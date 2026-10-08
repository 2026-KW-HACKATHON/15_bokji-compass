import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import QRCode from 'qrcode';
import { DEFAULT_PUBLIC_URL, destinations, publicUrl } from './urls.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(webRoot, '../..');
const defaultState = path.join(repoRoot, 'backend/data/tunnel-demo/runtime/processes.json');
const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/page.js', ['page.js', 'text/javascript; charset=utf-8']],
  ['/page.css', ['page.css', 'text/css; charset=utf-8']],
  ['/brand-logo.png', ['../../public/brand-logo.png', 'image/png']],
]);

export function authEndpoint(base) {
  const url = new URL(base);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('관리자 인증 API는 신뢰한 로컬 HTTP 서버 주소만 허용합니다.');
  }
  return new URL('/v1/admin/session', url).href;
}

async function authorize(cookie, endpoint) {
  const token = /(?:^|;\s*)bokji_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(cookie || '')?.[1];
  if (!token) return 401;
  try {
    const response = await fetch(endpoint, {
      // This gateway originates a private loopback check, not a forwarded browser request.
      // authEndpoint restricts the destination and Uvicorn trusts only this local proxy.
      headers: {
        Cookie: `bokji_session=${token}`,
        Accept: 'application/json',
        'X-Forwarded-Proto': 'https',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
    });
    if (response.status === 401 || response.status === 403) return response.status;
    if (!response.ok) return 503;
    return (await response.json()).is_admin === true ? 200 : 403;
  } catch {
    return 503;
  }
}

export function createExhibitionServer({
  statePath = defaultState,
  fixedUrl = DEFAULT_PUBLIC_URL,
  apkPath = path.join(webRoot, 'dist/downloads/bokji-compass.apk'),
  authApiUrl = 'http://127.0.0.1:8001',
} = {}) {
  const endpoint = authEndpoint(authApiUrl);
  return http.createServer(async (req, res) => {
    const host = req.headers.host;
    const origin = req.headers.origin;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    const send = (code, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(code, { 'Content-Type': type });
      res.end(body);
    };
    // Only a local gateway can reach this socket. Every resource still requires a live admin cookie.
    if (
      req.socket.remoteAddress !== '127.0.0.1' ||
      !host ||
      /[\s/@\\]/.test(host) ||
      (origin && ![`http://${host}`, `https://${host}`].includes(origin)) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    ) {
      send(403, '올바른 관리자 요청이 아닙니다.');
      return;
    }
    const permission = await authorize(req.headers.cookie, endpoint);
    if (permission !== 200) {
      const message =
        permission === 401
          ? '관리자 계정으로 로그인해 주세요.'
          : permission === 403
            ? '관리자 계정만 접근할 수 있습니다.'
            : '관리자 인증 서버에 연결하지 못했습니다.';
      if (req.url === '/' || req.url?.startsWith('/?')) {
        send(
          permission,
          `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>관리자 로그인 필요</title><h1>${message}</h1><p>복지나침반 사이트에 로그인한 뒤 ‘전시 QR 관리’를 선택해 주세요.</p><a href="/#login">사이트 로그인</a></html>`,
          'text/html; charset=utf-8',
        );
      } else send(permission, message);
      return;
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      send(405, 'Method not allowed');
      return;
    }
    try {
      const url = new URL(req.url, `http://${host}`);
      if (url.pathname === '/api/status') {
        let detectedUrl = '',
          recordedAt = null;
        let source = fixedUrl ? 'fixed' : 'tunnel';
        if (fixedUrl) detectedUrl = publicUrl(fixedUrl, { originOnly: true });
        else {
          try {
            const state = JSON.parse(await readFile(statePath, 'utf8'));
            const entry = state.processes?.find((item) => item.name === 'tunnel');
            if (entry && Number.isSafeInteger(entry.id) && entry.id > 0 && state.url) {
              process.kill(entry.id, 0); // Read-only liveness probe; does not signal the process.
              detectedUrl = publicUrl(state.url, { originOnly: true });
              recordedAt = (await stat(statePath)).mtime.toISOString();
            }
          } catch {
            /* Missing/stopped/invalid sharing state is not a live address. */
          }
        }
        const apkFile = await stat(apkPath).catch(() => null);
        send(
          200,
          JSON.stringify({
            detectedUrl,
            source,
            recordedAt,
            apkPresent: !!apkFile?.isFile() && apkFile.size > 0,
            apkBytes: apkFile?.isFile() ? apkFile.size : 0,
          }),
          'application/json; charset=utf-8',
        );
        return;
      }
      if (url.pathname === '/api/qr') {
        const kind = url.searchParams.get('kind');
        if (!['web', 'android'].includes(kind)) {
          send(400, 'QR 종류를 확인해 주세요.');
          return;
        }
        const targets = destinations(
          url.searchParams.get('origin'),
          url.searchParams.get('apk') || '',
        );
        const png = await QRCode.toBuffer(targets[kind], {
          type: 'png',
          errorCorrectionLevel: 'M',
          margin: 4,
          width: 1024,
          color: { dark: '#000000ff', light: '#ffffffff' },
        });
        if (url.searchParams.get('download') === '1') {
          res.setHeader('Content-Disposition', `attachment; filename="bokji-${kind}-qr.png"`);
        }
        send(200, png, 'image/png');
        return;
      }
      // URL planning only: no remote fetch, upload, APK publishing, or arbitrary filesystem reads.
      if (url.pathname === '/api/targets') {
        send(
          200,
          JSON.stringify(
            destinations(url.searchParams.get('origin'), url.searchParams.get('apk') || ''),
          ),
          'application/json; charset=utf-8',
        );
        return;
      }
      const file = staticFiles.get(url.pathname);
      if (!file) {
        send(404, 'Not found');
        return;
      }
      send(200, await readFile(path.resolve(here, file[0])), file[1]);
    } catch (error) {
      send(
        400,
        error instanceof Error && !('code' in error)
          ? error.message
          : '요청을 처리하지 못했습니다.',
      );
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.EXHIBITION_PORT || 5181);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Invalid EXHIBITION_PORT');
  const fixedUrl = process.env.EXHIBITION_PUBLIC_URL || DEFAULT_PUBLIC_URL;
  if (fixedUrl) publicUrl(fixedUrl, { originOnly: true });
  const server = createExhibitionServer({
    fixedUrl,
    authApiUrl: process.env.EXHIBITION_AUTH_API_URL || 'http://127.0.0.1:8001',
  });
  server.on('error', (error) => {
    console.error(`QR 관리 서버 시작 실패: ${error.code}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () =>
    console.log(`전시 QR 관리 게이트웨이: 127.0.0.1:${port} (사이트 관리자 세션 필수)`),
  );
}
