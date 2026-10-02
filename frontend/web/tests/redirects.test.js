import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHttpClient } from '../src/shared/api/httpClient.js';
import { createFinanceApi } from '../src/features/finance/financeApi.js';
import { emptyFinancialProfile } from '../src/features/finance/financeModel.js';
import { createQuestionApi } from '../src/features/assistant/questionApi.js';

test('API redirects never forward financial profiles, recommendation inputs or member questions', async (t) => {
  const forwarded = [];
  const target = http.createServer((request, response) => {
    forwarded.push(request.url);
    request.resume();
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{}');
  });
  await new Promise((resolve) => target.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => target.close(resolve)));
  let status = 307;
  const source = http.createServer((request, response) => {
    request.resume();
    response.writeHead(status, {
      Location: `http://127.0.0.1:${target.address().port}/redirected`,
    });
    response.end();
  });
  await new Promise((resolve) => source.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => source.close(resolve)));
  const baseUrl = `http://127.0.0.1:${source.address().port}`;
  const finance = createFinanceApi({ baseUrl });
  const recommend = createHttpClient({ baseUrl });
  const ask = createQuestionApi({ baseUrl });
  for (const code of [307, 308]) {
    status = code;
    await assert.rejects(finance.calculate(emptyFinancialProfile()), /연결하지 못했습니다/);
    await assert.rejects(
      finance.saveProfile(emptyFinancialProfile(), { consent: true }),
      /연결하지 못했습니다/,
    );
    await assert.rejects(
      recommend('/v1/recommendations', { method: 'POST', body: { profile: { region: '서울' } } }),
      (error) => error.code === 'network',
    );
    await assert.rejects(
      ask('00000000-0000-0000-0000-000000000001', '지원 전에 확인할 조건을 알려주세요.'),
      (error) => error.code === 'network',
    );
  }
  assert.deepEqual(forwarded, []);
});
