# Bottom-sheet close controls

September 5, 2026 — `experiment/calendar-personal-following`

Audited close-button call sites across sheet components and their shared/local CSS. Standardized 104 controls with the shared `sheet-dismiss` class and a 20px close icon:

- 44 × 44px circular target, muted surface background, primary text color.
- No border, shadow or glass effect; shared pressed background and existing focus-visible outline.
- Close on the right. Back/navigation controls remain on the left.
- Absolute controls retain the shared page gutter; header controls align to the right edge of their header content.
- Class and personal-plan close controls remain sticky when scrolling. Class overflow and its menu move to the left; studio/group preview close controls move to the right in both DOM and visual order.

Coverage includes class details and nested shift actions, personal plans, calendar/comment/directory sheets, account/profile/settings, add/edit flows, share/QR tools, authentication, groups, studio administration, feedback/reporting, notifications, search and informational prompts. Full-screen photo viewers, page navigation, and inline remove/clear buttons are separate controls and retain their existing behavior.

Validation: TypeScript, lint, color and icon checks; seven representative header layouts at 390px and 1440px in Chromium, WebKit and Firefox. Browser checks assert the 44px target, right alignment, muted background, no shadow, and separation of class overflow/close controls. This is a source audit plus representative layout coverage, not physical-device testing of every conditional sheet state.

For new sheets, apply `sheet-dismiss` to the close button, use `<Icon name="close" size={20} />`, and place it last in a flex header or at the right page gutter. Preserve a meaningful accessible label and the existing close handler.
