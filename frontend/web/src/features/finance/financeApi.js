import { parseCalculation, toFinancialProfile } from './financeModel.js';

export function createFinanceApi({
  baseUrl = '/api',
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
} = {}) {
  async function request(path, { body, member = false, signal } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const response = await fetchImpl(baseUrl.replace(/\/$/, '') + '/v1/finance/' + path, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: member ? 'include' : 'omit',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(member ? { 'X-Auth-Request': '1' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json().catch(() => null);
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!response.ok) {
        const fallback =
          response.status === 401
            ? '로그인이 필요합니다. 다시 로그인해 주세요.'
            : response.status === 404
              ? '저장된 정보가 없거나 서비스를 아직 사용할 수 없습니다.'
              : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
        const error = new Error(typeof data?.detail === 'string' ? data.detail : fallback);
        error.status = response.status;
        throw error;
      }
      if (!data || typeof data !== 'object')
        throw new Error('서버 응답을 읽지 못했습니다. 다시 시도해 주세요.');
      return data;
    } catch (error) {
      if (signal?.aborted) {
        const aborted = new Error('요청을 취소했습니다.');
        aborted.name = 'AbortError';
        throw aborted;
      }
      if (timedOut) throw new Error('응답이 늦어지고 있습니다. 다시 시도해 주세요.');
      if (error instanceof TypeError)
        throw new Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
  function stored(data) {
    if (data.profile === null && data.calculation === null)
      return { profile: null, calculation: null, updated_at: data.updated_at ?? null };
    return {
      profile: toFinancialProfile(data.profile),
      calculation: parseCalculation(data.calculation),
      updated_at: data.updated_at,
    };
  }
  return {
    rules: ({ signal } = {}) => request('rules', { signal }),
    calculate: async (profile, { signal } = {}) =>
      parseCalculation(
        await request('calculate', { body: { profile: toFinancialProfile(profile) }, signal }),
      ),
    getProfile: async ({ signal } = {}) =>
      stored(await request('profile', { member: true, signal })),
    saveProfile: async (profile, { consent, signal } = {}) => {
      if (consent !== true) throw new Error('계정에 저장하려면 저장 동의를 선택해 주세요.');
      const saved = stored(
        await request('profile', {
          member: true,
          body: { profile: toFinancialProfile(profile), consent: true },
          signal,
        }),
      );
      if (!saved.profile)
        throw new Error('저장 결과를 확인하지 못했습니다. 다시 불러와 확인해 주세요.');
      return saved;
    },
    deleteProfile: async ({ signal } = {}) => {
      const data = await request('profile/delete', { member: true, body: {}, signal });
      if (data.deleted !== true)
        throw new Error('삭제 결과를 확인하지 못했습니다. 다시 불러와 확인해 주세요.');
      return data;
    },
  };
}
