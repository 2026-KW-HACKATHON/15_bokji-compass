// Search remains available. Only a deliberate click hands the original text to chat.
export function suggestsConversation(query) {
  if (typeof query !== 'string') return false;
  const text = query.normalize('NFKC').trim();
  if (!text || text.length > 200) return false;
  const compact = text.replace(/\s+/g, '');
  const personal = /나는|저는|제가|내가|휴학|취준|취업준비|실직|살고|거주중|재학중|한부모/;
  const request = /지원|장학|생활비|월세|혜택|도움|필요|받을|신청|궁금|알려|찾아|상담/;
  const sentence = /인데|이고|지만|필요해|필요한|필요합니다|싶어|싶습니다|있을까|주세요|알려줘/;
  return (
    (text.length >= 16 && personal.test(compact) && request.test(compact)) ||
    (text.length >= 40 && sentence.test(compact))
  );
}
