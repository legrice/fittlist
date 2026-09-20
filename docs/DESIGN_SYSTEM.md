# FittList interface system

This file is the contract for the product UI. Changing a shared rule here is
intended to change every screen that consumes it. Page-specific styles should
not redefine these decisions.

## Product principles

- Content sits on white or near-white surfaces.
- Elevation comes from layering and dividers, never decorative shadows.
- Lists are flat. Rows use inset dividers rather than individual cards.
- Lime means the primary next action or the selected state.
- Green means an item was successfully added. Red is destructive only.
- Every interactive target is at least 44 by 44 pixels.

## Shape

| Token | Value | Purpose |
| --- | ---: | --- |
| `--radius-sm` | 10px | Small contained details and compact menus |
| `--radius-control` | 16px | Buttons, inputs, cards, and action rows |
| `--radius-sheet` | 28px | Top corners of bottom sheets |
| `--radius-pill` | 999px | Filters, statuses, avatars, and circular icon buttons |

Do not add a new radius for a single feature. If none of these four describes
the element, reconsider whether the element needs a container.

## Actions

- **Primary:** lime (`#A1E510`) fill, charcoal (`#192126`) type; lighter lime (`#BBF246`) when pressed.
- **Secondary:** cool gray fill, charcoal type. Secondary text uses `#384046` in light mode.
- **Outline:** white fill with ink outline, used only when the boundary matters.
- **Tertiary:** text only.
- **Destructive:** red, always confirmed before irreversible work.
- **Icon:** 44px circular target with a 18–24px icon.

All text buttons use the shared `.btn` primitive and its variants. Feature
classes may change width or layout, but not radius, color meaning, font, or
pressed/disabled behavior.

## Typography

- Delight is the product typeface.
- `700` is reserved for short display headlines and decisive actions.
- Dense product copy and schedules stay at `400–600`.
- All-caps is a display treatment for onboarding and feature stories, never
  ordinary page navigation or long-form copy.

## Navigation and dismissal

- Back is always top-left and means return to the previous screen or step.
- Close is always top-right and means dismiss the current modal or sheet.
- If both are present, Back remains left and Close remains right.
- Overflow never swaps places with Close.
- Sheets use a 28px top radius and no bottom radius.

## Tabs and filters

- Page mode switches use a segmented control.
- Filters and compact statuses may use pills.
- Profile section navigation uses underline tabs because it anchors one page.
- Filled and underline tabs should never be mixed within the same navigation.

## Layout and spacing

- Page and sheet gutter: 24px.
- Structural spacing uses an 8px grid: 8, 16, 24, 32, 40, 48, and 64px.
- A 4px adjustment is allowed only inside a component for optical alignment;
  it must never become the gap between sections.
- Page titles share one vertical position beneath the app header.
- Calendar rows, date headers, and dividers use shared components everywhere.

## Surfaces

The palette uses white (`#FFFFFF`) cards, cool gray (`#F3F4F6`) backgrounds,
and charcoal (`#192126`) calendar backdrops. Dark mode uses the same charcoal
ground with raised gray surfaces and white text. Semantic status and calendar
role colors remain distinct from the primary action color.

Containers are appropriate for fields, sheets, dialogs, empty states, media
previews, and genuinely selectable options. Calendar entries, settings,
favorites, directories, and search results are lists and should be flat.

## Review checklist

Before introducing a new visual rule, verify:

1. Can an existing token or primitive express it?
2. Does the same component already exist elsewhere?
3. Does the color communicate the same meaning everywhere?
4. Is Back on the left and Close on the right?
5. Is the target at least 44px?
6. Could a divider replace this container?
7. Does changing the shared primitive intentionally update all consumers?

## `/ui-preview` action and typography contract

The prototype intentionally uses rounded cards and pill-shaped actions per the
current design direction; it does not change production's flat-list contract.
Its shared rules live at the end of `src/app/ui-preview/preview.module.css`.

- Primary bottom actions: minimum 60px height, 24px horizontal padding, pill
  radius, Delight 16px/1.25 at weight 600, lime fill and charcoal text.
  Share, class Save/Edit, membership checkout, and primary form actions consume
  this same rule. Long labels may grow vertically rather than clip.
- Secondary actions: gray pills, minimum 44px height, the same 16px/600 label.
  Compact calendar Save and View Profile controls retain the main-branch sizing.
- Page/display headings: 36px/1.08, weight 600. Section and date headings:
  21px/1.2, weight 600. Subheadings: 18px/1.25, weight 600. Body: 16px/1.5;
  supporting notes: 13px. Use semantic heading levels independently of size.
- Bottom actions clear the safe area. Share's horizontally scrolling tools and
  primary action form one fixed dock; content reserves room beneath it. Action
  sheets take precedence over the dock. Detail views hide root navigation.
- Keep action labels sentence case and verb-led. Use Save/Saved consistently;
  use Back for navigation, Close for dismissing an action sheet. Demo billing
  actions must remain explicitly labeled as simulated.

Add new primary actions to the shared rule (or extract a shared component),
never duplicate the dimensions in a feature-specific override.
