import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Pause, Play, Sparkles } from 'lucide-react';
import Icon from '../../shared/ui/Icon.jsx';
import './HomeBanner.css';

export default function HomeBanner({ children, easy, onCalendar }) {
  const { t, intlLocale } = useI18n();

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduceMotion = () => {
      if (preference.matches) setPlaying(false);
    };
    document.addEventListener('visibilitychange', visibility);
    preference.addEventListener('change', reduceMotion);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      preference.removeEventListener('change', reduceMotion);
    };
  }, []);
  useEffect(() => {
    if (!playing || hovered || !visible) return;
    const timer = setTimeout(() => setIndex((current) => (current + 1) % 2), 8000);
    return () => clearTimeout(timer);
  }, [index, playing, hovered, visible]);
  function choose(next) {
    setPlaying(false);
    setIndex(next);
  }
  return (
    <section
      className="home-carousel"
      aria-label={t('홈 안내 배너')}
      aria-roledescription={t('캐러셀')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={(event) => {
        if (
          !event.target.closest('[data-rotation-control]') &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setPlaying(false);
      }}
    >
      <div className="home-banner-viewport">
        <div
          className={'home-banner-slide' + (index === 0 ? ' is-active' : '')}
          aria-hidden={index !== 0}
          inert={index !== 0}
        >
          {children}
        </div>
        <div
          className={'home-banner-slide' + (index === 1 ? ' is-active' : '')}
          aria-hidden={index !== 1}
          inert={index !== 1}
        >
          <section className="calendar-promo">
            <div className="calendar-promo-copy">
              <span className="calendar-promo-kicker">
                <CalendarDays size={18} aria-hidden="true" /> {t('새로운 공고 캘린더')}{' '}
              </span>
              <h1>
                {easy ? (
                  <>
                    {' '}
                    {t('복지 신청 일정,')} <br /> {t('달력으로 확인해요.')}{' '}
                  </>
                ) : (
                  <>
                    {' '}
                    {t('신청 시작부터 마감까지,')} <br />
                    <em>{t('달력으로 한눈에.')}</em>
                  </>
                )}
              </h1>
              <p>
                {' '}
                {t('관심 분야와 지역으로 골라보고')} <br className="desktop-break" />{' '}
                {t('신청할 날짜를 확인하세요.')}{' '}
              </p>
              <button className="button primary" onClick={onCalendar}>
                {' '}
                {t('공고 캘린더 보기')} <Icon name="arrow" />
              </button>
            </div>
            <div className="calendar-promo-art" aria-hidden="true">
              <span className="promo-sparkle">
                <Sparkles size={30} />
              </span>
              <div className="promo-paper">
                <div className="promo-binding">
                  <i />
                  <i />
                </div>
                <div className="promo-paper-heading">
                  <span>{t('신청 일정')}</span>
                  <CalendarDays size={22} />
                </div>
                <div className="promo-weekdays">
                  {Array.from({ length: 7 }, (_, index) =>
                    new Intl.DateTimeFormat(intlLocale, {
                      weekday: 'short',
                      timeZone: 'Asia/Seoul',
                    }).format(new Date(Date.UTC(2026, 0, 4 + index))),
                  ).map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="promo-days">
                  {Array.from({ length: 28 }, (_, day) => (
                    <span key={day} className={day === 7 ? 'start' : day === 23 ? 'end' : ''}>
                      {day + 1}
                    </span>
                  ))}
                </div>
              </div>
              <span className="promo-date-label start">
                <i /> {t('신청 시작')}{' '}
              </span>
              <span className="promo-date-label end">
                <i /> {t('신청 마감')}{' '}
              </span>
            </div>
          </section>
        </div>
      </div>
      <div className="home-banner-controls">
        <span className="home-banner-name">
          {index === 0 ? t('나를 위한 복지 비서') : t('신청 일정 한눈에 보기')}
        </span>
        <div className="home-banner-pagination">
          <button aria-label={t('이전 배너')} onClick={() => choose((index + 1) % 2)}>
            <ChevronLeft size={19} aria-hidden="true" />
          </button>
          <div className="home-banner-dots">
            {['추천 안내', '공고 캘린더 안내'].map((label, value) => (
              <button
                key={label}
                aria-label={t('{label} 배너 보기', { label: t(label) })}
                aria-pressed={index === value}
                onClick={() => choose(value)}
              >
                <span />
              </button>
            ))}
          </div>
          <span className="home-banner-counter" aria-live={playing ? 'off' : 'polite'}>
            {index + 1} / 2
          </span>
          <button aria-label={t('다음 배너')} onClick={() => choose((index + 1) % 2)}>
            <ChevronRight size={19} aria-hidden="true" />
          </button>
          <button
            data-rotation-control
            aria-label={playing ? t('배너 자동 전환 멈추기') : t('배너 자동 전환 시작하기')}
            onClick={() => setPlaying((value) => !value)}
          >
            {playing ? (
              <Pause size={17} aria-hidden="true" />
            ) : (
              <Play size={17} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
