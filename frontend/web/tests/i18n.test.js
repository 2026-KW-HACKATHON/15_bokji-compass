import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectLocale,
  intlLocaleFor,
  isSupportedLocale,
  locales,
  messageCatalogs,
  normalizeLocale,
  parseStoredLocale,
  translate,
  translateFinanceError,
  translateFinanceLabel,
  translateFinanceHint,
} from '../../packages/core/src/i18n/index.js';
import { emptyFinancialProfile, toFinancialProfile } from '../../packages/core/src/financeModel.js';

test('language detection honors ordered supported preferences and regional variants', () => {
  assert.equal(detectLocale(['fr-FR', 'vi-VN', 'en-US']), 'vi');
  assert.equal(detectLocale(['zh-Hant-TW']), 'zh');
  assert.equal(detectLocale(['ja_JP']), 'ja');
  assert.equal(detectLocale(['fr', 'de']), 'ko');
  assert.equal(detectLocale([null, {}, 'en-GB']), 'en');
  assert.equal(normalizeLocale(' EN-us '), 'en');
  assert.equal(normalizeLocale(null), 'ko');
  assert.equal(normalizeLocale('__proto__'), 'ko');
  assert.equal(isSupportedLocale('en-US'), false);
  assert.equal(parseStoredLocale('"vi"'), 'vi');
  assert.equal(parseStoredLocale('en'), 'en');
  assert.equal(parseStoredLocale('"fr"'), null);
  assert.equal(parseStoredLocale('{"locale":"en"}'), null);
  assert.equal(intlLocaleFor('vi'), 'vi-VN');
  assert.deepEqual(
    locales.map(({ code }) => code),
    ['ko', 'en', 'zh', 'vi', 'ja'],
  );
});

test('translations interpolate complete phrases and preserve unknown data verbatim', () => {
  assert.equal(translate('en', '{count}명', { count: 3 }), '3 people');
  assert.equal(translate('ja', '{name}님', { name: 'Alex' }), 'Alexさん');
  assert.equal(translate('ko', '{count}명', { count: 3 }), '3명');
  assert.equal(translate('zh', '{count}명'), '{count}人');
  assert.equal(translate('en', '서울'), 'Seoul');
  assert.equal(translate('en', '새로운 정책 원문'), '새로운 정책 원문');
  assert.equal(translate('en', 'constructor'), 'constructor');
  assert.equal(translate('en', '{count}명', Object.create({ count: 9 })), '{count} people');
  assert.equal(translate('en', 'User {{name}}', { name: '$& <script>' }), 'User $& <script>');
});

test('every registered message has four translations with matching interpolation slots', () => {
  const slots = (value) =>
    [...value.matchAll(/\{\{(\w+)\}\}|\{(\w+)\}/g)].map((match) => match[1] ?? match[2]).sort();
  for (const [catalogName, catalog] of Object.entries(messageCatalogs)) {
    assert.ok(Object.keys(catalog).length > 0, `${catalogName} must not be an empty placeholder`);
    for (const [source, entry] of Object.entries(catalog)) {
      for (const locale of ['en', 'zh', 'vi', 'ja']) {
        assert.equal(typeof entry[locale], 'string', `${catalogName}: ${source} missing ${locale}`);
        assert.ok(entry[locale].trim(), `${catalogName}: ${source} has empty ${locale}`);
        assert.deepEqual(
          slots(entry[locale]),
          slots(entry.ko ?? source),
          `${catalogName}: ${source}: ${locale} interpolation differs`,
        );
      }
    }
  }
});

test('local finance validation translates the complete message without changing model data', () => {
  const profile = emptyFinancialProfile();
  profile.members[0].age = -1;
  const t = (source, values) => translate('en', source, values);
  assert.throws(
    () => toFinancialProfile(profile),
    (error) => {
      const localized = translateFinanceError(error.message, t);
      assert.equal(localized, 'Enter Age of household member 1 as a non-negative whole number.');
      return true;
    },
  );
  assert.equal(profile.members[0].age, -1);
  assert.equal(profile.region, 'unknown');
  assert.equal(translateFinanceError('Unknown server error', t), 'Unknown server error');
});

test('new assistant and introduction routes keep translated navigation after integration', () => {
  assert.equal(translate('en', 'AI 복지비서'), 'AI welfare assistant');
  assert.equal(translate('en', '서비스 소개'), 'About this service');
  assert.equal(translate('zh', 'AI 비서'), 'AI助手');
  assert.equal(translate('vi', '한눈에 보기'), 'Tổng quan');
  assert.equal(translate('ja', '질문할 공고'), '質問する公示');
  assert.equal(translate('ko', 'AI 복지비서'), 'AI 복지비서');
  assert.equal(translate('en', '새로운 상담 입력 2026'), '새로운 상담 입력 2026');
});

test('monthly support labels and validation errors follow the selected language', () => {
  for (const locale of ['en', 'zh', 'vi', 'ja']) {
    const t = (source, values) => translate(locale, source, values);
    for (const suffix of ['지원금 합계', '받은 횟수']) {
      const label = '2026년 10월 ' + suffix;
      const displayed = translateFinanceLabel(label, t);
      assert.doesNotMatch(displayed, /[가-힣]/);
      assert.match(displayed, /2026/);
      assert.match(displayed, /10/);
      const error = translateFinanceError(label + '은(는) 0 이상의 정수로 입력해 주세요.', t);
      assert.doesNotMatch(error, /[가-힣]/);
      assert.ok(error.includes(displayed));
    }
    const hint = translateFinanceHint(
      '2025년 11월부터 2026년 10월까지 가구원 모두가 받은 돈을 합산해 주세요. 가구원 사이에 주고받은 돈은 중복 입력하지 않아요.',
      t,
    );
    assert.doesNotMatch(hint, /[가-힣]/);
    assert.match(hint, /2025/);
    assert.match(hint, /2026/);
    assert.equal(translateFinanceLabel('사용자 입력 원문', t), '사용자 입력 원문');
  }
  assert.equal(
    translateFinanceLabel('2026년 10월 지원금 합계', (s, v) => translate('ko', s, v)),
    '2026년 10월 지원금 합계',
  );
});
