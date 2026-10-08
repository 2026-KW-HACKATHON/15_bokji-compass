const returnPages = new Set(['calculator-details', 'calculator', 'profile', 'assistant']);

export function loginDestination(value) {
  return returnPages.has(value) ? value : 'home';
}
