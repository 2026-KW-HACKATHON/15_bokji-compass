import { ApiError } from '../../shared/api/httpClient.js';

const modes = ['personalized', 'popular', 'general', 'profile_required'];

// Missing metadata in an older response must never imply personalized eligibility.
export function parseRecommendationContext(result) {
  if (
    (result.mode !== undefined && !modes.includes(result.mode)) ||
    (result.profile_sufficient !== undefined && typeof result.profile_sufficient !== 'boolean') ||
    (result.guidance !== undefined && typeof result.guidance !== 'string') ||
    (result.missing_fields !== undefined &&
      (!Array.isArray(result.missing_fields) ||
        !result.missing_fields.every((field) => typeof field === 'string'))) ||
    (result.mode === 'personalized' && result.profile_sufficient !== true)
  )
    throw new ApiError('추천 안내의 형식이 올바르지 않아요.', 'invalid_response');
  return {
    mode: result.mode || 'general',
    profileSufficient: result.profile_sufficient === true,
    guidance: result.guidance || '',
    missingFields: [...new Set(result.missing_fields || [])],
  };
}

export function recommendationGuidance(result) {
  if (result.guidance) return result.guidance;
  if (result.mode === 'popular')
    return '맞춤 추천에 필요한 정보가 충분하지 않아, 공식 제공처의 누적 조회수가 높은 일반 공고를 보여드렸어요. 내 정보를 추가하면 더 정확하게 추천받을 수 있어요.';
  if (result.mode === 'general')
    return '맞춤 추천에 필요한 정보가 충분하지 않아, 신청 대상 제한이 없다고 안내된 일반 공고를 보여드렸어요. 내 정보를 추가하면 더 정확하게 추천받을 수 있어요.';
  if (result.mode === 'profile_required')
    return '현재 정보만으로 안전하게 추천할 공고를 찾지 못했어요. 거주 지역과 연령대 등 내 정보를 더 입력해 주세요.';
  return '';
}
