# Responsive verification — 8 October 2026

Checked the rendered GROW interface in the in-app Chromium browser using explicit viewports. These are browser emulations, not physical-device or Safari/Firefox certification.

| Layout | Viewport |
| --- | --- |
| Small phone | 320 × 568 |
| Android-sized phone | 360 × 800 |
| Phone | 390 × 844 |
| Large phone | 430 × 932 |
| Tablet portrait | 768 × 1024 |
| Phone landscape | 844 × 390 |
| Tablet / small laptop | 1024 × 768 |
| Desktop | 1440 × 900 |
| Wide desktop | 1920 × 1080 |

All 24 owner views passed at each size: 216 page/viewport combinations. The document width matched the viewport, and page content stayed inside the viewport except within deliberately scrollable boards, tables and calendars. The browser's measured width was checked against the requested width on every final pass.

Additional checks covered seven Business Admin views at five sizes, the member workspace at seven sizes, and sign-in at five sizes. Quick-task and person/access-role dialogs were checked at five sizes; client, content and invoice dialogs at 320 × 568 and 844 × 390. The open dialogs stayed inside the viewport, their fields fitted, and mobile input text was 16px.

Long unbroken names, emails, links, Bangla task titles and large financial amounts were checked in eight views at four sizes. Long person names and agenda labels wrap inside cards. Wide tabular values remain accessible by scrolling their table.

The navigation drawer was checked for opening, selecting a page, closing, Escape dismissal, restoring the background, and updating its expanded state. Hidden navigation is inert. On phones/tablets, primary buttons and form controls have a 44px minimum height. A task board was focused and scrolled with the keyboard while the document retained its viewport width.

Fixes: shrinkable dashboard grid children, wrapping tabs and filters, a compact two-row header on the smallest phones, tablet navigation drawer, larger touch controls, contained form dialogs, long-text wrapping and keyboard access to horizontally scrollable regions.

Existing interaction and template-render checks pass. Live deployment is verified separately with authenticated page checks and a comparison of saved records/settings before and after deployment.
