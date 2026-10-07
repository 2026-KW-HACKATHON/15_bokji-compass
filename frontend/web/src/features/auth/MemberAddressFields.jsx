import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { useEffect, useRef, useState } from 'react';
import { loadPostcode, selectedMemberAddress } from './postcode.js';
import './member-address.css';

export default function MemberAddressFields({
  value,
  onChange,
  idPrefix = 'member',
  label = '회원 거주 주소 (선택)',
  disabled = false,
}) {
  const { t } = useI18n();
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const hostRef = useRef(null);
  const searchRef = useRef(null);
  const detailRef = useRef(null);
  const headingRef = useRef(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const id = (name) => `${idPrefix}-${name}`;

  useEffect(() => {
    if (!searching || disabled) return;
    let active = true;
    const host = hostRef.current;
    headingRef.current?.focus();
    setLoading(true);
    setError('');
    loadPostcode()
      .then((Postcode) => {
        if (!active) return;
        new Postcode({
          width: '100%',
          height: '100%',
          minWidth: 240,
          onresize: (size) => {
            if (active && Number.isFinite(size.height))
              host.style.height = `${Math.max(320, Math.min(600, size.height))}px`;
          },
          oncomplete: (data) => {
            if (!active) return;
            try {
              const address = selectedMemberAddress(data);
              changeRef.current(address);
              setSearching(false);
              requestAnimationFrame(() => detailRef.current?.focus());
            } catch (err) {
              setError(err.message);
            }
          },
        }).embed(host);
        const iframe = host.querySelector('iframe');
        if (iframe) iframe.title = t('거주 주소 검색');
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message);
        setLoading(false);
        setSearching(false);
        requestAnimationFrame(() => searchRef.current?.focus());
      });
    return () => {
      active = false;
      host.replaceChildren();
    };
  }, [searching, disabled, t]);

  function closeSearch() {
    setSearching(false);
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  return (
    <div className="member-address-fields" role="group" aria-labelledby={id('address-label')}>
      <span className="field-label" id={id('address-label')}>
        {t(label)}
      </span>
      <div className="member-postcode-row">
        <label className="field-label" htmlFor={id('postal_code')}>
          {t('우편번호')}
          <input
            id={id('postal_code')}
            name="postal_code"
            value={value.postal_code || ''}
            autoComplete="postal-code"
            placeholder={t('우편번호')}
            readOnly
          />
        </label>
        <button
          type="button"
          className="button secondary"
          ref={searchRef}
          disabled={disabled || searching}
          aria-expanded={searching}
          aria-controls={id('address-search')}
          onClick={() => setSearching(true)}
        >
          {t('주소 검색')}
        </button>
      </div>
      {searching && (
        <section
          className="member-address-search"
          id={id('address-search')}
          aria-labelledby={id('search-title')}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              closeSearch();
            }
          }}
        >
          <div className="member-address-search-heading">
            <h3 id={id('search-title')} tabIndex={-1} ref={headingRef}>
              {t('거주 주소 검색')}
            </h3>
            <button type="button" className="text-button" onClick={closeSearch}>
              {t('주소 검색 닫기')}
            </button>
          </div>
          {loading && <p role="status">{t('주소 검색을 불러오고 있어요…')}</p>}
          <div className="member-address-search-host" ref={hostRef} />
        </section>
      )}
      {error && (
        <p role="alert" className="auth-error">
          {t(error)}
        </p>
      )}
      <label className="field-label" htmlFor={id('address')}>
        {t('기본 주소')}
        <input
          id={id('address')}
          name="address"
          value={value.address || ''}
          autoComplete="address-line1"
          placeholder={t('주소 검색에서 도로명 또는 지번 주소를 선택해 주세요')}
          readOnly
        />
      </label>
      <label className="field-label" htmlFor={id('address_detail')}>
        {t('상세 주소')}
        <input
          id={id('address_detail')}
          name="address_detail"
          value={value.address_detail || ''}
          autoComplete="address-line2"
          placeholder={t('동·호수 등 상세 주소')}
          maxLength={200}
          disabled={disabled || !value.address}
          ref={detailRef}
          onChange={(event) => changeRef.current({ address_detail: event.target.value })}
        />
      </label>
      <small className="member-address-hint">
        {value.address
          ? t('거주 지역 · {region}. 주소에서 확인한 지역을 복지 안내에 참고해요.', {
              region: t(value.region),
            })
          : value.region
            ? t('기존 거주 지역 · {region}. 주소 검색으로 정확한 주소를 추가할 수 있어요.', {
                region: t(value.region),
              })
            : t('도로명·건물명·지번으로 검색한 뒤 상세 주소를 입력해 주세요.')}
      </small>
      <small className="member-address-hint">
        {t('주소 검색은 카카오 우편번호 서비스를 이용해요. 상세 주소는 회원 정보에 저장돼요.')}
      </small>
      {(value.address || value.region) && (
        <button
          type="button"
          className="text-button member-address-clear"
          disabled={disabled}
          onClick={() => {
            changeRef.current({ region: '', postal_code: '', address: '', address_detail: '' });
            setError('');
            closeSearch();
          }}
        >
          {t('주소 지우기')}
        </button>
      )}
    </div>
  );
}
