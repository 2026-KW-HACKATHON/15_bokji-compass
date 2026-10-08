# Web design QA — 2026-10-07

## Source visual truth

- Selected user attachment: `C:/15_bokji-compass/output/design-review-2026-10-07/selected-home.png` (1108×811 physical pixels).
- App-only source region: approximately x=23, y=14, width=1074, height=764. Compare its proportions at 1440×1024 CSS pixels; external viewer chrome is excluded. This is a user screenshot of the selected second concept, not a pixel-perfect screenshot of running code.
- Existing Noto Sans KR variable font, original `public/brand-logo.png`, Lucide icon library, and existing API interactions remain the product foundations.
- New guide direction: the selected blue/navy product identity, with large product storytelling sections inspired by the official Apple and Toss websites. `public/guide-compass.png` is a generated transparent raster asset (1254×1254), not CSS illustration.

## Browser-rendered evidence

All files are under `C:/15_bokji-compass/output/design-review-2026-10-07/`.

- Desktop, 1440×1024 CSS pixels, DPR 1: `desktop-home.png`, `desktop-guide.png`, `desktop-guide-full.png`, `desktop-explore.png`, `desktop-calendar.png`, `desktop-saved.png`, `desktop-calculator.png`, `desktop-profile.png`, `desktop-login.png`, `desktop-signup.png`.
- Mobile, 390×844 CSS pixels, DPR 1: corresponding `mobile-*.png`, `mobile-guide-full.png`, `mobile-easy-home.png`.
- Narrow easy-mode check: `easy-320.png` and browser tests at 320px.
- `capture-results.json` records route headings, viewport/document widths, and zero uncaught page errors.
- State: guest home without sufficient matching information; real empty-result category links replace the source concept's example policy rows. This intentional data-dependent difference preserves real service semantics. No example policies were inserted into production data.
- Source and implementation full views were opened together in the same image inspection input. Header/search/list proportions and spacing were compared directly. Focused checks covered the mobile search control, common-page focus border, guide hero, typography, and full-page guide section rhythm.

## Findings and corrections

1. **P2 resolved — small-screen easy-mode search overflow.** The existing 78px minimum width exceeded the new 54px search grid column. Reset the mobile minimum width and use `minmax(0, 1fr)`. 320px and 390px now have no horizontal document overflow, including the strict browser tests.
2. **P2 resolved — oversized focus border after navigation.** Programmatic focus on the whole main region produced a brown border around other pages. Suppressed that noninteractive container outline while preserving visible focus on links, buttons and fields.
3. **P2 resolved — lost official policy indicators in new row layout.** Restored `PolicyIndicators` with source links. Browser tests verify supplied popularity and budget values and reject invented metrics.
4. **P2 resolved — guide example/fine-print readability.** Increased small explanatory text to at least 12px and darkened it to `#5c6e82`. Blue control color was also darkened to `#076cda`.
5. **P3 resolved — off-center profile content.** Capped and centered the profile surface to align its reading width with the wider common shell.
6. **P3 resolved — guide calendar label.** Describe the actual start-date example rather than claiming an end marker is present.

## Fidelity surfaces

- **Typography:** source-style centered headline and readable Noto Sans KR hierarchy; Korean wraps intentionally, buttons have stable label alignment. The source screenshot's washed-out contrast is not reproduced.
- **Spacing/layout:** horizontal site navigation, central wide search, consistent rows and two supporting shortcuts match the selected direction. Shared page widths, radii and control heights are harmonized. Mobile nav scrolls within its own track rather than enlarging the document.
- **Colors/tokens:** existing navy and blue retained; soft blue/green accents have defined purposes. No competing page-specific theme added to ordinary app pages.
- **Assets:** supplied logo remains intact; guide raster has true alpha and a fixed square aspect ratio. Icons use the established library. No stretching, missing assets or substitute drawings found.
- **Content:** live response text remains data-driven. Fixed Korean copy was corrected in recommendations, search, questions, calendar, profile and financial help. Guide demonstrations are marked as examples and eligibility is not guaranteed.

## Interaction and regression checks

- Homepage query/region/category reach actual explorer fields and requests; reload and back navigation work.
- Guide CTA destinations, category demo, bookmark demo, easy-mode preview and actual mode switch work.
- Normal-motion guide QA: all 13 revealed regions became visible; all 12 section clicks across 1440/768/390px set the expected active section and focus. Sticky offsets track resized header heights. Keyboard Enter/Space operations passed.
- Existing save/detail/question, calendar, source-indicator and recommendation-context checks remain covered.
- Unit tests: 89 passed. Relevant browser suite: 59 initially passed and all 9 initially failing flows passed after fixes (68 total). Two strengthened zero-overflow checks also passed.
- Production build passed after guide code splitting; main JS 489.46kB and guide JS 19.49kB before gzip.

## Limits and follow-up polish

- Screenshots do not establish comprehensive accessibility compliance. No formal screen-reader audit was requested or performed.
- Individual source-announcement and generated-answer grammar requires concrete server response examples; fixed interface wording was reviewed in this change.
- Some live list captures include loading states; loaded data, filtering, detail and saving are separately verified by browser fixtures. These are not claimed as live backend data validation.
- No actionable P0/P1/P2 findings remain for this implementation scope.

final result: passed

## 2026-10-08 introduction menu and motion follow-up

- Renamed the main navigation item and inner title to `복지나침반 소개`. The active navigation item stays in view within the mobile horizontal menu, including direct entry and viewport resizing.
- Added one-time search and matching sequences (2.8s / 3.6s), replay controls and category-result transitions. Focus and pointer interaction finish the sequence immediately. Replay preserves the chosen category; reduced-motion changes cancel motion and reveal all content immediately.
- Captured and visually reviewed eight normal-motion frames at 1440px and 390px: `output/design-review-2026-10-08/{desktop,mobile}-guide-{search,match}-{sequence,complete}.png`. Checked stage spacing, text/button alignment, replay controls, sticky header clearance, and settled positions. No overlap found.
- Browser checks: 12 passed across desktop and mobile (11 initially; one passed after allowing subpixel rounding in the active-link viewport assertion). Coverage includes replay, user selection, keyboard operation, reduced-motion changes during playback, real CTA destinations and 320px easy mode. Additional smoke checks reported no page errors or overflow at 768px and 390px.
- Production build passed; the introduction remains a separate chunk. The overall app currently emits a main-chunk size warning above 500kB. This follow-up adds no runtime dependency.

## 2026-10-08 AI conversation and chatbot introduction

- Final navigation and inner title: `서비스 소개`. Added an `AI 대화` contents item, navy product section with a staged conversation preview, and a companion chatbot introduction with working CTAs.
- Copy was checked against AssistantPage, GuidedConversation and FloatingAssistant. The example is labeled; conversation/login, consent-based saving, user-recorded application status and provided source evidence are described without promising unsupported capabilities.
- Screenshots: `output/design-review-2026-10-08/{desktop,mobile,narrow}-service-ai-{viewport,section}.png`, at 1440/390/320px. Desktop and mobile sections were opened for visual review. Headings, conversation bubbles, summary rows and chatbot button fit; measurements report no page overflow or JavaScript errors at all three widths.
- Browser verification: 18 guide/portal/motion tests and four existing chatbot regression cases passed. The real chatbot opens within the introduction, closes back to its trigger, and leaves the floating launcher hidden. The AI CTA reaches `#assistant`. The four-second example makes no assistant API call and responds to reduced-motion changes during replay.
- Production build passed. No new runtime dependency; the existing main-bundle size warning remains.
