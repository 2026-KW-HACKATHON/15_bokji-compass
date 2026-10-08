export const NOTICE_VERSION = "2026-10-07.3";
export const normalizeEmail = (value) => value.trim().toLowerCase();
export function emailError(value) {
  const email = normalizeEmail(value);
  return email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? "이메일 주소를 확인해 주세요."
    : "";
}
export function credentialsError(fields) {
  if (!/^[a-zA-Z0-9_]{4,20}$/.test(fields.username))
    return "아이디는 영문·숫자·밑줄(_)로 4~20자 입력해 주세요.";
  if (
    fields.password.length < 8 ||
    fields.password.length > 128 ||
    !/[a-zA-Z]/.test(fields.password) ||
    !/[0-9]/.test(fields.password)
  )
    return "비밀번호는 영문과 숫자를 포함해 8~128자 입력해 주세요.";
  if (fields.password !== fields.confirm_password)
    return "비밀번호가 서로 달라요. 다시 확인해 주세요.";
  return "";
}
export function validNotice(notice) {
  return (
    notice?.version === NOTICE_VERSION &&
    typeof notice.operator_name === "string" &&
    !!notice.operator_name &&
    typeof notice.contact_email === "string" &&
    !!notice.contact_email &&
    typeof notice.retention === "string" &&
    !!notice.retention
  );
}
export function signupConsent(
  notice,
  { collection, profile = false, ai = false },
) {
  if (!validNotice(notice) || !collection)
    throw new Error("최신 안내문을 확인하고 필수 수집·이용에 동의해 주세요.");
  if (
    ai &&
    (!notice.ai?.enabled || typeof notice.ai.notice_version !== "string")
  )
    throw new Error("외부 AI 안내를 다시 확인해 주세요.");
  return {
    notice_version: notice.version,
    collection: true,
    profile,
    ai,
    ...(ai ? { ai_notice_version: notice.ai.notice_version } : {}),
  };
}
