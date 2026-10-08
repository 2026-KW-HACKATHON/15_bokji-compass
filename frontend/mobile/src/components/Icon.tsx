import {
  ArrowRight,
  Calculator,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  FileText,
  MessageCircle,
  Sparkles,
  House,
  Menu,
  Search,
  UserRound,
  X,
  MapPin,
  CalendarDays,
  GraduationCap,
  BriefcaseBusiness,
  HeartPulse,
  Wallet,
  SlidersHorizontal,
  ArrowUpRight,
  Info,
  Languages,
  ChevronDown,
  ChevronUp,
} from "lucide-react-native";
import { ColorValue, View } from "react-native";
import { colors } from "./theme";

const icons = {
  home: House,
  policies: FileText,
  finance: Calculator,
  account: UserRound,
  menu: Menu,
  search: Search,
  next: ChevronRight,
  previous: ChevronLeft,
  arrow: ArrowRight,
  check: Check,
  close: X,
  assistant: MessageCircle,
  ai: Sparkles,
  compass: Compass,
  location: MapPin,
  calendar: CalendarDays,
  education: GraduationCap,
  work: BriefcaseBusiness,
  health: HeartPulse,
  wallet: Wallet,
  filter: SlidersHorizontal,
  external: ArrowUpRight,
  info: Info,
  language: Languages,
  expand: ChevronDown,
  collapse: ChevronUp,
};
export type IconName = keyof typeof icons;

export function Icon({
  name,
  size = 24,
  color = colors.ink,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  strokeWidth?: number;
}) {
  const Glyph = icons[name];
  return (
    <View
      accessible={false}
      aria-hidden
      importantForAccessibility="no-hide-descendants"
    >
      <Glyph size={size} color={color} strokeWidth={strokeWidth} />
    </View>
  );
}

/** A consistent, visible landmark beside the easy-mode feature label. */
export function EasyIconTile({ name }: { name: IconName }) {
  return (
    <View
      accessible={false}
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 60,
        height: 60,
        flexShrink: 0,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: colors.easyIcon,
        backgroundColor: colors.easyIconBackground,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={name} size={34} color={colors.easyIcon} strokeWidth={2.25} />
    </View>
  );
}
