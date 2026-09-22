const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

/** Only documented backend endpoints. Throws on HTTP, network or timeout errors. */
export async function checkHealth() {
  const response = await fetch(`${baseUrl}/health`, {
    signal: AbortSignal.timeout(5000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`서버 응답 오류 (${response.status})`);
  const result = await response.json();
  if (result.status !== 'ok' || result.service !== 'bokji-compass-backend')
    throw new Error('서버 응답 형식을 확인해 주세요.');
  return result;
}
