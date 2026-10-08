// Shared visual tokens. Easy mode deliberately uses stronger boundaries and
// larger controls while keeping the same navigation and information order.
export const colors = {
  ink: "#17233B",
  muted: "#5F6D83",
  green: "#245FE5",
  mint: "#EBF1FF",
  paper: "#F3F5F9",
  surface: "#FFFFFF",
  line: "#E5EAF2",
  easyLine: "#68788E",
  easyPaper: "#F7F8FA",
  easyIcon: "#0068B7",
  easyIconBackground: "#E0F2FE",
  danger: "#A12622",
};

export const typography = {
  title: {
    fontSize: 26,
    lineHeight: 36,
    fontWeight: "700" as const,
    letterSpacing: -0.7,
  },
  body: { fontSize: 16, lineHeight: 25 },
  easyTitle: {
    fontSize: 28,
    lineHeight: 40,
    fontWeight: "700" as const,
    letterSpacing: 0,
  },
  easyBody: { fontSize: 20, lineHeight: 30 },
};

export function tabBarHeight(easy: boolean, fontScale = 1) {
  // The label may wrap when Dynamic Type or translated labels need more room.
  return easy
    ? 96 + Math.max(0, fontScale - 1) * 96
    : 70 + Math.max(0, fontScale - 1) * 72;
}
