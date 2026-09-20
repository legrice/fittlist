# shadcn/ui mobile experiment

Branch: `experiment/shadcn-ui`. The production `main` branch is unchanged.

The `/ui-preview` route is a phone-sized, interactive concept covering Calendar, Discover, Groups, Inbox, and You. It uses sample content so the visual language can be reviewed without changing production data or navigation. This route is a design preview, not the working app.

shadcn/ui is installed with the Base UI Nova preset, Tailwind 4, and the existing FittList Delight font and semantic colors. Tailwind's preflight is omitted to avoid resetting the existing app while components are migrated. The real group page is the first feature using shadcn Tabs and Avatar. Future migration should move shared controls and each functional screen to the chosen design, with mobile interaction and accessibility checks before merging.

Do not merge this branch as a complete app migration. The functional screens still contain their existing components and CSS.

## HeroUI comparison

`/hero-preview` is a separate Calendar and Explore trial using HeroUI React 3.2.6.
The original styled `/ui-preview` remains intact. Cards, tabs, buttons, avatars,
chips, search fields, and selects use HeroUI components and its default light
theme. Only layout and content hierarchy are supplied by the preview CSS.

The comparison renders through a React portal into a same-origin iframe so
HeroUI and the existing app's global CSS cannot override each other. Select
popovers target that iframe's root as well. The official precompiled stylesheet
and its license are copied from `@heroui/styles` into `public/hero-preview`;
refresh both and the versioned stylesheet URL when upgrading the package.

Sample interactions include Calendar You/Following, a person filter, Explore
search, Classes/People/Places subpages with filters and back navigation, and
local follow toggles. Add and Share lead to the existing app flows. The Original
link returns to the full styled prototype.
