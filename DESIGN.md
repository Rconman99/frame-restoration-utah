---
# Agent-readable brand file. Values are read from this repo's code on 2026-11-25
# (global.css, global-critical.css, index.html, manifest.json, images/, data/).
# If code and this file disagree, the live code wins: fix this file in the same PR.
brand: Frame Restoration Utah
market: Utah (Wasatch Front and Wasatch Back)
entity_on_site: "Frame Restoration Utah"       # title, og:site_name, schema name, manifest
schema_alternate_name: "Frame Roofing Utah"
domain: https://www.framerestorationutah.com  # canonical since the 2026-06-17 domain move; old frameroofingutah.com redirects
tokens:
  color:
    navy: "#0B4060"          # primary brand surface + headings
    navy-mid: "#093552"      # hover / pressed for navy
    navy-deep: "#082D44"     # FAQ band, darkest surface. Used as a fallback only, not declared in :root
    gold: "#E1B969"          # accent, primary CTA fill, rules and borders
    gold-light: "#E8C97F"    # gold hover
    gold-text: "#8A5A12"     # small gold-family text on white / off-white
    white: "#FFFFFF"
    off-white: "#FAF9F5"     # alt section background, manifest background_color
    gray: "#4A5464"          # body copy
    light-gray: "#E5E3DF"    # hairlines, table borders
    dark: "#262626"          # default text, footer background
  font:
    display: "'Archivo Black', sans-serif"   # self-hosted /assets/fonts/archivo-black.woff2
    body: "'Archivo', sans-serif"            # 400 + 600, self-hosted woff2
  radius:
    none: 0        # default for cards, chips, FAQ/how-to items (global.css forces it inside <main>)
    button: 2px
    card-soft: 4px # blog cards, table wrapper
    round: 50%     # avatars / icon dots only
  layout:
    nav-height: 100px        # 84px between 901 and 1100px and on mobile
    section-padding: "110px 5%"
    content-max: 900px
    hero-content-max: 780px
    sub-max: 600px
---

# Frame Restoration Utah: DESIGN.md

The brand file every agent reads before it makes a page, graphic, deck or email for
**Frame Restoration Utah**. It describes what is live in this repo, not a wish list.
Where something is unclear it says **UNSURE**; ask Ryan before treating it as a rule.
`CLAUDE.md` in this repo still wins on claims, phone numbers, hours and markets.

**Frame's brand only.** Never mix in RC Digital Systems, Powers GC, Taylor Creek or any
other client's colors, fonts, logos or copy. The Texas market (`frame-restoration-texas-v2`) has
its own DESIGN.md with a different navy; do not copy tokens, photos or copy across markets.

## 1. Name and identity

| Item | Value | Source |
|---|---|---|
| Public name on the site | **Frame Restoration Utah** | `<title>`, `og:site_name`, schema `name` (10x on home), `manifest.json`, 222 HTML files |
| Schema alternate name | Frame Roofing Utah | `alternateName` in schema |
| Logo wordmark | FRAME RESTORATION, tagline ROOFING & CONSTRUCTION | `images/logo-rc-*.webp`, `logo.png` |
| Theme color | `#0B4060` | `<meta name="theme-color">`, manifest |

Name history, so agents don't re-litigate it:
- 2026-06-01: `data/BRAND-DECISION-2026-06-01.md` picked "Frame Roofing Utah". **Superseded.**
- 2026-06-16: rebrand to **Frame Restoration Utah**, marketing-only; Twilio/A2P untouched
  (hub `projects/frame-utah/DECISIONS.md`: "Do not re-litigate").
- 2026-06-17: domain moved to www.framerestorationutah.com.
- UNSURE / open: some directory listings and the Google profile name may still say
  "Frame Roofing Utah". I did not check listings for this file. Listing alignment is
  Landon's and Ryan's call; agents should not edit listings.
- 35 HTML files still contain "Frame Roofing Utah" and the `global.css` header comment says
  "Frame Roofing design system". Don't spread that name in new copy; use Frame Restoration Utah.

The `rc` in `logo-rc-darkblue.webp` means **Roofing & Construction** (the tagline on the lockup).
It has nothing to do with RC Digital.

## 2. Color

| Token | Hex | Role | Contrast |
|---|---|---|---|
| `--navy` | `#0B4060` | Hero and band backgrounds, headings, nav links, table headers | 11.0:1 on white |
| `--navy-mid` | `#093552` | Hover/pressed state of navy buttons | |
| `--navy-deep` | `#082D44` | FAQ section background, deepest surface | gold on it 7.7:1 |
| `--gold` | `#E1B969` | Primary CTA fill, accent rules, card top borders, `<span>` in headlines, links on dark | 5.9:1 on navy; **1.9:1 on white** |
| `--gold-light` | `#E8C97F` | Gold hover | |
| `--gold-text` | `#8A5A12` | Section labels and small gold-family text on light backgrounds | 5.9:1 on white |
| `--white` | `#FFFFFF` | Page background, text on navy | |
| `--off-white` | `#FAF9F5` | Alternate sections, related-articles band, how-to band | |
| `--gray` | `#4A5464` | Body paragraphs | 7.7:1 on white |
| `--light-gray` | `#E5E3DF` | Borders, table rules | |
| `--dark` | `#262626` | Default text, footer background | 15.1:1 on white |

Rules:
- **Gold is never text on white or off-white.** Use `--gold-text` there. Gold text is for navy,
  navy-deep and dark backgrounds only.
- Navy plus gold is the whole palette. No new accent colors, gradients or tints without Ryan's OK.
- Overlays on photos are navy at 0.75 to 0.95 opacity (`.page-hero-overlay`).
- The logo artwork itself uses a darker navy (about `#0A223E`) than the site's `--navy`. Use the
  logo files as they are; don't recolor them to match.

Known drift in code (fix when touching these lines, don't copy them):
- `global-critical.css` does not declare `--gold-text`; anything above the fold that needs it falls back.
- `.nav-links a.active` and `.blog-card .blog-meta` use `--gold` on white (about 1.9:1). They should use `--gold-text`.
- The `global.css` comment above says the contrast of `#E1B969` on white is "about 1.7:1"; it measures 1.85:1. Same conclusion.

## 3. Typography

| Use | Font | Size | Style |
|---|---|---|---|
| Hero H1 (home) | Archivo Black | see `index.html` hero rules | UPPERCASE, white, second line in gold `<span>` |
| Page hero H1 | Archivo Black | `clamp(36px, 5.5vw, 64px)`, line-height 1.05 | UPPERCASE, white, gold `<span>` |
| Section title | Archivo Black | `clamp(32px, 4vw, 52px)`, line-height 1.08 | UPPERCASE, navy |
| Content H2 | Archivo Black | `clamp(22px, 3vw, 32px)` | UPPERCASE, navy, 3px gold left rule |
| Card H3 | Archivo Black | 14 to 19px | UPPERCASE, letter-spacing 0.5 to 1px |
| Section label (eyebrow) | Archivo Black | 11 to 12px, letter-spacing 3px | UPPERCASE, `--gold-text` |
| Buttons, nav | Archivo Black | 12 to 17px, letter-spacing 1 to 2px | UPPERCASE |
| Body | Archivo 400 | 16px, line-height 1.8 (content), 18px/1.7 (hero sub) | Sentence case, `--gray` |

- Fonts are self-hosted (`/assets/fonts/archivo-{regular,semibold,black}.woff2`, `font-display: swap`).
  Do not add Google Fonts links.
- `global-critical.css` loads first and `global.css` loads non-blocking. Above-the-fold rules belong in the critical file.
- Headlines are short two-beat lines: "Mountain-Grade Roofing. / Valley-Wide." The second beat is gold.

## 4. Spacing and layout

- Sections: `padding: 110px 5%` (FAQ and how-to bands `80px 5%`, `60px 5%` on mobile).
- Reading width: content 900px, hero text 780px, hero paragraph 560px, section sub 600px.
- Fixed white nav, 100px tall (84px from 901 to 1100px and on mobile), logo 85px (68px when the nav is 84px).
- Breakpoints in use: min-width ranges 1101 to 1350 and 901 to 1100, then max-width 900 (sticky contact bar appears), 700, 640, 600px.
- Touch targets: 44px minimum; sticky bar buttons 48px.
- Respect `prefers-reduced-motion` (the sticky bar already does).

## 5. Shape and depth

- **Sharp corners are the look.** Cards, chips, FAQ and how-to items are square (`border-radius: 0`,
  forced on inline styles inside `<main>`). Buttons 2px. Blog cards and table wrappers 4px.
  50% only for avatars and icon dots.
- Hover depth is a **hard offset shadow**: `4px 4px 0 var(--navy)` plus `translateY(-2px)`.
  Soft shadows are limited to the nav and the gold button glow (`0 8px 24px rgba(225,185,105,0.35)`).
- Gold rules carry structure: 3px gold top border on cards, 3px gold left border on content H2s and
  FAQ items, a 56px by 3px gold bar under centered H2s, 4px navy top and bottom on the gold CTA band.

## 6. Components (all in `global.css`, `global-critical.css` or `index.html`)

| Component | Look | Class |
|---|---|---|
| Primary button | Gold fill, navy text, 2px radius, uppercase Archivo Black 15px | `.btn-primary` |
| Secondary button | Transparent, white text, 2px white-45% border (on dark only) | `.btn-secondary` |
| Navy button | Navy fill, white or gold text | `.btn-navy` |
| Nav CTA | Navy fill, white text, 44px tall | `.nav-cta` |
| Mobile call icon in nav | Navy outline square with phone icon | `.nav-call-mobile` |
| Page hero | Navy, photo at 20% opacity under a navy overlay, breadcrumb in gold | `.page-hero` |
| Hero form card | Lead form on the home hero | `.hero-form-card` |
| Trust bar / quick answer strip | Short proof line under the hero | `.trust-bar`, `.quick-answer-strip` |
| Service card | Photo, body, caption | `.service-card-*` |
| How-to steps | Off-white band, white items with gold left rule, navy square number badge | `.howto-section` |
| FAQ | Navy-deep band, gold H3s, items with gold left rule | `.faq-section` |
| CTA band | Gold band, navy borders, navy buttons with gold text | `.page-cta` |
| Mid-page CTA | Inverted: navy band, gold buttons | `.page-cta.page-cta-inverted` |
| Nearby cities | Navy band, square chips with gold-30% border | `.nearby-section`, `.nearby-chip` |
| Sticky mobile contact bar | Navy bar, gold top border, two buttons: gold "Call Now" and outlined "Text Us"; hides on scroll | `.sticky-call`, `.sticky-call-phone`, `.sticky-call-text` |
| Blog card | White, 4px radius, gold top border, uppercase navy title | `.blog-card` |

New pages should reuse these classes. Don't invent a second button or card style.

## 7. Logo

| File | Use |
|---|---|
| `images/logo-rc-darkblue.webp` | Default: on white and light backgrounds (nav uses this) |
| `images/logo-rc-white.webp`, `logo.png` | On navy, dark or photo backgrounds (`logo.png` is the white-text lockup) |
| `images/logo-darkblue.webp`, `images/logo-white.webp` | Lockup without the ROOFING & CONSTRUCTION tagline |
| `favicon.svg`, `icon-192/512.png` | App icons |

- The mark is a navy diamond with gold and white edges and an "FR" monogram (F gold, R white).
- The lockup says FRAME RESTORATION; there is no "Utah" in the artwork. Add "Utah" in text, not in the logo.
- Use the files as they are. Don't recolor, stretch, redraw, crop the diamond, or have AI make a
  new version. Don't place the dark-blue logo on navy or the white logo on white.
- UNSURE: no clear-space or minimum-size rule exists in code. Until one is set, keep at least the
  height of the "F" around it and don't go under 48px tall.

## 8. Photos and video (real-proof rule)

Real-proof rule (hub RADAR, ADOPT 2026-11-13) and the photo authenticity doctrine
(hub `projects/frame-utah/DECISIONS.md`, 2026-04-17: real Landon photos only, never fabricate before/after pairs):
- **Real Frame Utah job photos and video for anything presented as real work**: project pages,
  city pages, before/after, galleries, Google Business Profile posts, "our work" sections.
- **AI images only for designed graphics** that are plainly not a job: storm or hail alert cards,
  icons, diagrams, seasonal promo backgrounds. Never an AI roof, crew, house, damage, customer or testimonial avatar.
- Utah media only. Never borrow Texas, Idaho or other-market photos.
- Don't label a photo with a city unless its source confirms that city.
- Resize and transcode only. No generative edits to roof condition, materials, people or completion state.
- Track images in `data/image-registry.json`; don't put an unregistered or flagged image on a live page.
- **Drone photography and video are fine. Drone inspection is never marketed as a service** (Landon, 2026-05-11).
- Every GBP post needs a photo, and GBP posts are owner-manual only. Agents never auto-publish to the Google profile.

## 9. Voice and copy

- Plain, confident, homeowner-first. Short sentences. Mountain and storm toughness without hype.
- Headlines: two short beats, uppercase, the second in gold. Lead with the outcome and the area.
- CTAs say the action: "Get My Free Roof Inspection", "Call", "Text Us a Roof Photo", "Schedule Online", "View Our Work".
- **Phone:** one public number only, the Twilio line in `CLAUDE.md`. Never put any other number on a
  public surface. Phone, address and hours come from this repo's NAP sources, never from memory.
- **Hours:** Mon to Sun 8 AM to 6 PM (`CLAUDE.md`; source of truth is `index.html` openingHoursSpecification).
- **Claims you may use:** Licensed & Insured in Utah, Free Roof Inspections, 24/7 Storm Response,
  Financing Available, 10-Year Workmanship Warranty, BBB Accredited.
- **Claims you may not use:** any BBB letter grade, NRCA membership, GAF Master Elite, Owens Corning
  Preferred, or anything else not on the list above. Run `scripts/audit-claim-registry.mjs`.
- Review counts come from `reviews.json`, not from copy.
- Markets: Heber Valley (Heber City, Midway, Wallsburg, Charleston, Daniel) is one market. "The valley"
  means the Salt Lake Valley premium ZIPs, not Heber Valley.
- Lead focus: low-traffic, high-revenue areas (hub DECISIONS 2026-05-11).
- Ryan never appears on customer-facing surfaces.

## 10. Agent checklist before you ship

1. Colors come from the tokens above; no gold text on light backgrounds.
2. Headings use Archivo Black uppercase; body uses Archivo; no new font files.
3. Existing component classes, square corners, hard-offset hover.
4. Every photo is a real Utah job tracked in the registry; AI only for designed graphics.
5. Copy uses "Frame Restoration Utah", only approved claims, the one public number and the hours above.
6. Nothing from Texas, RC Digital or another client.
7. Draft PR only. Ryan merges.
