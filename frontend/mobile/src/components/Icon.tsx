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
};
export type IconName = keyof typeof icons;

export function Icon({
  name,
  size = 24,
  color = colors.ink,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
}) {
  const Glyph = icons[name];
  return (
    <View
      accessible={false}
      aria-hidden
      importantForAccessibility="no-hide-descendants"
    >
      <Glyph size={size} color={color} strokeWidth={2} />
    </View>
  );
}
