export const genders = [
  ['male', '남성'],
  ['female', '여성'],
  ['other', '기타'],
  ['undisclosed', '응답하지 않음'],
];

export function memberFieldError(name, value) {
  if (name === 'name' && (!value.trim() || value.length > 50 || /[\x00-\x1f]/.test(value)))
    return '이름을 1~50자로 입력해 주세요.';
  if (
    name === 'age' &&
    (String(value).trim() === '' ||
      !Number.isInteger(Number(value)) ||
      Number(value) < 0 ||
      Number(value) > 120)
  )
    return '만 나이를 0~120 사이의 숫자로 입력해 주세요.';
  if (name === 'gender' && !genders.some(([key]) => key === value))
    return '성별을 선택해 주세요. 원하지 않으면 ‘응답하지 않음’을 선택할 수 있습니다.';
  return '';
}
