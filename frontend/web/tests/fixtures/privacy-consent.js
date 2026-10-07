import { expect } from '@playwright/test';

export const consentVersion = '2026-10-07.3';
export const requiredConsentLabel = '[필수] 회원가입 개인정보 수집·이용에 동의합니다.';
export const profileConsentLabel = '[선택] 맞춤 안내용 개인정보 수집·이용에 동의합니다.';
export const aiConsentLabel = '[선택] 외부 AI 처리 및 개인정보 국외이전에 동의합니다.';
export const privacyNotice = {
  version: consentVersion,
  operator_name: '복지나침반 팀',
  contact_email: 'privacy@example.com',
  retention: '회원 계정 유지 기간 동안 보관하며 회원 탈퇴 시 즉시 삭제합니다.',
  ai: { enabled: false },
};

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
