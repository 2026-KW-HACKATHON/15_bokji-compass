export class ApiError extends Error {
  constructor(message, code, status = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}
export function createHttpClient({
  baseUrl = '/api',
  fetchImpl = globalThis.fetch,
  timeout = 15000,
} = {}) {
  return async function request(
    path,
    { method = 'GET', body, signal, timeoutMs = timeout, authenticated = false } = {},
  ) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetchImpl(baseUrl.replace(/\/$/, '') + '/' + path.replace(/^\//, ''), {
        method,
        signal: controller.signal,
        credentials: authenticated ? 'include' : 'omit',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          ...(authenticated ? { 'X-Auth-Request': '1' } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok)
        throw new ApiError(
          '서버에서 정보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.',
          'http',
          response.status,
        );
      try {
        return await response.json();
      } catch {
        throw new ApiError('서버 응답을 읽을 수 없어요.', 'invalid_response');
      }
    } catch (error) {
      if (signal?.aborted) throw new ApiError('요청을 취소했어요.', 'aborted');
      if (timedOut) throw new ApiError('응답이 늦어지고 있어요. 다시 시도해 주세요.', 'timeout');
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        '서버에 연결하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.',
        'network',
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
}
