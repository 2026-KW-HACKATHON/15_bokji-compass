import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import Icon from '../../shared/ui/Icon.jsx';
export default function FinanceHelp({ name }) {
  const { t, intlLocale } = useI18n();

  const help = {
    household: (
      <details className="finance-details">
        <summary>{t('누구의 소득을 입력하나요?')}</summary>
        <p>
          {' '}
          {t(
            '함께 사는 사람과 지원 사업의 심사에 포함되는 가구원은 다를 수 있어요. 생계급여의 보장가구와 국민임대의 세대 구성 기준을 각각 공식 안내에서 확인해 주세요. 아직 확인하지 않았다면 확인란을 선택하지 않아도 계산할 수 있어요.',
          )}{' '}
        </p>
        <p>
          {' '}
          {t(
            '가구원 수를 줄이면 목록의 마지막 가구원부터 계산에서 제외돼요. 이 화면에서 가구원 수를 다시 늘리면 입력했던 내용이 복원돼요.',
          )}{' '}
        </p>
      </details>
    ),
    period: (
      <details className="finance-details finance-guidance">
        <summary>{t('어떤 기간의 금액을 입력하나요?')}</summary>
        <p>
          {' '}
          {t(
            '모든 소득을 최근 3개월로 맞추지 마세요. 지원 사업과 소득 종류에 따라 확인하는 자료와 기간이 다릅니다.',
          )}{' '}
        </p>
        <dl className="finance-guidance-list">
          <div>
            <dt>{t('상시근로소득')}</dt>
            <dd>{t('건강보험·국세청 등 공적 자료의 월 보수나 연간 소득을 확인합니다.')}</dd>
          </div>
          <div>
            <dt>{t('일용근로소득')}</dt>
            <dd>
              {t('기초생활보장 신청 조사는 최근 3개월, 확인 조사는 최근 6개월을 구분합니다.')}
            </dd>
          </div>
          <div>
            <dt>{t('연금')}</dt>
            <dd>{t('전월 지급액 등 해당 사업에서 정한 자료를 확인합니다.')}</dd>
          </div>
        </dl>
        <p>
          {' '}
          {t(
            '입력한 자료의 기간과 공고가 요구하는 조사 기간은 다를 수 있어요. 국민임대 등 개별 공고의 기준도 확인해 주세요. 기준이 불확실하면 금액을 임의로 나누거나 평균 내지 말고 모르는 항목으로 남겨 주세요.',
          )}{' '}
        </p>
      </details>
    ),
    income: (
      <details className="finance-details">
        <summary>{t('세전 금액과 공적 소득 자료가 다른가요?')}</summary>
        <p>
          {' '}
          {t(
            '세후 실수령액만 알고 있다면 금액을 입력한 뒤 ‘실수령액 (세후)’를 선택하세요. 세전 금액으로 추측해서 바꾸지 않습니다.',
          )}{' '}
        </p>
        <p>
          {' '}
          {t(
            '실제 심사에서는 공적 소득 자료를 사용하며 비과세 항목 등 반영 범위가 다를 수 있어요. 급여명세서의 총지급액이 모든 사업의 심사 소득과 같지는 않습니다.',
          )}{' '}
        </p>
      </details>
    ),
    deduction: (
      <details className="finance-details">
        <summary>{t('공제 유형 선택 도움말')}</summary>
        <p>
          {' '}
          {t(
            '해당 가구원에게 적용되는 유형을 선택하세요. 학생·북한이탈주민 등의 특례는 자격과 적용 기간을 추가 확인해야 합니다. 확실하지 않으면 ‘모름’을 선택하세요. 금액을 직접 공제해서 입력하지 마세요.',
          )}{' '}
        </p>
      </details>
    ),
    debt: (
      <details className="finance-details">
        <summary>{t('어떤 부채를 어디에 입력하나요?')}</summary>
        <p>
          {' '}
          {t(
            '마이너스통장, 1년 이내 카드론, 기업대출, 개인 간 차용금은 ‘추가 확인이 필요한 부채’에 입력하세요. 모든 부채가 재산에서 공제되는 것은 아닙니다. 공제 가능한 범위는 담당 기관에서 확인해야 합니다.',
          )}{' '}
        </p>
      </details>
    ),
    vehicle: (
      <details className="finance-details">
        <summary>{t('차량 가액은 어디서 확인하나요?')}</summary>
        <p>
          {' '}
          {t(
            '신청할 공고에서 지정한 차량가액 조회처와 기준일을 먼저 확인하세요. 현재 구입 가격이나 중고 시세만 안다면 해당 기준을 선택해 참고값으로 남길 수 있어요.',
          )}{' '}
        </p>
        <p>
          {' '}
          {t(
            '일부 LH 공고는 홈택스에서 차량가액을 조회하도록 안내합니다. 조회 금액과 실제 심사에 쓰는 개별 차량가액은 다를 수 있어요.',
          )}{' '}
        </p>
        <div className="finance-help-links">
          <a href="https://www.hometax.go.kr/" target="_blank" rel="noopener noreferrer">
            {' '}
            {t('홈택스에서 확인')} <Icon name="external" size={17} />
            <span className="sr-only">{t('새 창')}</span>
          </a>
          <a
            href="https://apply.lh.or.kr/lhapply/lhFile.do?fileid=68228411"
            target="_blank"
            rel="noopener noreferrer"
          >
            {' '}
            {t('LH 조회 안내 예시 (공고 31쪽)')} <Icon name="external" size={17} />
            <span className="sr-only">{t('PDF 새 창')}</span>
          </a>
        </div>
        <p>
          {' '}
          {t(
            '영업용 등록, 실제 생업 사용, 장애인·국가유공자 사용은 서로 다른 정보입니다. 해당한다고 선택해도 재산에서 자동 제외하거나 특례를 확정하지 않습니다.',
          )}{' '}
        </p>
      </details>
    ),
  };
  return help[name] ?? null;
}
