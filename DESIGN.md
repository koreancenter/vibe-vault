# DESIGN.md: Vibe Vault — Luxury Minimalist Private Financial Safe

## 1. Design Philosophy & Foundations
- **Core Archetype**: *Haute Horlogerie & Stealth Wealth* — High-end Swiss watchmaking precision combined with cryptographic privacy vault aesthetics.
- **Visual Tenets**:
  - **Monochromatic Purity**: Pure black (`#090A0D`) to deep obsidian (`#111217`) base canvas. No unmotivated saturated colors or electric blues.
  - **Zero Visual Noise**: No flashy gradients, playful candy badges, or generic SaaS dashboard tropes.
  - **Platinum Contrast**: Primary actions and active highlights use pure platinum white (`#FFFFFF`) against obsidian, commanding authority and crisp legibility.
  - **Tactile Refinement**: Sub-pixel hairlines (`border-white/[0.07]`), smoked glass backdrops (`backdrop-blur-2xl`), and subtle micro-elevations (`shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]`).
  - **Mathematical Hierarchy**: Nested radius formula $r_{\text{inner}} = \max(0, r_{\text{outer}} - \text{padding})$, single-surface flat depth, and tabular numeric alignment (`tabular-nums`).

---

## 2. Definitive Color System & Semantic Tokens

### 2.1 Obsidian Canvas & Structural Surfaces
```css
--bg-canvas: #090A0D;            /* Absolute deep vault canvas */
--surface-modal: #111217;        /* Elevated dialog & drawer surface (smoky obsidian) */
--surface-card: rgba(255, 255, 255, 0.03);  /* Unified flat card container */
--surface-interactive: rgba(255, 255, 255, 0.06); /* Button & input background */
--surface-interactive-hover: rgba(255, 255, 255, 0.10);

--border-hairline: rgba(255, 255, 255, 0.07); /* 1px crisp separation */
--border-focus: rgba(255, 255, 255, 0.40);    /* Quiet platinum focus rim */
--border-highlight: rgba(255, 255, 255, 0.15);/* Hovered interactive edge */
```

### 2.2 Typographic Tonal Scale
```css
--text-primary: #FFFFFF;         /* 100% white for balances, headers, key numbers */
--text-secondary: #A3A3A3;       /* Neutral 400 for labels, subtitles, descriptions */
--text-tertiary: #525252;        /* Neutral 600 for timestamps, watermarks, hints */
--text-inverse: #090A0D;         /* High-contrast black for white solid buttons */
```

### 2.3 Semantic Financial & State Signals (Quiet & Restrained)
Never use high-saturation neon colors for routine spending or idle UI states.
- **Inflow / Active Safe**: Muted Emerald `#34D399` (`emerald-400`) / Subtle Glow (`rgba(52, 211, 153, 0.12)`)
- **Outflow / Routine**: Pure Neutral Slate `#FFFFFF` (Primary) / `#A3A3A3` (Secondary)
- **Budget Caution (80%–99%)**: Warm Champagne Amber `#FBBF24` (`amber-400`)
- **Overbudget / Critical Alert / Danger**: Muted Crimson Rose `#FB7185` (`rose-400`) / Destructive `#F43F5E`
- **Active Navigation / Selection**: Pure Platinum White underline or solid chip (`border-white text-white`)

---

## 3. Component Architecture & Guidelines

### 3.1 Modal & Dialog Surfaces
- **Overlay**: Deep scrim `bg-black/80 backdrop-blur-md`.
- **Window**: `bg-[#111217] border border-white/[0.08] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl sm:rounded-3xl`.
- **Header**: Minimalist title with subtle icon + quiet circular close button (`text-neutral-400 hover:text-white hover:bg-white/[0.08]`).

### 3.2 Navigation & Tab Discipline
- **Primary Modal Tabs**: Clean text with dynamic indicator (`pb-2.5 font-medium text-white border-b-2 border-white` for active, `text-neutral-400 hover:text-white border-b-2 border-transparent` for inactive).
- **Secondary / Sub-Tabs**: Refined segmented chips (`px-3 py-1 text-xs rounded-full border transition-all`). Active state: `bg-white/10 text-white border-white/20 font-medium`. Inactive: `bg-white/[0.02] text-neutral-400 border-white/[0.06] hover:text-white`.
- **Zero-Pill Discipline**: Informational metadata (counts, dates, modes) must use quiet inline text with separators (`·`), never bulky candy pills.

### 3.3 Buttons & Interactive Controls
- **Primary Action (Commit / Save / Add)**:
  - White Solid Luxury: `bg-white text-black hover:bg-neutral-200 active:scale-[0.98] font-medium rounded-xl transition-all shadow-xs`
- **Secondary / Ghost Action**:
  - `bg-white/[0.04] hover:bg-white/[0.08] text-neutral-200 hover:text-white border border-white/[0.08] active:scale-[0.98] font-normal rounded-xl`
- **Destructive Action**:
  - `bg-rose-500/10 hover:bg-rose-500/15 text-rose-400 border border-rose-500/20 active:scale-[0.98]`
- **Inputs & Textareas**:
  - `bg-white/[0.03] border border-white/10 text-white placeholder:text-neutral-600 focus:border-white/30 focus:bg-white/[0.05] rounded-xl outline-none font-sans`

### 3.4 Gauge & Metrics Display
- Progress bars and gauges use monochrome fills (`bg-white/90` or `bg-neutral-300`) with sleek track heights ($3\text{px}$–$4\text{px}$). Only shifts to amber/rose when nearing or breaching set constraints.
