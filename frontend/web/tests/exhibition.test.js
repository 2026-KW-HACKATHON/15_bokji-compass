import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { createExhibitionServer } from '../tools/exhibition/server.mjs';
import { destinations } from '../tools/exhibition/urls.mjs';
import { adminCookie, startAuthFixture } from './fixtures/admin-gateway.mjs';

test('QRs use the public origin, an APK file, and no operator/local address', () => {
  assert.deepEqual(destinations('https://expo.example.org/'), {
    web: 'https://expo.example.org/',
    android: 'https://expo.example.org/downloads/bokji-compass.apk',
    temporary: false,
  });
  assert.equal(destinations('https://new.trycloudflare.com').temporary, true);
  assert.equal(
    destinations('https://expo.example.org', 'https://files.example.org/app-v1.apk').android,
    'https://files.example.org/app-v1.apk',
  );
});
test('unsafe/local/credential URLs and non-APK overrides fail closed', () => {
  for (const origin of [
    'http://expo.example.org',
    'https://localhost',
    'https://127.0.0.1',
    'https://[::1]',
    'https://demo.local',
    'https://user:pass@expo.example.org',
    'https://expo.example.org?token=secret',
    'https://expo.example.org/path',
    'javascript:alert(1)',
    'https://expo.example.org:4431',
    'https://expo.example.org#home',
  ]) {
    assert.throws(() => destinations(origin));
  }
  assert.throws(() => destinations('https://expo.example.org', 'https://files.example.org/login'));
});

function request(port, url, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: url,
        method,
        headers: { Cookie: adminCookie, ...headers },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('operator server enforces isolation, updates tunnel addresses and generates download PNGs', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'bokji-qr-'));
  const statePath = path.join(temp, 'state.json');
  const apkPath = path.join(temp, 'release.apk');
  const auth = await startAuthFixture();
  const server = createExhibitionServer({ statePath, apkPath, fixedUrl: '', authApiUrl: auth.url });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await auth.close();
    await rm(statePath, { force: true });
    await rm(apkPath, { force: true });
    await rmdir(temp);
  });
  const state = async (url) =>
    writeFile(statePath, JSON.stringify({ url, processes: [{ id: process.pid, name: 'tunnel' }] }));
  const getStatus = async () => JSON.parse((await request(port, '/api/status')).body);
  assert.equal((await getStatus()).detectedUrl, '');
  await state('https://first.trycloudflare.com');
  assert.equal((await getStatus()).detectedUrl, 'https://first.trycloudflare.com');
  await state('https://second.trycloudflare.com');
  assert.equal((await getStatus()).detectedUrl, 'https://second.trycloudflare.com');
  await writeFile(
    statePath,
    JSON.stringify({ url: 'https://stale.trycloudflare.com', processes: [] }),
  );
  assert.equal((await getStatus()).detectedUrl, '');
  assert.equal((await getStatus()).apkPresent, false);
  await writeFile(apkPath, 'TEST FILE — presence is not a release approval');
  assert.equal((await getStatus()).apkPresent, true);
  for (const headers of [
    { Origin: 'https://evil.example.org' },
    { 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    assert.equal((await request(port, '/api/status', headers)).status, 403);
  }
  assert.equal((await request(port, '/', {}, 'POST')).status, 405);
  for (const url of ['/../package.json', '/.env', '/api/upload', '/downloads/bokji-compass.apk']) {
    assert.equal((await request(port, url)).status, 404);
  }
  const index = await request(port, '/');
  assert.equal(index.status, 200);
  assert.equal(index.headers['x-frame-options'], 'DENY');
  assert.equal(index.headers['cache-control'], 'no-store');
  assert.equal(index.headers['access-control-allow-origin'], undefined);
  const params = new URLSearchParams({
    kind: 'android',
    origin: 'https://expo.example.org',
    download: '1',
  });
  const png = await request(port, '/api/qr?' + params);
  assert.equal(png.status, 200);
  assert.equal(png.headers['content-type'], 'image/png');
  assert.match(png.headers['content-disposition'], /attachment; filename="bokji-android-qr.png"/);
  assert.equal(png.body.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.body.readUInt32BE(16), 1024);
  const pixels = PNG.sync.read(png.body);
  assert.equal(
    jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height).data,
    'https://expo.example.org/downloads/bokji-compass.apk',
  );
  params.set('kind', 'web');
  const webPng = PNG.sync.read((await request(port, '/api/qr?' + params)).body);
  assert.equal(
    jsQR(new Uint8ClampedArray(webPng.data), webPng.width, webPng.height).data,
    'https://expo.example.org/',
  );
  assert.equal((await request(port, '/api/qr?kind=web&origin=http://localhost')).status, 400);
  for (const url of [
    '/',
    '/page.js',
    '/api/status',
    '/api/targets?origin=https://expo.example.org',
    '/api/qr?' + params,
  ]) {
    assert.equal((await request(port, url, { Cookie: '' })).status, 401);
    assert.equal(
      (
        await request(port, url, {
          Cookie: 'bokji_session=' + 'B'.repeat(43),
          'X-Admin': 'true',
          'X-Forwarded-Host': 'public.example.org',
        })
      ).status,
      403,
    );
  }
  auth.revoke();
  assert.equal((await request(port, '/api/status')).status, 403);
  assert.equal((await request(port, '/api/qr?' + params)).status, 403);
});

test('default fixed public origin ignores tunnel state and generates matching QR images', async (t) => {
  const auth = await startAuthFixture();
  const server = createExhibitionServer({
    statePath: 'unused-tunnel-state.json',
    authApiUrl: auth.url,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  t.after(() => auth.close());
  const response = await request(server.address().port, '/api/status');
  const status = JSON.parse(response.body);
  assert.equal(status.detectedUrl, 'https://bokji.commitnaru.com');
  assert.equal(status.source, 'fixed');
  for (const [kind, target] of [
    ['web', 'https://bokji.commitnaru.com/'],
    ['android', 'https://bokji.commitnaru.com/downloads/bokji-compass.apk'],
  ]) {
    const params = new URLSearchParams({ kind, origin: status.detectedUrl });
    const png = PNG.sync.read((await request(server.address().port, '/api/qr?' + params)).body);
    assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height).data, target);
  }
});
