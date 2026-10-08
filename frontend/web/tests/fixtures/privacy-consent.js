import { expect } from '@playwright/test';

export const consentVersion = '2026-10-07.3';
export const requiredConsentLabel = '[필수] 회원가입 개인정보 수집·이용에 동의합니다.';
export const profileConsentLabel = '[선택] 맞춤 안내용 개인정보 수집·이용에 동의합니다.';
export const aiConsentLabel = '[선택] 외부 AI 처리 및 개인정보 국외이전에 동의합니다.';
export const privacyViewLabels = {
  collection: '회원가입 개인정보 수집·이용 내용 보기',
  profile: '맞춤 안내용 개인정보 수집·이용 내용 보기',
  ai: '외부 AI 처리 및 국외이전 내용 보기',
  all: '개인정보 처리 안내 다시 보기',
};
export const privacyNotice = {
  version: consentVersion,
  operator_name: '복지나침반 팀',
  contact_email: 'privacy@example.com',
  retention: '회원 계정 유지 기간 동안 보관하며 회원 탈퇴 시 즉시 삭제합니다.',
  ai: { enabled: false },
};
export const privacyNoticeWithAi = {
  ...privacyNotice,
  ai: {
    enabled: true,
    notice_version: 'ai-test-notice.1',
    provider_name: '테스트 AI 처리 업체',
    contact: 'processor@example.com',
    countries: ['미국'],
    purpose: '사용자 질문에 대한 복지 안내 답변 생성',
    items: ['질문 내용', '지역', '연령대'],
    transfer_time: '사용자가 질문을 전송하는 시점',
    transfer_method: '암호화된 통신',
    retention: '테스트용 보유 기간',
    training: '모델 학습에 사용하지 않음',
  },
};

export async function openPrivacyNotice(page, section = 'collection') {
  await page.getByRole('button', { name: privacyViewLabels[section], exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '개인정보 수집·이용 안내', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

export function expectedConsent(profile = false, ai = false) {
  return { notice_version: consentVersion, collection: true, profile, ai };
}

export async function acceptSignupConsent(page, { profile = false } = {}) {
  await expect(
    page.getByRole('heading', { name: '개인정보 수집·이용 안내', exact: true }),
  ).toBeVisible();
  await page.getByRole('checkbox', { name: requiredConsentLabel, exact: true }).check();
  if (profile) await page.getByRole('checkbox', { name: profileConsentLabel, exact: true }).check();
  await page.getByRole('button', { name: '동의하고 가입 방법 선택', exact: true }).click();
}

export async function acceptKakaoConsent(page, { profile = false } = {}) {
  await expect(
    page.getByRole('heading', { name: '개인정보 수집·이용 안내', exact: true }),
  ).toBeVisible();
  await page.getByRole('checkbox', { name: requiredConsentLabel, exact: true }).check();
  if (profile) await page.getByRole('checkbox', { name: profileConsentLabel, exact: true }).check();
  await page.getByRole('button', { name: '동의하고 가입 계속하기', exact: true }).click();
}
