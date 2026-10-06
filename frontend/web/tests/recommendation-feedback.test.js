import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendationFailure } from '../src/features/assistant/recommendationFeedback.js';
import { createRecommendationRepository } from '../src/features/assistant/recommendationRepository.js';
import { ApiError } from '../src/shared/api/httpClient.js';
import { defaultProfile } from '../src/features/profile/profileModel.js';

test('empty successful recommendations remain distinct from failed requests', async () => {
  const empty = createRecommendationRepository({
    mode: 'api',
    request: async () => ({ items: [], summary: '추천할 공고가 없어요.' }),
  });
  assert.deepEqual((await empty.recommend(defaultProfile)).items, []);
  for (const status of [404, 429, 500, 502, 503, 504]) {
    const failed = createRecommendationRepository({
      mode: 'api',
      request: async () => {
        throw new ApiError('private server detail', 'http', status);
      },
    });
    await assert.rejects(failed.recommend(defaultProfile), (error) => {
      const feedback = recommendationFailure(error);
      assert.equal(feedback.action, 'retry');
      assert.doesNotMatch(
        feedback.title + feedback.message,
        /공고가 없|준비하고|연결이 끝나면|private/,
      );
      return error.status === status;
    });
  }
});

test('recommendation failures guide users to the appropriate next action', () => {
  assert.equal(recommendationFailure({ status: 401 }).action, 'login');
  assert.equal(recommendationFailure({ status: 422 }).action, 'profile');
  assert.match(recommendationFailure({ status: 429 }).title, /요청이 많아/);
  assert.match(recommendationFailure({ code: 'timeout' }).title, /늦어지고/);
  assert.match(recommendationFailure({ code: 'network' }).message, /인터넷 연결/);
  for (const error of [undefined, { code: 'invalid_response' }, { code: 'configuration' }]) {
    assert.equal(recommendationFailure(error).action, 'retry');
  }
});
