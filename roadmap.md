# Vibe Vault Update & Refactoring Roadmap

This roadmap prioritizes protecting vault data and API credentials before broader cleanup. It is based on a static code review; confirm each behavior with focused tests and deployment configuration before changing production flows.

## Guiding principles

- Preserve local-first storage and existing user data; make migrations reversible or fail safely.
- Never report a successful write when encryption or persistence failed.
- Be explicit about what AI features send off-device and which party processes it.
- Keep financial calculations deterministic, tested, and clear about stale or estimated inputs.
- Refactor in small, behavior-preserving steps after the critical correctness work.

## Phase 1 — Protect vault data and credentials

### 1. Make encryption fail closed

- Change field encryption so failures reject the operation rather than returning plaintext.
- Ensure IndexedDB writes abort and surface an actionable error when encryption fails.
- Keep legacy plaintext compatibility in decryption only where required for migration; do not silently treat authentication or key errors as valid plaintext.
- Add regression tests for locked-vault writes, unavailable Web Crypto, malformed ciphertext, and tampered AES-GCM payloads.

**Done when:** sensitive fields are never newly persisted in plaintext as a result of an encryption failure, and users receive a visible error rather than a success-shaped fallback.

### 2. Define and implement safe key rotation

- Specify the intended key lifecycle for device master keys, PIN changes, PIN removal, and vault reset.
- Before replacing a key, migrate every encrypted record and encrypted credential atomically or retain a recoverable prior key until migration completes.
- Ensure interrupted migrations can resume or roll back without losing access to data.
- Add tests that populate transactions, accounts, debts, and API-key storage, then change/remove the PIN and verify all data remains readable after reload.

**Done when:** PIN setup, change, removal, and reset have tested data-preservation behavior, including a simulated interrupted migration.

### 3. Replace API-key obfuscation with authenticated encryption

- Remove XOR/fixed-seed obfuscation as a persistence mechanism; keep a narrowly scoped legacy decoder only for migration if existing users need it.
- Use the vault’s authenticated encryption for persisted keys and remove duplicate weakly encoded copies.
- Make asynchronous key upgrades race-safe with clear/replace operations so an old pending encryption cannot restore a cleared or superseded key.
- Verify that lock and guest wipe clear the in-memory key and all applicable persisted copies.

**Done when:** no current write path stores API keys using reversible obfuscation, and tests confirm save, unlock, rotate, clear, and migration behavior.

## Phase 2 — Secure and clarify AI/API boundaries

### 4. Protect backend endpoints

- **Deployment decision: local-only.** The Express API binds to loopback and rejects non-local hosts and cross-origin browser requests; remote clients are not supported.
- Add process-local rate limits and payload-size limits to AI/key-validation endpoints; return explicit 400/413/429 responses.
- Validate request shapes, supported engine providers, text/image sizes, and image MIME types server-side. Do not route non-Gemini BYOK selections through a configured Gemini server key.
- Return generic client errors; keep detailed diagnostics server-side and redact keys, prompts, and personal financial data from logs.
- Add regression coverage for input guards and rate-limit behavior; verify malformed/oversized requests and API responses without exposing upstream details.

**Done when:** only same-device clients can reach the API, costly endpoints are bounded, and responses/logs do not expose secrets or raw sensitive data.

### 5. Align privacy claims and runtime behavior

- Document separately what remains in IndexedDB, what is sent to the app backend, what is sent to Google, and what the local-only modes do.
- Correct claims that all AI requests are browser-to-Google if requests pass through the Express proxy.
- Keep deterministic parsing and WebGPU modes clearly distinguishable from cloud AI features in UI and settings.
- Review PII sanitization against realistic inputs and state its limitations; do not imply that receipt images are anonymized when sent to AI.

**Done when:** README, in-app notices, and actual request flows agree; users can make an informed choice before transmitting financial text or images.

### 6. Review deployment security headers

- Confirm which platform serves production assets and whether `public/_headers` is applied there.
- Set equivalent security headers for the Express production server or hosting platform.
- Keep Express and static-host security headers aligned. The existing `'unsafe-eval'` and `'unsafe-inline'` CSP allowances remain until browser runtime checks confirm they can be removed without breaking Vite/PWA/WebGPU features.
- Test both the root and `/vibevault` deployment paths, including AI connections, workers, and service-worker behavior.

**Done when:** production security headers are present and verified on every supported deployment path; any retained CSP allowances have a documented compatibility reason and follow-up verification requirement.

## Phase 3 — Restore confidence in financial outputs

### 7. Make FX-rate quality explicit

- **Done:** use the Frankfurter daily reference-rate API with a six-hour in-process cache and an explicit estimated-rate fallback.
- **Done:** unknown currencies now return an unavailable response and currency conversion rejects missing rates instead of substituting 1 or a generic estimate.
- **Done:** expose source, effective date, and stale/estimated status; show estimated or stale rates in a persistent app notice.
- **Done:** add tests for provider parsing, incomplete/invalid rates, stale and unavailable refreshes, conversion direction, rounding, and unknown currency rejection.

**Done when:** users can distinguish published rates from estimates, and unsupported currencies cannot silently distort totals. **Complete.**

### 8. Remove sample-data success fallbacks from real operations

- **Done:** remove fictional receipt and brokerage screenshot responses from the API.
- **Done:** image scans without cloud AI now return HTTP 503 with an actionable unavailable message; client scan paths reject any non-Gemini scan result.
- **Done:** retain local parsing only for user-provided text; the existing balance-update flow still requires an explicit confirmation action.
- **Done:** add regression coverage that rejects local/sample scan sources.

**Done when:** no real workflow can mistake demo values for scanned or user-provided financial data. **Complete.**

## Phase 4 — Simplify structure and reduce maintenance cost

### 9. Split oversized modules along behavior boundaries

- Extract Express route handlers and shared request validation from `server.ts`.
- Separate AI prompt/schema definitions from HTTP and parsing code.
- Split `financialParser.ts` by stable domains (amount/date parsing, transaction rules, receipt parsing) while preserving shared exported behavior.
- Extract focused hooks or components from `App.tsx` and `VaultOverviewSection.tsx` only where state ownership and UI responsibilities are clear.
- Keep public interfaces stable during each extraction and use existing test coverage as regression protection.

**Done when:** modules have clear responsibilities, imports remain acyclic, and targeted tests pass without user-visible behavior changes.

### 10. Remove dead code and redundant configuration

- Confirm whether `parseWithLocalRules` and other suspected unused exports are genuinely unused before removal.
- **Done:** removed the confirmed-unused `parseWithLocalRules` wrapper after checking its call sites.
- Identify compatibility aliases and duplicate constants that can be retired safely.
- Check dependency usage before removing packages; document intentional tooling-only dependencies.
- Enable unused-local/import checks after resolving existing findings rather than suppressing them broadly.

**Status:** partially complete. Existing project-wide unused-local/import diagnostics still include unrelated findings, so compiler checks remain unchanged. No dependency or compatibility alias was removed without confirming it was safe.

**Done when:** unused code and redundant dependencies are removed with type-check/build coverage and no undocumented compatibility break.

### 11. Centralize repeated policy and identifiers

- Reuse the existing financial PII sanitizer in server fallback paths instead of maintaining separate regex copies.
- **Done:** extracted the shared sanitizer into `src/piiSanitizer.ts`; both financial parsing and server fallback parsing now use it. Added coverage for account numbers and masked Korean names.
- Centralize validation for API payloads, currency codes, and image constraints so client/server rules do not drift.
- **Done:** supported FX currencies now have one shared list used by client validation and the server rate endpoint; unsupported codes are rejected before fetching rates.
- Replace weak, collision-prone `Date.now()`/`Math.random()` identifiers for persisted records with cryptographically secure IDs where supported, with an explicit compatibility strategy.
- **Done:** migrated persisted ID creation paths to `generateSecureId`, including UUID fallback through secure random bytes; added format, uniqueness, fallback, and unavailable-crypto tests.

**Status:** complete for shared PII/FX policy and persisted ID generation. API payload and image validation continue to use the existing shared server-security validators.

**Done when:** shared policies have one authoritative implementation and persisted IDs have a tested collision-resistant generation path.

### Phase 4 remaining work

- The larger route-handler, AI prompt/schema, financial-parser-domain, and focused App/Vault UI extractions in item 9 remain outstanding; keep these as separate behavior-preserving changes.

## Phase 5 — Verification and release

For each phase, run the narrowest relevant tests first, then the complete quality gates:

1. **Done:** add or update focused tests for behavior changes, including the Phase 4 sanitizer, currency validation, secure IDs, and guest-session wipe.
2. **Done:** `npm test` passes (152 tests) and `npm run lint` passes.
3. **Done:** `npm run build` passes; scanned generated production assets for common credential patterns with no matches. The existing large-bundle and empty vendor-chunk warnings remain.
4. **Partially verified:** automated migration tests cover representative transactions, accounts, debts, API-key storage, PIN transitions, and an interrupted atomic migration. A copied browser IndexedDB profile has not been tested.
5. **Partially verified:** the production preview loads at `/` and `/vibevault/`; browser checks cover lock/unlock, guest wipe, and offline shell behavior. Unit tests cover API failure handling and encrypted/legacy backup round trips. A live hosted deployment, real network isolation, and UI-driven backup restore have not been exercised.
6. **Done for current behavior:** corrected onboarding's inaccurate “no external transmission” claim to disclose Gemini cloud transmission. README and the legal notice describe the local storage and cloud AI boundaries.

**Status:** local automated verification is complete. Treat production release validation as pending until a representative IndexedDB copy and the actual hosting configuration are tested. Phase 4's larger module extractions also remain outstanding, so the overall refactoring roadmap is not complete.

## Suggested delivery order

1. Encryption fail-closed behavior and data-preserving key lifecycle.
2. API-key storage migration and race-safe clearing.
3. Hosted API abuse controls and safe error handling.
4. Privacy disclosures and deployment security headers.
5. FX-rate correctness and removal of misleading sample fallbacks.
6. Incremental module extraction, dead-code cleanup, and shared validation.

Do not combine the key-migration release with broad structural refactors. Ship and verify the data-safety changes independently before moving code across module boundaries.
