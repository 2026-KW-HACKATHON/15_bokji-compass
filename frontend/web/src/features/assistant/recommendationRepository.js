import { parsePolicy } from '../policies/policyModel.js';
import { recommendationProfile } from '../profile/profileModel.js';
import { ApiError } from '../../shared/api/httpClient.js';
import { toFinancialProfile } from '../finance/financeModel.js';
export function createRecommendationRepository({ mode, request, path = '/v1/recommendations' }) {
  return {
    async recommend(profile, { signal, financialProfile = null } = {}) {
      const input = recommendationProfile(profile);
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
