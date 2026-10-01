import { ApiError } from '../../shared/api/httpClient.js';

export function parseAnswer(data, revisionId) {
  if (
    !data ||
    data.revision_id !== revisionId ||
    data.preview !== false ||
    data.eligibility_decided !== false ||
    !['grounded', 'insufficient_source'].includes(data.status) ||
    typeof data.answer !== 'string' ||
    !data.answer.trim() ||
    !Array.isArray(data.citations) ||
    !data.citations.every(
      (item) =>
        typeof item?.source_field === 'string' &&
        typeof item?.quote === 'string' &&
        item.quote.trim(),
    ) ||
    (data.status === 'grounded' && data.citations.length === 0) ||
    !Array.isArray(data.follow_up_questions) ||
    !data.follow_up_questions.every((item) => typeof item === 'string')
  )
    throw new ApiError('답변의 근거를 확인하지 못했어요. 다시 질문해 주세요.', 'invalid_response');
  return data;
}

export function createQuestionApi({
  baseUrl = '/api',
  fetchImpl = globalThis.fetch,
  timeoutMs = 70000,
} = {}) {
  return async function ask(revisionId, question, { signal } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, timeoutMs);
    try {
      if (controller.signal.aborted) throw new Error('aborted');
      const response = await fetchImpl(baseUrl.replace(/\/$/, '') + '/v1/assistant/questions', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-Auth-Request': '1' },
        body: JSON.stringify({ revision_id: revisionId, question: question.trim() }),
      });
      const data = await response.json().catch(() => null);
      if (controller.signal.aborted) throw new Error('aborted');
      if (!response.ok)
        throw new ApiError(
          typeof data?.detail === 'string' ? data.detail : '답변을 불러오지 못했어요.',
          'http',
          response.status,
        );
      return parseAnswer(data, revisionId);
    } catch (error) {
      if (signal?.aborted) throw new ApiError('질문을 취소했어요.', 'aborted');
      if (controller.signal.aborted)
        throw new ApiError('답변이 늦어지고 있어요. 잠시 후 다시 질문해 주세요.', 'timeout');
      if (error instanceof ApiError) throw error;
      throw new ApiError('서버에 연결하지 못했어요. 다시 질문해 주세요.', 'network');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
}
