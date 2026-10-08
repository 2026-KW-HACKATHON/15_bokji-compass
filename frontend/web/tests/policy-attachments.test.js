import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAttachments, attachmentHref } from '../src/features/policies/attachmentModel.js';
import { parsePolicy } from '../src/features/policies/policyModel.js';

const id = 'a'.repeat(64);
const path = `/v1/policies/notice%3Afixture/attachments/${id}`;
const file = {
  id,
  name: '공식 안내.pdf',
  downloadUrl: `${path}?download=true`,
  previewUrl: path,
  sourceUrl: 'https://www.kw.ac.kr/include/Download.jsp?fuid=1&ano=2',
  sizeBytes: 1234,
};

test('actual attachments retain names and use the configured API prefix for preview/download', () => {
  const [parsed] = parseAttachments([file], 'notice:fixture');
  assert.equal(parsed.name, file.name);
  assert.equal(parsed.sizeBytes, 1234);
  assert.equal(attachmentHref(parsed.previewUrl, '/api'), `/api${path}`);
  assert.equal(
    attachmentHref(parsed.downloadUrl, 'https://api.example.org/'),
    `https://api.example.org${path}?download=true`,
  );
  assert.equal(parseAttachments([file, file], 'notice:fixture').length, 1);
});

test('file links for another notice or arbitrary origins and invalid names are discarded', () => {
  for (const invalid of [
    { ...file, downloadUrl: 'javascript:alert(1)' },
    { ...file, previewUrl: '//evil.example/a.pdf' },
    { ...file, previewUrl: 'https://evil.example/a.pdf' },
    { ...file, name: 'file\r\nheader.pdf' },
    { ...file, id: '../secret' },
  ])
    assert.deepEqual(parseAttachments([invalid], 'notice:fixture'), []);
  assert.deepEqual(parseAttachments([file], 'another-policy'), []);
});

test('older policy contracts have no attachment requirement; detail retains new file metadata', () => {
  const policy = { id: 'notice:fixture', title: '공고', summary: '', tags: [] };
  assert.deepEqual(parsePolicy(policy).attachments, []);
  assert.equal(parsePolicy({ ...policy, attachments: [file] }).attachments[0].id, id);
});
