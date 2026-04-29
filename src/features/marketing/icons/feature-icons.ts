import {
  BarChart3,
  Bell,
  BellRing,
  CalendarDays,
  Clock,
  CreditCard,
  Flame,
  Globe,
  Heart,
  Image as ImageIcon,
  Search,
  Shield,
  Sparkles,
  Star,
  Tag,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Marketing pages (`/about`, `/how-it-works`) are Server Components, but
 * `<FeatureGrid>` is a Client Component (uses `motion`). Function components
 * — including lucide icons — can't cross the RSC serialization boundary, so
 * pages pass an `iconName` string and the client component looks up the icon
 * here. One map for the whole marketing surface; add new entries when a page
 * needs a new icon.
 */

export type FeatureIconName =
  // /about — values
  | "heart"
  | "sparkles"
  | "users"
  | "zap"
  | "shield"
  | "globe"
  // /how-it-works — client features
  | "search"
  | "clock"
  | "flame"
  | "credit-card"
  | "star"
  | "bell"
  // /how-it-works — master features
  | "calendar-days"
  | "wallet"
  | "bar-chart"
  | "bell-ring"
  | "image"
  // /models
  | "tag";

export const FEATURE_ICONS: Record<FeatureIconName, LucideIcon> = {
  heart: Heart,
  sparkles: Sparkles,
  users: Users,
  zap: Zap,
  shield: Shield,
  globe: Globe,
  search: Search,
  clock: Clock,
  flame: Flame,
  "credit-card": CreditCard,
  star: Star,
  bell: Bell,
  "calendar-days": CalendarDays,
  wallet: Wallet,
  "bar-chart": BarChart3,
  "bell-ring": BellRing,
  image: ImageIcon,
  tag: Tag,
};
