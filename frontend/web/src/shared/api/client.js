import { appConfig } from '../config.js';
import { createHttpClient, ApiError } from './httpClient.js';
export const request = createHttpClient({ baseUrl: appConfig.apiBaseUrl });
export async function checkHealth() {
  const result = await request('/health', { timeoutMs: 5000 });
  if (result.status !== 'ok' || result.service !== 'bokji-compass-backend')
    throw new ApiError('서버 응답 형식을 확인해 주세요.', 'invalid_response');
  return result;
}
