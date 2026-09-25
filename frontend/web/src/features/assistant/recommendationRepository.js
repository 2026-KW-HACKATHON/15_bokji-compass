import { demoPolicies } from '../policies/demoPolicies.js';
import { parsePolicy } from '../policies/policyModel.js';
import { recommendationProfile } from '../profile/profileModel.js';
import { ApiError } from '../../shared/api/httpClient.js';
import { toFinancialProfile } from '../finance/financeModel.js';
export function createRecommendationRepository({ mode, request, path = '/v1/recommendations' }) {
  return {
    async recommend(profile, { signal, financialProfile = null } = {}) {
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
              ? '선택한 관심 분야인 ‘' + policy.category + '’의 예시 공고예요.'
              : '추천 화면을 살펴볼 수 있는 예시 공고예요.',
          }));
        return {
          items,
          source: 'demo',
          summary: '관심 분야의 예시 공고를 먼저 보여드려요. 실제 AI 추천은 준비 중이에요.',
        };
      }
      if (mode !== 'api' || !request)
        throw new ApiError('추천 연결 설정을 확인해 주세요.', 'configuration');
      const result = await request(path, {
        method: 'POST',
        body: {
          profile: input,
          limit: 3,
          ...(financialProfile ? { financialProfile: toFinancialProfile(financialProfile) } : {}),
        },
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
