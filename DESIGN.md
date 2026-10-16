# Vibe Vault — Product & Interface Design

This document describes the interface and design patterns currently implemented in Vibe Vault. The codebase is the source of truth when a detail here and a rendered component differ.

## Product character

Vibe Vault is a Korean-first, privacy-conscious personal finance app that brings asset tracking, spending insights, and transaction entry into one compact experience. Its visual direction is dark, quiet, and information-dense: an obsidian canvas, soft glass-like panels, fine borders, restrained motion, and aligned financial figures.

The interface favors quick mobile use over a wide desktop dashboard. It uses a deliberately narrow app frame, persistent bottom navigation, and a shared natural-language entry point. Financial privacy is also a visible interaction: users can mask amounts and protect the vault with a PIN and auto-lock.

## App frame and navigation

- The app fills the viewport and centers a single-column frame capped at `440px`. On wider screens, the surrounding canvas remains near-black and the app frame has subtle side borders and shadow.
- The frame is a vertical layout: a compact `64px` header, a scrollable content region, and a persistent bottom dock.
- The header shows the Vibe Vault name and opens Settings. The main sections are **자산** (Vault), **인사이트** (Insights), and **장부** (Ledger).
- The bottom dock keeps the AI omnibar available in every section, above the three-item tab navigation. Touch swipes between sections are supported; inputs, buttons, and horizontal scrollers are excluded from swipe handling.
- The selected section is remembered as the default launch screen. The currently selected space is also persisted locally.
- Content should remain usable in the narrow frame: use compact labels, wrapping or horizontal scrolling for filter rows, and fluid type and spacing where appropriate.

## Color and surfaces

The app is dark-only. `src/index.css` defines shared surface and accent variables; individual components also use Tailwind color utilities and some explicit color values. Treat the values below as the implemented palette, not a guarantee that every component uses a single token.

| Role | Current treatment |
| --- | --- |
| Outer canvas | `#07080A` |
| App and page canvas | `#090A0D` |
| Raised glass surface | `rgba(18, 19, 24, 0.9)` or a subtle white overlay such as `rgba(255, 255, 255, 0.03)` |
| Inset surface | `rgba(0, 0, 0, 0.35)` |
| Hairline borders | White at roughly 4–8% opacity |
| Primary text and primary actions | White; primary buttons use a white fill with dark text |
| Supporting text | Neutral and slate grays |
| Positive / confirmation | Emerald |
| Financial data and balances | Sky blue is common; blue also marks selected asset navigation and internal transfers |
| Insights navigation and analytical suggestions | Indigo |
| Caution and notes | Amber |
| Destructive or risk states | Rose |

Color is used as a functional cue rather than being fully monochrome. Keep routine surfaces neutral; reserve colored text, borders, and soft fills for categories, selected states, transaction meaning, chart series, and alerts. The implemented interface includes rounded filter pills, suggestion chips, and status badges, so these are appropriate when they carry an action or state.

Common raised surfaces use translucent dark fills, a soft blur, a low-contrast border, and sometimes an inset top highlight. Cards are typically rounded-xl to rounded-3xl. Use separation and spacing before adding stronger shadows or nested card layers.

## Typography and data legibility

- The app loads **Plus Jakarta Sans** and **Inter**, with system sans-serif fallbacks. Body text uses a slightly tightened letter spacing and platform antialiasing.
- Shared fluid type classes scale from phone-sized layouts: hero values are approximately `28–36px`, titles `16–20px`, body copy `13–15px`, and captions `11–12px`.
- Keep labels quiet and compact; use weight and contrast to establish hierarchy instead of oversized headings.
- Apply tabular numerals to currency, balances, percentages, dates, and other values that users compare.
- Preserve the user’s currency and sign conventions. Secondary-currency comparisons use a quieter, smaller line beneath the primary amount when enabled.
- Stealth mode blurs sensitive amounts while keeping the surrounding layout and labels visible.

## Interaction patterns

### Actions and controls

- Primary save, add, confirm, and report actions generally use a white fill, dark text, and a rounded-xl shape.
- Secondary actions use a transparent or low-opacity white fill with a subtle border. Hover and press feedback is brief and restrained.
- Destructive actions use rose-toned styling and should remain visually distinct from routine controls.
- Filters and compact choices use rounded-full chips with a quiet inactive state and a brighter, lightly filled selected state.
- Form fields use dark inset surfaces, subtle borders, and clear focus contrast. Number inputs do not show browser spin buttons.
- Provide clear empty, loading, error, offline, and confirmation states where the flow needs them. Toasts and inline messages use compact text and an appropriate semantic accent.

### Modals and motion

- Modal backdrops use a dark scrim and blur. Dialogs use a dark raised surface, a fine border, rounded corners, and a compact header with a quiet close action.
- On small screens, dialogs commonly enter as bottom sheets with a rounded top edge and a short drag-handle cue; on larger screens they are centered.
- Motion is short and functional: fade/slide transitions for overlays, subtle active-scale feedback for buttons, and no prolonged decorative animation.
- Maintain visible focus states, accessible labels for icon-only controls, and readable contrast over translucent surfaces.

### Shared entry dock

The AI omnibar is the primary transaction and query entry point. It adapts its prompt to the selected section and supports:

- Natural-language transaction entry, with quick suggestions shown when the field is focused.
- Voice input, receipt scanning, and a currency-cycle action.
- Visible processing, offline, and error feedback. The dock has a real-time preview presentation slot, but the current app shell does not pass preview data to it.
- Financial questions in Insights, including suggested analytical queries.

The omnibar should remain visually distinct from the tab bar without obscuring scrollable content or the final list items.

## Main sections

### 자산 — Vault

The Vault presents a net-worth summary, totals for assets and liabilities, and portfolio allocation across tracked categories such as brokerage, bank, crypto, cash, real estate, and liabilities. Below the overview, users can filter and manage accounts, inspect holdings and credit-card activity, edit balances, add accounts, and transfer funds between their own accounts. Asset screenshot scanning is also available.

This is the most privacy-sensitive dashboard: support stealth masking for balances and holdings, show currency clearly, and keep high-level totals easy to scan.

### 인사이트 — Insights

Insights combines monthly/category spending analysis with charts and an AI financial diagnosis. It also presents cash-flow trends and forecasts, detected subscriptions, and a transient AI briefing when a user runs a natural-language financial query. Chart and metric colors may be more varied than the base shell to distinguish data series; keep surrounding surfaces subdued and labels legible.

### 장부 — Ledger

The Ledger starts with a monthly spending summary and comparison. The default everyday space and user-created project/event spaces share the screen; project spaces can include a budget, participant count, per-person share, and settlement report.

Transactions are displayed as a compact feed with description, category, payment method, date, and a right-aligned tabular amount. Income, expense, internal transfer, and settlement have distinct signs or semantic cues. Users can filter by transaction type or category, export the current filtered space as CSV, and open a transaction to edit or delete it. Empty spaces offer receipt scanning, sample data where applicable, and example natural-language entries.

### Settings and privacy

Settings groups controls into **스마트 자산**, **AI 엔진**, **일반 설정**, and **데이터 관리**. Depending on the tab, users can manage accounts, budgets, subscriptions, AI configuration, currencies and preferences, launch section, auto-categorization, stealth mode, PIN/auto-lock, and encrypted backup/restore.

The product supports local persistence, but some AI and exchange-rate flows can use server endpoints or configured providers. Privacy copy should describe the specific action and data handling; do not imply that every feature is permanently offline or that cloud processing never occurs.

## Responsive and accessibility considerations

- Design for the `360–440px` phone range first, then retain a centered, capped frame on larger viewports.
- Account for the on-screen keyboard, safe areas, and the fixed bottom dock. Keep scroll regions bounded to the app frame.
- Keep touch targets and modal actions usable on small screens. Prefer bottom sheets on mobile and centered dialogs on larger screens.
- Keep labels and controls understandable without color alone; retain text or icon cues for income, expense, transfer, settlement, selection, and warnings.
- Preserve semantic buttons, labels, status announcements, and accessible names for icon-only actions.
- Scrollbars are intentionally subtle and narrow; do not make essential navigation depend on scrollbar visibility.

## Implementation references

- Global layout, section routing, fixed navigation, and the omnibar dock are composed in `src/App.tsx`.
- Global color, typography, fluid sizing, glass surfaces, and scrollbar styling live in `src/index.css`.
- Main screen patterns are implemented in `src/components/VaultOverviewSection.tsx`, `src/components/InsightsSection.tsx`, `src/components/FinancialSummaryCard.tsx`, and `src/components/OmnibarDock.tsx`.
- Theme behavior and preference defaults are defined in `src/utils.ts`; the supported theme is currently dark.
