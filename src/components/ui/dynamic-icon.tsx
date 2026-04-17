import {
  Bell,
  Building2,
  CalendarCheck,
  Calendar,
  Camera,
  ClipboardList,
  Eye,
  Flame,
  Globe,
  GraduationCap,
  Handshake,
  Link2,
  Mail,
  Megaphone,
  MessageCircle,
  Rocket,
  Scissors,
  Shield,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  User,
  Users,
  Zap,
} from "lucide-react";
import type { LucideProps } from "lucide-react";

const ICON_MAP = {
  Bell,
  Building2,
  CalendarCheck,
  Calendar,
  Camera,
  ClipboardList,
  Eye,
  Flame,
  Globe,
  GraduationCap,
  Handshake,
  Link2,
  Mail,
  Megaphone,
  MessageCircle,
  Rocket,
  Scissors,
  Shield,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  User,
  Users,
  Zap,
} as const;

export type DynamicIconName = keyof typeof ICON_MAP;

type Props = LucideProps & { name: DynamicIconName };

export function DynamicIcon({ name, ...props }: Props) {
  const Icon = ICON_MAP[name];
  return <Icon {...props} />;
}
