# Kronicle replica — UI specification

Status: build-ready draft  
Scope: `apps/web` in `kronicle.kee`  
Related: `PRODUCT-TEARDOWN.md`, `API-CONTRACTS.md`, `DATA-MODEL.md`, `VIDEO-EDITOR-SPEC.md`, `PLAN.md`

This document specifies the visible product: tokens, shell, screens, components, states, responsive behaviour, accessibility and build order. It is a clean-room specification. Behaviour and information architecture are reproduced; source files, proprietary assets and long marketing copy are not. All names, series, quotes, metrics and stills used by the replica are original sample content.

---

## 0. How to use this spec

### 0.1 Source hierarchy

1. `PRODUCT-TEARDOWN.md` and `API-CONTRACTS.md` define what the product does.
2. This file defines how it looks, reads and behaves.
3. `VIDEO-EDITOR-SPEC.md` owns timeline mechanics; this file owns the editor's shell, chrome and visual states.
4. When this file and an implementation shortcut disagree, this file wins unless the shortcut is recorded in `PLAN.md`.

### 0.2 Observed vs decided

- **Observed**: routes, labels, role names, credit concepts, flow order, panel structure, dark palette, typography families and scale.
- **Decided**: exact component APIs, responsive collapse rules, empty/error copy, keyboard map, build order, and all marketing copy. These are product decisions for the replica, not claims about the original.

### 0.3 Clean-room copy rules

| Allowed to match | Must be rewritten |
|---|---|
| Functional labels: `Home`, `Shows`, `Credits`, `Billing`, `Team`, `Usage`, `Pick a look`, `Shoot-ready`, `Storyboard`, `Compile` | Headlines, taglines, body paragraphs, testimonials, press quotes, plan descriptions |
| Domain nouns: episode, scene, shot, take, track, clip, asset, workspace | Series titles, studio names, people, metrics, awards, funding claims |
| Short action verbs: `Analyse`, `Generate`, `Continue`, `Save`, `Retry` | Error paragraphs and empty-state paragraphs copied verbatim |

All sample marketing content is fictional. Never present a replica metric, quote or series as real. The footer carries `Demo replica — sample content`.

### 0.4 Asset policy

- No original logo, icon font, still, video, voice or font file is copied.
- Brand mark is an original monogram: a `K` cut from three clapperboard slats, one slat filled with the brand gradient.
- Showreel loops are generated or licensed placeholders with original names.
- UI icons use Lucide at 1.2 px stroke; custom icons only where Lucide has no equivalent.
- Fonts: Geist Sans / Geist Mono and Courier Prime are open-source; Noto fallbacks cover Devanagari, Chinese and Korean.

### 0.5 Evidence basis

| Area | Basis |
|---|---|
| Routes, labels, shell structure | Captured app chunks in `engagements/auto/web-20261124-073125/raw/js-app/` |
| Token values, type scale, radii, gradients | Captured public CSS chunks requested by the landing page |
| Marketing information architecture | `/tmp/kronicle_home.html` snapshot of the public home page |
| Auth layout | Public `/login` HTML, read-only |
| Roles, credits, billing, invite semantics | `reports/KRONICLE-BILLING-SECURITY-REVIEW.md` and `evidence/raw/` |
| Video-editor mechanics | `docs/VIDEO-EDITOR-SPEC.md` (separate owner) |

Only structure, measurements and short functional labels were taken from these sources. No source file, image, video, font binary or long copy is reproduced.

---

## 1. Product frame

### 1.1 Route map

| Route | Screen | Access |
|---|---|---|
| `/` | Marketing home | Public |
| `/pricing` | Pricing | Public |
| `/login` | Email sign-in | Public |
| `/login?step=code` | 4-digit email code | Public, email in flight |
| `/login/onboarding` | Personal or organisation setup | Signed in, not onboarded |
| `/home` | Home / start a show | Any member |
| `/home/shows` | Shows | Any member |
| `/home/settings/general` | Account and workspace | Any member |
| `/home/settings/team` | Members and invites | Organisation members; management requires `members.manage` |
| `/home/settings/billing` | Credit packs and payment | Any member; pay requires `billing.pay` |
| `/home/settings/usage` | Credit ledger | Any member |
| `/home/script-split` | Check episodes (setup) | `project.edit` |
| `/script-management` | Episode script management (studio) | `workspace.view.script`; `/script` is an alias |
| `/home/pick-look` | Pick a look | `project.edit` |
| `/home/pick-director` | Pick a directing style | `project.edit` |
| `/home/pick-models` | Pick models | `project.edit` |
| `/scriptEnhancement` | Shoot-ready scripts | `workspace.view.scriptEnhancement` |
| `/cornerScape` | Cast & places | `workspace.view.cornerScape` |
| `/production` | Production workbench | `workspace.view.production` |
| `/assets` | Asset library | `workspace.view.assets` |
| `/editor` | Video editor | Production access |
| `/invite/:token` | Accept invite | Public, token-bound |
| `/legal/*`, `/support` | Legal and help | Public |

`/home/settings/credits` is an alias that redirects to `/home/settings/billing`. `/script` is a legacy alias for `/script-management`.

Observed but out of scope for this replica: `/novel/*` (novel list, writer, continuity), `/platform/*` (operator console), `/pitch`, `/contact`, `/request-access`, `/series`, `/slate`, `/waitlist`, `/access-denied` and `/maintenance`. Do not render hidden nav items for them; keep the status routes only if the matching error state is built.

### 1.2 Roles

| Capability | Viewer | Editor | Admin |
|---|---|---|---|
| Read shows, scripts, assets, plans | Yes | Yes | Yes |
| Generate text/image/video | No | Yes | Yes |
| Edit scripts, cast, plans, storyboard | No | Yes | Yes |
| Compile and export | No | Yes | Yes |
| Rename workspace | No | No | Yes |
| Invite, remove, change roles | No | No | Yes |
| Buy credits, manage billing | No | No | Yes |
| Leave workspace | Yes | Yes | Yes, except sole owner |

A viewer sees the app read-only: primary generation actions are disabled with a tooltip, a `View only` badge sits beside the project name, and destructive controls are absent rather than disabled.

### 1.3 Navigation model

Two navigation modes share one shell.

- **Setup mode** — a show is missing a look, a directing style or models. Primary navigation becomes the four setup steps: Episodes, Looks, Styles, Models. Finished steps are links; the current step is highlighted.
- **Studio mode** — setup complete. The project section becomes:
  - **Workflow**: Script (`/script-management`), Enhance (`/scriptEnhancement`), Cast (`/cornerScape`), Video (`/production`), Editor (`/editor`)
  - **Library**: Assets (`/assets`)

A show with extraction or enhancement running shows a status dot on the relevant nav item. Nav items with permission gaps are hidden, not disabled.

### 1.4 Setup flow

```
Home composer
  → Check your episodes    /home/script-split
  → Pick a look            /home/pick-look
  → Pick a directing style /home/pick-director
  → Pick models            /home/pick-models
  → Shoot-ready            /scriptEnhancement
  → Cast & places          /cornerScape
  → Production             /production
  → Editor                 /editor
```

Look and directing style lock after setup. Models remain changeable per show. Every setup screen uses the same header, stepper, leave-confirmation and continue pattern.

### 1.5 Generation guardrails

The replica implements the fixed billing behaviour, and the UI must make it visible rather than hide it.

- Quote before dispatch: every text, image, video, enhancement or extraction action shows its credit estimate and the account balance before the primary button is enabled.
- Reserve the batch: the confirmation states the full item count and full reservation. The client never supplies a concurrency value as billing truth.
- Batch cap: 50 items per action in the UI; `Select all` stops at the cap and explains why. The server enforces the same cap.
- No work at or below zero available credits: the CTA becomes `Add credits`, with the shortfall inline. A negative balance cannot start new work.
- Pending holds appear in the credit pill and Usage page until settlement; settled amounts replace the estimate with a visible diff when they differ.
- Batch progress is per item, not a modal that blocks the whole app.

---

## 2. Design tokens

Tokens are CSS custom properties on `:root` and `.dark`. The replica ships dark as the default brand experience; light and auto are supported in Settings. Marketing, auth, showreel and editor surfaces always use the dark palette.

### 2.1 Colour — dark (primary)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0A0A0B` | Page background, letterbox |
| `--fg` | `#F4F4F2` | Primary text |
| `--surface-1` | `#131314` | Cards, panels, popovers |
| `--surface-2` | `#1B1B1D` | Inputs, secondary cards, hover rows |
| `--surface-3` | `#252528` | Selected rows, chips, pressed states |
| `--border` | `rgba(255,255,255,0.12)` | Default hairline |
| `--border-strong` | `rgba(255,255,255,0.14)` | Inputs, outlined buttons, selection |
| `--muted` | `#A3A3A8` | Secondary text |
| `--subtle` | `#76767C` | Tertiary text, metadata only |
| `--brand` | `#E0457B` | Brand actions, active indicators |
| `--brand-text` | `#F27AA3` | Brand-coloured text on dark |
| `--brand-wash` | `rgba(224,69,123,0.14)` | Selected nav wash |
| `--brand-from` | `#7C3AED` | Gradient start |
| `--brand-via` | `#E0457B` | Gradient middle |
| `--brand-to` | `#FF8A3D` | Gradient end |
| `--brand-fg` | `#FFFFFF` | Text on brand |
| `--success` | `#3DD68C` | Done, locked, paid |
| `--warning` | `#FF7849` | Partial, outdated, attention |
| `--info` | `#7AB4FF` | Informational, video track |
| `--danger` | `#FF5C6C` | Errors, destructive |
| `--skeleton` | `rgba(255,255,255,0.09)` | Loading blocks |
| `--scrim` | `rgba(0,0,0,0.62)` | Modal backdrop |
| `--glass` | `rgba(28,28,30,0.55)` | Floating nav, badges |
| `--glass-border` | `rgba(255,255,255,0.10)` | Glass outline |
| `--glass-selected` | `rgba(255,255,255,0.12)` | Open menu trigger |
| `--screen` | `#0A0A0B` | Video/showreel surface |
| `--screen-fg` | `#F4F4F2` | Text over video |
| `--track-video` | `var(--info)` | Video clips |
| `--track-audio` | `var(--success)` | Audio clips |
| `--track-text` | `var(--brand-from)` | Text clips |
| `--track-image` | `mix(info, success)` | Image clips |
| `--track-effect` | `var(--fg)` at 8% | Effect clips |

### 2.2 Colour — light (supported)

| Token | Value |
|---|---|
| `--bg` | `#F5F5F3` |
| `--fg` | `#111112` |
| `--surface-1` | `#FFFFFF` |
| `--surface-2` | `#EEEEEC` |
| `--surface-3` | `#E4E4E1` |
| `--border` | `rgba(10,10,11,0.08)` |
| `--border-strong` | `rgba(10,10,11,0.14)` |
| `--muted` | `#5C5C62` |
| `--subtle` | `#87878D` |
| `--brand` | `#C2366A` |
| `--brand-text` | `#B42359` |
| `--brand-wash` | `rgba(194,54,106,0.10)` |
| `--success` | `#14804A` |
| `--warning` | `#C4410F` |
| `--info` | `#2563EB` |
| `--danger` | `#CC2E3E` |
| `--skeleton` | `rgba(10,10,11,0.11)` |
| `--glass` | `rgba(255,255,255,0.62)` |

Gradient stops remain the same in both modes. White text on the gradient must be measured: apply an 18% black inner scrim to primary buttons so every label reaches 4.5:1 against the orange end.

### 2.3 Gradients

```css
--gradient-brand: linear-gradient(90deg, #7C3AED 0%, #E0457B 52%, #FF8A3D 100%);
--gradient-brand-vertical: linear-gradient(180deg, #7C3AED, #E0457B 55%, #FF8A3D);
--gradient-hero: linear-gradient(164deg,
  color-mix(in oklab, #7C3AED 22%, #0A0A0B) 0%,
  color-mix(in oklab, #E0457B 38%, #0A0A0B) 27%,
  color-mix(in oklab, #7C3AED 12%, #0A0A0B) 54%,
  #0A0A0B 77%);
--gradient-poster: linear-gradient(133deg, var(--poster-a) 7%, var(--poster-b) 79%);
```

Gradient use is deliberate: primary buttons, active nav rail, credit rule, brand mark, selection borders, progress shimmer. Never use the gradient for large body-text backgrounds or as the only status signal.

### 2.4 Typography

| Role | Family | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|---|
| Hero (app) | Sans | 44 / 1.02 | 400 | -0.04em | Marketing display, empty-page statements |
| Title | Sans | 32 / 1.1 | 600 | -0.02em | Page titles |
| Heading XL | Sans | 28 / 1.15 | 600 | -0.03em | Section openers |
| Heading LG | Sans | 22 / 1.2 | 600 | -0.01em | Panel titles |
| Heading MD | Sans | 17 / 1.25 | 600 | -0.01em | Card titles, screen titles |
| Heading SM | Sans | 14 / 1.3 | 600 | 0 | Dense panel headers |
| Body LG | Sans | 15 / 1.5 | 400 | 0 | Primary paragraphs, auth inputs |
| Body MD | Sans | 13 / 1.5 | 400 | 0 | Default UI copy |
| Body SM | Sans | 12 / 1.45 | 400 | 0 | Helper text, table cells |
| Label | Sans | 13 / 1.2 | 500 | 0 | Buttons, fields, nav |
| Label SM | Sans | 12 / 1.2 | 500 | 0 | Dense controls, badges |
| Caption | Sans | 11 / 1.3 | 400 | 0 | Metadata, timestamps |
| Overline | Sans | 10 / 1.2 | 500 | 0.04em, uppercase | Group labels, status overlines |
| Data | Mono | 11 / 1.2 | 500 | 0 | Credits, IDs, timecode, counts |
| Screenplay | Courier Prime | 13 / 1.6 | 400 | 0 | Script readers |
| Indic | Sans + Noto | 14 / 1.6 | 400 | 0 | Hindi and mixed-script content |

Marketing display scale: 30 / 48 / 60 / 76 px across mobile → desktop, line-height 1.0–1.15, tracking -0.045em. Marketing headings may use 900 weight for number motifs only.

Numbers: `font-variant-numeric: tabular-nums` everywhere credits, durations, counts, timecode.

### 2.5 Spacing and layout

Base unit `4px`. Allowed steps: 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 120.

| Context | Value |
|---|---|
| Page gutter | 16 mobile, 24 tablet, 32 desktop |
| Marketing gutter | 20 mobile, 32 tablet, 0 inside 1200 max |
| Card padding | 16 compact, 20 default, 24 roomy |
| Panel gap | 12 / 16 / 20 |
| Sidebar padding | 8 horizontal, 14 vertical |
| Auth form width | 440 max |
| Settings/billing width | 880 max |
| Studio content width | 1120 max |
| Marketing width | 1200 max |
| Video editor library | 280 |
| Video editor inspector | 300 |
| Timeline default height | 280, range 200–480 |

### 2.6 Radius, border, elevation

| Token | Value | Use |
|---|---|---|
| `--r-xs` | 2px | Meter |
| `--r-sm` | 6px | Tiny chips |
| `--r-md` | 8px | Inputs, small buttons, nav items |
| `--r-lg` | 10px | Default buttons, cards, inputs |
| `--r-xl` | 12px | Cards, segmented controls |
| `--r-2xl` | 16px | Page panels, dialogs |
| `--r-3xl` | 22px | Auth cards, hero cards, alert dialogs |
| `--r-pill` | 999px | Pills, avatars, credit badge |

Borders are 1px. Selected cards use 1.5px. Focus rings are 3px at 50% brand; editor focus outlines are 2px at 45% brand with 1px offset.

Elevation:

```css
--shadow-float: 0 8px 24px rgba(0,0,0,0.40);
--shadow-menu: 0 10px 28px rgba(0,0,0,0.45);
--shadow-popup: 0 24px 64px rgba(0,0,0,0.50);
--shadow-glow: 0 12px 48px rgba(124,58,237,0.22);
```

Glass surfaces use `backdrop-filter: blur(14px)` and a 1px glass border. Never stack more than two translucent layers.

### 2.7 Motion

| Token | Value |
|---|---|
| Fast | 150ms |
| Base | 200ms |
| Slow | 300ms |
| Cinematic | 500ms |
| Enter ease | `cubic-bezier(0.23, 1, 0.32, 1)` |
| Exit ease | `cubic-bezier(0.4, 0, 1, 1)` |

Named animations: `rise` (8px up + fade), `meter` (scaleX 0→1 once), `shimmer`, `text-shimmer`, `loader-sheen`, `loader-breathe`, `loader-aurora`, `working-dot`, `video-reel-x`, `video-reel-y`, `video-orbit`.

Rules:
- All non-essential motion is gated by `motion-safe:`.
- `prefers-reduced-motion: reduce` sets durations to 0ms; loading still communicates through text and static progress.
- Hover transforms are limited to 1–3%; never move a primary action on hover.
- Page transitions are 200ms fades; no route-level sliding.
- No parallax, no autoplay sound, no looping decorative video behind text without a scrim.

### 2.8 Icons and imagery

- Lucide, 1.2px stroke. Nav 18px; buttons 15px; empty states 20–24px; hero motifs 24–32px.
- Brand mark 22px in shell, 28–40px in auth/empty states.
- Show posters are 2:3. Episode thumbnails 16:9. Asset cards 1:1 or 4:5. Auth showreel 1:1 crop.
- Every image has `alt`; decorative art uses `alt=""`.
- Poster fallback: two-colour gradient derived from a stable hash of the show name plus 1–2 initials. The same show always gets the same colours.
- Video always ships a poster. Autoplay is muted, inline and looped. If reduced motion or Save-Data, show the poster.

### 2.9 Data formatting

| Data | Format |
|---|---|
| Credits (sidebar) | Compact, 3 significant digits: `1.41K`, `314` |
| Credits (detail) | Up to 2 decimals, floored: `314.83`; tooltip exposes full precision |
| Credits (billing) | Integer when whole, otherwise 1 decimal |
| Currency | `₹` with `en-IN` grouping |
| Dates under 7 days | Relative: `2 h ago`, `yesterday` |
| Dates over 7 days | `24 Nov 2026` |
| Episode label | `EP 01`, zero-padded |
| Duration | `01:42`; long form `~2 min` |
| Word count | Grouped integer followed by `words` |
| File size | `2.4 MB` |
| Counts | No abbreviation under 10,000 |

---

## 3. App shell

### 3.1 Desktop shell

```
┌───────────────┬──────────────────────────────────────────────┐
│ Sidebar       │ Project bar (56px)                           │
│ 248 / 72      ├──────────────────────────────────────────────┤
│               │                                              │
│ brand         │ Main panel                                   │
│ workspace     │ rounded 16, bg muted/40, scrolls             │
│ nav           │                                              │
│ recent shows  │                                              │
│ project nav   │                                              │
│ credits       │                                              │
│ utilities     │                                              │
└───────────────┴──────────────────────────────────────────────┘
```

- Sidebar is `md+`, fixed height `100dvh`, `border-right`, background `--bg`.
- Width: 248px expanded, 72px collapsed. Persist choice in `localStorage` under `kronicle:sidebarExpanded`; default expanded.
- Padding 8px horizontal, 14px vertical; nav gap 2px.
- Main area padding 16px; the main surface is a 16px-radius panel on `--surface-2` at 40% opacity. Home, settings and setup screens opt out of the panel and use full width with their own page header.
- The shell scrolls the main panel, never the page. Sidebar and project bar stay fixed.
- `prefers-reduced-motion` disables the width transition.

### 3.2 Sidebar anatomy

Top to bottom:

1. **Brand row** — wordmark 22px high when expanded; monogram 22px when collapsed. A 28px collapse button sits on the right (expanded) or below (collapsed), `aria-expanded`, label `Collapse sidebar` / `Expand sidebar`.
2. **Workspace switcher** — 42px trigger. Expanded shows gradient avatar, workspace name, `Personal · Owner` or `Organisation · Editor`, chevrons. Collapsed shows only the avatar.
3. **Primary nav** — Home and Shows (Shows appears only when the workspace has at least one show). 40px rows expanded, 40px square collapsed. Active state: `--surface-3` background, medium text, 3px gradient rail on the left, extends 2px outside the sidebar padding.
4. **Recent shows** — expanded only. Overline `Recent`. Up to 6 items: 32×46 poster, name, current step or updated time. Scrolls independently with a 120px minimum height.
5. **Project section** — separated by a rule. Project switcher: 2:3 poster, show name, `videoRatio` in mono uppercase (`9:16`), chevron; a `View only` badge for viewers. Below it, the adaptive nav groups described in §1.3, each item with its stage dot.
6. **Spacer** — pushes utilities to the bottom.
7. **Credit pill** — see §3.5.
8. **Utilities** — Notifications (unread count), Settings popover, Log out.

Collapsed sidebar: nav items are icon-only, labels move to tooltips, status dots sit at the icon's top-right with a 2px background ring. Recent shows and project names are hidden. Credit pill becomes a 40px square.

### 3.3 Mobile shell

Below `md` (768px):

- 48px top bar: menu button (40px), brand monogram, spacer, compact credit button.
- Menu opens a left sheet, 272px wide, with the same sidebar content in expanded form.
- The sheet has a visually hidden title and description; focus moves into it and returns to the menu button on close.
- Main content is full width, no rounded panel. Page gutters 16px.
- The project bar remains 48px and shows project name + viewer badge.
- Safe areas: add `padding-bottom: env(safe-area-inset-bottom)` to fixed footers.

### 3.4 Top bar and project bar

There is no separate global desktop top bar; the project bar is the desktop top bar. Mobile has a compact app top bar above it.

- Height 56px desktop, 48px mobile. Sticky at the top of the main panel.
- Left: project poster 28×40 (optional), project name (truncated), role/viewer badge.
- Right: contextual action slot (e.g. `Open editor`), then overflow menu.
- On setup routes, the project bar is replaced by the setup header (breadcrumb + stepper).
- On the editor, the app shell is replaced entirely by the editor chrome.

### 3.5 Credit pill

Expanded (default):

```
┌────────────────────────────────────┐
│ Credits                    Top up  │
│ ◉ 314.83                           │
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ (3px gradient)   │
└────────────────────────────────────┘
```

- Container: `--surface-1`, 1px border, 12px radius, 12px padding, 8px margin bottom.
- `Top up` is a link to billing only when the user has `billing.pay`; otherwise it is plain text.
- Balance uses Data type, tabular numerals. Full-precision value is in `title` and accessible description.
- The 3px gradient rule is decorative, not a proportion. It animates once on mount (`meter`), then stays static.
- Negative balance: amount uses `--danger`, a warning icon appears, and `Top up` becomes a filled small button.
- Collapsed: 40px square with coin icon, compact number and the gradient rule. Tooltip shows exact credits.
- Below 10% of the last top-up (or negative), add a `Low` badge and announce once per session.
- Loading: 40px skeleton, no layout shift.

### 3.6 Workspace switcher

Trigger and popover:

```
[avatar] Studio Name            ⌄
         Organisation · Admin
```

Popover 256px:
- Overline `Workspaces`.
- One row per workspace: 28px gradient avatar (first letter), name, `type · role`, check icon on the active one.
- Disabled workspace: 50% opacity, no hover, reason in helper text, not selectable.
- Divider.
- `Join with link` opens a 440px dialog with a single link/token field, inline validation, and an `Open invite` action.
- Staff-only `Platform console` row.
- Switching invalidates project queries, closes the popover, and routes to `/home` with a loading state. Preserve the current route only if the project exists in the target workspace; otherwise fall back to `/home`.

Keyboard: popover uses menu semantics; arrow keys move, Enter selects, Esc closes. The join dialog autofocuses the field.

### 3.7 Settings popover

- Trigger: the Settings utility row at the bottom of the sidebar. Opens a 340px popover to the right, align end, 10px offset.
- **Appearance**: three mini window cards (`Light`, `Dark`, `Auto`), selected with a gradient border; applies immediately and persists.
- **Workspace** → `/home/settings/general`.
- **Help** → `/support`.
- **Install app** row with `Install`, `Installed`, or `Unavailable` state; hidden when the browser cannot install.
- **Profile card**: name, email, workspace name · role, credit balance, workspace ID with copy.
- Staff-only `Platform console` is hidden in this replica.
- Destructive `Log out` stays in the sidebar utility list, not inside this popover.
- Focus returns to the trigger on close; `Esc` closes.

### 3.8 Notifications

- Trigger is a bell utility row with an unread count.
- Opens a 360px right sheet, max height `min(560px, 100dvh - 6rem)`.
- Header: `Notifications`, `Mark all read`.
- Segmented tabs: `Unread`, `All`; unread count in a brand pill.
- Rows: icon or avatar, title, one-line body, relative time, unread dot. Clicking marks read and navigates.
- Empty: icon tile, short title, one sentence.
- Footer: `Clear all` when any exist.
- Live updates prepend without stealing focus. Announce count changes politely, not every item.

### 3.9 Page header pattern

Standard page header used by Home, Shows, Settings and Assets:

```
Title (32)                              [primary action]
Subtitle (15, muted)
```

- `flex-wrap`, bottom-aligned, 16px gap.
- Animates once with `rise` unless reduced motion.
- Title max 2 lines on mobile.
- Primary action right-aligned on desktop, full-width below title on mobile if it is the page's main action.

Setup header (Episodes/Look/Style/Models):

```
Home / Project name                       [1 2 3 4 stepper]   [Continue]
Title (32)
Subtitle (15)
```

- Stepper sits on the right at `lg+`; below the title on mobile as a horizontal scroll.
- `Continue` is disabled until the step is valid; disabled reason is a persistent helper line, not a toast.

### 3.10 Shell tree

```
AppShell
├── SkipLink
├── Sidebar (desktop)
│   ├── BrandRow
│   ├── WorkspaceSwitcher
│   ├── PrimaryNav
│   ├── RecentShows
│   ├── ProjectSwitcher
│   ├── ProjectNav
│   ├── CreditPill
│   └── UtilityNav
│       ├── NotificationsSheet
│       ├── SettingsPopover
│       └── LogOutButton
├── MobileTopBar
│   └── SidebarSheet
├── Main
│   ├── ProjectBar
│   └── RouteContent
├── GuidePanel (optional)
└── ToastViewport
```

### 3.11 Guides

- Each primary route has an optional docked guide: a 320px panel titled `What can I do here?` with 3–6 stops, `Back`, `Next`, `Done`, and `x of y` progress.
- Stops point at existing anchors (`data-guide="home-composer"`, `"split-summary"`, `"enhance-choice"`, `"cast-list"`, `"prod-steps"`, `"library"`, `"timeline"`, `"inspector"`, `"compile"`). Highlight with a 2px brand ring and a dimmed backdrop; never block the control being described.
- Closing the guide persists `closed`; `Settings → General → Replay product guide` restores it.
- On mobile, the guide becomes a bottom sheet with the same steps; it does not auto-start.
- Guides are instructional only. They never perform an action, change data or require permissions.

---

## 4. Screens

Each screen section gives its job, layout, states, interactions and component tree. Copy examples are original.

### 4.1 Marketing home — `/`

**Job.** Explain the product in one screen, prove the workflow, and route to sign-in or pricing. Dark, cinematic, no app chrome.

**Layout.**

1. **Hero (900px desktop, auto mobile).** Full-bleed muted loop behind a 164° brand gradient and a radial vignette. Max-width 1200. Floating glass nav 24px from the top: monogram, `Studio`, `Series`, `Fund`, `Pricing`, divider, `Sign in`, `Start creating`. Mobile: monogram, `Start creating`, menu.
2. **Headline.** Two-line display: a fixed lead and a rotating noun phrase with a 3px gradient caret. Example: `Start with one line. / Finish with a season.` Rotating phrases: `a lighthouse that writes back`, `a wedding that never happened`, `a city that remembers`.
3. **Composer card.** Glass panel, 560px max, with:
   - mode chips `Series`, `Episode`, `Single shot`;
   - one-line textarea `Describe the story you want to make`;
   - start-from chips `A script`, `A novel chapter`;
   - primary `Start creating`, secondary `See pricing`;
   - helper: `No card to browse. Credits are quoted before anything runs.`
4. **Workflow proof (01–04).** Four alternating rows with numbered overline, title, one paragraph and a mocked product visual: chat, shot grid, episode cut, season board. Visuals are generated placeholders, not screenshots of the original.
5. **First-look fund.** Full-width panel with an original name (`The First-Look Fund`), a short promise, `Submit a pitch`, a three-stage pipeline `Pitch → Pilot → Greenlit`, and a countdown chip. Countdown is cosmetic sample data.
6. **Now streaming.** Horizontal poster rail, 2:3 cards with title, genre, language, episode count and a `Watch` action. Original sample series only. Edge fades and drag/scroll.
7. **Inside the studio.** One large 16:9 video card plus a 3-item playlist; duration badge; play overlay; captions.
8. **Quote carousel.** Large pull quote, name, role, studio, episode count. Original sample quote. Auto-advance only when not reduced motion; pause on hover/focus; arrows and dots.
9. **Referral tiers.** Four steps: 1, 3, 5, 10 studios. Each has a benefit; current progress bar example. `Copy referral link` action is disabled in the replica with `Demo` tooltip.
10. **Press rail.** Monochrome wordmarks in an infinite marquee. All fictional; `Sample press` overline.
11. **Final CTA.** Display line, `Request access`, `See pricing`, and a small `Demo replica` note.
12. **Footer.** Four link columns, parent-company line (fictional), language selector, social links, copyright.

**States.**
- Hero video fails: gradient + poster remain; no layout shift.
- Reduced motion / Save-Data: static poster; rotating headline stops on one phrase.
- No JS: server-rendered hero, nav and footer links work.
- Mobile menu: full-screen sheet with the four section links and two CTAs.

**Interactions.**
- Rotating phrase changes every 3.2s with a blur/rise transition; pauses when the tab is hidden.
- Carousels support drag, wheel, arrow keys when focused, and pagination dots.
- Nav links scroll to sections with 40px scroll margin.
- Sticky nav becomes solid `--bg` after 24px scroll.
- CTAs: `Start creating` goes to `/home` or `/login`; `See pricing` goes to `/pricing`; `Request access` and `Submit a pitch` open a demo dialog that says intake is not enabled in the replica (no upload, no persistence); `Watch` opens a sample player.

**Tree.**

```
MarketingHome
├── Hero
│   ├── BackgroundVideo / Poster
│   ├── HeroGradient
│   ├── FloatingNav
│   │   ├── BrandWordmark
│   │   ├── SectionLinks
│   │   └── AuthActions
│   ├── RotatingHeadline
│   └── PromptComposer
│       ├── ModeChips
│       ├── PromptInput
│       ├── StartFromChips
│       └── CTAGroup
├── WorkflowSection
│   └── WorkflowRow ×4 (number, copy, ProductMock)
├── FirstLookFund
├── StreamingRail
│   └── PosterCard ×N
├── InsideTheStudio
│   ├── FeatureVideoCard
│   └── StoryPlaylist
├── QuoteCarousel
├── ReferralTiers
├── PressMarquee
├── FinalCTA
└── SiteFooter
```

### 4.2 Pricing — `/pricing`

**Job.** Make credit packs legible, answer cost questions, and send the user to sign-in or billing.

**Layout.**
- Same dark marketing shell and footer; nav `Pricing` is active.
- Hero: `Pay for the work you actually run` (original), one paragraph, `Start creating`.
- Three pack cards: 100, 220, 550 credits; price, per-credit note, bonus badge (`+10%`, `+18%`), example output (`~15 image sets`, `~2 short episodes`). Middle card is recommended.
- A custom amount card: `Need more?` → support.
- A `What a credit buys` table: text pass, image, video second, enhancement, extraction. Values come from shared pricing constants; never hard-code in the UI.
- Cost calculator: quantity slider + output type; shows quote (`This batch: 31.35 credits`) using the quote endpoint, never local arithmetic.
- FAQ accordion: expiry, shared wallets, negative balance, refunds, taxes.
- Final CTA.

**States.**
- Plans fail: inline error panel with `Retry`.
- Location/currency mismatch: informational banner + refreshed prices.
- Signed out: CTAs go to `/login?next=/pricing`.
- Signed in without `billing.pay`: packs are visible, `Buy` becomes `Ask an admin`.

**Tree.**

```
PricingPage
├── MarketingNav
├── PricingHero
├── PackGrid
│   ├── CreditPackCard ×3
│   └── CustomPackCard
├── CreditExplainerTable
├── CostCalculator
│   ├── OutputTypeSelect
│   ├── QuantitySlider
│   └── QuoteSummary
├── FAQAccordion
├── FinalCTA
└── SiteFooter
```

### 4.3 Login — `/login`

**Job.** Get an email address with minimum friction and explain the code step before it happens.

**Layout.**
- 50/50 split at `lg+`. Left: full-height showreel, 16:9 crop, muted loop, gradient scrim at the bottom 47%, `AI-generated` glass badge top-left, title and one-line caption bottom-left. Right: centered 440px column.
- Right column: monogram 36px, `Welcome back` (32px), subtitle `Sign in with your work email. We'll send a one-time code.`
- `Continue with Google` — 48px outline button. In the replica it is visibly disabled with `Demo: email sign-in only` helper; do not fake a Google flow.
- Divider `or use your work email`.
- Email field, 48px, `you@studio.com`, `inputmode=email`, autocomplete, max 254.
- `Continue with email` — 48px gradient primary, full width.
- Helper: `One code, no password. Codes expire in five minutes.`
- Terms line with links.
- Bottom nav: language popover (`English`, 7 options) and `Help`.
- Left showreel advances through 5 loops every 12s; title/caption change with it.

**States.**
- Invalid email: inline error, field `aria-invalid`, focus retained.
- Sending: button spinner + `Sending…`, field disabled.
- Rate limited: inline alert with countdown; no toast only.
- Google clicked (if enabled in a later build): standard OAuth redirect; not part of the replica MVP.
- Back from OTP: email prefilled, focus on field.

**Tree.**

```
LoginPage
├── AuthShowreel
│   ├── ShowreelVideo
│   ├── AiBadge
│   └── ShowreelCaption
├── AuthPanel
│   ├── BrandMark
│   ├── Heading
│   ├── GoogleButton (disabled demo)
│   ├── Divider
│   ├── EmailForm
│   │   ├── EmailField
│   │   ├── InlineError
│   │   └── SubmitButton
│   ├── TermsNote
│   └── SupportNav
│       ├── LanguagePopover
│       └── HelpLink
```

### 4.4 Email code — `/login?step=code`

**Job.** Verify a 4-digit, email-bound code without ambiguity about which email is being checked.

**Layout.**
- Same split shell and showreel.
- `Back` text button above the heading (`Use another email`).
- Heading `Check your inbox` (32px); body `We sent a 4-digit code to **name@studio.com**. It expires in 5:00.`
- Four 56×64 code boxes, 12px gap, centered, `inputmode=numeric`, `autocomplete=one-time-code`, `aria-label="Digit 1 of 4"`.
- `Verify` gradient button, full width, enabled at 4 digits.
- Resend row: `Didn't get it?` + `Resend code in 0:24`; after zero, `Resend code` becomes a text button.
- `Change email` link.
- Helper: `Codes are single-use and tied to this email.`

**States.**
- Auto-advance on entry; paste fills all four; Backspace moves back; arrows navigate.
- Wrong code: boxes shake once (motion-safe), red border, message `That code didn't match. 4 tries left.` Focus first box, select content.
- Expired: banner `This code expired. Send a new one.` Resend is primary.
- Too many attempts: lock the form for 60s with countdown; do not reveal whether the email exists.
- Verifying: button spinner, boxes read-only.
- Success: route to `/login/onboarding` if not onboarded, else `next` or `/home`; toast `Signed in`.
- Dev/mock: a small `Dev code: 1234` chip appears only when `NODE_ENV !== production`; never in a production build.

**Tree.**

```
OtpPage
├── AuthShowreel
├── AuthPanel
│   ├── BackButton
│   ├── Heading
│   ├── EmailSummary
│   ├── OtpInput
│   │   └── OtpBox ×4
│   ├── InlineError / ExpiryBanner
│   ├── VerifyButton
│   ├── ResendRow
│   └── ChangeEmailLink
```

### 4.5 Onboarding — `/login/onboarding`

**Job.** Choose personal or organisation, name the workspace, and explain the credit grant honestly.

**Layout.**
- Centered 560px card, no sidebar, dark background with a subtle radial brand glow.
- Stepper text `Step 2 of 2` (email verified → workspace).
- Heading `How will you work?`
- Two large choice cards, 1.5px border, 20px padding:
  - **Personal** — `For solo projects and quick tests.` — `Starts with 100 credits.`
  - **Organisation** — `For a team with a shared wallet and roles.` — `Starts with 1,000 credits.`
- Selected card gets a gradient border and check.
- Organisation reveals a `Workspace name` field (2–80 chars) and optional `Invite teammates` emails (up to 5, one per line). Invites are sent after creation.
- `Create workspace` primary. `Back` returns to login.
- Fine print: `Credits are demo credits. No payment is taken in this replica.`

**States.**
- Personal selected: no name field; workspace name defaults to `{first name}'s workspace`.
- Organisation with empty name: inline error on submit.
- Creating: button spinner, choices disabled.
- Error: inline alert with retry; preserve inputs.
- Already onboarded: redirect to `/home`.
- Deep link with `next`: after onboarding, route there instead of home.

**Tree.**

```
OnboardingPage
├── BrandMark
├── StepLabel
├── Heading
├── WorkspaceTypeCards
│   ├── TypeCard(Personal)
│   └── TypeCard(Organisation)
├── OrgFields (conditional)
│   ├── WorkspaceNameField
│   └── InviteEmailsField
├── SubmitButton
├── FinePrint
└── BackLink
```

### 4.6 Home — `/home`

**Job.** Turn a script into a show in one action, and let returning users resume.

**Layout.**
- Max width 880, centered, top padding 32/48.
- Header: `Start a show` (32), subtitle `Paste a script or drop a file. We'll find the episodes and set up the show.`
- Composer panel, `--surface-1`, 16px radius, 1px border, 24px padding:
  - Large textarea, min 160px, placeholder example in our own words.
  - Drop state: dashed brand border, `Drop to read` overlay.
  - File chips under the textarea: name, size, remove; reading state with spinner; error state red.
  - Footer row: `Add files` outline button, `Try a sample` text link, spacer, `Analyse` gradient button with coin + credit cost. After a successful analysis the primary becomes `Create show`; editing the text exposes `Re-analyse`.
  - Secondary row: show name (suggested by analysis, editable, 1–80 chars), episode length segmented control (`1 / 2 / 3 / 5 min`), aspect ratio select (`9:16`, `16:9`, `1:1`, `4:5`, `3:4`), language select. Defaults come from the last used show; the name stays empty until analysis suggests one.
- Analysis state: composer collapses to a summary card; a `StageLoader` shows four stages (`Reading`, `Finding breaks`, `Naming episodes`, `Checking lengths`) with rotating messages and a thin progress rail. `Cancel` is available until naming starts.
- After analysis: the name, ratio, language and duration chips fill from the suggestions; the primary becomes `Create show`. Create routes to `/home/script-split` with the parsed result in query cache and a toast like `12 episodes found`.
- Below the composer: `Recent shows` grid (up to 5) and, if a setup is incomplete, a `Continue setup` card with the current step and a resume button. While recent shows load, show three poster skeletons; if they fail, hide the section rather than blocking the composer.
- Empty: composer + three sample cards (original sample episodes) with title, logline, language, duration, aspect.
- No credits: `Analyse` disabled, inline `You need 3 credits to analyse. You have 1.2.` + `Add credits`.

**States.**
- No config: inline error `App settings failed to load. Refresh the page.` and retry.
- File parse error: chip error + toast; other files remain.
- Too long: character counter turns danger; submit disabled with reason.
- No episode breaks: informational callout `No headings found. This will be one episode; you can split it later.` Continue allowed.
- Drag over: only the composer border and drop label change.
- Mobile: textarea 200px, footer stacks, Analyse full width, options scroll horizontally.

**Tree.**

```
HomePage
├── PageHeader
├── ScriptComposer
│   ├── ScriptTextarea
│   ├── DropOverlay
│   ├── FileChipList
│   ├── ComposerFooter
│   │   ├── AddFilesButton
│   │   ├── SampleLink
│   │   └── AnalyseButton
│   └── ShowOptionsRow
├── AnalysisProgress (conditional)
├── ContinueSetupCard (conditional)
├── RecentShowsGrid
└── SampleShowCards (empty state)
```

### 4.7 Shows — `/home/shows`

**Job.** Browse, search, sort and act on every show in the workspace.

**Layout.**
- Header `Shows`, count `24 shows`, primary `New show`.
- Toolbar: search field (280px), status tabs (`All`, `In setup`, `In production`, `Done`), sort select (`Last edited`, `Newest`, `Oldest`, `Name`), view toggle (grid/list) on desktop.
- Grid: responsive 2:3 poster cards.
  - Poster (gradient/initial fallback), status pill top-left, overflow menu top-right, progress rail at the bottom.
  - Body: name (2 lines max), current step, `EP 04 · 12 episodes`, updated relative time.
  - Hover: poster scales 1.03 inside a clipped frame; card border brightens. No card-wide lift.
  - Click: opens the correct next step for that show.
- List view: 56px rows with 32×46 poster, name, step, episodes, updated, menu.
- Pagination: `Load more` after 24 items; server-paged with placeholder data, no full-page spinner.
- Loading: poster grid skeletons at the current column count; toolbar stays interactive.
- Empty: poster-stack illustration, `No shows yet`, `Start with a script and we'll build the rest.`, `Start a show`.
- Search empty: `No shows match "..."`, clear search.
- Error: inline panel with retry; keep toolbar.

**Show menu.** Open, Rename, Move to workspace, Share (if permitted), Leave (if member), Delete (admin/owner only). Destructive items separated, red. Rename uses a dialog with 1–80 chars. Move uses a workspace list. Delete requires typing the show name in an alert dialog.

**Tree.**

```
ShowsPage
├── PageHeader
├── ShowsToolbar
│   ├── SearchField
│   ├── StatusTabs
│   ├── SortSelect
│   └── ViewToggle
├── ShowGrid / ShowList
│   └── ShowCard ×N
│       ├── Poster
│       ├── StatusPill
│       ├── ShowMenu
│       └── ShowMeta
├── LoadMore
├── EmptyState / SearchEmpty
└── RenameDialog / MoveDialog / DeleteDialog
```

### 4.8 Settings shell — `/home/settings/*`

**Job.** One predictable frame for account, team, money and usage.

**Layout.**
- Max width 880. Page header `Settings`.
- Horizontal tab bar: General, Team, Billing, Usage. 44px tall, underline indicator 2px brand, 24px gaps. Team appears only for organisation workspaces; personal workspaces get the upgrade card in General instead.
- Content panels are cards (`--surface-1`, 16px radius, 20–24px padding) with 24px gaps.
- Mobile: tabs scroll horizontally; cards full width; tables become stacked rows.
- Every settings page has a stable URL and preserves unsaved form state on tab switch only after confirmation if dirty.

**Tree.**

```
SettingsLayout
├── PageHeader
├── SettingsTabs
├── RouteContent
└── LeaveWorkspaceDialog / UpgradeDialog (contextual)
```

### 4.9 General — `/home/settings/general`

**Sections.**

1. **Profile** — name (editable inline), email (read-only + copy), user ID (mono + copy), account ID (mono + copy). Inline edit with Save/Cancel, 120-char max, error under field.
2. **Workspace** — name (admin only, inline edit), type (`Personal` / `Organisation`), your role, workspace ID, member count, credit balance. Copy buttons for IDs. `Rename` opens a dialog for admins; non-admins see read-only.
3. **Appearance** — three visual mode cards (`Light`, `Dark`, `Auto`) with miniature window previews; selected gets gradient border. Applies immediately and persists. Optional text size (`Default`, `Large`) if implemented; same pattern.
4. **Danger zone** — `Leave workspace` (all non-owner members) and `Upgrade to organisation` (personal owners). A sole owner cannot leave; the button is disabled with `Contact support to hand over or close this workspace.`
5. **Help** — `Open support`, `Replay product guide` (restores the guide), `Install app` when installable.

**States.** Loading skeleton rows; profile load error; save pending; name invalid; rename conflict; leave pending; upgrade pending. Success uses a toast and updates the cached workspace.

**Tree.**

```
GeneralSettings
├── SettingsCard(Profile)
│   └── DefinitionList
├── SettingsCard(Workspace)
│   └── DefinitionList
├── SettingsCard(Appearance)
│   └── ThemeChoice ×3
├── SettingsCard(DangerZone)
│   ├── LeaveWorkspaceButton
│   └── UpgradeButton
└── SettingsCard(Help)
```

### 4.10 Team — `/home/settings/team`

**Job.** Show who is in the workspace, what they can do, and manage invitations.

**Personal workspace.** The Team tab is hidden. A direct visit to `/home/settings/team` redirects to General and opens the upgrade card: `Bring your team in`, explanation of shared wallet and roles, `Upgrade to organisation`. Upgrading does not grant a second signup bonus in the replica; the balance carries over unchanged.

**Organisation layout.**
- Header row: `Members` count, `Invite` primary (admin only).
- Members table:
  - Member: 32px avatar (image or gradient initial), name, email.
  - Role: select (`Admin`, `Editor`, `Viewer`) for admins; static pill otherwise. Owner row is `Owner` and cannot change.
  - Joined: relative under 7 days, absolute date after; `—` if unavailable.
  - Actions: overflow `Remove`, disabled for owner and self, with tooltip.
- Pending invites table: email, role, invited by, sent, expires, actions `Copy link`, `Resend`, `Revoke`. Expired rows show `Expired` and only `Resend`/`Revoke`.
- Invite dialog 440px:
  - Email field, role radio cards with one-line capability summaries, `Send invite`.
  - After success: `Invite sent` state with a copyable link and `Done`; do not close immediately.
  - Duplicate member/invite: inline warning with `Resend` option.
  - Seat/spend note: `This workspace shares one credit wallet. Admins can buy credits; editors can spend them.`
- Leave workspace: confirm dialog; owner blocked.
- Empty members impossible; empty invites: small empty row `No pending invites`.

**States.** Loading skeletons, error panels per table, role-change optimistic with rollback toast, remove confirmation, revoke confirmation, resend success, invite validation.

**Tree.**

```
TeamSettings
├── TeamHeader
├── MembersTable
│   └── MemberRow ×N
├── InvitesTable
│   └── InviteRow ×N
├── InviteDialog
├── RemoveMemberDialog
├── LeaveWorkspaceDialog
└── UpgradePanel (personal)
```

### 4.11 Billing — `/home/settings/billing`

**Job.** Show the balance, sell credit packs, and make payment state unambiguous.

**Layout.**
1. **Balance summary** — large credit number, `available`, held credits, total; `How credits work` link.
2. **Pack rail** — responsive grid of plan cards, min 152px:
   - Price (`₹100`), credit amount, episode estimate, bonus tag (`+10%`), selected check.
   - Selected card: 1.5px gradient border and `--surface-2` fill.
   - Last card: dashed `Need a custom amount?` → support.
   - Mobile: horizontal snap rail with 16px peek.
3. **Selected summary** — big credits, `credits`, episode estimate, split `base + bonus`, `Pay ₹100` primary. Admin-only; others see `Only workspace admins can buy credits.`
4. **Payment states** — inline `Opening checkout…`, then a modal:
   - Pending: `Waiting for payment confirmation` with spinner and `Check again`.
   - Success: green check, credits added, `Done`.
   - Failed: reason, `Try again`, `Contact support`.
   - Abandoned: `Payment not completed`, cart preserved.
5. **Recent purchases** — last 5 ledger rows of type `topup` with amount, date, status, link to Usage.
6. **Fine print** — taxes, currency, no refunds in demo, secure checkout note.

**States.** Plans loading skeleton; plans error with retry; payments not configured (503) shows `Payments are unavailable in this demo`; location/currency change info banner and refetch; admin permission missing; order polling every 3s up to 60s then `Still waiting` with support link.

**Tree.**

```
BillingSettings
├── BalanceSummary
├── PackRail
│   ├── CreditPackCard ×N
│   └── CustomPackCard
├── SelectedPackSummary
│   ├── CreditAmount
│   └── PayButton
├── PaymentModal
│   ├── PendingState
│   ├── SuccessState
│   └── FailureState
├── RecentPurchases
└── BillingFinePrint
```

### 4.12 Usage — `/home/settings/usage`

**Job.** Make every credit movement inspectable.

**Layout.**
- Summary row: Available, Held, Spent in range, Added in range. Four compact stat cards.
- Filters: date range (`7 days`, `30 days`, `90 days`, `All`), type (`All`, `Generation`, `Top-up`, `Refund`, `Adjustment`), output (`All`, `Text`, `Image`, `Video`), search by actor.
- Ledger table:
  - Date/time (absolute with relative tooltip).
  - Activity: humanised `genType` (`Asset prompt`, `Asset extraction`, `Script analysis`, `Video take`, `Enhancement`) plus output chip.
  - Actor: avatar initials + name; `System` for grants.
  - Held: mono, `—` when zero.
  - Credits: signed mono, green for positive, default for negative; never colour-only — include `+`/`−`.
  - Status: `Completed`, `Pending`, `Failed`, `Refunded` with dot + label.
  - Row expand: ledger ID, model, project/episode, full precision.
- Pagination 25 per page, `Newer` / `Older`.
- Empty: `No credit activity in this range`, `Try a wider range.`
- Loading: four stat skeletons and eight table-row skeletons; filters remain usable.
- Error: summary and table error panels with `Retry`.
- Mobile: cards with amount top-right, activity, actor, date, status; filters in a sheet.

**Tree.**

```
UsageSettings
├── UsageSummary
│   └── StatCard ×4
├── UsageFilters
├── LedgerTable
│   └── LedgerRow ×N
│       └── LedgerDetail (expand)
├── Pagination
└── EmptyState
```

### 4.13 Script split — `/home/script-split`

**Job.** Review how a script was divided, fix episodes, and lock the episode list before look and style are chosen.

**Layout.**
- Setup header: breadcrumb `Home / {show}`, stepper `1 Episodes · 2 Looks · 3 Styles · 4 Models`, primary `Continue to Looks`.
- Title `Check your episodes` (32), subtitle `Review the episode breaks and adjust them now. The next steps depend on this list.`
- Summary strip 72px: source chip (`Pasted script` or `3 files`), split method (`Split at "Episode" headings` / `Suggested by AI` / `One episode`), episode count, total read time, and a thin duration bar showing relative episode lengths. If text exists before the first heading, add an info chip `Intro text before EP 01 is skipped` with a tooltip; never drop it silently.
- Two-pane body:
  - **Episode list (320px).** Tabs `All` / `Your call` above the list. Draggable rows: drag handle, `EP 01`, title, word count, a `short`/`long` flag when the episode is below 0.6× or above 1.8× the median (only with ≥3 episodes), duration, status dot. Active row uses brand wash + 1.5px border. Reorder updates the duration bar live. Inline rename from the row menu. Keyboard: `Alt+↑/↓` moves, `Enter` opens.
  - **Script reader (flex).** Screenplay typography, 13/1.6, max 72ch, generous margins. Editable inline when the episode is editable. A right-edge minimap is optional; do not ship a rich text toolbar in MVP.
- Under the reader: word count, `Ends on` marker, next-episode peek.
- Footer actions: `Add episodes`, `Save N changes` (disabled when clean), `Continue to Looks`.
- Add episodes sheet 720px:
  - Tabs `Paste` / `Upload files`.
  - Paste: name + textarea + character count.
  - Upload: drop zone, `.docx .pdf .txt .md`, one file per episode or one large file to split.
  - `Split pattern` row: preset select (`Episode`, `Chapter`, `Part`, Hindi/Chinese headings, `[N]`, custom) plus `Edit patterns` for regex-literate users; AI can suggest a pattern when none match.
  - `Split` previews episode names and line counts before adding.
  - Adds after the last existing episode; a background job may finish after the sheet closes, with a toast and a refresh of the list.
- Delete: row menu; blocked when the episode is generating, already enhanced, has extracted assets, or is the last episode. Blocked reasons appear in the confirm dialog, not as a mystery disabled item.

**States.**
- Loading: two-pane skeleton with 5 episode rows and a reader block.
- Analysis failed: full-pane error with `Try again` and `Paste a different script`.
- No credits: inline callout from the home analysis action, with `Add credits`.
- No episodes: empty illustration + `Add episodes`.
- Reader empty: `Select an episode`.
- Save error: keep edits, toast + inline banner, retry.
- Dirty navigation: confirm `Leave setup?`; stay keeps state, leave keeps the suggested look/style/models and exits to home.
- Mobile: segmented `Episodes` / `Script`; episode list full width; reader full width; footer sticky.

**Dialogs.**
- Delete episode (destructive, requires confirm).
- Add episodes (sheet).
- Leave setup (alert dialog; explains what is kept).
- Split pattern help (popover): supported headings `Episode`, `Ep`, `Chapter`, `Part`, Hindi and Chinese equivalents, `[1]`.

**Tree.**

```
ScriptSplitPage
├── SetupHeader
│   ├── Breadcrumb
│   ├── SetupStepper
│   └── ContinueButton
├── SplitSummary
│   ├── SourceChip
│   ├── SplitMethod
│   └── DurationBar
├── SplitWorkspace
│   ├── EpisodeList
│   │   └── EpisodeRow ×N
│   └── ScriptReader
│       ├── EpisodeTitle
│       ├── ScreenplayBody
│       └── ReaderFooter
├── SplitFooter
│   ├── AddEpisodesButton
│   └── SaveButton
├── AddEpisodesSheet
├── DeleteEpisodeDialog
└── LeaveSetupDialog
```

**Studio-mode variant — `/script-management`.** The same two-pane list and reader (same tree as §4.13), without the setup stepper or the continue-to-look action. Header: `Script`, project chip, `Save`, and workflow actions (`Enhance`, `Cast`, `Video`). Add/rename/delete follow the same rules. `/script` is a legacy alias.

### 4.14 Pick a look — `/home/pick-look`

**Job.** Choose the visual treatment that every character, place and frame will follow.

**Layout.**
- Setup header step 2. Title `Pick a look`, subtitle `This treatment carries through every character, location and frame. It is locked once setup finishes.`
- Toolbar: search `Search looks` (280px), genre filter chips, result count.
- Look grid: 3 columns `lg`, 2 `sm`, 1 mobile. Card:
  - 4:5 still, gradient scrim at the bottom, name over the image, two metadata tags (`35mm`, `Neon`, `Documentary`).
  - Suggested card: small `Suggested for your genre` tag.
  - Selected: 1.5px gradient border, check in a gradient square, subtle inner glow.
  - Hover: image scales 1.03, card border brightens; no text movement.
- Footer: `Back to episodes`, selection summary, `Continue with {look}`.
- When the list is longer than one screen, `Previous styles` / `Next styles` buttons page the grid; `←/→` also page it when the grid has focus.
- The page never auto-generates anything; helper says `Nothing has been generated yet.`

**States.**
- Loading: six 4:5 skeletons.
- Error: `Looks didn't load` + `Retry`.
- No search results: `No looks match "..."` + clear.
- Nothing selected: continue disabled with `Choose a look to continue.`
- Saving: button spinner, cards locked.
- Save error: toast + retry; selection kept.
- Mobile: 2-column grid, sticky footer.

**Tree.**

```
PickLookPage
├── SetupHeader
├── LookToolbar
│   ├── SearchField
│   └── GenreChips
├── LookGrid
│   └── LookCard ×N
├── SelectionFooter
│   ├── BackLink
│   └── ContinueButton
└── LeaveSetupDialog
```

### 4.15 Pick a directing style — `/home/pick-director`

**Job.** Choose pacing, hook style and sound character. Same structure as Pick a look, with style-specific metadata.

**Differences.**
- Title `Pick a directing style`; subtitle about hook, cut rhythm and scene energy.
- Cards are 16:9 motion tiles with a 2s muted preview loop. Under reduced motion, show the still and a `Preview` play button (click to play once).
- Metadata chips: `Slow burn`, `Hard cuts`, `Handheld`, `Score-led`, `Natural sound`.
- A 3-bar `Pace · Tension · Sound` mini-meter appears on the selected card, not on every card.
- Suggested tag uses the show's genre.
- The selection locks after setup.

Everything else — grid, search, continue, loading, empty, leave dialog — follows §4.14.

**Tree.**

```
PickDirectorPage
├── SetupHeader
├── DirectorToolbar
├── DirectorGrid
│   └── StyleCard ×N
│       ├── PreviewTile
│       ├── StyleMeta
│       └── PaceMeter (selected)
└── SelectionFooter
```

### 4.16 Pick models — `/home/pick-models`

**Job.** Pick one image model and one video model for this show, with honest capability labels.

**Layout.**
- Setup header step 4. Title `Pick models`; subtitle `One model draws the frames, one turns them into clips. We start you with a recommended pair.`
- Two sections separated by 32px:
  - `Image model` + hint `Draws characters, places and storyboard frames.`
  - `Video model` + hint `Turns every take into a moving clip.`
- Each section: 4 cards in a row at `xl`, 2 at `sm`, 1 mobile. Card 170px min height:
  - Top row: `Recommended` tag, provider tag, selection square.
  - Logo tile 30px (letter fallback; dark tile for vendor marks that need it).
  - Model name, one-line description, capability chips (`Text to image`, `Image edit`, `Multi-reference`, `Audio`, `Anchoring`, `5–10s`, `9 image refs`, `max resolution`).
  - Anchoring chips use info colour with a ring; they explain that layout-locking reference frames are included.
  - Selected: 1.5px foreground border, surface-2 fill, gradient check.
- `See all 12 image models` opens a right sheet:
  - Header with count, search, filter chips for shared specs, `All`.
  - Radio rows with logo, name, recommended tag, description, chips.
  - Sticky footer: `Applies to this show only`, `Cancel`, `Use {model}`.
- Footer: selection summary `Aster Image 2 + Motion 2.5 · recommended`, hint `Nothing has been generated yet.`, `Back`, `Continue`.
- Continue saves both models and routes to `/scriptEnhancement`.

**States.**
- No models: empty panel per section.
- Load error: section-level retry, other section remains usable.
- Missing one selection: continue disabled + `Choose an image model and a video model to continue.`
- Saving: spinner, cards locked.
- Model list changes between loads: keep selection if the id still exists; otherwise fall back to recommended and show an info toast.

**Tree.**

```
PickModelsPage
├── SetupHeader
├── ModelSection(Image)
│   └── ModelCard ×4
├── ModelSection(Video)
│   └── ModelCard ×4
├── SelectionSummary
├── ModelSheet (shared)
│   ├── SearchField
│   ├── SpecFilters
│   ├── ModelRadioRow ×N
│   └── SheetFooter
└── LeaveSetupDialog
```

### 4.17 Shoot-ready scripts — `/scriptEnhancement`

**Job.** Decide whether to use original scripts or AI-prepared shoot-ready scripts, then review each episode side by side.

**Layout.**
- Full-height workspace under the project bar. Header 64px:
  - Title `Shoot-ready scripts`, project name chip.
  - Choice bar: `How should the show use your N episodes?` + `Use originals` / `Make all shoot-ready`.
  - Primary `Continue to Cast & places`; footer also carries `Extract assets`, gated on enhancement completeness.
- Body three columns:
  - **Episode rail (280px).** `EP 01` mono label, name, status dot + text. Active uses brand wash. Frozen episodes show a lock icon. Disabled while editing.
  - **Original pane (flex).** Header `Original` + `Edit`; screenplay reader; word count; edit mode swaps to a mono textarea with Save/Cancel.
  - **Shoot-ready pane (flex).** Header `Shoot-ready` + status badge + `Edit` / `Regenerate` / `Download`; screenplay reader; word count; generating state; empty state; failure state.
- Footer: `N / N` fraction, summary (`2 enhancing · 3 queued`), progress rail, `Extract assets` and `Proceed to Cast & places`. Extraction uses the configured batch size; the proceed action is enabled only when every episode has a usable script.
- While generating, poll every 4s; users can navigate away and come back.

**Status vocabulary.**

| Status | Dot | Label |
|---|---|---|
| Not generated | subtle | `Not generated` |
| Generating | brand, pulsing | `Enhancing` |
| Ready | warning | `Ready to review` |
| Failed | danger | `Failed` |
| Using original | success | `Using original` |
| Frozen | subtle + lock | `Frozen` |

**Dialogs.**
- `Enhance N episodes?` — explains background work, credit use and that originals become read-only once enhancement starts.
- `Use shoot-ready scripts?` — warns that originals will be replaced as the working source; unenhanced episodes will be enhanced now.
- `Revert to originals?` — shoot-ready versions are kept but no longer used.
- `Regenerate EP 03?` — optional notes textarea (2,000 chars), cost, destructive warning.
- `Leave without saving?` — only when the editor draft is dirty.

**States.**
- Loading: rail skeleton + two reader skeletons.
- All originals: right pane explains that shoot-ready adds scene headings, cast and wardrobe; `Enhance all anyway`.
- Failed episode: right pane error + `Try again`; original remains usable.
- Extraction started: editing locks; tooltip explains assets are being pulled.
- No credits: dialog shows the shortfall and `Add credits`; do not start a partial batch.
- Mobile: segmented `Original` / `Shoot-ready`; episode rail becomes a select; actions in a bottom sheet.

**Tree.**

```
EnhancementPage
├── EnhancementHeader
│   ├── TitleBlock
│   ├── ChoiceBar
│   └── ContinueButton
├── EnhancementBody
│   ├── EpisodeRail
│   │   └── EpisodeStatusRow ×N
│   ├── OriginalPane
│   │   ├── PaneHeader
│   │   ├── ScreenplayReader / Editor
│   │   └── WordCount
│   └── ShootReadyPane
│       ├── PaneHeader
│       ├── PaneBody (reader / loader / empty / error)
│       └── WordCount
├── EnhancementFooter
│   ├── ProgressSummary
│   ├── ProgressRail
│   ├── ExtractAssetsButton
│   └── ProceedButton
├── EnhanceAllDialog
├── SwitchSourceDialog
├── RegenerateDialog
└── LeaveEditDialog
```

### 4.18 Cast & places — `/cornerScape`

**Job.** Turn extracted characters, places and props into consistent, locked visual references.

**Layout.**
- Header: `Cast & places` (32), project chip, `Three steps` strip: `Write prompts` → `Generate looks` → `Lock`.
- Batch action on the right: `Do next step for everything` with a progress count (`18 of 42 locked`). On click, run the next incomplete step for all unlocked items after a confirm that states the credit cost.
- Search `Search cast, places and props`; type tabs `All`, `Characters`, `Places`, `Props`; status filter `All`, `Needs prompt`, `Needs look`, `Locked`.
- Body:
  - **Asset list (360px).** Rows with 48×48 thumbnail, name, type chip, status dot. Grouped headers. Multi-select checkboxes appear on hover/focus; a bulk bar replaces the toolbar when selection exists.
  - **Detail panel (flex).** Large 4:5 preview with regenerate overlay. Below:
    - Name (editable), type (read-only), description.
    - Prompt textarea with character count and `Improve prompt` action (editor+).
    - Reference images (multi-reference models only), up to 9.
    - Voice select for characters (`Narrator`, `Warm male`, `Bright female`, custom), with preview button.
    - Model badge + seed + `Copy ID`.
    - Actions: `Generate look`, `Generate variations`, `Lock`, `Unlock`, `Delete`.
- Footer: `Continue to Video` when every asset is locked; otherwise disabled with `Lock every asset to continue.`
- Empty/extracting: a progress card with asset counts, `Cancel extraction`, and skeletons per type.

**States.**
- Loading: list rows and a detail preview skeleton.
- No assets: `Nothing extracted yet`, `Open shoot-ready scripts` action.
- Prompt missing: generate disabled; helper `Write a prompt first.`
- Generating: image tile shows shimmer + progress label; list row shows spinner dot.
- Locked: check + `Locked` pill; prompt becomes read-only until unlocked.
- Batch partial failure: keep successes, show `3 failed` with retry.
- Viewer: all generation actions hidden; can browse and copy prompts.
- Mobile: list is the page; selecting opens a full-screen detail sheet with sticky actions.

**Dialogs.**
- Batch next-step confirmation (counts + credits).
- Delete asset (destructive).
- Unlock (explains downstream variants may become outdated).
- Voice preview (small popover, not a modal).

**Tree.**

```
CastPlacesPage
├── CastHeader
│   ├── TitleBlock
│   ├── ThreeStepStrip
│   └── BatchAction
├── CastToolbar
│   ├── SearchField
│   ├── TypeTabs
│   └── StatusFilter
├── CastWorkspace
│   ├── AssetList
│   │   └── AssetRow ×N
│   ├── BulkBar (selection)
│   └── AssetDetail
│       ├── Preview
│       ├── PromptEditor
│       ├── ReferenceStrip
│       ├── VoiceField (character)
│       └── ActionRow
├── CastFooter
├── BatchConfirmDialog
├── DeleteAssetDialog
└── UnlockAssetDialog
```

### 4.19 Production shell — `/production`

**Job.** Move one episode through six production steps without losing context.

**Layout.**
- Header: breadcrumb `Production`, episode picker (searchable select with poster, `EP 04 · Monsoon Kitchen`), step rail, `Next: {step}` primary, Director toggle.
- At `xl+` the header is one 64px row with a vertical 220px step rail down the left. Below `xl` it becomes two rows: picker/actions, then a horizontally scrollable step rail.
  - `Script`, `Script assets`, `Plan`, `Asset Variants`, `Storyboard`, `Video`.
  - States: done (check, success), current (brand), todo (subtle), outdated (warning), failed (danger). Each has a short status line.
- Work area: full-height panel, 16px radius, `--surface-1`, 1px border. Each step owns its own toolbar and scroll region.
- Director panel: right rail 360px, collapsible; on mobile it becomes a bottom sheet.
- Empty (no episodes): centered `Pick an episode to produce` with an episode list.
- Missing setup: redirect to `/home/script-split` with an info banner.
- Viewer: work area read-only, no generate actions.

**Director panel.**
- Header `Director`, context chip `EP 04 · Scene 3`, overflow `Clear conversation`.
- Message list with assistant and user bubbles; assistant messages can contain a diff card (`Apply to plan`, `Apply to prompt`).
- Quick actions: `Tighten pacing`, `Fix continuity`, `Shorten dialogue`, `Suggest coverage`.
- Composer: textarea + send, credit estimate beside send.
- Streaming state: typing dots + stop button. Failure: retry message.
- The panel never edits project state without an explicit `Apply` action.

**Tree.**

```
ProductionPage
├── ProductionHeader
│   ├── EpisodePicker
│   ├── ProductionStepRail
│   ├── NextStepButton
│   └── DirectorToggle
├── ProductionWorkspace
│   └── StepContent (Script / ScriptAssets / Plan / Variants / Storyboard / Video)
└── DirectorPanel
    ├── DirectorHeader
    ├── MessageList
    ├── QuickActions
    └── DirectorComposer
```

### 4.20 Production step — Script

**Job.** Read the working script for the chosen episode and jump to the scene being produced.

**Layout.**
- Toolbar: source badge (`Shoot-ready` or `Original`), scene count, word count, `Open in Shoot-ready` link, `Download`.
- Two columns at `lg+`: scene index 240px and screenplay reader.
- Scene index: `SC 01`, slugline, page count, status dot (`planned`, `storyboarded`, `video`). Active scene uses brand wash.
- Reader: screenplay formatting. Dialogue blocks are selectable; selecting a block reveals `Send to Director` and `Copy`.
- Sticky scene header with location, time of day, cast chips.
- No editing here; edit lives in Shoot-ready. A pencil action deep-links there.

**States.** Loading, empty script, scene missing, viewer read-only.

**Tree.**

```
ScriptStep
├── ScriptToolbar
├── SceneIndex
│   └── SceneIndexRow ×N
├── ScreenplayReader
│   ├── SceneHeading
│   ├── ActionBlock
│   └── DialogueBlock
└── SelectionActions
```

### 4.21 Production step — Script assets

**Job.** Confirm the per-episode extraction of cast, places and props before planning.

**Layout.**
- Toolbar: `Extracted from EP 04`, counts by type, `Re-extract` (admin/editor), `Open Cast & places`.
- Summary tiles: Characters, Places, Props, Missing references.
- Asset grid grouped by type:
  - Tile 1:1 image or gradient fallback, name, status (`Linked`, `Missing`, `New`), lock icon if locked.
  - Click opens a preview drawer with prompt, voice, linked global asset, `Open in Cast & places`.
- Missing reference banner: `3 assets need a look` + `Fix in Cast & places`.
- Re-extract confirm explains cost and that downstream plan/storyboard may become outdated.

**States.** Extracting (stage loader), failed (retry), no assets (empty + extract), partial (warning banner).

**Tree.**

```
ScriptAssetsStep
├── ScriptAssetsToolbar
├── AssetSummaryTiles
├── AssetGroup(Characters / Places / Props)
│   └── AssetTile ×N
├── MissingReferenceBanner
├── AssetDrawer
└── ReextractDialog
```

### 4.22 Production step — Plan

**Job.** Turn the script into a shootable scene and shot plan.

**Layout.**
- Empty: centered `No plan yet`, explanation, `Generate plan` with credit estimate.
- Generating: stage loader (`Reading scenes`, `Blocking shots`, `Estimating runtime`), cancel allowed for 10s.
- Plan view:
  - Overview row: scenes, shots, estimated runtime, model pair.
  - Scene list: accordion cards. Header `SC 01 · INT. KITCHEN — DAWN`, chips for cast and location, shot count, runtime.
  - Expanded: beat list; each beat has action, dialogue excerpt, intended coverage (`Wide`, `Medium`, `Close`, `Insert`) and an edit action.
  - Shot numbering is stable (`1A`, `1B`) and used by storyboard and video.
- Toolbar: `Regenerate plan` (confirm), `Add scene`, version selector.
- Regeneration marks storyboard/video `Outdated` with a banner and a link to review differences.
- Inline edit: scene heading, synopsis, beats; save per scene; dirty-state guard.

**States.** No plan, generating, failed, outdated, partial (some scenes failed), viewer.

**Tree.**

```
PlanStep
├── PlanToolbar
├── PlanOverview
├── SceneAccordion
│   └── SceneCard ×N
│       ├── SceneHeader
│       ├── BeatList
│       └── SceneActions
├── PlanEmpty
├── PlanLoader
└── RegeneratePlanDialog
```

### 4.23 Production step — Asset Variants

**Job.** Generate and choose the visual variant that will anchor each asset in storyboard frames.

**Layout.**
- Left asset rail 240px: search, type filter, thumbnail + name + variant count + status.
- Main:
  - Header: asset name, type, locked badge, `Generate 4 variants` primary with cost.
  - Variant grid: 2 columns mobile, 3 `md`, 4 `xl`. Each tile:
    - image, `Primary` pill, selection ring, hover actions `Preview`, `Use as primary`, `Delete`.
    - generating tile: shimmer + progress label; failed tile: retry.
  - Compare mode: select two variants, side-by-side with metadata.
- Footer: `Primary: Variant 3`, `Continue to Storyboard` (enabled when every required asset has a primary).
- Batch: `Generate missing variants` with count + cost, confirm dialog.
- Deleting the primary promotes the next variant and warns that storyboard frames using it become outdated.
- **Anchoring sub-mode** (only when the selected video model supports it): a segmented `Variants` / `Anchoring` switch. Anchoring generates wide reference images per scene that lock layout for the first frame; the grid supports batch generate, poll, edit and delete, and shows which shots consume each anchor.

**States.** No assets, no variants, generating, partial, all ready, anchor failed, viewer.

**Tree.**

```
AssetVariantsStep
├── VariantAssetRail
│   └── VariantAssetRow ×N
├── VariantWorkspace
│   ├── VariantHeader
│   ├── VariantGrid
│   │   └── VariantTile ×N
│   └── VariantFooter
├── CompareDrawer
├── BatchGenerateDialog
└── DeleteVariantDialog
```

### 4.24 Production step — Storyboard

**Job.** Turn the plan into ordered shots with frames, durations and continuity notes.

**Layout.**
- Toolbar: scene filter, view toggle (`Grid`, `Table`), `Generate all missing` (cost), `Preview`, `Download`.
- Progress strip: `24 / 36 frames`, failed count, `Retry failed`.
- Grid view: shot cards 16:9:
  - frame or shimmer, shot number, scene label, duration, status dot.
  - Hover: `Preview`, `Edit`, `Regenerate`.
  - Outdated frames get an amber corner badge.
- Table view: columns `#`, `Frame`, `Scene`, `Action`, `Duration`, `Status`, `Actions`. Sticky header; rows 72px.
- Shot drawer 480px:
  - Start frame and optional end frame; prompt; negative prompt; duration (2–10s); camera move; dialogue; continuity notes.
  - `Generate frame`, `Regenerate`, `Use as anchor`.
  - Continuity panel: previous/next shot references; warning when wardrobe or location conflicts.
  - Save/Cancel with dirty guard.
- Preview mode: full-screen slideshow with arrow keys, shot metadata, `Esc` to close.
- Download: ZIP of frames with a manifest CSV.

**States.** No plan (link to Plan), no frames, generating, partial failure, outdated due to plan change, viewer.

**Tree.**

```
StoryboardStep
├── StoryboardToolbar
├── StoryboardProgress
├── StoryboardGrid / StoryboardTable
│   └── ShotCard / ShotRow ×N
├── ShotDrawer
│   ├── FramePair
│   ├── PromptFields
│   ├── ShotSettings
│   └── ContinuityPanel
├── StoryboardPreview
└── GenerateMissingDialog
```

### 4.25 Production step — Video

**Job.** Generate, compare and select takes for each shot, add sound, and send the episode to the editor.

**Layout.**
- Toolbar: shot filter, `Generate missing takes` (cost), model badge, `Open editor`, `Compile`.
- Shot list 300px: number, thumbnail, duration, take count, status (`No take`, `Generating`, `3 takes`, `Selected`).
- Take workspace:
  - Prompt editor with `Rewrite with Director`, token/char count.
  - Duration chips (`5s`, `10s`), resolution, model; cost preview.
  - `Generate take` primary.
  - Takes grid 16:9: video poster, duration, model, `Selected` badge, actions `Play`, `Use this take`, `Download`, `Delete`.
  - Generating tile: orbit loader + rotating status; polling every 3s; `Cancel` until render starts.
- Audio panel:
  - BGM: search/library, preview waveform, volume, `Generate BGM`, replace/remove.
  - Dialogue/voice tracks summary; link to editor for fine control.
- Episode assembly summary: total runtime, selected takes, missing shots, track count. `Compile` is disabled until every shot has a selected take.
- `Compilations` list under the summary: completed renders with date, duration, size, status, `Open`, `Download`, `Delete`.
- Compile opens the editor with a `Compile` dialog, or compiles directly if the user chooses `Quick compile`.

**States.** No storyboard, no takes, generating, partial, all selected, failed render, viewer.

**Tree.**

```
VideoStep
├── VideoToolbar
├── VideoWorkspace
│   ├── ShotList
│   │   └── VideoShotRow ×N
│   ├── TakeWorkspace
│   │   ├── VideoPromptEditor
│   │   ├── TakeSettings
│   │   └── TakeGrid
│   │       └── TakeCard ×N
│   └── AudioPanel
├── AssemblySummary
│   └── CompilationList
├── GenerateTakesDialog
└── CompileDialog
```

### 4.26 Video editor — `/editor`

**Job.** Assemble selected takes, trim and arrange them, add sound and text, and compile the episode.

`VIDEO-EDITOR-SPEC.md` owns timeline mechanics. This section fixes the chrome, visual language and states.

**Shell.** The app sidebar is replaced by an editor chrome: a context bar, four working regions, and a resizable timeline.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Context: ← Show ▾  Episode ▾  Timeline ▾   [Assemble] [Saved] [Compile]     │
├───────────────┬──────────────────────────────────────────┬───────────────────┤
│ Library       │ Canvas                                   │ Inspector         │
│ 280–360       │ flexible, letterboxed                    │ 300–360           │
│ tabs + grid   │ transport + timecode                     │ clip / canvas     │
├───────────────┴──────────────────────────────────────────┴───────────────────┤
│ Timeline (resizable, default 280): ruler · V2 V1 A1 A2 T1 · clips · playhead│
└──────────────────────────────────────────────────────────────────────────────┘
```

- Full four-region layout at ≥1280px. At 1024–1279px the inspector becomes a floating sheet; below 1024px show a blocking `Open on a larger screen` panel with a read-only preview and `Back to production`. Do not ship a broken touch editor.
- Background `--bg`; panels `--surface-1`; 1px borders; no rounded outer shell.
- Context bar: back arrow to `/production`, Show picker, Episode picker, Timeline picker, `Assemble`, save state (`Saved`, `Saving…`, `Unsaved changes`), undo/redo icon buttons, `Compile`.
- `Assemble` rebuilds the timeline from the selected takes; it never deletes manual edits without a confirmation.
- Library tabs: `Takes`, `Clips`, `Images`, `Audio` (BGM, uploads and extracted voices). Rows show poster, name, duration, resolution and a `Generated` badge. Search and filter; click previews, double-click or drag adds. Width 280–360, collapsible with `Cmd/Ctrl+B`.
- Canvas: checkered/dark letterbox, aspect-ratio frame, safe-area toggle, play overlay. Empty canvas shows `Drag a take here`.
- Transport: skip to start, play/pause, skip to end, current/total timecode, speed, volume, fullscreen, zoom `− 100% +` with `Fit` and snapping toggle.
- Inspector: clip properties when selected (transform, scale, rotation, opacity, volume, speed, fade in/out, text style); canvas properties when nothing selected (ratio, background, safe areas). Tabs `Clip` / `Canvas`. Width 300–360.
- Timeline: ruler with adaptive tick spacing; track headers with lock, mute, solo, visibility; V2/V1 picture, A1/A2 sound, T1 text; BGM lives on an audio track. Lane height 56px video, 44px audio. Clips carry thumbnail strips or waveforms, a label and duration; selected clip has a 2px brand outline and trim handles.
- Track colours use the track tokens; clips always carry a label, so colour is not the only cue.
- Playhead: 1px brand line with a 9px cap; dragging scrubs. Snapping toggle; zoom slider; timeline splitter.
- Compile dialog: name, range (`Full episode` / `In–Out`), resolution, fps, format, estimated size and time, `Compile`. Progress modal shows percentage, stage, cancel, then `Open file` and `Reveal in assets`. The finished render also appears under `Compilations` in the Video step.
- Save: autosave 800ms after change; explicit Cmd/Ctrl+S; before unload guard when dirty.
- Errors: `This timeline didn't load` full-panel state with `Reload`; never silently discard local changes.

**Keyboard.** The full map is owned by `VIDEO-EDITOR-SPEC.md` §14; §8.4 repeats the shipping subset.

**Tree.**

```
EditorPage
├── EditorContextBar
│   ├── BackToProduction
│   ├── ShowPicker
│   ├── EpisodePicker
│   ├── TimelinePicker
│   ├── AssembleButton
│   ├── SaveState
│   ├── UndoRedo
│   └── CompileButton
├── EditorBody
│   ├── MediaLibrary
│   │   ├── LibraryTabs
│   │   ├── LibrarySearch
│   │   └── MediaItem ×N
│   ├── PreviewPane
│   │   ├── Canvas
│   │   └── TransportBar (zoom, fit, snap)
│   ├── Inspector
│   │   ├── ClipProperties
│   │   └── CanvasProperties
│   └── InspectorSheet (1024–1279)
├── Timeline
│   ├── TimelineToolbar
│   ├── Ruler
│   ├── Track ×N
│   │   ├── TrackHeader
│   │   └── Clip ×N
│   └── Playhead
├── CompileDialog
└── UnsavedChangesDialog
```

### 4.27 Assets — `/assets`

**Job.** One library for every reusable element in the show.

**Layout.**
- Header `Assets`, counts, `Add` split button (`Character`, `Scene`, `Prop`, `Upload clip`), `Upload clip` primary on the Clips tab.
- Tabs: `All`, `Characters`, `Scenes`, `Props`, `Clips`, `Voices`. Counts in tab labels; `Scenes` is the library label for places.
- Search 320px; sort (`Recently updated`, `Name`, `Most variants`); filter `All`, `Needs look`, `Locked`, `Missing`.
- Table at `md+`: checkbox, thumbnail, name, type, variants, status, updated, overflow.
- Grid at mobile: 2-column tiles with name, type, status.
- Bulk bar: `N selected`, `Generate looks`, `Edit prompt`, `Lock`, `Delete`, `Clear`.
- Row click opens the same asset detail used by Cast & places, but in a drawer, not a route.
- Clip upload: dialog with file drop, name, duration probe, poster frame picker, progress.
- Pagination 25; server-side.

**States.** Loading skeleton table, empty per tab, extracting, upload progress, upload failure, viewer, search empty.

**Tree.**

```
AssetsPage
├── AssetsHeader
├── AssetTabs
├── AssetsToolbar
├── AssetTable / AssetGrid
│   └── AssetRow / AssetTile ×N
├── BulkActionBar
├── AssetDrawer
├── UploadClipDialog
└── DeleteAssetsDialog
```

### 4.28 Invite — `/invite/:token`

**Job.** Accept a workspace invitation with the correct account.

**Layout.**
- Centered 480px card on a dark brand-glow background.
- Workspace avatar 48px, `You're invited to {workspace}`, inviter line `{name} invited you as {role}`, role capability summary, and expiry `This invite expires in 6 days` (or the absolute date when under 48 hours).
- Signed-in state: `Signed in as {email}` + `Accept invite` primary + `Not you? Switch account`.
- Signed-out state: explain that sign-in is required, `Sign in to accept` → `/login?next=/invite/{token}`.
- Wrong email: warning `This invite was sent to {masked email}.` + `Switch account`; do not reveal the full address.
- Token invalid/expired: error state with `Back to home`.
- Already a member: `You're already in this workspace` + `Open workspace`.
- Accepting: spinner; success routes to `/home` with a toast `Welcome to {workspace}` and invalidates workspace queries.

**Tree.**

```
InvitePage
├── BrandMark
├── InviteCard
│   ├── WorkspaceAvatar
│   ├── InviteHeading
│   ├── InviterLine
│   ├── RoleSummary
│   ├── AccountLine
│   └── ActionGroup
└── InviteErrorState
```

### 4.29 Legal and support

- `/legal/terms-of-service`, `/legal/privacy-policy`, `/legal/cookie-policy`: prose pages, 720px max, 16/1.7 body, sticky table of contents at `lg+`, `Back to top`.
- `/support`: contact card, response-time note, FAQ accordion, `Email support` link. No form in the replica; link to a mailto or a local ticket stub.
- Both use the marketing shell but hide the showreel and heavy motion.

**Tree.**

```
LegalSupportPage
├── MarketingNav
├── ProseLayout
│   ├── TableOfContents
│   └── LegalProse / SupportContent
└── SiteFooter
```

---

## 5. System states

### 5.1 Error page ("slate")

A full-page state with a film-slate motif, used for 403, 404, 500, maintenance, offline and editor load failure.

```
┌───────────────────────────────────────────────┐
│ 404                                      MISSING │
│ ┌───────────────────────────────────────────┐ │
│ │              [ brand mark ]               │ │
│ │ NO SUCH SCENE                             │ │
│ │ This scene isn't here                     │ │
│ │ The address may be stale, or it moved.    │ │
│ │ [Go home] [Back to start]                 │ │
│ │ Error ID · abc123                         │ │
│ └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

- Frame: 1px border, 24px radius, 48px padding, corner brackets, subtle grid.
- Top-left code (mono, 10px, uppercase); top-right "take" word.
- Overline, then 32–44px title, then 15px body, max 420px.
- Actions: one primary, one outline. Never more than two.
- Error ID only when a server ID exists; copy button.
- Variants: `404 Missing`, `403 Restricted`, `Waitlist Queue`, `500 Retake`, `503 Offline`, `Maintenance Pause`, `Workspace off`, `Timeline hold`. All titles and bodies are original and follow the formula in §9.
- The page keeps the user's session and offers `Retry` for transient failures.

### 5.2 Empty states

Anatomy: 40px icon tile, title (14–17px semibold), one-sentence body (13px muted), one primary action, optional secondary link. Max width 320. No stock illustrations.

| Context | Title | Action |
|---|---|---|
| No shows | `No shows yet` | `Start a show` |
| No search results | `Nothing matches "{query}"` | `Clear search` |
| No episodes | `This show has no episodes` | `Add episodes` |
| No assets extracted | `Nothing extracted yet` | `Open shoot-ready scripts` |
| No plan | `No plan yet` | `Generate plan` |
| No frames | `No frames yet` | `Generate missing` |
| No takes | `No takes for this shot` | `Generate take` |
| No credit activity | `No activity in this range` | `Widen the range` |
| No invites | `No pending invites` | none |
| Empty notifications | `You're all caught up` | none |
| Empty editor | `Drag a take onto the timeline` | `Browse takes` |

### 5.3 Loading

| Level | Pattern |
|---|---|
| App boot | Centered brand mark, 3px gradient rule shimmering, `Loading your studio` (screen-reader only) |
| Route navigation | 2px top progress bar; the current screen stays visible, no full-page spinner takeover |
| Route / auth guard | Brand mark + shimmer, 300ms delay before showing to avoid flashes |
| Card / table | Skeletons matching final geometry; never a spinner inside a card |
| Page section | 5-row skeleton (48px) with `aria-busy` |
| Image | Surface-2 block with a 300ms faded image; no layout shift |
| Text generation | `StageLoader` with rotating messages every 2.6s + thin shimmer rail |
| Image batch | Tile-level shimmer + `3 of 10`; do not block the whole page |
| Video render | `VideoLoader`: 16:9 aurora + orbit ring + status pill + progress rail |
| Payment | Pending modal + `Check again`; poll 3s, max 20 tries |
| Compile | Progress modal with stage + percentage + cancel |

Rotating messages are short and truthful. Do not claim a specific backend stage the client cannot know; use phase labels (`Preparing`, `Generating`, `Finishing`).

### 5.4 Offline and disabled

- Offline banner: fixed bottom, `You're offline. Changes will retry when you reconnect.` + `Retry now`.
- Workspace disabled: full error slate; actions `Switch workspace`, `Contact support`; credits and projects paused.
- Read-only: `View only` badge beside project name; generation buttons hidden; a single info banner explains who can generate.
- Maintenance: full error slate; no polling loop; `Check again` manual only.

### 5.5 Toasts

- Placement: bottom-right desktop, bottom-center mobile, 16px inset.
- Width 360 max; stacking 4; newest on top.
- Duration: success 3.5s, info 4s, warning 5s, error 7s (or persistent if it has an action).
- Structure: 16px icon, title (optional), one line of body, action, close.
- Types: `success`, `info`, `warning`, `error`, `loading`.
- `loading` can resolve in place to success/error (e.g. upload).
- Never use a toast for field validation, permission explanation, or anything the user must act on. Those are inline.
- Announce via `aria-live="polite"`; errors via `role="alert"`.
- Error toasts include `Retry` when the action is idempotent.
- A credit shortfall discovered after an action fails uses a warning toast with `Add credits`; a shortfall known before the action is inline, not a toast.

### 5.6 Dialogs, sheets, popovers

| Surface | Width | Use |
|---|---|---|
| Dialog `sm` | 440 | Invite, rename, join link |
| Dialog `md` | 560 | Create workspace, regenerate notes |
| Dialog `lg` | 720 | Add episodes, compile |
| Alert dialog | 400 | Destructive confirmation only |
| Right sheet | 480 | Model picker, asset detail, notifications |
| Left sheet | 272 | Mobile navigation |
| Bottom sheet | auto | Mobile filters, mobile Director |
| Popover | 256–340 | Workspace switcher, settings, language |

Rules:
- Overlay `--scrim` + 5px backdrop blur.
- Title 16–17px semibold; description 13px muted; body scrolls; footer right-aligned.
- Destructive dialogs focus Cancel first, use a red action, and name the object (`Delete "Monsoon Kitchen"?`).
- Esc closes non-destructive dialogs; destructive dialogs require an explicit choice (Esc = cancel).
- Focus is trapped, returns to the trigger, and never lands behind the overlay.
- Forms keep values on error; closing a dirty form asks for confirmation.
- Mobile dialogs become bottom sheets above 80dvh content.

---

## 6. Component inventory

All components live in `apps/web/src/components`. Props below are the contract, not an exhaustive implementation.

### 6.1 Foundations

| Component | Key props | States / notes |
|---|---|---|
| `BrandMark` | `size`, `animated?` | Static, hover (arm draws 120ms) |
| `Wordmark` | `height` | Expanded sidebar, auth, footer |
| `Button` | `variant`, `size`, `loading`, `iconStart`, `iconEnd`, `asChild`, `fullWidth` | Default, hover, active, focus-visible, disabled, loading, `aria-invalid` |
| `IconButton` | `label` (required), `size`, `variant`, `loading` | Tooltip below/above; 40px min target |
| `Badge` | `tone` (`neutral`, `brand`, `success`, `warning`, `info`, `danger`), `variant` (`solid`, `soft`, `tag`) | Label + optional dot; never colour-only |
| `Pill` | `children`, `tone`, `icon` | Counts, statuses, filters |
| `StatusDot` | `state` (`done`, `current`, `todo`, `pending`, `partial`, `outdated`, `failed`, `n/a`) | Always paired with text unless decorative; worst state wins: failed > outdated > partial > pending > done |
| `Avatar` | `name`, `src`, `size` | Image, gradient initial, loading |
| `Poster` | `show`, `ratio`, `size` | Image, gradient hash fallback, initials |
| `ProgressBar` | `value`, `max`, `tone`, `indeterminate` | Determinate, indeterminate, complete |
| `Meter` | `value`, `tone`, `label` | Decorative credit rule; no fake precision |
| `Skeleton` | `w`, `h`, `radius`, `count` | Static shimmer; `aria-hidden` |
| `Divider` | `orientation`, `label?` | 1px border |
| `Tooltip` | `content`, `side`, `delay` | 300ms open, 100ms close; never the only label |
| `CodeText` | `value`, `copyable` | Mono, truncate, copy toast |

### 6.2 Navigation and shell

| Component | Key props | States / notes |
|---|---|---|
| `AppShell` | `children`, `project?`, `mode` (`setup`, `studio`, `plain`) | Desktop/mobile; scroll lock |
| `Sidebar` | `expanded`, `onToggle`, `project`, `setupMode` | Expanded, collapsed, mobile sheet |
| `NavItem` | `icon`, `label`, `href`, `active`, `expanded`, `badge?`, `count?` | Default, hover, active, collapsed tooltip |
| `WorkspaceSwitcher` | `agencies`, `activeId`, `onSwitch` | Loading, open, disabled row, join dialog |
| `CreditPill` | `balance`, `held`, `canTopUp`, `expanded` | Positive, low, negative, loading |
| `ProjectSwitcher` | `project`, `projects`, `onSelect` | Poster, ratio, view-only, open, search, empty |
| `ProjectNav` | `groups`, `pathname`, `statuses` | Setup/studio variants |
| `RecentShows` | `shows`, `max` | Loading, empty hidden, overflow |
| `MobileTopBar` | `onMenu`, `credits` | Menu open state |
| `Tabs` | `items`, `value`, `onChange`, `variant` (`underline`, `segmented`) | Active, disabled, overflow scroll |
| `Stepper` | `steps`, `current`, `orientation` | Done, current, todo, clickable done |
| `Breadcrumb` | `items` | Truncation, mobile collapse |
| `PageHeader` | `title`, `description`, `actions` | Responsive wrap |
| `SettingsTabs` | `active`, `orgOnly` | Scrollable mobile |
| `SettingsPopover` | `user`, `workspace`, `theme`, `onNavigate` | Appearance, install states, profile |
| `NotificationSheet` | `items`, `unread`, `onReadAll` | Unread/all, empty, clear |
| `GuidePanel` | `stops`, `open`, `onClose` | Docked, mobile sheet, closed, restored |

### 6.3 Inputs

| Component | Key props | States / notes |
|---|---|---|
| `Field` | `label`, `hint`, `error`, `required`, `children` | Error association via `aria-describedby` |
| `Input` | `size`, `invalid`, `prefix`, `suffix`, native props | Default, focus, invalid, disabled, read-only |
| `Textarea` | `autoGrow`, `maxLength`, `showCount`, `mono` | Count, over-limit, invalid |
| `Select` | `options`, `value`, `placeholder`, `groups` | Open, searchable variant, empty |
| `SearchField` | `value`, `onChange`, `placeholder`, `shortcut?` | Clear button, `/` focus |
| `OTPInput` | `length=4`, `value`, `onChange`, `autoSubmit`, `invalid` | Empty, partial, complete, error, disabled |
| `FileDrop` | `accept`, `maxSize`, `multiple`, `onFiles` | Idle, drag-over, reading, error, disabled |
| `FileChip` | `name`, `size`, `status`, `onRemove` | Reading, ready, error |
| `RadioCard` | `title`, `description`, `meta`, `selected` | Selected, disabled, focus |
| `Checkbox` | `checked`, `indeterminate` | Default, checked, mixed, disabled |
| `Switch` | `checked`, `label` | On, off, disabled |
| `SegmentedControl` | `options`, `value` | Selected, disabled, keyboard arrows |
| `Slider` | `min`, `max`, `step`, `value`, `onChange` | Hover expands track, focus ring, disabled |
| `NumberStepper` | `value`, `min`, `max`, `step` | Buttons + input |

### 6.4 Data display

| Component | Key props | States / notes |
|---|---|---|
| `Card` | `padding`, `interactive`, `selected` | Default, hover, selected, disabled |
| `SettingsCard` | `title`, `description`, `actions`, `children` | Header + body + footer |
| `DefinitionList` | `items` (`label`, `value`, `copyable`) | Empty value `—`, copy |
| `StatCard` | `label`, `value`, `delta?`, `tone` | Loading skeleton |
| `DataTable` | `columns`, `rows`, `sort`, `selection`, `empty` | Loading, empty, error, sorted, selected |
| `Pagination` | `page`, `pageSize`, `total`, `onPage` | Newer/older, disabled edges |
| `EmptyState` | `icon`, `title`, `body`, `action`, `secondary` | Compact and page sizes |
| `ErrorPanel` | `title`, `body`, `retry`, `tone` | Section-level, role=alert |
| `StageLoader` | `messages`, `every`, `label` | Running, reduced motion, complete |
| `VideoLoader` | `ratio`, `messages`, `every` | Running, reduced motion |
| `LedgerRow` | `entry` | Expanded detail, positive/negative |
| `ShowCard` | `show`, `onOpen`, `menu` | Poster, status, progress, hover |
| `EpisodeRow` | `episode`, `active`, `status`, `draggable` | Active, dragging, disabled |
| `AssetRow` / `AssetTile` | `asset`, `selected`, `status` | Locked, missing, generating |
| `ShotRow` / `ShotCard` | `shot`, `status`, `selected` | Outdated, failed, selected |
| `CreditPackCard` | `pack`, `selected`, `currency` | Base, bonus, recommended, selected |
| `LookCard` / `StyleCard` | `look`, `selected`, `suggested` | Selected, hover, loading |
| `ModelCard` | `model`, `selected`, `recommended`, `type` | Selected, disabled, anchors |
| `CreditAmount` | `amount`, `plain`, `compact` | Exact, compact, negative |

### 6.5 Overlays

| Component | Key props | States / notes |
|---|---|---|
| `Dialog` | `open`, `title`, `description`, `size`, `footer` | Enter/exit, scroll body, focus trap |
| `AlertDialog` | `title`, `body`, `confirmLabel`, `destructive` | Cancel focused, red action |
| `Sheet` | `side`, `width`, `title` | Left/right/bottom, drag on mobile |
| `Popover` | `trigger`, `align`, `width` | Open, collision, focus return |
| `DropdownMenu` | `items`, `groups`, `destructive` | Keyboard, typeahead, disabled |
| `Toast` | `tone`, `title`, `body`, `action`, `duration` | Enter/exit, pause on hover |
| `HoverCard` | `trigger`, `content` | 700ms open, touch disabled |
| `ConfirmDialog` | `title`, `body`, `confirm`, `cancel` | Thin wrapper over AlertDialog |

### 6.6 Studio components

| Component | Key props | States / notes |
|---|---|---|
| `ScriptComposer` | `value`, `files`, `options`, `onAnalyse`, `pending` | Empty, drag, reading, over-limit, no credits |
| `AnalysisProgress` | `stage`, `messages`, `onCancel` | Running, cancelling, failed |
| `SplitSummary` | `source`, `method`, `episodes`, `duration` | Loading, single episode |
| `EpisodeList` | `episodes`, `activeId`, `onReorder` | Drag, keyboard move, disabled |
| `ScriptReader` | `content`, `editable`, `onSave` | Read, edit, saving, frozen |
| `LookGrid` | `looks`, `selected`, `onSelect` | Loading, empty, search |
| `ModelSheet` | `type`, `options`, `current`, `onUse` | Search, filters, no match |
| `EnhancementPane` | `title`, `content`, `status`, `actions` | Read, edit, generating, empty, error |
| `CastList` | `assets`, `activeId`, `selection` | Grouped, bulk, empty |
| `AssetDetail` | `asset`, `onGenerate`, `onLock` | Prompt, variants, voice, locked |
| `ProductionStepRail` | `steps`, `current`, `statuses` | Vertical/horizontal, outdated |
| `DirectorPanel` | `messages`, `onSend`, `context`, `pending` | Streaming, error, collapsed |
| `SceneAccordion` | `scenes`, `onEdit` | Expanded, dirty, outdated |
| `VariantGrid` | `variants`, `primaryId`, `onSelect` | Generating, failed, compare |
| `ShotDrawer` | `shot`, `onSave`, `onGenerate` | Dirty, generating, continuity warning |
| `TakeCard` | `take`, `selected`, `onSelect` | Poster, playing, selected, failed |
| `CompilationList` | `items`, `onOpen` | Empty, processing, ready, failed |
| `GenerationQuote` | `action`, `count`, `unitCost`, `balance` | Ready, insufficient, settling |
| `PaymentModal` | `order`, `status`, `onCheck` | Opening, pending, success, failure |
| `InviteDialog` | `onInvite`, `roles` | Form, sent, error |

### 6.7 Marketing and auth components

| Component | Key props | States / notes |
|---|---|---|
| `FloatingNav` | `activeSection`, `signedIn`, `onMenu` | Transparent, scrolled solid, mobile sheet |
| `PromptComposer` | `mode`, `value`, `onStart` | Idle, focused, typing, submitting |
| `WorkflowRow` | `index`, `title`, `body`, `visual`, `flip` | Static, reveal-on-scroll |
| `PosterRail` | `items`, `onOpen` | Loading, empty, dragging, edge fades |
| `FeatureVideoCard` | `video`, `title`, `duration` | Poster, playing, reduced motion |
| `QuoteCarousel` | `quotes`, `index`, `onChange` | Auto, paused, keyboard, reduced motion |
| `ReferralTiers` | `tiers`, `progress` | Locked, current, complete |
| `PressMarquee` | `items` | Animated, reduced motion static |
| `AuthShowreel` | `items`, `index` | Loading, playing, fallback poster |

### 6.8 Editor components

| Component | Key props | States / notes |
|---|---|---|
| `EditorShell` | `episode`, `onSave`, `onCompile` | Loading, ready, error, narrow-screen |
| `MediaLibrary` | `tab`, `items`, `onAdd` | Takes/Clips/Images/Audio, search, drag |
| `PreviewCanvas` | `ratio`, `playing`, `timecode`, `safeAreas` | Empty, playing, paused, fullscreen |
| `TransportBar` | `playing`, `current`, `total`, `volume` | Disabled, scrubbing |
| `Inspector` | `selection`, `onChange` | Clip, canvas, multi-select |
| `Timeline` | `tracks`, `zoom`, `playhead`, `snapping` | Empty, dragging, trimming, locked track |
| `Track` | `type`, `muted`, `locked`, `clips` | Video, audio, text, image, effect |
| `Clip` | `clip`, `selected`, `onTrim`, `onMove` | Selected, trimming, snapping, error |
| `CompileDialog` | `range`, `settings`, `onCompile` | Form, progress, success, failure |

---

## 7. Responsive behaviour

### 7.1 Breakpoints

| Name | Min width | Shell |
|---|---|---|
| Base | 0 | Mobile top bar + sheet |
| `sm` | 640 | 2-column cards, wider dialogs |
| `md` | 768 | Desktop sidebar, project bar 56 |
| `lg` | 1024 | Split auth, 3-pane studio, settings tables |
| `xl` | 1280 | Production vertical rail, 4-column model grids |
| `2xl` | 1536 | Wider marketing gutters |

### 7.2 Per-area rules

| Area | Mobile | Tablet | Desktop |
|---|---|---|---|
| Marketing nav | Monogram + CTA + menu sheet | Full links, no utility divider | Floating glass nav |
| Hero | 30–40px headline, composer full width | 48–60px | 76px, 900px hero |
| Workflow rows | Stacked visual after copy | Alternating 2-col | Alternating 2-col, 1200 max |
| Poster rails | 1.6 cards visible, snap | 3 cards | 4–5 cards |
| Auth | Form only; showreel hidden | Form only | 50/50 split |
| Home composer | Full width, footer stacks | 640 centered | 880 centered |
| Shows | 2 columns | 3 | 4–5 |
| Settings | Tabs scroll; cards stack | 2-column stat rows | 880, tables |
| Billing | Snap rail, 1.2 cards | 2–3 cards | 4 cards + summary |
| Usage | Cards, filters sheet | Table with horizontal scroll | Full table |
| Script split | Segmented list/script | List 280 + reader | List 320 + reader |
| Pick cards | 2 columns | 2–3 | 3 |
| Enhancement | Tabs Original/Shoot-ready | 2 panes, rail 240 | 3 panes, rail 280 |
| Cast | List → detail sheet | List 320 + detail | List 360 + detail |
| Production | Horizontal step scroll; Director sheet | Horizontal rail | Vertical rail at `xl` |
| Storyboard | 1 card per row | 2 | 3–4 |
| Editor | Blocking notice | Blocking notice | Full ≥1280; inspector sheet 1024–1279 |
| Tables | Card rows | Scroll container | Full table |

### 7.3 Rules

- No horizontal page scroll at 360px except intentional rails, timelines and data tables (inside their own scroll container).
- Touch targets are 44×44 minimum on mobile; desktop controls may be 32–36.
- Sticky footers must not cover the last row: add `padding-bottom: calc(footer + 16px)`.
- Truncate one line with ellipsis and a `title`; never truncate a primary action.
- Dialogs are viewport-bounded: `max-height: calc(100dvh - 32px)`.
- Charts and timeline are exempt from the 44px rule where precision matters; provide zoom and keyboard alternatives.

---

## 8. Keyboard and accessibility

### 8.1 Global

- Skip link to `#main` is the first tab stop; visible on focus.
- One `h1` per screen; landmarks `header`, `nav`, `main`, `aside`, `footer`.
- Focus ring: 3px brand at 50% opacity, 1px offset; never remove without replacement.
- `Esc` closes the topmost overlay; focus returns to the trigger.
- `Tab` order follows visual order. No positive `tabindex`.
- Route changes move focus to the page `h1` or main container and announce the page name.
- Tooltips are supplementary; every icon-only button has an `aria-label`.

### 8.2 Shell and navigation

- Sidebar is a `nav` with an accessible name.
- Nav items are links when they navigate, buttons when they act. `aria-current="page"` on the active route.
- Collapse button has `aria-expanded`; collapsed labels are still available to screen readers.
- Workspace switcher: menu button + `aria-haspopup="menu"`; arrow keys, Home/End, typeahead, Enter, Esc.
- Credit pill has an accessible description with exact credits; the decorative meter is `aria-hidden`.
- Notifications sheet: `aria-label="Notifications"`, tabs with `role=tablist`, unread count in the tab name.

### 8.3 Screen-specific

| Screen | Keys |
|---|---|
| Login / OTP | `Enter` submits; OTP digits auto-advance; `Backspace` moves back; `←/→` move; paste fills; `Esc` clears error |
| Script split | `↑/↓` or `←/→` switch episodes when the list has focus; `Alt+↑/↓` reorder; `PageUp/PageDown` scroll reader; `Cmd/Ctrl+S` save |
| Enhancement | `←/→` switch episodes when not in a field; `Cmd/Ctrl+S` save draft; `Esc` cancels edit |
| Cast | `↑/↓` move list; `Enter` opens detail; `Space` toggles selection; `L` locks/unlocks when detail focused |
| Production | `[` / `]` previous/next step; `Cmd/Ctrl+Enter` runs the next step |
| Storyboard | Arrow keys move shot focus; `Enter` opens drawer; `Space` previews |
| Editor | See §8.4 |
| Tables | Arrow keys move cells/rows; `Space` selects; `Enter` opens; header buttons sort |

### 8.4 Editor shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `J` / `K` / `L` | Reverse / pause / forward (repeat ×2, ×4) |
| `←` / `→` | Step 1 frame |
| `Shift+←` / `Shift+→` | Step 1 second |
| `Home` / `End` | Timeline start / end |
| `I` / `O` | Set clip in / out at playhead |
| `S` | Split at playhead |
| `Delete` / `Backspace` | Ripple delete selection |
| `Shift+Delete` | Lift clip and leave a gap |
| `Cmd/Ctrl+Z` | Undo |
| `Shift+Cmd/Ctrl+Z` | Redo |
| `Cmd/Ctrl+D` | Duplicate clip after itself |
| `Cmd/Ctrl+A` | Select all clips on the focused track |
| `Esc` | Clear selection / close overlay |
| `+` / `−` | Zoom timeline |
| `Z` | Fit timeline |
| `Shift+Z` | Zoom to selection |
| `N` | Toggle snapping |
| `M` | Mute selected clip/track |
| `T` | New text clip at playhead |
| `G` | Toggle safe-area guides |
| `F` | Fullscreen preview |
| `Cmd/Ctrl+B` | Toggle library rail |
| `Cmd/Ctrl+Enter` | Compile |
| `Cmd/Ctrl+S` | Force save |
| `[` / `]` | Previous / next marker |
| `Alt+drag` | Disable snapping / ripple trim |

The full map, including marker and multi-select edge cases, lives in `VIDEO-EDITOR-SPEC.md` §14.

Do not bind single-letter shortcuts while a text field is focused.

### 8.5 Accessibility checklist

- Body text contrast ≥ 4.5:1; large text ≥ 3:1. `--subtle` is not used for essential copy.
- Primary gradient buttons carry an 18% dark scrim to keep white labels ≥ 4.5:1.
- Status uses dot + label, never colour alone.
- Form errors are linked with `aria-describedby` and announced.
- Loading regions use `aria-busy`; progress uses `role=progressbar` with values where known.
- Video has captions and a transcript where speech exists; decorative loops are `aria-hidden`.
- Images have meaningful alt or empty alt.
- The app works at 200% zoom and 320px width without loss of function.
- `prefers-reduced-motion` stops loops, shimmers and parallax; no essential information is motion-only.
- Screen-reader pass on: login, OTP, composer, script split, enhancement, billing, invite, editor and timeline.
- Focus is never trapped in a hidden panel; closed sheets remove descendants from the tab order.

---

## 9. Content rules

### 9.1 Voice

- Calm, specific, studio-literate. Short sentences.
- Functional labels are Title Case (`Pick a look`, `Add episodes`); helper text is sentence case.
- No exclamation marks. No hype in the product UI.
- Never blame the user: `That code didn't match` not `You entered the wrong code`.
- Never promise what the replica cannot do: no real payments, no real provider calls.

### 9.2 Microcopy formulas

| Type | Formula | Example |
|---|---|---|
| Button | Verb + object | `Generate plan`, `Invite member` |
| Field hint | What it changes + constraint | `Used on every poster. 2–80 characters.` |
| Inline error | What happened + how to fix | `That email is already invited. Resend it instead.` |
| Empty | What belongs here + next action | `No frames yet. Generate the missing shots.` |
| Loading | Phase + reassurance | `Finishing the take. You can leave this page.` |
| Destructive | Object + consequence + undoability | `Delete "Monsoon Kitchen"? This can't be undone.` |
| Credit | Amount + what it buys + when charged | `This batch uses 31.35 credits. Charged as each item finishes.` |
| Success | Object + state | `Episodes saved` |

### 9.3 Marketing rewrite rules

- Keep the information architecture; replace the words.
- No claims about real funding, real studios, real viewership or real awards.
- Use fictional sample series and people, labelled as sample content in the footer.
- Prefer concrete product language over manifesto language.
- Every headline must be true of the replica.

Examples of acceptable original copy:

- Hero: `One line in. A season out.`
- Workflow: `From a rough scene to a cut you can watch.`
- Fund: `A first-look fund for new voices.`
- Pricing: `Buy credits when you need them.`
- Referral: `Invite a studio. Both sides get credits.`

### 9.4 Capitalisation and punctuation

- Product name `Kronicle` in prose; `KRONICLE` only in a logo lockup.
- `Shoot-ready` is hyphenated as an adjective; `shoot-ready scripts` lowercase in a sentence.
- `Cast & places` uses an ampersand; never `Cast and Places`.
- `EP 01` with a space; `9:16` with a colon.
- Use the Oxford comma only in marketing, not in dense UI.
- Avoid em dashes in buttons and labels.

### 9.5 Localisation

- All strings externalised from day one; no concatenated sentences.
- Support English, Hindi, Chinese, Korean, Portuguese, Spanish, German at the shell level in phase 2; content can fall back to English.
- Screenplay readers use the script font only for Latin; Indic text uses Noto with 1.6 line height.
- Number, date and currency formatting comes from `Intl`, never string templates.
- RTL is out of scope for MVP; do not ship half-mirrored layout.

---

## 10. Build order

### Phase 0 — Tokens and primitives (2–3 days)

Deliverables: token CSS, theme provider (light/dark/auto), font loading, Button, IconButton, Input, Textarea, Select, Field, Badge, Pill, Avatar, Poster, Skeleton, ProgressBar, Tooltip, Card, Dialog, AlertDialog, Sheet, Popover, DropdownMenu, Toast.

Exit: a `/design` route (dev only) renders every primitive in every state in both themes; visual regression snapshots exist.

### Phase 1 — App shell (3–4 days)

Deliverables: AppShell, Sidebar, mobile sheet, WorkspaceSwitcher, CreditPill, ProjectBar, ProjectNav, RecentShows, Notifications, Settings popover, route guard, error slate, empty state.

Exit: any placeholder route renders inside the shell at 360, 768, 1024 and 1440; keyboard pass on nav, switcher and notifications.

### Phase 2 — Auth and onboarding (3 days)

Deliverables: marketing-lite auth shell, Login, OTP, Onboarding, invite acceptance shell, session refresh handling, dev OTP chip.

Exit: sign-up → onboarding → home with mock OTP; wrong code, expired code and lockout states; invite token accepted with the right and wrong account.

### Phase 3 — Home, shows, settings general (4 days)

Deliverables: Home composer, file reading, sample shows, analysis progress, Shows grid/list, show menu, settings shell and General, appearance.

Exit: create a show from paste and from file; rename, move and delete; appearance persists; empty and error states.

### Phase 4 — Setup flow (5 days)

Deliverables: Script split, Add episodes, Pick look, Pick director, Pick models, setup stepper, leave-setup guard, shared choice cards.

Exit: a new show reaches Shoot-ready; look/style lock; models can change; all four steps survive refresh and deep links.

### Phase 5 — Enhancement and Cast (5 days)

Deliverables: Shoot-ready three-pane, generation polling, source switching, regenerate dialog, Cast & places list/detail, batch steps, lock states, asset extraction progress.

Exit: originals path and shoot-ready path both reach a fully locked cast; extraction gate is enforced; viewer cannot generate.

### Phase 6 — Production steps 1–4 (6 days)

Deliverables: Production shell, episode picker, step rail, Director shell, Script, Script assets, Plan, Asset Variants.

Exit: a locked cast produces a plan and a primary variant for every required asset; outdated states appear after regeneration; costs are quoted before every batch.

### Phase 7 — Storyboard, Video, Editor (8 days)

Deliverables: Storyboard grid/table/drawer/preview, Video takes and selection, audio panel, Editor shell, timeline integration, compile dialog and progress.

Exit: shots get frames and takes; every shot has a selected take; timeline trims, splits and reorders; compile produces an MP4 in the mock pipeline; editor load failure state verified.

### Phase 8 — Team, billing, usage, invite (4 days)

Deliverables: Team tables and invite flow, Billing packs and payment modal, Usage ledger, Invite page, role gating.

Exit: admin buys mock credits and balance updates; editor cannot pay; viewer sees read-only; ledger reconciles hold/settle; invite role is applied.

### Phase 9 — Marketing and pricing (4 days)

Deliverables: marketing home sections, pricing, legal/support, showreel placeholders, responsive and reduced-motion variants.

Exit: Lighthouse performance ≥ 90 on desktop with posters optimised; no copied copy or assets; all CTAs route correctly.

### Phase 10 — Hardening (3 days)

Deliverables: full empty/error/loading audit, keyboard audit, screen-reader pass, contrast fixes, 320px audit, reduced motion, seeded demo data, screenshots, walkthrough.

Exit: `pnpm dev` demo path completes end to end; every screen has a screenshot at 390×844 and 1440×900; the acceptance checklist below passes.

### Dependency notes

- Billing can be built in parallel with phase 6 once the wallet API is stable; the shell credit pill depends on wallet queries.
- The editor depends on storyboard/video data but not on marketing.
- Marketing can start after tokens and run in parallel with phases 4–8; it must not block the app.
- Invite acceptance depends on auth and workspace APIs; build the page early, wire it in phase 8.

---

## 11. Acceptance checklist

- [ ] Every route in §1.1 renders with a real state, not a placeholder.
- [ ] Dark, light and auto themes pass contrast and show no flash on load.
- [ ] Sidebar collapses, persists and works as a mobile sheet.
- [ ] Workspace switch invalidates project data and cannot cross tenants.
- [ ] Credit pill shows exact balance, compact balance, low and negative states.
- [ ] A new user completes: login → onboarding → script → split → look → style → models → shoot-ready → cast → production → storyboard → video → editor → compile.
- [ ] Every generation action shows its credit cost before running.
- [ ] Every destructive action has a named confirmation and a safe default.
- [ ] Every list has loading, empty, error and search-empty states.
- [ ] Every async action has pending, success and failure feedback.
- [ ] Viewer, editor and admin each see the correct actions; hidden means not rendered.
- [ ] No screen scrolls horizontally at 360px except intentional rails/tables/timeline.
- [ ] The editor is usable at 1024px with the inspector sheet and blocks below with a clear explanation.
- [ ] Reduced motion removes all non-essential animation.
- [ ] Keyboard-only completion of login, OTP, script split and invite.
- [ ] Screen-reader labels exist for icon-only controls, progress and status.
- [ ] Marketing contains no copied copy, real studio names, real quotes or unlabelled claims.
- [ ] All sample content is labelled as demo in the footer and onboarding.
- [ ] `docs/VIDEO-EDITOR-SPEC.md` and this file agree on editor chrome and shortcuts.
- [ ] Screenshots for every screen are stored with the release.

---

*End of UI specification.*
