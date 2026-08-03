import {
  Bookmark,
  ArrowLeft,
  ArrowUpRight,
  AtSign,
  BadgeCheck,
  Bell,
  Calendar,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Info,
  List,
  Menu,
  SlidersHorizontal,
  Clock,
  CircleUserRound,
  Compass,
  Copy,
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
  UserRoundPlus,
  X,
  Ellipsis,
  Megaphone,
  Flag,
  Palette,
  Pencil,
  Settings, ShieldCheck, Zap } from "lucide-react";

/**
 * A calendar with the tick cut out of it: the added state of "this is in my
 * plans". Lucide's CalendarCheck is an outline, and filling it swallows the
 * tick; drawing the tick on top would mean knowing what colour it is sitting
 * on, which the icon can't know and shouldn't have to. So the tick is a hole
 * in one evenodd path, the whole glyph is currentColor, and it reads on any
 * background the pill or the toast happens to have.
 */
function CalendarAdded({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 2.5v4M16 2.5v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 6h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Zm1.02 8.18 3.58 3.58 6.38-6.38-1.56-1.56-4.82 4.82-2.02-2.02-1.56 1.56Z"
      />
    </svg>
  );
}

/**
 * The ribbon, filled, with the tick cut out of it: the added state of "this is
 * in my plans". Same construction as CalendarAdded and for the same reason:
 * the tick is a hole in one evenodd path, so the whole glyph is currentColor
 * and reads on the dark pill, the card and the tab bar alike.
 */
function BookmarkAdded({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.5 2h11A2.5 2.5 0 0 1 20 4.5V22l-8-4.6L4 22V4.5A2.5 2.5 0 0 1 6.5 2Zm1.06 8.13 3.35 3.35 6.03-6.03-1.55-1.55-4.48 4.48-1.8-1.8-1.55 1.55Z"
      />
    </svg>
  );
}

// Lucide, drawn inline as SVG. Call sites keep the old Material names — this
// map is the only place that knows the difference — so changing sets again is
// a one-file job. No icon font also means no blocking request to Google and no
// flash of ligature text before it loads.
const ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  account_circle: CircleUserRound,
  add: Plus,
  shield: ShieldCheck,
  bolt: Zap,
  admin_panel_settings: ShieldUser,
  edit: Pencil,
  palette: Palette,
  flag: Flag,
  verified: BadgeCheck,
  campaign: Megaphone,
  more_horiz: Ellipsis,
  settings: Settings,
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
  content_copy: Copy,
  dark_mode: Moon,
  event: Calendar,
  info: Info,
  list: List,
  menu: Menu,
  event_available: CalendarCheck,
  // The pair on a class: an empty calendar, and one with the tick in it.
  event_added: CalendarAdded,
  bookmark: Bookmark,
  bookmark_added: BookmarkAdded,
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
  person_add: UserRoundPlus,
  place: MapPin,
  public: Globe,
  public_off: GlobeLock,
  qr_code_2: QrCode,
  schedule: Clock,
  search: Search,
  send: Send,
  share: Share,
  travel_explore: Compass,
  tune: SlidersHorizontal,
  visibility: Eye,
};

export function Icon({
  name,
  size = 18,
  className = "",
  strokeWidth = 1.75,
}: {
  name: string;
  size?: number;
  className?: string;
  /** The house weight is 1.75; a control that is nothing but its glyph
   *  (the header's plus) can ask for more. */
  strokeWidth?: number;
}) {
  const Glyph = ICONS[name] ?? Circle;
  return (
    <span className={`icon ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <Glyph size={size} strokeWidth={strokeWidth} />
    </span>
  );
}
