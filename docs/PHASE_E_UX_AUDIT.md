# Phase E — UX, Responsive & PWA Audit

- Verified via Playwright (`tests/e2e/verify_app.py`) against Vite preview:
  - **9 viewports passed** with zero console/page errors and zero horizontal overflow: `320x844`, `375x844`, `390x844`, `430x844`, `768x844`, `1024x900`, `1280x900`, `1440x900`, `1920x900`.
  - **Core flows passed:** Schedule Day/Week + WeekGrid Escape, Attendance toggle + reload persistence, LessonNotesDrawer create + reload persistence, Deadlines CRUD + reload persistence, Directory search/switch, Stats calculation, Settings theme + JSON Export/Import + department/subgroup persistence.
  - **PWA & reduced-motion passed:** `/manifest.json`, icons, `/sw.js` registration, `/offline.html`.
