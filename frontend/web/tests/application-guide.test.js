import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseApplicationGuide,
  parseApplicationPreparation,
  safeTelephoneUrl,
} from '../src/features/policies/applicationGuideModel.js';

const policy = {
  id: 'policy-1',
  revisionId: 'revision-1',
  sourceUrl: 'https://www.example.go.kr/notices/42',
};

test('different official notice and inquiry URLs remain reference pages', () => {
  for (const onlineUrl of [
    'https://example.gov/notices/42',
    'https://example.gov/contact',
    'https://www.gov.kr/portal/rcvfvrSvc/dtlEx/142100000001',
  ])
    assert.equal(parseApplicationGuide({ ...guide, onlineUrl }, policy).onlineUrl, null);
});
const guide = {
  methodText: '온라인 또는 전화로 신청',
  onlineUrl: 'https://apply.example.go.kr/services/42/apply',
  phones: [
    { number: '02-1234-5678', label: '접수 담당자', kind: 'application' },
    { number: '1350', label: '고용 상담', kind: 'inquiry' },
  ],
  visitText: '관할 센터에 방문하여 신청',
  documents: [
    { id: 'doc-identity', label: '신분증' },
    { id: 'doc-income', label: '소득 증빙 서류 (해당자만)' },
  ],
  documentsStatus: 'listed',
  documentsNote: '최근 3개월 이내 발급분',
};

test('application guide preserves source instructions, conditional documents and phone purpose', () => {
  const parsed = parseApplicationGuide(guide, policy);
  assert.deepEqual(parsed, guide);
  assert.notEqual(parsed.documents, guide.documents);
  assert.notEqual(parsed.phones, guide.phones);
  assert.equal(parsed.phones[1].kind, 'inquiry');
  assert.equal(parsed.documents[1].label, '소득 증빙 서류 (해당자만)');
  assert.equal(parseApplicationGuide(undefined, policy), null);
  assert.equal(parseApplicationGuide(null, policy), null);
});

test('source lists and long instructions are preserved without arbitrary metadata truncation', () => {
  const extended = {
    ...guide,
    methodText: '기관별 안내와 조건을 확인해 주세요.\n'.repeat(1500),
    phones: Array.from({ length: 31 }, (_, index) => ({
      number: `02-1000-${String(index).padStart(4, '0')}`,
      label: `관할 기관 ${index + 1}`,
      kind: 'inquiry',
    })),
    documents: Array.from({ length: 101 }, (_, index) => ({
      id: `document-${index}`,
      label: `추가 증빙 ${index + 1} (해당자만)`,
    })),
  };
  assert.deepEqual(parseApplicationGuide(extended, policy), extended);
});

test('application guide removes unsafe, notice and generic URLs from actionable destinations', () => {
  for (const onlineUrl of [
    'javascript:alert(1)',
    'tel:02-1234-5678',
    'https://user:password@example.go.kr/apply',
    'https://www.example.go.kr/notices/42',
    'https://www.example.go.kr/notices/42#apply',
    'https://www.example.go.kr/notices/42?utm_source=referral',
    'https://www.example.go.kr/',
    'https://www.example.go.kr/index.html',
    'https://www.example.go.kr/login',
    'https://www.example.go.kr/main.do',
  ]) {
    assert.equal(parseApplicationGuide({ ...guide, onlineUrl }, policy).onlineUrl, null);
  }
  assert.equal(
    parseApplicationGuide({ ...guide, onlineUrl: 'https://www.example.go.kr/apply?id=42' }, policy)
      .onlineUrl,
    'https://www.example.go.kr/apply?id=42',
  );
});

test('telephone actions only contain validated phone digits and preserve the displayed source number', () => {
  assert.equal(safeTelephoneUrl('02-1234-5678'), 'tel:0212345678');
  assert.equal(safeTelephoneUrl('1577-1000'), 'tel:15771000');
  assert.equal(safeTelephoneUrl('1350'), 'tel:1350');
  assert.equal(safeTelephoneUrl('+82 (2) 1234-5678'), 'tel:+82212345678');
  for (const number of [
    'javascript:alert(1)',
    '02-1234-5678;ext=99',
    '02-1234-5678?subject=hello',
    '02-1234-5678\n010-1111-2222',
    '123456789012345678901',
    '999',
  ]) {
    assert.equal(safeTelephoneUrl(number), null);
    assert.throws(
      () =>
        parseApplicationGuide(
          { ...guide, phones: [{ number, label: '', kind: 'application' }] },
          policy,
        ),
      (error) => error.code === 'invalid_response',
    );
  }
});

test('document status distinguishes no documents from unknown rather than creating a generic checklist', () => {
  for (const documentsStatus of ['none', 'unknown']) {
    assert.equal(
      parseApplicationGuide({ ...guide, documents: [], documentsStatus }, policy).documentsStatus,
      documentsStatus,
    );
    assert.throws(
      () => parseApplicationGuide({ ...guide, documentsStatus }, policy),
      (error) => error.code === 'invalid_response',
    );
  }
  assert.throws(() => parseApplicationGuide({ ...guide, documents: [] }, policy));
  assert.throws(() =>
    parseApplicationGuide(
      { ...guide, documents: [guide.documents[0], guide.documents[0]] },
      policy,
    ),
  );
  assert.throws(() =>
    parseApplicationGuide({ ...guide, documents: [{ id: '<unsafe>', label: '신분증' }] }, policy),
  );
  assert.throws(() =>
    parseApplicationGuide({ ...guide, phones: [{ ...guide.phones[0], kind: 'support' }] }, policy),
  );
  assert.throws(() => parseApplicationGuide({ ...guide, documentsNote: 42 }, policy));
});

test('account document self-checks accept only current revision and current source document identifiers', () => {
  const parsedGuide = parseApplicationGuide(guide, policy);
  const prepared = { revision_id: 'revision-1', prepared_document_ids: ['doc-income'] };
  const parsed = parseApplicationPreparation(prepared, parsedGuide, policy.revisionId);
  assert.deepEqual(parsed, prepared);
  assert.notEqual(parsed.prepared_document_ids, prepared.prepared_document_ids);
  assert.equal(parseApplicationPreparation(undefined, parsedGuide, policy.revisionId), null);
  for (const stale of [
    { ...prepared, revision_id: 'old-revision' },
    { ...prepared, prepared_document_ids: ['not-in-source'] },
  ]) {
    assert.equal(parseApplicationPreparation(stale, parsedGuide, policy.revisionId), null);
  }
  for (const invalid of [
    { ...prepared, prepared_document_ids: ['doc-income', 'doc-income'] },
    { ...prepared, prepared_document_ids: 'doc-income' },
  ]) {
    assert.throws(() => parseApplicationPreparation(invalid, parsedGuide, policy.revisionId));
  }
  assert.equal(parseApplicationPreparation(prepared, null, policy.revisionId), null);
  assert.deepEqual(
    parseApplicationPreparation(
      { ...prepared, prepared_document_ids: [] },
      { ...guide, documents: [], documentsStatus: 'none' },
      policy.revisionId,
    ),
    { revision_id: 'revision-1', prepared_document_ids: [] },
  );
});
