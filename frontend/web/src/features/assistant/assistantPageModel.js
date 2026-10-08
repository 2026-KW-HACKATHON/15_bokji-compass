import { housingTenures, housingTypes } from '../monitoring/monitoringModel.js';
import { householdLabel, occupationLabel } from '../profile/economicActivityModel.js';

export function assistantOverview(snapshot, user) {
  const profile = snapshot.profile;
  const label = (choices, value) => choices.find(([key]) => key === value)?.[1];
  const facts = [
    user?.region && user.region !== '전국' ? user.region : null,
    label(housingTenures, profile?.housing_tenure),
    label(housingTypes, profile?.housing_type),
    profile?.building_year ? `${profile.building_year}년 준공` : null,
    occupationLabel(profile?.occupation),
    householdLabel(profile?.household),
    ...(profile?.interests || []),
    profile?.job_seeking === true ? '구직 중' : null,
    profile?.repair_needed === true ? '주택 수리 필요' : null,
    profile?.disaster_damage === true ? '재난 피해 있음' : null,
  ].filter((fact, index, values) => Boolean(fact) && values.indexOf(fact) === index);
  const active = snapshot.candidates.filter((item) => item.active && !item.recommendation_feedback);
  const byPolicy = new Map();
  for (const candidate of snapshot.candidates) {
    if (!byPolicy.has(candidate.policy_id) || candidate.active)
      byPolicy.set(candidate.policy_id, candidate);
  }
  const progress = [...byPolicy.values()].filter((item) =>
    ['preparing', 'applied', 'completed'].includes(item.state),
  );
  const questions = [];
  const seen = new Set();
  for (const need of snapshot.needs) {
    for (const question of need.questions) {
      if (seen.has(question)) continue;
      seen.add(question);
      questions.push({ question, title: need.title, needId: need.id, policy: null });
    }
  }
  for (const candidate of active) {
    for (const question of candidate.questions) {
      if (seen.has(question)) continue;
      seen.add(question);
      questions.push({
        question,
        title: candidate.policy.title,
        needId: candidate.need_id,
        policy: candidate.policy,
      });
    }
  }
  return {
    facts,
    active,
    questions,
    progress,
    newAlerts: snapshot.alerts.filter((alert) => !alert.read),
    progressCounts: {
      preparing: progress.filter((item) => item.state === 'preparing').length,
      applied: progress.filter((item) => item.state === 'applied').length,
      completed: progress.filter((item) => item.state === 'completed').length,
    },
  };
}

export function questionForNeed(needId) {
  if (needId?.includes('housing')) return '주택 수리 지원을 알아보고 싶어요';
  if (needId?.includes('employment')) return '취업 지원을 알아보고 싶어요';
  if (needId?.includes('disaster')) return '재난 피해 지원을 알아보고 싶어요';
  return '';
}
