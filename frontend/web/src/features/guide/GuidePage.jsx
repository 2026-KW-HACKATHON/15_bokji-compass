import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Bookmark,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  GraduationCap,
  HeartPulse,
  House,
  MessageCircle,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react';
import useGuideSequence from './useGuideSequence.js';
import './guide.css';

const categories = [
  {
    name: '주거',
    icon: House,
    title: '청년 주거 지원 안내',
    summary: '주거비 부담을 덜어주는 지원을 살펴보세요.',
    detail: '거주 지역과 연령, 소득 등 신청 조건을 확인해요.',
  },
  {
    name: '일자리',
    icon: BriefcaseBusiness,
    title: '취업 준비와 직무 교육',
    summary: '새로운 일을 준비하는 데 필요한 지원을 살펴보세요.',
    detail: '모집 대상과 교육 일정, 참여 조건을 확인해요.',
  },
  {
    name: '생활·금융',
    icon: UsersRound,
    title: '생활 안정을 위한 지원',
    summary: '일상에 도움이 되는 생활 지원을 살펴보세요.',
    detail: '가구 구성과 소득 등 신청 조건을 확인해요.',
  },
  {
    name: '교육',
    icon: GraduationCap,
    title: '배움의 기회를 넓히는 지원',
    summary: '학업과 배움에 필요한 지원을 살펴보세요.',
    detail: '지원 대상과 교육 과정, 신청 방법을 확인해요.',
  },
  {
    name: '건강·돌봄',
    icon: HeartPulse,
    title: '건강과 돌봄 서비스',
    summary: '나와 가족을 위한 건강·돌봄 지원을 살펴보세요.',
    detail: '이용 대상과 서비스 내용, 담당 기관을 확인해요.',
  },
];
const sections = [
  { id: 'guide-find', label: '공고 찾기' },
  { id: 'guide-match', label: '맞춤 추천' },
  { id: 'guide-ai', label: 'AI 대화' },
  { id: 'guide-keep', label: '저장과 일정' },
  { id: 'guide-easy', label: '쉬운 화면' },
];
function GuideArrow({ children, onClick, light = false }) {
  return (
    <button
      type="button"
      className={'guide-text-action' + (light ? ' guide-text-action-light' : '')}
      onClick={onClick}
    >
      {children}
      <ArrowRight size={18} aria-hidden="true" />
    </button>
  );
}
function ExampleLabel({ children = '이해를 돕기 위한 예시 화면' }) {
  const { t } = useI18n();
  return (
    <p className="guide-example-label">{typeof children === 'string' ? t(children) : children}</p>
  );
}
function MotionReplay({ sequence, label }) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      className="guide-motion-replay"
      aria-label={t(`${label} 소개 애니메이션 다시 보기`)}
      onClick={sequence.replay}
      hidden={!sequence.canAnimate}
    >
      <RotateCcw size={13} aria-hidden="true" />
      <span>{t('다시 보기')}</span>
    </button>
  );
}

export default function GuidePage({
  onExplore,
  onProfile,
  onCalendar,
  onCalculator,
  onEasyMode,
  onAssistant,
  onChatbot,
}) {
  const { t } = useI18n();
  const page = useRef(null);
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [categoryChanged, setCategoryChanged] = useState(false);
  const [demoSaved, setDemoSaved] = useState(false);
  const [easyPreview, setEasyPreview] = useState(false);
  const [activeSection, setActiveSection] = useState(sections[0].id);
  const searchSequence = useGuideSequence(2800);
  const matchSequence = useGuideSequence(3600);
  const conversationSequence = useGuideSequence(4000);
  const category = categories[categoryIndex];
  const CategoryIcon = category.icon;
  useEffect(() => {
    const root = page.current;
    if (!root || typeof IntersectionObserver === 'undefined') return undefined;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const revealed = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('guide-is-visible');
            revealed.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 },
    );
    if (!reducedMotion.matches) {
      root.querySelectorAll('[data-guide-reveal]').forEach((element) => {
        element.classList.add('guide-will-reveal');
        revealed.observe(element);
      });
    }
    const current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: 0 },
    );
    sections.forEach(({ id }) => {
      const element = root.querySelector('#' + id);
      if (element) current.observe(element);
    });
    return () => {
      revealed.disconnect();
      current.disconnect();
    };
  }, []);
  const scrollTo = (id) => {
    const section = page.current?.querySelector('#' + id);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
    section?.focus({ preventScroll: true });
    setActiveSection(id);
  };
  return (
    <div className="guide-page" ref={page}>
      <section className="guide-hero" aria-labelledby="guide-title">
        <div className="guide-container guide-hero-grid">
          <div className="guide-hero-copy">
            <p className="guide-eyebrow">{t('당신의 일상을 위한 복지 길잡이')}</p>
            <h1 id="guide-title">
              {t('필요한 복지를,')}
              <br />
              {t('발견하는 기쁨.')}
              <br />
              <span>{t('복지나침반.')}</span>
            </h1>
            <p className="guide-lead">
              {t('어디서부터 찾아야 할지 막막할 때.')}
              <br />
              {t('나에게 필요한 공고부터 신청 준비까지,')}
              <br className="guide-mobile-break" />
              {t(' 한 걸음씩 함께해요.')}
            </p>
            <button type="button" className="guide-primary" onClick={onExplore}>
              {t('나에게 필요한 공고 찾기')}
              <ArrowRight size={19} aria-hidden="true" />
            </button>
          </div>
          <div className="guide-hero-visual">
            <img
              className="guide-compass"
              src="/guide-compass.png"
              alt={t('푸른 유리와 은색 금속으로 표현한 나침반')}
              width="1254"
              height="1254"
              fetchPriority="high"
            />
            <span className="guide-art-caption">
              <Sparkles size={15} aria-hidden="true" />
              {t('가능성을 향한 새로운 방향')}
            </span>
          </div>
        </div>
        <div className="guide-container guide-hero-bottom">
          <p>
            {t('찾고. 이해하고. 준비하고.')}
            <br />
            <strong>{t('복지를 만나는 과정이 한결 가벼워집니다.')}</strong>
          </p>
          <button
            type="button"
            className="guide-scroll-button"
            onClick={() => scrollTo('guide-find')}
          >
            {t('복지나침반 알아보기')}
            <ArrowDown size={17} aria-hidden="true" />
          </button>
        </div>
      </section>
      <nav className="guide-section-nav" aria-label={t('서비스 소개 목차')}>
        <div className="guide-container guide-section-nav-inner">
          <span className="guide-nav-title">{t('서비스 소개')}</span>
          <div className="guide-nav-links">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                aria-current={activeSection === section.id ? 'location' : undefined}
                onClick={() => scrollTo(section.id)}
              >
                {t(section.label)}
              </button>
            ))}
          </div>
        </div>
      </nav>
      <section
        className="guide-find guide-section"
        id="guide-find"
        tabIndex={-1}
        aria-labelledby="guide-find-title"
      >
        <div className="guide-container">
          <div className="guide-section-heading guide-centered" data-guide-reveal>
            <p className="guide-eyebrow">{t('01 · 필요한 공고 찾기')}</p>
            <h2 id="guide-find-title">
              {t('복지 정보는 많으니까.')}
              <br />
              <span>{t('내게 필요한 것부터.')}</span>
            </h2>
            <p>
              {t('지역과 관심 분야로 범위를 좁혀보세요.')}
              <br />
              {t('정확한 사업 이름을 몰라도, 필요한 도움에서 시작할 수 있어요.')}
            </p>
          </div>
          <div
            className="guide-search-showcase"
            ref={searchSequence.ref}
            data-guide-reveal
            data-guide-sequence={searchSequence.phase}
            onFocusCapture={searchSequence.finish}
            onPointerDownCapture={searchSequence.finish}
          >
            <div className="guide-demo-toolbar">
              <span data-guide-step="search-prompt">
                <Search size={18} aria-hidden="true" />
                {t('어떤 도움이 필요하세요?')}
              </span>
              <div className="guide-demo-tools">
                <span className="guide-demo-badge">{t('서비스 미리보기')}</span>
                <MotionReplay sequence={searchSequence} label="공고 찾기" />
              </div>
            </div>
            <div className="guide-demo-body">
              <p className="guide-demo-instruction">{t('관심 있는 분야를 눌러보세요')}</p>
              <div
                className="guide-category-tabs"
                role="group"
                aria-label={t('공고 예시의 관심 분야 선택')}
              >
                {categories.map((item, index) => {
                  const ItemIcon = item.icon;
                  return (
                    <button
                      type="button"
                      key={item.name}
                      data-guide-step="category"
                      style={{ '--guide-step-delay': `${400 + index * 90}ms` }}
                      aria-pressed={categoryIndex === index}
                      onClick={() => {
                        setCategoryChanged(true);
                        setCategoryIndex(index);
                      }}
                    >
                      <ItemIcon size={21} aria-hidden="true" />
                      {t(item.name)}
                    </button>
                  );
                })}
              </div>
              <div
                className="guide-demo-result"
                aria-live="polite"
                aria-atomic="true"
                data-guide-step="search-result"
                data-result-motion={categoryChanged}
              >
                <span className="guide-result-icon" key={`${category.name}-icon`}>
                  <CategoryIcon size={28} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <div key={`${category.name}-copy`}>
                  <span className="guide-result-category">
                    {category.name} {t('· 공고 예시')}
                  </span>
                  <h3>{category.title}</h3>
                  <p>{category.summary}</p>
                </div>
                <ChevronRight className="guide-result-chevron" size={22} aria-hidden="true" />
              </div>
              <p className="guide-demo-detail" data-guide-step="search-detail">
                <ShieldCheck size={16} aria-hidden="true" />
                {t(category.detail)}
              </p>
            </div>
            <ExampleLabel>
              {t('공고의 구성과 탐색 방식을 보여주는 예시입니다. 실제 모집 공고가 아닙니다.')}
            </ExampleLabel>
          </div>
          <div className="guide-centered guide-section-cta">
            <GuideArrow light onClick={onExplore}>
              {t('실제 공고 찾아보기')}
            </GuideArrow>
          </div>
        </div>
      </section>
      <section
        className="guide-match guide-section"
        id="guide-match"
        tabIndex={-1}
        aria-labelledby="guide-match-title"
      >
        <div className="guide-container guide-split">
          <div className="guide-section-heading" data-guide-reveal>
            <p className="guide-eyebrow">{t('02 · 내 정보로 맞춤 추천')}</p>
            <h2 id="guide-match-title">
              {t('내 정보를 알려주면,')}
              <br />
              <span>{t('찾는 길은 더 짧게.')}</span>
            </h2>
            <p>
              {t('거주 지역, 연령대, 관심 분야.')}
              <br />
              {t('입력한 정보를 바탕으로 공고를 추천해요.')}
              <br />
              {t('어떤 점이 맞는지, 추천 이유도 함께 살펴보세요.')}
            </p>
            <GuideArrow onClick={onProfile}>{t('내 정보로 맞춤 공고 찾기')}</GuideArrow>
            <p className="guide-fine-print">
              {t('추천은 탐색을 돕는 참고 정보예요.')}
              <br />
              {t('신청 전에 공식 공고의 자격 조건을 확인해 주세요.')}
            </p>
          </div>
          <div
            className="guide-profile-stage"
            ref={matchSequence.ref}
            data-guide-reveal
            data-guide-sequence={matchSequence.phase}
            onFocusCapture={matchSequence.finish}
            onPointerDownCapture={matchSequence.finish}
          >
            <div className="guide-profile-card" data-guide-step="profile">
              <div className="guide-profile-top">
                <span className="guide-user-icon">
                  <UserRound size={24} aria-hidden="true" />
                </span>
                <div>
                  <strong>{t('나의 관심사를 담아서')}</strong>
                  <small>{t('추천에 쓰는 내 정보')}</small>
                </div>
                <SlidersHorizontal size={20} aria-hidden="true" />
              </div>
              <div className="guide-profile-chips">
                <span data-guide-step="profile-chip" style={{ '--guide-step-delay': '450ms' }}>
                  {' '}
                  {t('서울')}{' '}
                </span>
                <span data-guide-step="profile-chip" style={{ '--guide-step-delay': '620ms' }}>
                  {' '}
                  {t('25–29세')}{' '}
                </span>
                <span data-guide-step="profile-chip" style={{ '--guide-step-delay': '790ms' }}>
                  {' '}
                  {t('주거')}{' '}
                </span>
              </div>
            </div>
            <div className="guide-profile-connector" data-guide-step="compare">
              <ArrowDown size={25} aria-hidden="true" />
              <span>{t('입력한 정보와 공고 조건 비교')}</span>
            </div>
            <div className="guide-match-card" data-guide-step="match-result">
              <div className="guide-match-card-title">
                <Sparkles size={19} aria-hidden="true" />
                <span>{t('함께 살펴볼 공고')}</span>
                <span className="guide-small-label">{t('예시')}</span>
              </div>
              <h3>{t('청년 주거 지원 안내')}</h3>
              <p>{t('지역과 연령 등 세부 신청 조건을 확인해 보세요.')}</p>
              <div className="guide-match-reason" data-guide-step="match-reason">
                <Check size={16} aria-hidden="true" />
                {t('선택한 관심 분야 ‘주거’와 관련 있어요')}
              </div>
            </div>
            <div className="guide-profile-footer">
              <ExampleLabel />
              <MotionReplay sequence={matchSequence} label="맞춤 추천" />
            </div>
          </div>
        </div>
      </section>
      <section
        className="guide-ai guide-section"
        id="guide-ai"
        tabIndex={-1}
        aria-labelledby="guide-ai-title"
      >
        <div className="guide-container">
          <div className="guide-split guide-ai-main">
            <div className="guide-section-heading" data-guide-reveal>
              <p className="guide-eyebrow">{t('03 · AI와 함께 살펴보기')}</p>
              <h2 id="guide-ai-title">
                {' '}
                {t('내 상황을 말하면,')} <br />
                <span>{t('다음 단계가 보여요.')}</span>
              </h2>
              <p>
                {' '}
                {t(
                  '취업 준비나 집수리처럼 지금 필요한 도움을 알려주세요. 필요한 정보를 하나씩 확인하고, 관련 지원 후보와 더 살펴볼 조건을 정리해 드려요.',
                )}{' '}
              </p>
              <dl className="guide-ai-points">
                <div>
                  <dt>{t('모르는 정보는 미확인으로')}</dt>
                  <dd>{t('추가로 확인할 조건을 따로 살펴볼 수 있어요.')}</dd>
                </div>
                <div>
                  <dt>{t('관심 지원과 준비 상황은 한곳에')}</dt>
                  <dd>{t('관련 공고와 내가 기록한 신청 진행 상태를 모아봐요.')}</dd>
                </div>
              </dl>
              <button type="button" className="guide-primary" onClick={onAssistant}>
                {' '}
                {t('AI 복지비서 시작하기')} <ArrowRight size={18} aria-hidden="true" />
              </button>
              <p className="guide-fine-print">
                {' '}
                {t('생활 상황 대화는 로그인 후 이용할 수 있어요.')} <br />{' '}
                {t('확인한 정보는 내용을 검토하고 저장에 동의한 뒤 계정에 보관해요.')}{' '}
              </p>
            </div>
            <div
              className="guide-conversation-stage"
              ref={conversationSequence.ref}
              data-guide-reveal
              data-guide-sequence={conversationSequence.phase}
              onFocusCapture={conversationSequence.finish}
              onPointerDownCapture={conversationSequence.finish}
              role="group"
              aria-label={t('AI 복지비서 생활 상황 대화 예시')}
            >
              <div className="guide-conversation-header">
                <span className="guide-conversation-avatar">
                  <Sparkles size={20} aria-hidden="true" />
                </span>
                <div>
                  <strong>{t('AI 복지비서')}</strong>
                  <span>{t('필요한 정보를 하나씩, 함께')}</span>
                </div>
                <span className="guide-conversation-example">{t('예시 대화')}</span>
              </div>
              <div className="guide-conversation-body">
                <div className="guide-message guide-message-user" data-guide-step="ai-question">
                  <span className="guide-message-speaker">{t('사용자')}</span>
                  <p>{t('취업 준비에 도움이 되는 지원이 궁금해요.')}</p>
                </div>
                <div className="guide-message guide-message-assistant" data-guide-step="ai-answer">
                  <span className="guide-message-speaker">{t('AI 복지비서')}</span>
                  <p>
                    {' '}
                    {t('현재 일을 찾고 계신가요?')} <br />{' '}
                    {t('확인할 정보를 하나씩 정리해 볼게요.')}{' '}
                  </p>
                </div>
                <div className="guide-message guide-message-user" data-guide-step="ai-reply">
                  <span className="guide-message-speaker">{t('사용자')}</span>
                  <p>{t('네, 지금 구직 중이에요.')}</p>
                </div>
                <div className="guide-ai-summary" data-guide-step="ai-summary">
                  <h3>
                    <CheckCheck size={16} aria-hidden="true" /> {t('한곳에서 이어서 확인해요')}{' '}
                  </h3>
                  <dl>
                    <div>
                      <dt>{t('관심 지원')}</dt>
                      <dd>{t('취업 · 직업 교육')}</dd>
                    </div>
                    <div>
                      <dt>{t('추가 확인')}</dt>
                      <dd>{t('소득 등 공고별 조건')}</dd>
                    </div>
                    <div className="guide-ai-progress" data-guide-step="ai-progress">
                      <dt>{t('신청 상태')}</dt>
                      <dd>
                        <span>{t('신청 준비 중')}</span>
                        <small>{t('사용자가 직접 기록한 상태')}</small>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              <div className="guide-conversation-footer">
                <ExampleLabel>{t('대화와 정리 방식의 예시입니다.')}</ExampleLabel>
                <MotionReplay sequence={conversationSequence} label="AI 대화" />
              </div>
            </div>
          </div>
          <aside
            className="guide-chatbot-intro"
            aria-labelledby="guide-chatbot-title"
            data-guide-reveal
          >
            <div className="guide-chatbot-icon">
              <MessageCircle size={30} strokeWidth={1.5} aria-hidden="true" />
            </div>
            <div className="guide-chatbot-copy">
              <p className="guide-eyebrow">{t('궁금한 순간, 챗봇으로')}</p>
              <h3 id="guide-chatbot-title">{t('공고를 읽다가 궁금해졌다면.')}</h3>
              <p>
                {' '}
                {t(
                  '지원 대상과 준비 서류를 질문하고, 답변에 제공된 원문 근거를 확인해 보세요. 신청 일정과 이용 방법도 안내해요.',
                )}{' '}
              </p>
              <p className="guide-chatbot-continuation">
                {' '}
                {t(
                  '생활 상황 상담은 작은 창에서 시작해 AI 복지비서 화면에서 이어갈 수 있어요.',
                )}{' '}
              </p>
              <p className="guide-chatbot-note">
                {' '}
                {t(
                  '이용 안내는 누구나 볼 수 있고, 생활 상황 대화와 공고 질문은 로그인 후 이용할 수 있어요. 신청 자격은 공식 공고에서 확인해 주세요.',
                )}{' '}
              </p>
            </div>
            <button type="button" className="guide-secondary" onClick={onChatbot}>
              {' '}
              {t('챗봇 열어보기')} <ArrowRight size={18} aria-hidden="true" />
            </button>
          </aside>
        </div>
      </section>
      <section
        className="guide-keep guide-section"
        id="guide-keep"
        tabIndex={-1}
        aria-labelledby="guide-keep-title"
      >
        <div className="guide-container">
          <div className="guide-section-heading guide-centered" data-guide-reveal>
            <p className="guide-eyebrow">{t('04 · 관심 공고와 신청 일정')}</p>
            <h2 id="guide-keep-title">
              {t('좋은 발견이,')}
              <br />
              <span>{t('다음 행동으로 이어지도록.')}</span>
            </h2>
            <p>
              {t('관심 있는 공고는 저장하고, 신청 일정은 캘린더에서.')}
              <br />
              {t('다시 찾는 수고를 줄이고 차근차근 준비하세요.')}
            </p>
          </div>
          <div className="guide-keep-grid" data-guide-reveal>
            <article className="guide-save-panel">
              <div className="guide-panel-kicker">
                <Bookmark size={20} aria-hidden="true" />
                <span>{t('저장한 공고')}</span>
              </div>
              <h3>
                {t('마음에 드는 공고는')}
                <br />
                {t('책갈피로 모아두세요.')}
              </h3>
              <div className="guide-saved-demo">
                <div>
                  <span className="guide-small-label">{t('공고 예시')}</span>
                  <strong>{t('청년 주거 지원 안내')}</strong>
                  <small>{t('주거 · 신청 조건 확인 필요')}</small>
                </div>
                <button
                  type="button"
                  className={'guide-bookmark-demo' + (demoSaved ? ' is-saved' : '')}
                  aria-label={demoSaved ? t('예시 공고 저장 해제') : t('예시 공고 저장하기')}
                  aria-pressed={demoSaved}
                  onClick={() => setDemoSaved((value) => !value)}
                >
                  <Bookmark
                    size={23}
                    fill={demoSaved ? 'currentColor' : 'none'}
                    aria-hidden="true"
                  />
                </button>
              </div>
              <p className="guide-save-feedback" role="status">
                {demoSaved ? (
                  <>
                    <CheckCheck size={17} aria-hidden="true" />
                    {t('예시 공고를 저장했어요. 한 번 더 누르면 해제돼요.')}
                  </>
                ) : (
                  <>
                    <ArrowRight size={17} aria-hidden="true" />
                    {t('책갈피를 눌러 저장을 체험해 보세요.')}
                  </>
                )}
              </p>
              <p className="guide-panel-note">
                {t('실제 공고는 공고 카드의 책갈피를 누르면')}
                <br />
                {t('‘저장한 공고’에서 다시 볼 수 있어요.')}
              </p>
            </article>
            <article className="guide-calendar-panel">
              <div className="guide-panel-kicker">
                <CalendarDays size={20} aria-hidden="true" />
                <span>{t('공고 캘린더')}</span>
              </div>
              <h3>
                {t('시작하는 날도,')}
                <br />
                {t('마감하는 날도 한눈에.')}
              </h3>
              <div
                className="guide-calendar-preview"
                aria-label={t('신청 시작일을 표시한 일정 예시')}
              >
                <div className="guide-calendar-heading">
                  <strong>{t('신청 일정')}</strong>
                  <span>{t('예시')}</span>
                </div>
                <div className="guide-calendar-days">
                  {[
                    [t('월'), '12'],
                    [t('화'), '13'],
                    [t('수'), '14'],
                    [t('목'), '15'],
                    [t('금'), '16'],
                  ].map(([day, date]) => (
                    <div key={day} className={date === '14' ? 'guide-selected-date' : ''}>
                      <span>{t(day)}</span>
                      <strong>{date}</strong>
                    </div>
                  ))}
                </div>
                <div className="guide-calendar-event">
                  <span>{t('신청 시작')}</span>
                  <strong>{t('청년 주거 지원 안내')}</strong>
                </div>
              </div>
              <GuideArrow onClick={onCalendar}>{t('공고 캘린더 열기')}</GuideArrow>
            </article>
          </div>
        </div>
      </section>
      <section
        className="guide-easy guide-section"
        id="guide-easy"
        tabIndex={-1}
        aria-labelledby="guide-easy-title"
      >
        <div className="guide-container guide-split">
          <div className="guide-easy-stage" data-guide-reveal>
            <div className="guide-preview-controls">
              <span>{t('직접 바꿔보세요')}</span>
              <button
                type="button"
                role="switch"
                aria-checked={easyPreview}
                aria-label={t('예시 화면을 쉬운 화면으로 보기')}
                className="guide-preview-switch"
                onClick={() => setEasyPreview((value) => !value)}
              >
                <span>{t('쉬운 화면')}</span>
                <span className="guide-switch-track">
                  <span />
                </span>
              </button>
            </div>
            <div
              className={'guide-easy-preview' + (easyPreview ? ' is-easy' : '')}
              aria-live="polite"
            >
              <span className="guide-small-label">
                {easyPreview ? t('쉬운 화면 예시') : t('기본 화면 예시')}
              </span>
              <h3>
                {t('나에게 필요한')}
                <br />
                {t('복지 공고를 찾아보세요.')}
              </h3>
              {!easyPreview && (
                <p className="guide-preview-description">
                  {t('지역과 관심 분야를 선택해 필요한 지원을 살펴보세요.')}
                </p>
              )}
              <div className="guide-preview-policy">
                <House size={22} aria-hidden="true" />
                <div>
                  <strong>{t('청년 주거 지원 안내')}</strong>
                  <span>
                    {easyPreview
                      ? t('지원 내용과 신청 조건을 확인하세요.')
                      : t('주거 · 청년 · 신청 조건 확인 필요')}
                  </span>
                </div>
              </div>
              {!easyPreview && (
                <div className="guide-preview-policy">
                  <BriefcaseBusiness size={22} aria-hidden="true" />
                  <div>
                    <strong>{t('일자리 교육 프로그램')}</strong>
                    <span>{t('일자리 · 교육 · 일정 확인 필요')}</span>
                  </div>
                </div>
              )}
              <button type="button" className="guide-preview-action" onClick={onExplore}>
                {t('공고 찾아보기')}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
            <ExampleLabel>{t('글자 크기와 정보 구성이 달라지는 예시입니다.')}</ExampleLabel>
          </div>
          <div className="guide-section-heading" data-guide-reveal>
            <p className="guide-eyebrow">{t('05 · 나에게 편한 방식으로')}</p>
            <h2 id="guide-easy-title">
              {t('조금 더 크게.')}
              <br />
              {t('한결 더 ')}
              <span>{t('편안하게.')}</span>
            </h2>
            <p>
              {t('작은 글씨와 복잡한 화면이 불편하다면,')}
              <br />
              {t('‘쉬운 화면’을 켜보세요.')}
              <br />
              {t('글자는 키우고, 중요한 정보는 더 또렷하게 보여드려요.')}
            </p>
            <GuideArrow onClick={onEasyMode}>{t('쉬운 화면으로 시작하기')}</GuideArrow>
          </div>
        </div>
      </section>
      <section className="guide-prepare guide-section" aria-labelledby="guide-prepare-title">
        <div className="guide-container guide-prepare-inner" data-guide-reveal>
          <div className="guide-section-heading">
            <p className="guide-eyebrow">{t('신청 전, 한 번 더 확인하세요')}</p>
            <h2 id="guide-prepare-title">
              {t('발견은 쉽게.')}
              <br />
              <span>{t('확인은 꼼꼼하게.')}</span>
            </h2>
          </div>
          <div className="guide-prepare-notes">
            <div>
              <span className="guide-note-number">01</span>
              <div>
                <h3>{t('신청 조건은 공식 공고에서')}</h3>
                <p>
                  {t(
                    '지원 대상, 제출 서류, 신청 기간을 확인한 뒤 담당 기관의 안내에 따라 신청하세요.',
                  )}
                </p>
              </div>
            </div>
            <div>
              <span className="guide-note-number">02</span>
              <div>
                <h3>{t('소득 기준은 계산기로 미리')}</h3>
                <p>
                  {t(
                    '가구원 수에 따른 중위소득 기준과 소득·재산 참고 결과를 살펴볼 수 있어요. 실제 심사 결과와는 다를 수 있어요.',
                  )}
                </p>
                <GuideArrow onClick={onCalculator}>{t('계산기 살펴보기')}</GuideArrow>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="guide-finale" aria-labelledby="guide-finale-title">
        <div className="guide-container guide-centered" data-guide-reveal>
          <img src="/brand-logo.png" alt="" width="68" height="68" loading="lazy" />
          <p className="guide-eyebrow">{t('당신에게 닿아야 할 기회가 있으니까')}</p>
          <h2 id="guide-finale-title">
            {t('이제, 나의 복지를')}
            <br />
            <span>{t('발견할 차례.')}</span>
          </h2>
          <p>{t('첫걸음은 가볍게. 복지나침반과 함께 시작하세요.')}</p>
          <div className="guide-finale-actions">
            <button type="button" className="guide-primary" onClick={onExplore}>
              {t('공고 찾아보기')}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button type="button" className="guide-secondary" onClick={onProfile}>
              {t('맞춤 추천 시작하기')}
            </button>
          </div>
          <span className="guide-finale-caption">{t('나를 위한 복지 길잡이, 복지나침반')}</span>
        </div>
      </section>
    </div>
  );
}
