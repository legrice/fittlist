# Prototype migration: feature parity audit

Reviewed 20 September 2026 against freshly fetched `origin/main` (`d1e12110`), on `experiment/shadcn-ui`.

## Decision

Keep the new Calendar / Explore / Groups / Updates / You navigation and visual system. Migrate existing capabilities into it using the existing authenticated server actions and permission rules. Do not replace production with `/ui-preview` yet: real reads are connected in several places, but most changes remain client-only. Existing production routes still exist on this branch; their presence is not evidence they are integrated into the new experience.

Groups should remain a first-class, free entry point: discovering, creating, joining, inviting, planning classes together, and participating in group updates must survive this migration. Paid class hosting is deferred. Staff must not need a personal subscription to view or coordinate their assigned work.

## Status definitions

**Partial live** means some production reads or shared components are used, not complete parity. **Local** means interactions affect preview state only. **Missing** means the corresponding production workflow is not represented in the new navigation. This is a source audit, not a signed-in production acceptance test.

## Whole-app checklist

| Area | Main capabilities / source | Prototype status and required work |
|---|---|---|
| Authentication and onboarding | `actions/auth.ts`, `actions/onboarding.ts`, auth callbacks: password, magic link, passkeys, social return, profile claims, coach requests, onboarding | Partial. Prototype sign-in return exists; verify every provider, email return, invitation, expired session, member/coach/admin and native cold start. Onboarding and claim flows still use existing screens. |
| You calendar | `CalendarScreen`, `MyCalendar`, `actions/calendar-data.ts`, `actions/classes.ts`, `actions/personal.ts` | Partial live reads. Add/edit/delete and save changes are local. Restore recurring vs individual occurrence edits, cancellations, private personal entries, date navigation, timezone handling and complete calendar range. |
| Following calendar | `actions/calendar-stream.ts`, `following-directory.ts`, `pins.ts`, `circles.ts` | Partial live subset. Wire follow/save writes, pins, unseen state, pagination/month loading, visibility and approval rules. Keep own teaching excluded. Conflict notice is local; use actual occurrence/timezone data. |
| Class details | `actions/classdetail.ts`, public class routes, `going.ts`, `reports.ts` | Partial. Full-screen presentation exists but uses loaded preview class data. Restore canonical class/occurrence lookup, links, ownership actions, privacy, reporting and applicable attendance controls. Direct URL must work independently of the loaded calendar. |
| Explore | `actions/discover.ts`, `actions/search.ts`, `subscribe.ts` | People and studios read live; map exists. Search/filter only loaded data; follow is local/name-based. Preserve directory search, distance/location filters, empty/error states and follow requests. Classes stay out of Explore per design decision. |
| People profiles | `PublicProfileView`, `MemberProfileView`, `ProfileAbout`, `ProfileEndorsements`, `ProfileShoutouts` | Generic preview detail. Missing complete about/schedule/studios, member vs coach distinction, endorsements, shoutouts, contact permissions, follower lists, block/report and canonical handles. |
| Studio profiles | `StudioProfileHub`, `/s/[slug]/*`, `actions/studios.ts` | Generic preview detail and live map. Missing complete about/contact/coaches/schedule, edits and suggestions/reports, visits/endorsements, banners and public URLs. |
| Groups discovery and membership | `actions/groups.ts`, `GroupActions`, `GroupSetup`, `/g/[slug]` | Partial live list and member names; create/join local. Restore unique handles, public/unlisted/private rules, invitations and acceptance, leave/remove, member/admin roles, favorites and shareable invitation links. |
| Group calendar and updates | `GroupUpdates`, `groupClassCatalog`, `addGroupClasses`, `/g/[slug]/manage` | Missing live group class selections (live adapter returns empty class indexes), posts, comments, reactions and admin center. Prioritize these over new monetization features. |
| Updates and messaging | `NotificationCenter`, `NotificationFeed`, `actions/notifications.ts`, `inbox.ts`, `inquiries.ts` | Sample interactions only; signed-in screen links back to old `/updates`. Bring in real pagination, unread state, mark-read, replies, permissions, away replies, follow requests and deep links. |
| Profile editing and banners | `actions/profile.ts`, `profile-banner.ts`, `ProfileBannerSetting` | Local basic editor; banner not implemented. Preserve upload/crop, handle validation, member/coach fields, studio associations and privacy. Apply requested edge-to-edge banner with left avatar overlapping banner/content and name below. |
| Account and privacy | `ProfileSheet`, `MemberAccount`, `actions/auth.ts`, `blocks.ts`, `timezone.ts` | Most preview settings local. Restore password/email/passkey controls, account deletion, blocked people, discoverability, follower approval, message permissions, away dates and persisted timezone. Logout is connected. |
| Appearance and notifications | `actions/theme.ts`, `notifprefs.ts`, `push.ts`, `NativePushSettings` | Preview appearance works locally; preference switches are not account settings. Connect saved theme and notification preferences, browser/native permissions and push registration. |
| Calendar sync | `GoogleCalendarConnect`, `actions/google.ts`, `calfeed.ts`, `/connect/google`, feed endpoints | Preview controls only. Restore Google OAuth/disconnect and actual Apple/Outlook subscription URLs and visibility rules. |
| Sharing | `ShareHubScreen`, `actions/share-design.ts`, `share.ts`, `weektext.ts`, `/embed/[handle]` | Shared image editor/export is reused. `previewMode` bypasses account persistence; backgrounds, saved looks and initial design are not fully loaded. Restore share data/revisions, saved looks, background persistence, week text, embeds, public QR/link targets and native export behavior. |
| Insights | `actions/product-activity.ts`, `studioPageViews`, `gymCounts` | Preview metrics/gating are not production analytics. Reuse real definitions, history/ranges and authorization. |
| Studio management | `/s/[slug]/manage/*`, `actions/gym.ts` | New dashboard preview below; read-only live loading plus local drafts, not operational parity. |
| Registration / front desk | `actions/event-registration.ts`, `/s/[slug]/register`, `/manage/registrations` | Missing new-style integration: existing enabled studios have capacities, registration, waitlist, promotion/removal and check-in. Preserve existing conditional access; do not confuse this with deferred paid class hosting. |
| Admin and support | `/admin`, `/admin/marketing`, `actions/admin.ts`, `content-reports.ts`, `feedback.ts` | Existing routes remain; preview does not reproduce operational tools, moderation, invitations, role management, feedback or legal/support navigation. Can remain separate admin surfaces initially, with explicit authorized links. |
| Membership and billing | `ui-preview/membership.tsx` (new, not main parity) | Simulated checkout/codes/receipts/Apple restore. No Stripe or StoreKit entitlements. Current Pro price in code is still $7.99, while the later discussion used $6.99: reconcile pricing before launch. Studio $49.99/month. Brand/logo controls remain planned. |
| Navigation, accessibility and native | `AppChrome`, native navigation/deep-link code, existing browser/native scripts | Root tabs and full-screen details exist. Only class IDs are encoded into preview URLs; most destinations rely on local state. Preserve canonical URLs, reload/back/forward, scroll restoration, push/email links, safe areas, focus management, keyboard use and desktop layout. |

## Studio management detail

The new preview dashboard exposes Calendar, Requests, Staff, Standard week, Class counts, and Profile & settings. Signed-in authorized managers can load the current schedule, roster and requests. Changes are explicitly local; no invitations, notifications, or database changes are sent.

| Workflow | Main | New preview / remaining parity |
|---|---|---|
| Dashboard | Coverage, daily workload, requests, management shortcuts | Summary counts and coverage exist; workload chart and conditional front desk still missing. |
| Scheduling | Week/month, recurring and occurrence edits, draft publishing, open shifts, coach assignment, closures, standard days | Local class editing, draft/public flag and closures only. Need date navigation, real writes, recurrence semantics, delete and bulk publishing. |
| Shift coordination | Pickup, give up, transfer, cover, requests with occurrence/standing scope | Local request decision example only. Must use request/class IDs and real scope, not name/date matching; coach self-service remains missing. |
| Staff | Search existing users, invite, roles, coach detail, schedule inclusion/removal | Local name entry and roster counts only. No actual invitations or role changes. |
| Owner/managers | Manager permissions and ownership transfer | Missing. Preserve stricter permission checks; do not equate coaches with administrators. |
| Standard week | Persistent standard calendar and apply-standard-day behavior | Local capture/copy of loaded week; not equivalent to standing schedules. |
| Class counts | Production totals and range selection | Local loaded-schedule CSV only; add authoritative ranges and matching count semantics. |
| Studio settings | Profile, banner, visibility, shift approvals, owner controls | Local example values; do not present them as saved account settings. |

## Migration order and acceptance gates

1. **Routing and data foundation.** Keep stable user/studio/group/class IDs, handles/slugs, occurrence dates and timezones through adapters. Replace name matching. Shared new-style shell on canonical routes; bottom nav only on root pages, actions in sheets, details in full-screen routes.
2. **Calendar and Groups end to end.** Connect existing actions, proper permission/error/loading states, and refresh after writes. Groups discovery → join/create → invite → shared calendar → updates should work without a personal paid tier.
3. **Studio workspace and free staff access.** Migrate dashboard and schedule/shift/staff workflows against existing gym actions. Verify owner, manager, coach and ordinary member separately. Staff access must survive the individual having a Free account.
4. **Profiles, Updates, settings and share persistence.** Include banners, privacy/safety, sync, real messages and notifications, and saved sharing preferences. Update all legacy entry links to the new-style destination.
5. **Release validation and billing separately.** Membership is not a reason to delay basic parity or introduce client-only gates into production. Billing requires real server-verified entitlements and provider integration before launch.

For each migrated flow: successful write survives reload and another session; unauthorized write is rejected server-side; failed mutation does not show success; back/reload/deep link work; nav is absent on details; dark/light/mobile/desktop and native safe areas are checked. Exercise recurrence, closed days, DST/timezones, deleted/private classes and invitation states. Run existing relevant browser, calendar, data-integrity, notification and native suites before switching the production entry point.

## Scope and limitations

This audit compares production route/action/component inventory with prototype implementation. It is not a claim of exhaustive runtime verification, and signed-in production mutations were not tested. The production action layer is largely unchanged from main (auth differs for preview return), so migration should reuse it instead of building a second backend. Keep this checklist current as each workflow passes its acceptance checks.

## Discovery at scale

Explore now uses a compact people rail (up to 10 previews) and a studio photo rail (up to 8), with full searchable lists reached through See all. Use objective category labels, not motivational phrases. Do not infer proximity from a list being present: the production migration must resolve a chosen location before saying “near you”, and use “People” / “Studios” when location is unavailable.

Planned discovery requirements: explicit city/neighborhood or optional current location, adjustable radius, people specialty and studio activity filters, server-side pagination and distance sorting. Preserve filters when returning from a profile; reset filters deliberately when switching directories. Never depend on loading the whole directory into the browser.

Groups: keep Your groups separate from discovery. Add search, chosen location/radius, activity/category and public joinability filters, with clear empty states and reset controls. Private/unlisted groups must retain existing visibility/invitation rules, not leak into results through filters. Membership alone is not a discovery taxonomy. These richer filters are planned, not implemented by the rail layout change.

### Group discovery preview update

Explore includes a Groups rail after Studios; See all opens the Groups root tab. Groups → Explore all groups opens a full-screen directory with local text search, category pills and membership filtering; returning from a group preserves directory selection. Category grouping is a prototype mapping of existing category text, not a persisted taxonomy. Location/radius, accurate distance, authoritative categories and paginated server search remain required. Sample locations are marked; live distances are not invented.
