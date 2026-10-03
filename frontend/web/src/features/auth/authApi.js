import { appConfig } from '../../shared/config.js';

export async function authRequest(path, body, { signal, scope = 'auth' } = {}) {
  if (!['auth', 'admin'].includes(scope)) throw new Error('허용되지 않은 요청입니다.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${appConfig.apiBaseUrl.replace(/\/$/, '')}/v1/${scope}/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Auth-Request': '1' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(
        typeof data.detail === 'string'
          ? data.detail
          : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.status) throw error;
    throw new Error('연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
