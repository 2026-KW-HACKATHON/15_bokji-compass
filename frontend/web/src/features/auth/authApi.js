import { appConfig } from '../../shared/config.js';

export async function authRequest(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${appConfig.apiBaseUrl.replace(/\/$/, '')}/v1/auth/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Auth-Request': '1' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(
        typeof data.detail === 'string'
          ? data.detail
          : '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.status) throw error;
    throw new Error('인증 서버에 연결하지 못했어요. 서버 실행 상태를 확인하고 다시 시도해 주세요.');
  } finally {
    clearTimeout(timeout);
  }
}
