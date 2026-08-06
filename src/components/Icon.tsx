import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  AtSign,
  BadgeCheck,
  Bell,
  Bookmark,
  Calendar,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleUserRound,
  Clock,
  Compass,
  Copy,
  Ellipsis,
  ExternalLink,
  Eye,
  Fingerprint,
  Flag,
  Globe,
  GlobeLock,
  Heart,
  House,
  Image,
  Info,
  Link2,
  List,
  Lock,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  MessageCircle,
  Moon,
  Palette,
  Pencil,
  Phone,
  Plus,
  QrCode,
  Search,
  Send,
  Settings,
  Share,
  ShieldCheck,
  ShieldUser,
  SlidersHorizontal,
  Smartphone,
  Store,
  Sun,
  Trash2,
  UserRoundPlus,
  Users,
  X,
  Zap,
} from "lucide-react";

/**
 * Lucide again, one step heavier than it originally was.
 *
 * The set went to Phosphor's filled weight for a while, chasing "big, bold,
 * filled in", and came back by Matt's call: the outline drawing was the app's
 * look, and the solid set was a different app's. What survives of that trip is
 * the two numbers that were right about it all along: the glyphs stay at the
 * bigger size the type deserved, and the stroke sits at 2 rather than the
 * original 1.75, so the marks hold their own against 27px class names without
 * becoming shapes.
 *
 * Call sites keep the old Material names. This map is the only place that
 * knows the difference, which is why swapping the whole set is a one-file job
 * and has now been done three times.
 */

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
 * The ribbon, filled solid: the added state of "this is in my plans". Still
 * one currentColor path, so it reads on the dark pill, the card and the tab
 * bar alike.
 */
function BookmarkAdded({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.5 2h11A2.5 2.5 0 0 1 20 4.5V22l-8-4.6L4 22V4.5A2.5 2.5 0 0 1 6.5 2Z"
      />
    </svg>
  );
}

/**
 * Lucide's Sparkles with the big star filled in: the share moment's glyph,
 * solid where the outline read as furniture. The two small sparks stay
 * strokes so the shape keeps its air; everything is currentColor.
 */
function SparklesFilled({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
      />
      <path
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        d="M20 3v4M22 5h-4M4 17v2M5 18H3"
      />
    </svg>
  );
}

/**
 * The same sparkle, outlined, for anywhere the filled one would read as a
 * fifth weight in a row of strokes.
 */
function SparklesOutline({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
      />
      <path
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        d="M20 3v4M22 5h-4M4 17v2M5 18H3"
      />
    </svg>
  );
}

const ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  account_circle: CircleUserRound,
  activity: Activity,
  add: Plus,
  admin_panel_settings: ShieldUser,
  alternate_email: AtSign,
  arrow_back: ArrowLeft,
  auto_awesome: SparklesFilled,
  auto_awesome_outline: SparklesOutline,
  bolt: Zap,
  bookmark: Bookmark,
  bookmark_added: BookmarkAdded,
  calendar_month: CalendarDays,
  calendar_today: Calendar,
  call: Phone,
  campaign: Megaphone,
  chat: MessageCircle,
  chat_bubble: MessageCircle,
  check: Check,
  chevron_left: ChevronLeft,
  chevron_right: ChevronRight,
  close: X,
  content_copy: Copy,
  dark_mode: Moon,
  delete: Trash2,
  edit: Pencil,
  event: Calendar,
  event_added: CalendarAdded,
  event_available: CalendarCheck,
  expand_less: ChevronUp,
  expand_more: ChevronDown,
  favorite: Heart,
  fingerprint: Fingerprint,
  flag: Flag,
  groups: Users,
  home: House,
  // The class photo picker asks for this name; it drew the fallback circle
  // for months before `icon-check` existed to notice.
  image: Image,
  info: Info,
  ios_share: Share,
  light_mode: Sun,
  link: Link2,
  list: List,
  lock: Lock,
  mail: Mail,
  menu: Menu,
  more_horiz: Ellipsis,
  north_east: ArrowUpRight,
  notifications: Bell,
  open_in_new: ExternalLink,
  palette: Palette,
  person_add: UserRoundPlus,
  phone_iphone: Smartphone,
  place: MapPin,
  public: Globe,
  public_off: GlobeLock,
  qr_code_2: QrCode,
  schedule: Clock,
  search: Search,
  send: Send,
  settings: Settings,
  share: Share,
  shield: ShieldCheck,
  storefront: Store,
  travel_explore: Compass,
  tune: SlidersHorizontal,
  verified: BadgeCheck,
  visibility: Eye,
};

/** The house size and weight. The size kept the Phosphor era's bump (the type
 *  went up, so the glyphs had to); the weight is Lucide's own drawing, one
 *  step heavier than the 1.75 it shipped at here originally. */
const SIZE = 24;
const WEIGHT = 2;

export function Icon({
  name,
  size = SIZE,
  className = "",
  strokeWidth = WEIGHT,
}: {
  name: string;
  size?: number;
  className?: string;
  /** A control that is nothing but its glyph can ask for more; a glyph inside
   *  dense type can ask for less. */
  strokeWidth?: number;
}) {
  const Glyph = ICONS[name] ?? Circle;
  return (
    <span className={`icon ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <Glyph size={size} strokeWidth={strokeWidth} />
    </span>
  );
}
