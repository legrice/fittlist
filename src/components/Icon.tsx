import {
  Activity,
  Bookmark,
  Store,
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
  ChevronUp,
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
  Sun,
  Users,
  UserRoundPlus,
  X,
  Ellipsis,
  Megaphone,
  Flag,
  Palette,
  Pencil,
  Trash2,
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
 * The ribbon, filled solid: the added state of "this is in my plans". It
 * carried a tick cut out of it for a while; the solid shape against the
 * outline at rest already says in or out, and the hole was one mark too
 * many at row size. Still one currentColor path, so it reads on the dark
 * pill, the card and the tab bar alike.
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
function SparklesFilled({ size = 24, strokeWidth = 2.25 }: { size?: number; strokeWidth?: number }) {
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
 * The same sparkle, outlined. The tab bar's four other glyphs are strokes, so
 * a solid one in the middle read as a fifth weight on a row whose whole job is
 * five equals. The filled one stays everywhere it is a button or a row, where
 * solid is what stops it reading as furniture.
 */
function SparklesOutline({ size = 24, strokeWidth = 2.25 }: { size?: number; strokeWidth?: number }) {
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

// Lucide, drawn inline as SVG. Call sites keep the old Material names — this
// map is the only place that knows the difference — so changing sets again is
// a one-file job. No icon font also means no blocking request to Google and no
// flash of ligature text before it loads.
/** The list view, drawn for this app rather than borrowed: two rules with a
 *  boxed band between them, which is a day's rows under a heading. Hand-drawn
 *  like `bookmark_added`, so it is a path rather than a Lucide import. */
function ViewList({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 12.67 10.67"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.67,9.33H0v1.33h12.67v-1.33ZM11.33,4v2.67H1.33v-2.67h10ZM12,2.67H.67c-.37,0-.67.3-.67.67v4c0,.37.3.67.67.67h11.33c.37,0,.67-.3.67-.67v-4c0-.37-.3-.67-.67-.67ZM12.67,0H0v1.33h12.67V0Z" />
    </svg>
  );
}

const ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  account_circle: CircleUserRound,
  add: Plus,
  delete: Trash2,
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
  auto_awesome: SparklesFilled,
  auto_awesome_outline: SparklesOutline,
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
  expand_less: ChevronUp,
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
  // The heartbeat, for Activity: a pulse is what a feed of what people are
  // doing looks like, and it is not a bell (that is news addressed to you)
  // and not a compass (that is browsing).
  activity: Activity,
  storefront: Store,
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

/**
 * The house size and weight.
 *
 * They were 18 and 1.75, which is a hairline set drawn small, and against a
 * 22px class name it read as a different app's furniture: thin marks next to
 * heavy type. This is a calendar app whose whole surface is words, so the
 * glyphs beside them have to hold their own weight rather than apologise for
 * being there.
 *
 * A true filled set (Material Symbols, say) is the other way to get here and
 * is deliberately not taken: it is a self-hosted font or seventy re-mapped
 * names, and Lucide at this weight is most of the way there for two numbers.
 * If it still reads too light after living with it, that swap is its own
 * commit and this is the one place it would land.
 */
const SIZE = 21;
const WEIGHT = 2.25;

export function Icon({
  name,
  size = SIZE,
  className = "",
  strokeWidth = WEIGHT,
}: {
  name: string;
  size?: number;
  className?: string;
  /** The house weight; a control that is nothing but its glyph can ask for
   *  more, and a glyph inside dense type can ask for less. */
  strokeWidth?: number;
}) {
  // Hand-drawn glyphs are their own components rather than Lucide icons, so
  // they are asked for before the map is.
  if (name === "view_list") return <ViewList size={size} className={className} />;
  const Glyph = ICONS[name] ?? Circle;
  return (
    <span className={`icon ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <Glyph size={size} strokeWidth={strokeWidth} />
    </span>
  );
}
