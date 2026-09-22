import { appConfig } from '../shared/config.js';
import { request } from '../shared/api/client.js';
import { createPolicyRepository } from '../features/policies/policyRepository.js';
import { createRecommendationRepository } from '../features/assistant/recommendationRepository.js';
export const policyRepository = createPolicyRepository({
  mode: appConfig.dataMode,
  request,
  path: appConfig.policiesPath,
});
export const recommendationRepository = createRecommendationRepository({
  mode: appConfig.dataMode,
  request,
  path: appConfig.recommendationsPath,
});
