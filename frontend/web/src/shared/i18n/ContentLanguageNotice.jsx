import { useI18n } from './I18nProvider.jsx';

export default function ContentLanguageNotice() {
  const { locale, t } = useI18n();
  if (locale === 'ko') return null;
  return (
    <p className="content-language-notice">
      {t(
        '공고는 선택한 언어로 번역합니다. AI 상담 답변은 현재 한국어로 제공됩니다. 신청 조건은 공식 원문에서 확인해 주세요.',
      )}
    </p>
  );
}
