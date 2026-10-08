import { defaultProfile, memberRecommendationProfile } from './profileModel.js';
import { genders } from '../auth/authFields.js';
import { householdLabel, occupationLabel } from './economicActivityModel.js';

export const profileCategories = [
  {
    id: 'basic',
    label: '기본 정보',
    icon: 'user',
    description: '이름·나이·거주 지역과 주소',
    fields: ['region', 'ageBand'],
  },
  {
    id: 'life',
    label: '직업·가구',
    icon: 'briefcase',
    description: '경제활동 상태와 가구 구성',
    fields: ['occupation', 'household'],
  },
  {
    id: 'finance',
    label: '소득·재산',
    icon: 'wallet',
    description: '가구 소득과 재산·부채',
    fields: [],
  },
  {
    id: 'interests',
    label: '관심 분야',
    icon: 'heart',
    description: '관심 있는 복지 분야',
    fields: ['interests'],
  },
];

const selected = (value) => (value && value !== '선택하지 않음' ? value : null);
export function profileRows(category, user, profile = defaultProfile) {
  if (category === 'basic') {
    if (!user)
      return [
        ['거주 지역', profile.region === '전국' ? null : profile.region],
        ['연령대', selected(profile.ageBand)],
      ];
    const rows = [
      ['이름', user.name || null],
      ['나이 (만 나이)', user.age == null ? null : `${user.age}세`],
      ['거주 지역', user.region || null],
      [
        '성별',
        user.gender === 'undisclosed'
          ? '응답하지 않음'
          : genders.find(([key]) => key === user.gender)?.[1] || null,
      ],
    ];
    if (user.address) {
      rows.splice(
        3,
        0,
        ['거주 주소', [user.address, user.address_detail].filter(Boolean).join(' ')],
        ['우편번호', user.postal_code || null],
      );
    }
    const member = memberRecommendationProfile(user);
    if (profile.region !== member.region || profile.ageBand !== member.ageBand) {
      rows.push(
        ['추천에 사용할 지역', profile.region],
        ['추천에 사용할 연령대', selected(profile.ageBand)],
      );
    }
    return rows;
  }
  if (category === 'life')
    return [
      ['경제활동 상태', occupationLabel(profile.occupation)],
      ['가구 구성', householdLabel(profile.household)],
    ];
  if (category === 'interests')
    return [['관심 분야', profile.interests.length ? profile.interests.join(' · ') : null]];
  return [];
}

export function rowStatus(rows) {
  const count = rows.filter(([, value]) => value != null).length;
  return count === 0 ? '미입력' : count === rows.length ? '입력됨' : '일부 입력';
}

// Merge just the edited category so a draft kept in another tab cannot undo a save.
export function mergeProfileCategory(profile, draft, category) {
  return {
    ...profile,
    ...Object.fromEntries(
      profileCategories.find(({ id }) => id === category).fields.map((key) => [key, draft[key]]),
    ),
  };
}

export function financeRows(profile) {
  const incomes = profile.members.flatMap((member) =>
    ['earned_income', 'business_income', 'other_income', 'private_transfer_income'].map(
      (key) => member[key],
    ),
  );
  const assets = Object.values(profile.assets);
  const debts = Object.values(profile.debts);
  const inputCount = (values) =>
    `${values.filter((value) => value != null).length} / ${values.length}개 항목 입력`;
  return [
    ['가구원', `${profile.household_size}명`],
    ['월 소득', inputCount(incomes)],
    ['재산·부채', inputCount([...assets, ...debts])],
    [
      '차량',
      profile.vehicle_status === 'none'
        ? '없음'
        : profile.vehicle_status === 'owned'
          ? `${profile.vehicles.length}대`
          : '확인 필요',
    ],
  ];
}

export function financeInputStatus(profile) {
  const amounts = [
    ...profile.members.flatMap((member) =>
      ['earned_income', 'business_income', 'other_income', 'private_transfer_income'].map(
        (key) => member[key],
      ),
    ),
    ...Object.values(profile.assets),
    ...Object.values(profile.debts),
  ];
  return amounts.some((value) => value == null) || profile.vehicle_status === 'unknown'
    ? '일부 입력'
    : '입력됨';
}
