import { isIP } from 'node:net';

export const DEFAULT_PUBLIC_URL = 'https://bokji.commitnaru.com';

export function publicUrl(value, { originOnly = false, apk = false } = {}) {
  if (typeof value !== 'string' || value.length > 1200)
    throw new Error('공개 HTTPS 주소를 입력해 주세요.');
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('주소 형식을 확인해 주세요.');
  }
  const host = url.hostname;
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.port ||
    isIP(host) ||
    host.includes(':') ||
    !host.includes('.') ||
    /(^localhost$|\.(localhost|local|internal)$)/i.test(host)
  ) {
    throw new Error('비밀번호·쿼리·포트가 없는 공개 HTTPS 도메인을 사용해 주세요.');
  }
  if (originOnly && url.pathname !== '/') throw new Error('메인 주소는 경로 없이 입력해 주세요.');
  if (apk && !url.pathname.toLowerCase().endsWith('.apk'))
    throw new Error('.apk 파일로 연결되는 주소를 입력해 주세요.');
  return originOnly ? url.origin : url.href;
}

export function destinations(origin, apkOverride = '') {
  const base = publicUrl(origin, { originOnly: true });
  return {
    web: base + '/',
    android: apkOverride.trim()
      ? publicUrl(apkOverride, { apk: true })
      : base + '/downloads/bokji-compass.apk',
    temporary: new URL(base).hostname.endsWith('.trycloudflare.com'),
  };
}
