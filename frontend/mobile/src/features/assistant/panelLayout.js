// Leave the current page visible, including when the keyboard or large type is used.
/** @param {{width: number, height: number, top?: number, left?: number, right?: number, bottom?: number, keyboardTop?: number | null, tabHeight?: number, easy?: boolean}} options */
export function chatPanelLayout({
  width,
  height,
  top = 0,
  left = 0,
  right = 0,
  bottom = 0,
  keyboardTop = null,
  tabHeight = 70,
  easy = false,
}) {
  const viewport = Math.min(height, keyboardTop ?? height);
  const gap = width < 360 ? 8 : 12;
  const offset = keyboardTop === null ? tabHeight + bottom + 12 : 8;
  const available = Math.max(0, viewport - top - offset);
  return {
    width: Math.max(0, Math.min(440, width - left - right - gap * 2)),
    height: Math.min(easy ? 590 : 540, Math.floor(available * 0.72)),
    right: right + gap,
    bottom: height - viewport + offset,
  };
}
