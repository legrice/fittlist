import { ArrowLeft } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr/ArrowSquareOut";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr/ArrowUpRight";
import { At } from "@phosphor-icons/react/dist/ssr/At";
import { Bell } from "@phosphor-icons/react/dist/ssr/Bell";
import { BookmarkSimple } from "@phosphor-icons/react/dist/ssr/BookmarkSimple";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { CalendarCheck } from "@phosphor-icons/react/dist/ssr/CalendarCheck";
import { CalendarDots } from "@phosphor-icons/react/dist/ssr/CalendarDots";
import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { CaretUp } from "@phosphor-icons/react/dist/ssr/CaretUp";
import { ChatCircle } from "@phosphor-icons/react/dist/ssr/ChatCircle";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { Circle } from "@phosphor-icons/react/dist/ssr/Circle";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { Compass } from "@phosphor-icons/react/dist/ssr/Compass";
import { Copy } from "@phosphor-icons/react/dist/ssr/Copy";
import { DeviceMobile } from "@phosphor-icons/react/dist/ssr/DeviceMobile";
import { DotsThree } from "@phosphor-icons/react/dist/ssr/DotsThree";
import { EnvelopeSimple } from "@phosphor-icons/react/dist/ssr/EnvelopeSimple";
import { Export } from "@phosphor-icons/react/dist/ssr/Export";
import { Eye } from "@phosphor-icons/react/dist/ssr/Eye";
import { Fingerprint } from "@phosphor-icons/react/dist/ssr/Fingerprint";
import { Flag } from "@phosphor-icons/react/dist/ssr/Flag";
import { GearSix } from "@phosphor-icons/react/dist/ssr/GearSix";
import { Globe } from "@phosphor-icons/react/dist/ssr/Globe";
import { GlobeX } from "@phosphor-icons/react/dist/ssr/GlobeX";
import { Heart } from "@phosphor-icons/react/dist/ssr/Heart";
import { House } from "@phosphor-icons/react/dist/ssr/House";
import { Image } from "@phosphor-icons/react/dist/ssr/Image";
import { Info } from "@phosphor-icons/react/dist/ssr/Info";
import { Lightning } from "@phosphor-icons/react/dist/ssr/Lightning";
import { LinkSimple } from "@phosphor-icons/react/dist/ssr/LinkSimple";
import { List } from "@phosphor-icons/react/dist/ssr/List";
import { ListBullets } from "@phosphor-icons/react/dist/ssr/ListBullets";
import { Lock } from "@phosphor-icons/react/dist/ssr/Lock";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { MapPin } from "@phosphor-icons/react/dist/ssr/MapPin";
import { Megaphone } from "@phosphor-icons/react/dist/ssr/Megaphone";
import { Moon } from "@phosphor-icons/react/dist/ssr/Moon";
import { Palette } from "@phosphor-icons/react/dist/ssr/Palette";
import { PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr/PaperPlaneTilt";
import { PencilSimple } from "@phosphor-icons/react/dist/ssr/PencilSimple";
import { Phone } from "@phosphor-icons/react/dist/ssr/Phone";
import { Plus } from "@phosphor-icons/react/dist/ssr/Plus";
import { Pulse } from "@phosphor-icons/react/dist/ssr/Pulse";
import { QrCode } from "@phosphor-icons/react/dist/ssr/QrCode";
import { SealCheck } from "@phosphor-icons/react/dist/ssr/SealCheck";
import { ShareNetwork } from "@phosphor-icons/react/dist/ssr/ShareNetwork";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { SlidersHorizontal } from "@phosphor-icons/react/dist/ssr/SlidersHorizontal";
import { Sparkle } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { Storefront } from "@phosphor-icons/react/dist/ssr/Storefront";
import { Sun } from "@phosphor-icons/react/dist/ssr/Sun";
import { Trash } from "@phosphor-icons/react/dist/ssr/Trash";
import { UserCircle } from "@phosphor-icons/react/dist/ssr/UserCircle";
import { UserGear } from "@phosphor-icons/react/dist/ssr/UserGear";
import { UserPlus } from "@phosphor-icons/react/dist/ssr/UserPlus";
import { UsersThree } from "@phosphor-icons/react/dist/ssr/UsersThree";
import { X } from "@phosphor-icons/react/dist/ssr/X";

/**
 * Phosphor, solid.
 *
 * The set was Lucide at a 1.75 stroke, which is a hairline drawing: fine
 * beside 15px type and plainly a different app's furniture beside 22px class
 * names. What this app wants is Vignelli with the sound turned up: simple
 * geometric marks, no detail, no line weight to squint at, drawn heavy enough
 * to hold their own against the type.
 *
 * Phosphor gets there without an icon font. Its `fill` weight is exactly that
 * drawing (a bell is a bell-shaped solid, not an outline of one), and it ships
 * as tree-shaken React components off `dist/ssr`, so there is still no
 * blocking request to Google and no flash of ligature text before a font
 * lands. A Material Symbols variable font was the other candidate and lost on
 * that alone.
 *
 * The one rule worth knowing: **an object fills, a mark does not.** A bell, a
 * calendar, a pin, a padlock are things, and a thing drawn solid reads
 * instantly at any size. A plus, an X, a caret, a tick, an arrow are marks:
 * they have no inside, so Phosphor's `fill` for them is a rounded rectangle
 * with the mark knocked out of it, which is a button drawn inside a button.
 * Those take `bold` instead, the same simple geometry at a heavy stroke.
 * `WEIGHT` below is the exception list and anything not in it fills.
 *
 * That rule cannot be checked by machine, and `scripts/icon-check.mjs` says so
 * rather than pretending: a filled calendar is a rounded rectangle too, and
 * filled is exactly what it should be. What the check does hold is that every
 * name resolves to a component that exists in both weights, that no exception
 * names a glyph that has gone, and that no call site asks for a name this map
 * has never heard of. The last one found `image`, which had been drawing a
 * blank circle in the class photo picker for months.
 */

/** The list view, drawn for this app rather than borrowed: two rules with a
 *  boxed band between them, which is a day's rows under a heading. */
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

type Weight = "bold" | "fill";
type Glyph = React.ComponentType<{ size?: number; weight?: Weight }>;

// Call sites keep the old Material names. This map is the only place that
// knows the difference, which is why swapping the whole set is a one-file job
// and has now been done twice.
const ICONS: Record<string, Glyph> = {
  account_circle: UserCircle,
  add: Plus,
  admin_panel_settings: UserGear,
  alternate_email: At,
  arrow_back: ArrowLeft,
  auto_awesome: Sparkle,
  auto_awesome_outline: Sparkle,
  bolt: Lightning,
  bookmark: BookmarkSimple,
  // The filled half of a pair: same glyph, two weights, so the difference
  // reads as a state rather than as a different thing.
  bookmark_added: BookmarkSimple,
  calendar_month: CalendarDots,
  calendar_today: CalendarBlank,
  call: Phone,
  campaign: Megaphone,
  chat: ChatCircle,
  chat_bubble: ChatCircle,
  check: Check,
  chevron_left: CaretLeft,
  chevron_right: CaretRight,
  close: X,
  content_copy: Copy,
  dark_mode: Moon,
  delete: Trash,
  edit: PencilSimple,
  event: CalendarBlank,
  event_added: CalendarCheck,
  event_available: CalendarCheck,
  expand_less: CaretUp,
  expand_more: CaretDown,
  favorite: Heart,
  fingerprint: Fingerprint,
  flag: Flag,
  groups: UsersThree,
  home: House,
  // The class photo picker has been asking for this name for months and
  // getting the fallback circle. That is the failure mode `icon-check` exists
  // to catch: an unmapped name renders as a blank button and nothing complains.
  image: Image,
  info: Info,
  ios_share: Export,
  light_mode: Sun,
  link: LinkSimple,
  list: ListBullets,
  lock: Lock,
  mail: EnvelopeSimple,
  menu: List,
  more_horiz: DotsThree,
  north_east: ArrowUpRight,
  notifications: Bell,
  open_in_new: ArrowSquareOut,
  palette: Palette,
  person_add: UserPlus,
  phone_iphone: DeviceMobile,
  place: MapPin,
  public: Globe,
  public_off: GlobeX,
  // The heartbeat, for Activity: a pulse is what a feed of what people are
  // doing looks like, and it is not a bell (that is news addressed to you)
  // and not a compass (that is browsing).
  activity: Pulse,
  qr_code_2: QrCode,
  schedule: Clock,
  search: MagnifyingGlass,
  send: PaperPlaneTilt,
  settings: GearSix,
  share: ShareNetwork,
  shield: ShieldCheck,
  storefront: Storefront,
  travel_explore: Compass,
  tune: SlidersHorizontal,
  verified: SealCheck,
  visibility: Eye,
};

/**
 * The marks, which have no inside to fill.
 *
 * Getting this wrong is not subtle: a caret that slipped off this list renders
 * as a solid tile at the end of every settings row. A few here are objects
 * that are on it by choice rather than by need, because solid loses what they
 * are: a globe is its meridians, a fingerprint is its ridges, and a magnifier
 * filled in is a lollipop.
 */
const WEIGHT: Record<string, Weight> = {
  activity: "bold",
  add: "bold",
  alternate_email: "bold",
  arrow_back: "bold",
  // The outline half of the pair whose filled half means "in".
  auto_awesome_outline: "bold",
  bookmark: "bold",
  check: "bold",
  chevron_left: "bold",
  chevron_right: "bold",
  close: "bold",
  expand_less: "bold",
  expand_more: "bold",
  fingerprint: "bold",
  ios_share: "bold",
  link: "bold",
  list: "bold",
  menu: "bold",
  more_horiz: "bold",
  north_east: "bold",
  open_in_new: "bold",
  public: "bold",
  public_off: "bold",
  qr_code_2: "bold",
  search: "bold",
  tune: "bold",
};

/**
 * The house size.
 *
 * 24, up from 18. Phosphor draws inside a 256 box with more air than Lucide's
 * 24, so the same number reads smaller; and the type went up, so the glyphs
 * had to follow or the two stop belonging on one row.
 */
const SIZE = 24;

export function Icon({
  name,
  size = SIZE,
  className = "",
  weight,
}: {
  name: string;
  size?: number;
  className?: string;
  /** Override the per-name default. Rare: the point of the table above is
   *  that a glyph looks the same everywhere it appears. */
  weight?: Weight;
}) {
  // Hand-drawn glyphs are their own components rather than set icons, so they
  // are asked for before the map is.
  if (name === "view_list") return <ViewList size={size} className={className} />;
  const Glyph = ICONS[name] ?? Circle;
  return (
    <span className={`icon ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <Glyph size={size} weight={weight ?? WEIGHT[name] ?? "fill"} />
    </span>
  );
}
