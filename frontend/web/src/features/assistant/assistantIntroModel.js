// Only a presentation preference is stored; no profile or conversation content.
export function assistantIntroKey(owner) {
  return `bokji-assistant-intro-v1:${owner || 'guest'}`;
}
export function hasSeenAssistantIntro(storage, owner) {
  try {
    return storage.getItem(assistantIntroKey(owner)) === 'seen';
  } catch {
    return false;
  }
}
export function markAssistantIntroSeen(storage, owner) {
  try {
    storage.setItem(assistantIntroKey(owner), 'seen');
  } catch {
    // Storage may be unavailable; starting still works in the current page.
  }
}
