import {
  ArrowLeft,
  ArrowUpRight,
  AtSign,
  Bell,
  Calendar,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleUserRound,
  Compass,
  ExternalLink,
  Eye,
  Fingerprint,
  Globe,
  GlobeLock,
  Heart,
  House,
  Link2,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Moon,
  Phone,
  Plus,
  QrCode,
  Search,
  Send,
  Smartphone,
  Share,
  ShieldUser,
  Sparkles,
  Sun,
  Users,
  X,
} from "lucide-react";

// Lucide, drawn inline as SVG. Call sites keep the old Material names — this
// map is the only place that knows the difference — so changing sets again is
// a one-file job. No icon font also means no blocking request to Google and no
// flash of ligature text before it loads.
const ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  account_circle: CircleUserRound,
  add: Plus,
  admin_panel_settings: ShieldUser,
  alternate_email: AtSign,
  arrow_back: ArrowLeft,
  auto_awesome: Sparkles,
  calendar_month: CalendarDays,
  calendar_today: Calendar,
  call: Phone,
  chat: MessageCircle,
  chat_bubble: MessageCircle,
  check: Check,
  chevron_left: ChevronLeft,
  chevron_right: ChevronRight,
  close: X,
  dark_mode: Moon,
  event: Calendar,
  event_available: CalendarCheck,
  expand_more: ChevronDown,
  favorite: Heart,
  fingerprint: Fingerprint,
  groups: Users,
  home: House,
  ios_share: Share,
  light_mode: Sun,
  link: Link2,
  lock: Lock,
  mail: Mail,
  north_east: ArrowUpRight,
  notifications: Bell,
  open_in_new: ExternalLink,
  phone_iphone: Smartphone,
  place: MapPin,
  public: Globe,
  public_off: GlobeLock,
  qr_code_2: QrCode,
  search: Search,
  send: Send,
  share: Share,
  travel_explore: Compass,
  visibility: Eye,
};

export function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Glyph = ICONS[name] ?? Circle;
  return (
    <span className={`icon ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <Glyph size={size} strokeWidth={1.75} />
    </span>
  );
}
