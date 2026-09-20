# shadcn/ui mobile experiment

Branch: `experiment/shadcn-ui`. The production `main` branch is unchanged.

The `/ui-preview` route is a phone-sized, interactive concept covering Calendar, Discover, Groups, Inbox, and You. It uses sample content so the visual language can be reviewed without changing production data or navigation. This route is a design preview, not the working app.

shadcn/ui is installed with the Base UI Nova preset, Tailwind 4, and the existing FittList Delight font and semantic colors. Tailwind's preflight is omitted to avoid resetting the existing app while components are migrated. The real group page is the first feature using shadcn Tabs and Avatar. Future migration should move shared controls and each functional screen to the chosen design, with mobile interaction and accessibility checks before merging.

Do not merge this branch as a complete app migration. The functional screens still contain their existing components and CSS.

## Apple-inspired direction

Apple is the selected layout direction, with the original ink, white, and lime
colors restored. The palette comparison control has been removed.
Calendar now has one full-width dark hero containing a pill-shaped You/Following
control and either the personal summary or the people filter circles. The class
list sits directly beneath it. Updates also uses pill-shaped tabs.

Schibsted Grotesk (400, 500, 600, 700) is self-hosted from the official project's
webfont releases in `public/fonts/`, with its SIL Open Font License alongside.
It is scoped to this prototype; production typography is unchanged.

Sources: https://github.com/schibsted/schibsted-grotesk and its `fonts/webfonts`
directory. The Apple-inspired treatment remains a web interpretation, not native
Apple controls. Previous visual comparisons remain available in git history.
