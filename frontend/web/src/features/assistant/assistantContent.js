// Reviewed service guidance. Policy facts always come from the published policy API.
export const assistantMenus = [
  {
    id: 'guidance',
    icon: 'house',
    label: '생활 상황으로 상담하고 싶어요',
    description: '집수리·누수·취업, 부족한 정보는 대화로 확인',
  },
  {
    id: 'policy',
    icon: 'help',
    label: '공고 내용이 궁금해요',
    description: '지원 대상, 신청 방법과 준비 서류',
  },
  {
    id: 'schedule',
    icon: 'calendar',
    label: '신청 일정을 보고 싶어요',
    description: '신청 기간과 공고 캘린더',
  },
  {
    id: 'guides',
    icon: 'book',
    label: '이용 방법이 궁금해요',
    description: '내 정보, 공고 저장과 계산기 사용',
  },
];

export const assistantGuides = [
  {
    id: 'profile',
    question: '내 정보는 어디서 입력하나요?',
    answer: [
      '‘내 정보’에서 맞춤 추천에 사용할 지역과 관심 분야를 입력할 수 있어요.',
      '로그인한 회원은 같은 화면에서 회원 정보도 수정할 수 있어요. 회원 정보와 맞춤 추천 설정은 구분되어 있어요.',
    ],
    action: { page: 'profile', label: '내 정보 열기' },
  },
  {
    id: 'save',
    question: '공고를 저장하려면 어떻게 하나요?',
    answer: [
      '공고 카드의 저장 버튼이나 공고 상세의 ‘이 공고 저장하기’를 누르세요.',
      '저장한 공고는 ‘저장한 공고’ 메뉴에서 다시 볼 수 있어요. 저장 버튼을 다시 누르면 저장을 취소해요.',
    ],
    action: { page: 'saved', label: '저장한 공고 열기' },
  },
  {
    id: 'storage',
    question: '저장한 공고는 어디에 보관되나요?',
    answer: [
      '저장한 공고는 지금 사용하는 브라우저에 보관해요. 다른 기기나 브라우저에 자동으로 옮겨지지는 않아요.',
      '브라우저의 사이트 데이터를 삭제하면 저장 목록도 지워질 수 있어요. 저장된 공고의 최신 내용은 공식 공고에서 확인해 주세요.',
    ],
    action: { page: 'saved', label: '저장한 공고 열기' },
  },
  {
    id: 'calendar',
    question: '캘린더는 어떻게 보나요?',
    answer: [
      '‘공고 캘린더’에서 월과 날짜를 골라 신청 시작일과 마감일을 확인하세요. 공고를 누르면 상세 내용을 볼 수 있어요.',
      '날짜가 확인되지 않은 공고는 날짜 확인이 필요한 목록에서 살펴볼 수 있어요. 현재 접수 여부는 공식 공고에서 다시 확인해 주세요.',
    ],
    action: { page: 'calendar', label: '공고 캘린더 열기' },
  },
  {
    id: 'calculator',
    question: '계산기는 어떻게 사용하나요?',
    answer: [
      '‘계산기’에서 가구원 수를 고르면 기준 중위소득을 바로 볼 수 있어요. 가구 전체 월소득을 입력하면 중위소득 대비 비율도 확인할 수 있어요.',
      '재산·부채·차량과 공제까지 확인하려면 ‘상세 정보 입력하기’를 누르세요. 모르는 항목은 ‘모름’으로 표시할 수 있고, 회원은 동의 후 저장할 수 있어요. 결과는 참고용이며, 지원 여부는 담당 기관의 심사에 따라 달라져요.',
    ],
    action: { page: 'calculator', label: '계산기 열기' },
  },
  {
    id: 'easy',
    question: '쉬운 화면은 어떻게 켜나요?',
    answer: [
      '화면 위쪽의 ‘쉬운 화면’ 스위치를 켜면 글자와 버튼이 커지고 안내를 간단하게 볼 수 있어요.',
      '아래 버튼으로도 화면을 바꿀 수 있어요. 공고의 조건과 원문 근거는 두 화면에서 동일하게 확인할 수 있어요.',
    ],
    action: { toggleEasy: true },
  },
  {
    id: 'login',
    question: '질문하려면 로그인해야 하나요?',
    answer: [
      '이용 방법 안내와 공고 캘린더는 로그인하지 않아도 볼 수 있어요.',
      '자주 묻는 질문의 답변을 보거나 직접 질문하려면 로그인해 주세요. 직접 질문할 때는 내 정보에 저장한 지역과 연령대를 참고하고, 정보가 없으면 공고 내용을 바탕으로 안내해요. 이름이나 전화번호는 입력하지 마세요.',
    ],
    action: { page: 'login', label: '로그인하기' },
  },
];

export const policyQuestionLabels = {
  benefits: '어떤 지원을 받을 수 있나요?',
  eligibility: '누가 신청할 수 있나요?',
  period: '언제까지 신청하나요?',
  application: '어떻게 신청하나요?',
  documents: '어떤 서류를 준비하나요?',
  qualification: '신청 전에 무엇을 확인해야 하나요?',
};
