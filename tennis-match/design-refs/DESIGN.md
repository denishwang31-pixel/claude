---
name: Courtside Precision
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#3f4944'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#6f7a73'
  outline-variant: '#bec9c2'
  surface-tint: '#0f6b4f'
  primary: '#00513a'
  on-primary: '#ffffff'
  primary-container: '#0e6b4f'
  on-primary-container: '#97e8c5'
  inverse-primary: '#86d7b4'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#00513b'
  on-tertiary: '#ffffff'
  tertiary-container: '#216a52'
  on-tertiary-container: '#9fe7c8'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#a1f3cf'
  primary-fixed-dim: '#86d7b4'
  on-primary-fixed: '#002115'
  on-primary-fixed-variant: '#00513a'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#a9f1d2'
  tertiary-fixed-dim: '#8ed5b7'
  on-tertiary-fixed: '#002116'
  on-tertiary-fixed-variant: '#00513b'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 44px
    letterSpacing: -0.02em
  display-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '800'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '500'
    lineHeight: 26px
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.25rem
---

## Brand & Style
The design system reflects the disciplined elegance and brisk energy of modern tennis club culture. It serves affluent, active club players—particularly those aged 35 to 60—who require effortless outdoor readability in direct sun on the court. 

The aesthetic is Modern High-Contrast Minimalist infused with tactile, sporty refinement. It balances the timeless prestige of traditional lawn and clay courts with modern athletic luxury. The interface evokes confidence, exclusivity, athletic vigor, and absolute ease. Visual elements feature clean surfaces, expansive white and light-gray space, deep forest greens, and bright lime accents reminiscent of crisp court markings and tennis balls.

## Colors
The palette is built around high-contrast optical clarity under bright sunlight, paired with deep court tones:

- **Primary (`#0E6B4F`)**: Deep Court Forest Green. Anchors primary calls to action, active navigation markers, and brand hallmarks with a sophisticated, grounded authority.
- **Secondary (`#10B981`)**: Vibrant Court Accent. Used for focal highlights, state indicators, and active tennis match tags.
- **Tertiary (`#8FD6B8`)**: Energetic Lime Mint. Applied to sub-badges, pill accents, and focused focus-rings to bring contemporary vitality.
- **Neutral (`#0F172A`)**: Dark Ink Charcoal. Provides WCAG AAA-compliant text readability on bright backgrounds.
- **Neutral Secondary (`#475569`)**: Slate. Serves placeholder labels, helper text, and secondary metadata without visual clutter.
- **Surface Background (`#F8FAFC`)**: Clean Modern Light Gray. Reduces glare compared to blinding white while keeping the overall feel open and light.
- **Surface Elevated (`#FFFFFF`)**: Pure crisp white for cards, sheets, and active input containers.
- **Border Default (`#E2E8F0`)**: Subtle structure line that maintains definition without visual noise.

Third-party authentication palettes adhere to verified brand guidelines:
- **Kakao**: Background `#FEE500`, Text/Icon `#191919`.
- **Naver**: Background `#03C75A`, Text/Icon `#FFFFFF`.
- **Apple**: Background `#000000`, Text/Icon `#FFFFFF`.

## Typography
The system employs `Plus Jakarta Sans` for athletic display elements and English branding, complemented by `Inter` (with systemic fallbacks to Pretendard for native Korean glyphs) for all body text, numeric inputs, and interface labels. 

To ensure readability for players checking devices court-side under harsh ambient light:
- Base body scale starts at a generous 15px/17px.
- Weights skew toward medium (`500`) and semibold (`600`) to counteract glare and thin-stroke vanishing.
- Korean text pairings inherit identical line-height metrics to prevent clipping during dual-language localization.

## Layout & Spacing
The layout follows a mobile-first, edge-to-edge architecture optimized for portrait orientation, with a fluid grid that maintains structural limits on tablets.

- **Mobile (<640px)**: A 4-column layout with `1.25rem` (20px) outer margins and `1rem` (16px) gutters. Elements prioritize thumb-reach zones in the lower two-thirds of the screen.
- **Tablet / Large Mobile (≥640px)**: Form layouts are capped at a centered max-width of `440px` to maintain a streamlined flow without line elongation.

Spacing uses an 8pt base grid (`0.5rem` step). Vertical rhythms around forms and auth stacks are kept spacious (`space-lg` to `space-xl`) to eliminate mis-taps.

## Elevation & Depth
The system achieves depth through low-contrast outlines combined with ambient, tinted shadows rather than heavy drop shadows:

- **Level 0 (Flat)**: Baseline canvas on `#F8FAFC`.
- **Level 1 (Card & Inputs)**: `#FFFFFF` surface enclosed by a 1px border of `#E2E8F0`. Shadow: `0 1px 3px rgba(15, 23, 42, 0.04), 0 1px 2px rgba(15, 23, 42, 0.02)`.
- **Level 2 (Interactive Floating & Modals)**: `#FFFFFF` surface with a subtle forest tint in the ambient shadow: `0 10px 25px -5px rgba(14, 107, 79, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)`.
- **Level 3 (Toasts & Overlays)**: High-emphasis elevation with crisp boundaries: `0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 10px 10px -5px rgba(15, 23, 42, 0.04)`.

## Shapes
A roundedness level of 2 (base `0.5rem` / 8px) gives the app an approachable, modern feel. Buttons and input fields use `rounded-xl` (`0.75rem` / 12px) to provide soft, tactile edges. Status tags, skill tier indicators (NTRP), and court condition pills use full capsule curvature (`9999px`) to echo the geometry of tennis balls and court lines.

## Components

### Buttons
- **Touch Target**: Strict minimum height of `56px` for primary actions and social buttons to ensure reliable outdoor and post-match tapping.
- **Primary Button**: Background `#0E6B4F`, text `#FFFFFF`, radius `14px`. Hover/Active shifts to `#0A523C`.
- **Secondary Button**: Outlined with 1.5px `#0E6B4F`, background transparent or `#FFFFFF`, text `#0E6B4F`.
- **Social Login Stack**: Full-width `54px` buttons with centered vendor icons, strong typography, and brand-compliant fills:
  - *Kakao*: `#FEE500` background, `#191919` text.
  - *Naver*: `#03C75A` background, `#FFFFFF` text.
  - *Apple*: `#000000` background, `#FFFFFF` text.

### Input Fields
- **Container Height**: `56px` minimum.
- **States**: 
  - Resting: `#FFFFFF` fill, 1.5px `#E2E8F0` border, `#0F172A` text, `#475569` placeholder.
  - Focused: 2px solid `#0E6B4F` with a soft outer ring: `0 0 0 4px rgba(16, 185, 129, 0.15)`.
  - Error: 1.5px solid `#EF4444` border accompanied by an inline icon and 13px helper text.
- **Expandable Email Section**: Smooth accordion motion with spring physics (`damping: 24`, `stiffness: 260`) for clean transitions between social and direct credentials.

### Badges & Chips
- **Pill Badges**: `28px` to `32px` height, capsule-shaped (`rounded-full`), horizontal padding `12px`.
- **Club/Skill Tag**: `#E8F8F2` fill, `#0E6B4F` label, used for NTRP levels, court surfaces, and verified member statuses.

### Cards
- **Structure**: Surface `#FFFFFF`, border 1px solid `#E2E8F0`, rounded at `16px`. Internal padding is `space-lg` (`24px`).
- **Dividers**: Clean 1px `#F1F5F9` lines with subtle centered copy (e.g., "또는" / "or continue with") to clearly separate auth methods.

### Form Toggles & Checkboxes
- **Tap Area**: `44px` invisible bounding box enclosing a `22px` visual checkbox.
- **Active State**: Solid `#0E6B4F` background with an optical white check icon.