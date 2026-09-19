# shadcn/ui mobile experiment

Branch: `experiment/shadcn-ui`. The production `main` branch is unchanged.

The `/ui-preview` route is a phone-sized, interactive concept covering Calendar, Explore, Groups, Updates, and You. It uses sample content so the visual language can be reviewed without changing production data or navigation. This route is a design preview, not the working app.

shadcn/ui is installed with the Base UI Nova preset, Tailwind 4, and the existing FittList Delight font and semantic colors. Tailwind's preflight is omitted to avoid resetting the existing app while components are migrated. The real group page is the first feature using shadcn Tabs and Avatar. Future migration should move shared controls and each functional screen to the chosen design, with mobile interaction and accessibility checks before merging.

Do not merge this branch as a complete app migration. The functional screens still contain their existing components and CSS.

## Stock component comparison

The preview now uses the installed shadcn Base Nova component styling and the
standard neutral light theme with system sans-serif type. Official Input Group,
Native Select, and Item components replace bespoke controls. The CSS module
contains page layout and text hierarchy only, with no component color, radius,
shadow, or interaction-state overrides. The floating add action is a standard
icon Button.

`stock.css` scopes Tailwind's official preflight and neutral theme variables to
`data-shadcn-preview`. Generic legacy resets exclude this subtree, so existing
production screens retain their styling. App-specific composition (including
the bottom navigation and schedule columns) remains layout code: shadcn provides
the components, not these complete app screens.
