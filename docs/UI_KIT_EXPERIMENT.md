# shadcn/ui mobile experiment

Branch: `experiment/shadcn-ui`. The production `main` branch is unchanged.

The `/ui-preview` route is a phone-sized, interactive concept covering Calendar, Discover, Groups, Inbox, and You. It uses sample content so the visual language can be reviewed without changing production data or navigation. This route is a design preview, not the working app.

shadcn/ui is installed with the Base UI Nova preset, Tailwind 4, and the existing FittList Delight font and semantic colors. Tailwind's preflight is omitted to avoid resetting the existing app while components are migrated. The real group page is the first feature using shadcn Tabs and Avatar. Future migration should move shared controls and each functional screen to the chosen design, with mobile interaction and accessibility checks before merging.

Do not merge this branch as a complete app migration. The functional screens still contain their existing components and CSS.

## Three-way visual comparison

The top control on `/ui-preview` switches between Original, Apple-inspired, and
Material-inspired treatments. The same components, content, and interaction
state remain mounted when switching. Original is the default; `?look=apple`
and `?look=material` provide shareable selections that survive reloads.

The alternatives are CSS-based web interpretations of Apple's grouped surfaces,
system typography and blue actions, and Material 3's tonal colors, shape scale,
segmented controls and navigation indicators. They are not native controls or
implementations of a new component library. All five screens and their detail
views share the selected treatment. The comparison control remains visually
neutral and supports radio-group keyboard navigation.
