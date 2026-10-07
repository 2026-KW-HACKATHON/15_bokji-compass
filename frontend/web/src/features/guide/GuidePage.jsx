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
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react';
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
  return <p className="guide-example-label">{children}</p>;
}

export default function GuidePage({ onExplore, onProfile, onCalendar, onCalculator, onEasyMode }) {
  const page = useRef(null);
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [demoSaved, setDemoSaved] = useState(false);
  const [easyPreview, setEasyPreview] = useState(false);
  const [activeSection, setActiveSection] = useState(sections[0].id);
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
            <p className="guide-eyebrow">당신의 일상을 위한 복지 길잡이</p>
            <h1 id="guide-title">
              필요한 복지를,
              <br />
              발견하는 기쁨.
              <br />
              <span>복지나침반.</span>
            </h1>
            <p className="guide-lead">
              어디서부터 찾아야 할지 막막할 때.
              <br />
              나에게 필요한 공고부터 신청 준비까지,
              <br className="guide-mobile-break" /> 한 걸음씩 함께해요.
            </p>
            <button type="button" className="guide-primary" onClick={onExplore}>
              나에게 필요한 공고 찾기
              <ArrowRight size={19} aria-hidden="true" />
            </button>
          </div>
          <div className="guide-hero-visual">
            <img
              className="guide-compass"
              src="/guide-compass.png"
              alt="푸른 유리와 은색 금속으로 표현한 나침반"
              width="1254"
              height="1254"
              fetchPriority="high"
            />
            <span className="guide-art-caption">
              <Sparkles size={15} aria-hidden="true" />
              가능성을 향한 새로운 방향
            </span>
          </div>
        </div>
        <div className="guide-container guide-hero-bottom">
          <p>
            찾고. 이해하고. 준비하고.
            <br />
            <strong>복지를 만나는 과정이 한결 가벼워집니다.</strong>
          </p>
          <button
            type="button"
            className="guide-scroll-button"
            onClick={() => scrollTo('guide-find')}
          >
            복지나침반 알아보기
            <ArrowDown size={17} aria-hidden="true" />
          </button>
        </div>
      </section>
      <nav className="guide-section-nav" aria-label="서비스 소개 목차">
        <div className="guide-container guide-section-nav-inner">
          <span className="guide-nav-title">복지나침반 사용 안내</span>
          <div className="guide-nav-links">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                aria-current={activeSection === section.id ? 'location' : undefined}
                onClick={() => scrollTo(section.id)}
              >
                {section.label}
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
            <p className="guide-eyebrow">01 · 필요한 공고 찾기</p>
            <h2 id="guide-find-title">
              복지 정보는 많으니까.
              <br />
              <span>내게 필요한 것부터.</span>
            </h2>
            <p>
              지역과 관심 분야로 범위를 좁혀보세요.
              <br />
              정확한 사업 이름을 몰라도, 필요한 도움에서 시작할 수 있어요.
            </p>
          </div>
          <div className="guide-search-showcase" data-guide-reveal>
            <div className="guide-demo-toolbar">
              <span>
                <Search size={18} aria-hidden="true" />
                어떤 도움이 필요하세요?
              </span>
              <span className="guide-demo-badge">서비스 미리보기</span>
            </div>
            <div className="guide-demo-body">
              <p className="guide-demo-instruction">관심 있는 분야를 눌러보세요</p>
              <div
                className="guide-category-tabs"
                role="group"
                aria-label="공고 예시의 관심 분야 선택"
              >
                {categories.map((item, index) => {
                  const ItemIcon = item.icon;
                  return (
                    <button
                      type="button"
                      key={item.name}
                      aria-pressed={categoryIndex === index}
                      onClick={() => setCategoryIndex(index)}
                    >
                      <ItemIcon size={21} aria-hidden="true" />
                      {item.name}
                    </button>
                  );
                })}
              </div>
              <div className="guide-demo-result" aria-live="polite" aria-atomic="true">
                <span className="guide-result-icon">
                  <CategoryIcon size={28} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <div>
                  <span className="guide-result-category">{category.name} · 공고 예시</span>
                  <h3>{category.title}</h3>
                  <p>{category.summary}</p>
                </div>
                <ChevronRight className="guide-result-chevron" size={22} aria-hidden="true" />
              </div>
              <p className="guide-demo-detail">
                <ShieldCheck size={16} aria-hidden="true" />
                {category.detail}
              </p>
            </div>
            <ExampleLabel>
              공고의 구성과 탐색 방식을 보여주는 예시입니다. 실제 모집 공고가 아닙니다.
            </ExampleLabel>
          </div>
          <div className="guide-centered guide-section-cta">
            <GuideArrow light onClick={onExplore}>
              실제 공고 찾아보기
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
            <p className="guide-eyebrow">02 · 내 정보로 맞춤 추천</p>
            <h2 id="guide-match-title">
              내 정보를 알려주면,
              <br />
              <span>찾는 길은 더 짧게.</span>
            </h2>
            <p>
              거주 지역, 연령대, 관심 분야.
              <br />
              입력한 정보를 바탕으로 공고를 추천해요.
              <br />
              어떤 점이 맞는지, 추천 이유도 함께 살펴보세요.
            </p>
            <GuideArrow onClick={onProfile}>내 정보로 맞춤 공고 찾기</GuideArrow>
            <p className="guide-fine-print">
              추천은 탐색을 돕는 참고 정보예요.
              <br />
              신청 전에 공식 공고의 자격 조건을 확인해 주세요.
            </p>
          </div>
          <div className="guide-profile-stage" data-guide-reveal>
            <div className="guide-profile-card">
              <div className="guide-profile-top">
                <span className="guide-user-icon">
                  <UserRound size={24} aria-hidden="true" />
                </span>
                <div>
                  <strong>나의 관심사를 담아서</strong>
                  <small>추천에 쓰는 내 정보</small>
                </div>
                <SlidersHorizontal size={20} aria-hidden="true" />
              </div>
              <div className="guide-profile-chips">
                <span>서울</span>
                <span>25–29세</span>
                <span>주거</span>
              </div>
            </div>
            <div className="guide-profile-connector">
              <ArrowDown size={25} aria-hidden="true" />
              <span>입력한 정보와 공고 조건 비교</span>
            </div>
            <div className="guide-match-card">
              <div className="guide-match-card-title">
                <Sparkles size={19} aria-hidden="true" />
                <span>함께 살펴볼 공고</span>
                <span className="guide-small-label">예시</span>
              </div>
              <h3>청년 주거 지원 안내</h3>
              <p>지역과 연령 등 세부 신청 조건을 확인해 보세요.</p>
              <div className="guide-match-reason">
                <Check size={16} aria-hidden="true" />
                선택한 관심 분야 ‘주거’와 관련 있어요
              </div>
            </div>
            <ExampleLabel />
          </div>
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
            <p className="guide-eyebrow">03 · 관심 공고와 신청 일정</p>
            <h2 id="guide-keep-title">
              좋은 발견이,
              <br />
              <span>다음 행동으로 이어지도록.</span>
            </h2>
            <p>
              관심 있는 공고는 저장하고, 신청 일정은 캘린더에서.
              <br />
              다시 찾는 수고를 줄이고 차근차근 준비하세요.
            </p>
          </div>
          <div className="guide-keep-grid" data-guide-reveal>
            <article className="guide-save-panel">
              <div className="guide-panel-kicker">
                <Bookmark size={20} aria-hidden="true" />
                <span>저장한 공고</span>
              </div>
              <h3>
                마음에 드는 공고는
                <br />
                책갈피로 모아두세요.
              </h3>
              <div className="guide-saved-demo">
                <div>
                  <span className="guide-small-label">공고 예시</span>
                  <strong>청년 주거 지원 안내</strong>
                  <small>주거 · 신청 조건 확인 필요</small>
                </div>
                <button
                  type="button"
                  className={'guide-bookmark-demo' + (demoSaved ? ' is-saved' : '')}
                  aria-label={demoSaved ? '예시 공고 저장 해제' : '예시 공고 저장하기'}
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
                    예시 공고를 저장했어요. 한 번 더 누르면 해제돼요.
                  </>
                ) : (
                  <>
                    <ArrowRight size={17} aria-hidden="true" />
                    책갈피를 눌러 저장을 체험해 보세요.
                  </>
                )}
              </p>
              <p className="guide-panel-note">
                실제 공고는 공고 카드의 책갈피를 누르면
                <br />
                ‘저장한 공고’에서 다시 볼 수 있어요.
              </p>
            </article>
            <article className="guide-calendar-panel">
              <div className="guide-panel-kicker">
                <CalendarDays size={20} aria-hidden="true" />
                <span>공고 캘린더</span>
              </div>
              <h3>
                시작하는 날도,
                <br />
                마감하는 날도 한눈에.
              </h3>
              <div className="guide-calendar-preview" aria-label="신청 시작일을 표시한 일정 예시">
                <div className="guide-calendar-heading">
                  <strong>신청 일정</strong>
                  <span>예시</span>
                </div>
                <div className="guide-calendar-days">
                  {[
                    ['월', '12'],
                    ['화', '13'],
                    ['수', '14'],
                    ['목', '15'],
                    ['금', '16'],
                  ].map(([day, date]) => (
                    <div key={day} className={date === '14' ? 'guide-selected-date' : ''}>
                      <span>{day}</span>
                      <strong>{date}</strong>
                    </div>
                  ))}
                </div>
                <div className="guide-calendar-event">
                  <span>신청 시작</span>
                  <strong>청년 주거 지원 안내</strong>
                </div>
              </div>
              <GuideArrow onClick={onCalendar}>공고 캘린더 열기</GuideArrow>
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
              <span>직접 바꿔보세요</span>
              <button
                type="button"
                role="switch"
                aria-checked={easyPreview}
                aria-label="예시 화면을 쉬운 화면으로 보기"
                className="guide-preview-switch"
                onClick={() => setEasyPreview((value) => !value)}
              >
                <span>쉬운 화면</span>
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
                {easyPreview ? '쉬운 화면 예시' : '기본 화면 예시'}
              </span>
              <h3>
                나에게 필요한
                <br />
                복지 공고를 찾아보세요.
              </h3>
              {!easyPreview && (
                <p className="guide-preview-description">
                  지역과 관심 분야를 선택해 필요한 지원을 살펴보세요.
                </p>
              )}
              <div className="guide-preview-policy">
                <House size={22} aria-hidden="true" />
                <div>
                  <strong>청년 주거 지원 안내</strong>
                  <span>
                    {easyPreview
                      ? '지원 내용과 신청 조건을 확인하세요.'
                      : '주거 · 청년 · 신청 조건 확인 필요'}
                  </span>
                </div>
              </div>
              {!easyPreview && (
                <div className="guide-preview-policy">
                  <BriefcaseBusiness size={22} aria-hidden="true" />
                  <div>
                    <strong>일자리 교육 프로그램</strong>
                    <span>일자리 · 교육 · 일정 확인 필요</span>
                  </div>
                </div>
              )}
              <button type="button" className="guide-preview-action" onClick={onExplore}>
                공고 찾아보기
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
            <ExampleLabel>글자 크기와 정보 구성이 달라지는 예시입니다.</ExampleLabel>
          </div>
          <div className="guide-section-heading" data-guide-reveal>
            <p className="guide-eyebrow">04 · 나에게 편한 방식으로</p>
            <h2 id="guide-easy-title">
              조금 더 크게.
              <br />
              한결 더 <span>편안하게.</span>
            </h2>
            <p>
              작은 글씨와 복잡한 화면이 불편하다면,
              <br />
              ‘쉬운 화면’을 켜보세요.
              <br />
              글자는 키우고, 중요한 정보는 더 또렷하게 보여드려요.
            </p>
            <GuideArrow onClick={onEasyMode}>쉬운 화면으로 시작하기</GuideArrow>
          </div>
        </div>
      </section>
      <section className="guide-prepare guide-section" aria-labelledby="guide-prepare-title">
        <div className="guide-container guide-prepare-inner" data-guide-reveal>
          <div className="guide-section-heading">
            <p className="guide-eyebrow">신청 전, 한 번 더 확인하세요</p>
            <h2 id="guide-prepare-title">
              발견은 쉽게.
              <br />
              <span>확인은 꼼꼼하게.</span>
            </h2>
          </div>
          <div className="guide-prepare-notes">
            <div>
              <span className="guide-note-number">01</span>
              <div>
                <h3>신청 조건은 공식 공고에서</h3>
                <p>
                  지원 대상, 제출 서류, 신청 기간을 확인한 뒤 담당 기관의 안내에 따라 신청하세요.
                </p>
              </div>
            </div>
            <div>
              <span className="guide-note-number">02</span>
              <div>
                <h3>소득 기준은 계산기로 미리</h3>
                <p>
                  가구원 수에 따른 중위소득 기준과 소득·재산 참고 결과를 살펴볼 수 있어요. 실제 심사
                  결과와는 다를 수 있어요.
                </p>
                <GuideArrow onClick={onCalculator}>계산기 살펴보기</GuideArrow>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="guide-finale" aria-labelledby="guide-finale-title">
        <div className="guide-container guide-centered" data-guide-reveal>
          <img src="/brand-logo.png" alt="" width="68" height="68" loading="lazy" />
          <p className="guide-eyebrow">당신에게 닿아야 할 기회가 있으니까</p>
          <h2 id="guide-finale-title">
            이제, 나의 복지를
            <br />
            <span>발견할 차례.</span>
          </h2>
          <p>첫걸음은 가볍게. 복지나침반과 함께 시작하세요.</p>
          <div className="guide-finale-actions">
            <button type="button" className="guide-primary" onClick={onExplore}>
              공고 찾아보기
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button type="button" className="guide-secondary" onClick={onProfile}>
              맞춤 추천 시작하기
            </button>
          </div>
          <span className="guide-finale-caption">나를 위한 복지 길잡이, 복지나침반</span>
        </div>
      </section>
    </div>
  );
}
