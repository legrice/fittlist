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
 * Material Symbols Rounded, one path at a time, by Matt's call: the chrome
 * (the tab bar, the schedule's view toggle) moves to Material's drawing,
 * starting with the glyphs he named. They come in as filled currentColor
 * paths in Material's own 960 viewBox, so they sit in the same 24px box the
 * Lucide set uses and swap per name in the map below rather than per set.
 */
function mat(d: string) {
  return function MatIcon({ size = 24 }: { size?: number; strokeWidth?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 -960 960 960" aria-hidden="true">
        <path fill="currentColor" d={d} />
      </svg>
    );
  };
}
const MatGroup = mat(
  "M40-272q0-34 17.5-62.5T104-378q62-31 126-46.5T360-440q66 0 130 15.5T616-378q29 15 46.5 43.5T680-272v32q0 33-23.5 56.5T600-160H120q-33 0-56.5-23.5T40-240v-32Zm800 112H738q11-18 16.5-38.5T760-240v-40q0-44-24.5-84.5T666-434q51 6 96 20.5t84 35.5q36 20 55 44.5t19 53.5v40q0 33-23.5 56.5T840-160ZM360-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Zm400-160q0 66-47 113t-113 47q-11 0-28-2.5t-28-5.5q27-32 41.5-71t14.5-81q0-42-14.5-81T544-792q14-5 28-6.5t28-1.5q66 0 113 47t47 113ZM120-240h480v-32q0-11-5.5-20T580-306q-54-27-109-40.5T360-360q-56 0-111 13.5T140-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T440-640q0-33-23.5-56.5T360-720q-33 0-56.5 23.5T280-640q0 33 23.5 56.5T360-560Zm0 320Zm0-400Z",
);
const MatCalendarMonth = mat(
  "M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-40q0-17 11.5-28.5T280-880q17 0 28.5 11.5T320-840v40h320v-40q0-17 11.5-28.5T680-880q17 0 28.5 11.5T720-840v40h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm0 0v-80 80Zm280 240q-17 0-28.5-11.5T440-440q0-17 11.5-28.5T480-480q17 0 28.5 11.5T520-440q0 17-11.5 28.5T480-400Zm-160 0q-17 0-28.5-11.5T280-440q0-17 11.5-28.5T320-480q17 0 28.5 11.5T360-440q0 17-11.5 28.5T320-400Zm320 0q-17 0-28.5-11.5T600-440q0-17 11.5-28.5T640-480q17 0 28.5 11.5T680-440q0 17-11.5 28.5T640-400ZM480-240q-17 0-28.5-11.5T440-280q0-17 11.5-28.5T480-320q17 0 28.5 11.5T520-280q0 17-11.5 28.5T480-240Zm-160 0q-17 0-28.5-11.5T280-280q0-17 11.5-28.5T320-320q17 0 28.5 11.5T360-280q0 17-11.5 28.5T320-240Zm320 0q-17 0-28.5-11.5T600-280q0-17 11.5-28.5T640-320q17 0 28.5 11.5T680-280q0 17-11.5 28.5T640-240Z",
);
const MatArrowOutward = mat(
  "M640-624 284-268q-11 11-28 11t-28-11q-11-11-11-28t11-28l356-356H280q-17 0-28.5-11.5T240-720q0-17 11.5-28.5T280-760h400q17 0 28.5 11.5T720-720v400q0 17-11.5 28.5T680-280q-17 0-28.5-11.5T640-320v-304Z",
);
const MatCalendarViewDay = mat(
  "M200-280q-33 0-56.5-23.5T120-360v-240q0-33 23.5-56.5T200-680h560q33 0 56.5 23.5T840-600v240q0 33-23.5 56.5T760-280H200Zm0-80h560v-240H200v240Zm-41-400q-17 0-28-11.5T120-800q0-17 11.5-28.5T160-840h641q17 0 28 11.5t11 28.5q0 17-11.5 28.5T800-760H159Zm0 640q-17 0-28-11.5T120-160q0-17 11.5-28.5T160-200h641q17 0 28 11.5t11 28.5q0 17-11.5 28.5T800-120H159Zm41-480v240-240Z",
);
const MatCalendarViewMonth = mat(
  "M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-360h160v-200H160v200Zm240 0h160v-200H400v200Zm240 0h160v-200H640v200ZM320-240v-200H160v200h160Zm80 0h160v-200H400v200Zm240 0h160v-200H640v200Z",
);

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

/**
 * The classic share arrow: a big head and a tail that sweeps down to a
 * point, hand-drawn because Lucide's Share (a box with an arrow out of it)
 * read as furniture next to it. One closed outline, stroked in
 * currentColor, so it sits at the tab bar's weight beside the other glyphs.
 */
function ShareArrow({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        d="M12.5 7.6V4L21 11l-8.5 7v-3.7C8.2 14.3 5.6 16.1 3.6 19.6 3.4 12.9 6.8 8.5 12.5 7.6Z"
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
  arrow_outward: MatArrowOutward,
  bookmark: Bookmark,
  bookmark_added: BookmarkAdded,
  calendar_month: MatCalendarMonth,
  calendar_view_day: MatCalendarViewDay,
  calendar_view_month: MatCalendarViewMonth,
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
  group: MatGroup,
  groups: MatGroup,
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
  share: ShareArrow,
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
