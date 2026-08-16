# FittList interface system

This file is the contract for the product UI. Changing a shared rule here is
intended to change every screen that consumes it. Page-specific styles should
not redefine these decisions.

## Product principles

- Content sits on white or near-white surfaces.
- Elevation comes from layering and dividers, never decorative shadows.
- Lists are flat. Rows use inset dividers rather than individual cards.
- Orange means the primary next action or the selected state.
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

- **Primary:** orange fill, white type.
- **Secondary:** quiet gray fill, ink type.
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
