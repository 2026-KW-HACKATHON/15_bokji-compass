import { demoPolicies } from '../policies/demoPolicies.js';
import { parsePolicy } from '../policies/policyModel.js';
import { recommendationProfile } from '../profile/profileModel.js';
import { ApiError } from '../../shared/api/httpClient.js';
export function createRecommendationRepository({ mode, request, path = '/v1/recommendations' }) {
  return {
    async recommend(profile, { signal } = {}) {
      const input = recommendationProfile(profile);
      if (mode === 'demo') {
        // Deterministic UI preview, not an LLM result.
        const scored = demoPolicies.map((policy) => ({
          policy,
          score:
            (input.interests.includes(policy.category) ? 2 : 0) +
            (policy.region === input.region ? 1 : 0),
        }));
        const items = scored
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map(({ policy }) => ({
            policy,
            reason: input.interests.includes(policy.category)
              ? '관심 분야로 선택한 ' + policy.category + ' 공고의 추천 표시 예시예요.'
              : '개인비서가 공고를 설명하는 방식을 보여주는 예시예요.',
          }));
        return {
          items,
          source: 'demo',
          summary:
            '관심 분야를 먼저 보여주는 화면 예시예요. 실제 LLM 추천은 서버 연결 후 제공됩니다.',
        };
      }
      if (mode !== 'api' || !request)
        throw new ApiError('추천 연결 설정을 확인해 주세요.', 'configuration');
      const result = await request(path, {
        method: 'POST',
        body: { profile: input, limit: 3 },
        signal,
        timeoutMs: 30000,
      });
      if (
        !result ||
        !Array.isArray(result.items) ||
        result.items.length > 3 ||
        typeof result.summary !== 'string' ||
        result.items.some((item) => typeof item?.reason !== 'string' || !item.reason.trim())
      )
        throw new ApiError('추천 정보의 형식이 올바르지 않아요.', 'invalid_response');
      const items = result.items.map((item) => ({
        policy: parsePolicy(item.policy),
        reason: item.reason,
      }));
      if (new Set(items.map((item) => item.policy.id)).size !== items.length)
        throw new ApiError('추천 공고가 중복되었어요.', 'invalid_response');
      return { items, summary: result.summary, source: 'api' };
    },
  };
}
