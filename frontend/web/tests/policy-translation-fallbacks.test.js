import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePolicy } from '../src/features/policies/policyModel.js';
import {
  policyTranslationSource,
  restoreTranslationFallbacks,
} from '../src/features/policies/policyTranslationModel.js';
import { applyPolicyTranslation } from '../../packages/core/src/i18n/policyTranslation.js';
import { translate } from '../../packages/core/src/i18n/index.js';

const absent = {
  id: 'missing-display',
  revisionId: 'missing-revision',
  title: '공개 공고',
  summary: '요약',
  tags: [],
  organization: null,
};
const envelope = (translation) => ({
  policy_id: absent.id,
  revision_id: absent.revisionId,
  language: 'en',
  source_language: 'ko',
  source_hash: 'a'.repeat(64),
  translation,
});

test('missing display fields are validated as absent source and restored as localized UI copy', () => {
  const original = parsePolicy(absent);
  const before = structuredClone(original);
  const source = policyTranslationSource(original);
  assert.deepEqual(original.translationSourceEmptyFields, [
    'audience',
    'organization',
    'benefit',
    'applicationPeriod',
  ]);
  assert.equal(original.organization, '기관 확인 필요');
  assert.equal(original.audience, '지원 대상 확인 필요');
  assert.equal(source.organization, '');
  const translated = applyPolicyTranslation(
    source,
    'en',
    envelope({
      title: 'Public notice',
      summary: 'Summary',
      audience: '',
      organization: '',
      benefit: '',
      applicationPeriod: '',
    }),
  );
  const display = restoreTranslationFallbacks(original, translated, (value) =>
    translate('en', value),
  );
  assert.equal(display.organization, translate('en', '기관 확인 필요'));
  assert.equal(display.applicationPeriod, translate('en', '공식 공고에서 확인'));
  assert.deepEqual(original, before);
  assert.deepEqual(
    parsePolicy(JSON.parse(JSON.stringify(original))).translationSourceEmptyFields,
    original.translationSourceEmptyFields,
  );
});

test('real content cannot be marked absent to relax strict translation validation', () => {
  const original = parsePolicy({
    ...absent,
    organization: '서울시',
    translationSourceEmptyFields: ['organization', 'title', 'id'],
  });
  const source = policyTranslationSource(original);
  assert.equal(source.organization, '서울시');
  assert.throws(
    () =>
      applyPolicyTranslation(
        source,
        'en',
        envelope({ title: 'Public notice', summary: 'Summary', organization: '' }),
      ),
    /invalid_translation/,
  );
  const translated = { ...source, organization: 'Seoul City' };
  assert.equal(
    restoreTranslationFallbacks(original, translated, (value) => translate('en', value))
      .organization,
    'Seoul City',
  );
});
