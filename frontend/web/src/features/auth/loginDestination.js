const returnPages = new Set([
  'calculator-details',
  'calculator',
  'profile',
  'assistant',
  'assistant-monitoring',
  'new-notices',
]);

export function loginDestination(value) {
  return returnPages.has(value) ? value : 'home';
}
