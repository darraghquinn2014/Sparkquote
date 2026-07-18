# SPARKQUOTE.md — Project guide for Claude Code

> Rename note: Claude Code auto-reads `CLAUDE.md` in the project root. This file is named `SPARKQUOTE.md` by request. To have Claude Code auto-load it, either rename it to `CLAUDE.md`, or add a line to `CLAUDE.md` that says `See SPARKQUOTE.md`, or just tell Claude Code "read SPARKQUOTE.md" at the start of each session.

---

## What this is
**SparkQuote** — an offline-first job-estimating app for electricians (UK/Ireland). React Native + Expo SDK 54, running on a physical **Oppo X5 Android** phone via a custom Expo dev client. Tested, pure-TS domain logic (pricing, assemblies, labour, import, PDF, projects) lives in `./src`. The app is feature-rich and works on-device with full WatermelonDB persistence.

## Environment
- **Dir:** `~/sparkquote-app` (Windows, Git Bash). Keep it here — do NOT move to WSL; the working build is native-Windows + Git Bash.
- **Expo:** SDK 54 (RN 0.81.5, React 19.1). **Node:** 22.x via nvm-windows — run `nvm use 22.23.1` in each fresh shell.
- **Expo account** `dqm79` · Android pkg `com.dqm79.sparkquoteapp` · EAS project `ca440e10-9d29-447a-8b38-a52e6d507388`.
- **Run the app:** `cd ~/sparkquote-app && nvm use 22.23.1 && npx expo start --dev-client`, then open SparkQuote on the Oppo. JS hot-reloads (`r` in Metro); use `--clear` if a change won't show (stale transform cache has bitten before).

## iOS — physical device via EAS Build (NOT the Simulator)
On the Mac used for iOS work (`/Users/darraghquinn/Sparkquote`), the iOS Simulator is a dead end: that machine has only **4GB RAM** (2015 dual-core 1.6GHz Intel MacBook Air), and Xcode 16.1 + the iOS 18.1 Simulator cannot reliably boot on it — confirmed via `sample`/`vm_stat` that `update_dyld_sim_shared_cache` stalls under memory pressure/swap thrashing (free RAM dropped to ~13MB, swap climbed past 1.2GB, load average spiked over 200). Killing Spotlight indexing (`sudo mdutil -a -i off`) and background daemons helps a little but doesn't fix the underlying RAM ceiling. **Don't attempt `npx expo run:ios` targeting a simulator on this Mac — go straight to EAS Build.**

- **Expo account:** `dqm79` (same as Android). **Apple Developer Team:** `Darragh Quinn (Individual)`, team ID `3P627FCS88`.
- **Registered test device:** iPhone 8 Plus (UDID `938e7b9fb7985ce10e10f3df4e07fa655cf64de1`), added via `eas device:create`. Register additional devices the same way (it gives a link to open on the device).
- **Cloud build (only needed when native deps/config change):** `eas build --profile development --platform ios`. **Must be run in a real Terminal window** — not through Claude Code's `!`-prefixed passthrough or the Bash tool. Both lack a real TTY, so Apple ID / credential prompts silently fail with "You're in non-interactive mode" even though the command looks like it should work. `eas.json`'s `development` profile already has `ios.simulator: false` and `developmentClient: true` configured, so this builds an installable `.ipa` on Expo's servers (~4 min) — no local Xcode compile, no stress on the Mac.
- **Install:** the finished build gives a link like `https://expo.dev/accounts/dqm79/projects/sparkquote-app/builds/<id>` — open it in Safari **on the iPhone** and install from there (it's an ad-hoc build scoped to the registered device UDID). First launch needs trusting the dev certificate: Settings → General → VPN & Device Management.
- **Day-to-day JS iteration:** `npx expo start --dev-client` (lightweight, runs fine locally on this Mac). Find the Mac's LAN IP with `ipconfig getifaddr en0`; the installed dev client connects to it over WiFi. Pure JS/TS changes hot-reload through the already-installed client — only rerun the EAS build step when native dependencies or `app.json`/`eas.json` config change.
- **Stale port 8081:** if `expo start` silently says "Skipping dev server" instead of starting, something (often a leftover `expo run:ios` process from a past simulator attempt) is already holding port 8081. Find it with `lsof -i :8081` and kill it — non-interactive `expo start` won't prompt to use an alternate port, it just bails.

### Keeping iOS in sync when most development happens on the PC
Primary development happens on the Windows PC (Android side, see Environment above); this Mac is used mainly to keep the iOS build current. **You never need Xcode itself on this Mac** — EAS Build compiles in Expo's cloud, not locally. Two cases after `git pull` here:
1. **Pure JS/TS/UI changes (the common case) — no rebuild needed.** Just run `npx expo start --dev-client` (or leave it running); the already-installed dev client on the iPhone picks up new JS over WiFi automatically, same as hot reload.
2. **Native changes — need a fresh EAS build.** Triggers: a new/upgraded package with native code (most non-`expo-` packages, or a new `expo-*` module not already in the installed build), or any change to `app.json`/`app.config.js` (permissions, icons, plugins, bundle id, entitlements) or `eas.json`. Run `eas build --profile development --platform ios` in a real Terminal (see above), reinstall via the link on the iPhone, then resume `expo start --dev-client`.

If unsure which case a PC-side change falls into, just try `expo start --dev-client` first — a crash or a silently-missing feature (missing native module) is the signal a new EAS build is needed.

## Critical build rules (hard-won — do not relearn the hard way)
- **NO `babel.config.js`.** It caused a "private properties" crash with WatermelonDB decorators. Decorators work via tsconfig `experimentalDecorators`. Never re-add babel.config.js.
- **Tests use Vitest, NOT Jest.** Run `npx vitest run <path>` (e.g. `npx vitest run src/domain/__tests__/pricing.test.ts`). Jest fails to parse the TS `import type` syntax. There are ~176 domain tests; 11 are pricing tests.
- **Typecheck after every change:** `npx tsc --noEmit 2>&1 | head -20`.
- **CRLF warnings** on `git add` are harmless (Windows line-ending normalisation).
- **lucide-react-native icons can crash the app at runtime** with `IllegalViewOperationException` / `ViewManagerRegistry.get` even when they typecheck fine and exist in the package. If a screen using lucide icons red-screens on mount, replace the icons with plain `<Text>` symbols (e.g. "+", "›", "Delete"). This already bit the projects screens; they now use text instead of icons.

## Architecture (Approach 2: thin storage, lean on tested mappers)
- **DB plugin:** `@morrowdigital/watermelondb-expo-plugin@2.4.0-beta.0` (NOT @skam22). Installed with `--legacy-peer-deps`.
- **app.json plugins:** morrowdigital (`disableJsi:false`) + expo-build-properties (`pickFirst libc++_shared.so`). New Architecture is ON.
- **package.json** has `overrides: { "@nozbe/with-observables": { "react": "$react" } }`.
- `src/data/polyfills.ts` (perf.now fix) is imported FIRST in `database.ts`.
- **Schema** (`src/data/schema.ts`): v2, ~11 tables (materials, assemblies, assembly_components, labor_toggles, estimates, line_items, projects, locations, photos, sync_queue, + more). Models in `src/data/models.ts` (thin). Mappers raw↔domain in `src/data/mappers.ts`.
- **Repos:** `catalogue-repo.ts` (materials/assemblies: seedIfEmpty, loadCatalogue, createAssembly, setAssemblyFavourite, deleteAssembly), `estimate-repo.ts` (saveActiveEstimate diffed / loadActiveEstimate / clearActiveEstimate, stable ACTIVE_ID), `project-repo.ts` (createProject/loadProjects/renameProject/deleteProject, addLocation/loadLocations/renameLocation/deleteLocation).
- **Store:** `src/state/estimateStore.ts` (Zustand). Persists each mutation behind a `hydrated` guard; `hydrate()` runs on home-screen mount. Actions: addAssembly, addMaterial, addLabour, setHourlyRate, setShowLaborBreakdown, remove, replaceLine, clear.
- **Engine** (`src/domain/pricing.ts`): `priceLine` + `priceEstimate`. `EstimatePriceBreakdown` has subtotal, materialsTotalMinor, laborTotalMinor, vat, grandTotal. Flat labour via `overrides.customLaborFlatMinor` (bypasses hours×rate). `computeLabor` in `src/domain/labor.ts`.
- **Money is in minor units** (pence) throughout. `formatMoney(minor, currency)` in `src/domain/money.ts`. UK VAT default 20%.
- **Theme tokens** `src/ui/theme/tokens.ts`: colors (ground #14181F, surface #1E242E, accent #FFB020 amber, accentInk #14181F, hairline #2E3744, textPrimary/Secondary/Muted, danger #E5564B, category hues), space (xs4 sm8 md12 lg16 xl24 xxl32), radius (tile14 bar18 pill999), type scale (incl. `body`).

## Editing conventions (the workflow that works)
- Apply multi-line edits with **node scripts using line-based EXACT string matching**, NOT substring matching. Pitfall: `clear: () =>` is a substring of `clear: () => void;` — substring matching caused a real tangle. When one anchor is a substring of another, split the file into lines and match whole lines.
- In Claude Code you can edit files directly (str_replace/edit), so this is less of an issue — but still match whole, unique anchors.
- Keep prose/UI consistent with existing screens: reuse theme tokens, the inline-input pattern, the modal/sheet patterns (MaterialPicker, LabourSheet, AssemblyBuilder).

## Features COMPLETE & COMMITTED
1. **Core 9-feature app** — Quick Quote, Estimate + LineDrawer, Review→sign→PDF→share, Settings, CSV/xlsx import, persistent estimates. WatermelonDB throughout.
2. **125-item catalogue** (`/mnt/user-data/outputs/sparkquote-catalogue.csv`, import via Settings). **Prices are placeholders — need electrician sign-off.** 36 `m`-unit items (cables/trunking), rest `each`.
3. **Materials picker** (`src/ui/catalogue/MaterialPicker.tsx`) — search catalogue, add by quantity or metres. `lineFromMaterial` builds material-only lines (labour 0); metre items use `quantityMeters`.
4. **Labour feature** — adjustable per-job hourly rate (persists), Materials/Labour/Subtotal/VAT/Total breakdown on Estimate, standalone labour lines (hours that recalc with rate, OR fixed flat amount) via `LabourSheet.tsx` + `lineFromLabour`. Client PDF shows an optional muted "Includes labour: £X" note (Option 2 — never the materials/markup split), toggled on Review screen, honoured by rebuilding the client view-model from `useEstimateStore.getState()` at sign time.
5. **Custom assemblies + favourites** — `app/manage-jobs.tsx` ("Manage" link on Quick Quote header) lists all assemblies with **Hide/Show** (favourite toggle — deliberately NOT delete, so jobs can be re-favourited later) + **search**. `AssemblyBuilder.tsx`: name, **category chips** (canonical list in `src/domain/categories.ts` merged with in-use + "+ New"), labour hours, catalogue materials w/ live cost. Quick Quote shows **favourites only** (filtered by `quickQuoteRank`, sorted). `Assembly` domain type carries `quickQuoteRank`/`quickQuoteIcon` via the mapper.
6. **Projects — Phase 1 (DONE, COMMIT IT IF NOT ALREADY):** `app/(tabs)/projects.tsx` lists real persisted projects (replaced the hardcoded "Maple Street Office" sample). `app/project/new.tsx` creates (name + optional client). `app/project/[id].tsx` shows nested **floors → rooms** (locations tree via `parentId`) with inline **add**, **rename** (Edit buttons), and **delete**. Router headers hidden for project routes in `app/_layout.tsx`. Uses text symbols, not lucide icons (see crash note above).

## >>> NEXT: Projects Phase 2 — reference photos per room <<<
**Goal:** attach reference photos to a room so the electrician can see the space while quoting (NOT annotation — just reference images).

**What already exists (don't rebuild):**
- `src/media/camera-service.ts` — `saveCapture` (wraps expo-camera + expo-image-manipulator resize/compress), `deletePhoto`.
- `src/media/photo-service.ts` — `createPhoto`, `photosForProject`, `photosForLine`, `toPhoto`/`photoToRaw` mappers.
- `src/media/media-types.ts` — `Photo` type (has `projectId`, `lineItemId?` — but **NOT `locationId`**), path helpers `projectMediaDir`, `originalPhotoPath`.
- `photos` schema table: project_id, line_item_id?, file_path, quality, visibility ('internal' — never in client PDF), captured_at. **No `location_id` column.**

**The two pieces to build:**
1. **Schema migration — add `location_id` to the `photos` table.** This is the delicate part. FIRST inspect `src/data/database.ts` to see whether a WatermelonDB `migrations` array is already wired into the `Database`/adapter setup. If not, that infra must be added (schema version bump v2→v3 + a `migrations.ts` with `addColumns({ table: 'photos', columns: [{ name: 'location_id', type: 'string', isOptional: true, isIndexed: true }] })`). Also add `location_id` to `PhotoModel` and `locationId?` to the `Photo` domain type + mappers. TEST that the app still opens and existing estimates/projects survive the upgrade (migrations run against the on-device DB — verify on the Oppo, not just tsc).
2. **Room detail screen `app/project/room/[id].tsx`** (room rows in `app/project/[id].tsx` already navigate here via `router.push('/project/room/${room.id}')`). Show the room name, a photo gallery/grid, and "+ Add photo" → capture (camera) or pick (library) via the existing `saveCapture` → persist a photo row with `locationId` set → display the saved photos. Photos are internal-only (never on the client PDF). Add a `photo-repo.ts` (or extend project-repo) for create/load/delete photos by location.

**Suggested order:** (a) inspect database.ts migration setup; (b) do the migration + model/type/mapper for location_id, test on device; (c) build photo-repo create/load/delete-by-location; (d) build the room screen UI; (e) test capture→persist→display→survives restart; (f) commit.

## Git
Initialised; user `Darragh <darraghquinn2014@gmail.com>`. `.gitignore` excludes node_modules, .expo, secrets, /ios /android. Commit cadence: one feature per commit. Pre-commit safety check used each time:
`git add -A && git diff --cached --name-only | grep -iE "node_modules|\.env|secret|keystore" || echo "CLEAN"`
Recent commits: catalogue+picker, labour features, custom assemblies+manage-jobs. **Phase 1 projects may be uncommitted — commit it first** with a message like "Add projects with floors and rooms (Phase 1)".

## Remaining non-code (pre-release)
SME sign-off on placeholder catalogue prices + BS7671/EICR terminology; VAT/reverse-charge with an accountant; OAuth client IDs for cloud sync; signature legal weight; iOS pass (needs Mac/Xcode or EAS iOS + Apple device).

## Optional polish / deferred
Persist `showLaborBreakdown` per-estimate (needs migration); live recalc-cascade display after import; list swipe-to-delete; wire the rich `ProjectModeScreen` (per-room quote totals) to real projects; clean unused styles. Deferred: Phase 8 LiDAR/RoomPlan room scan (designed only, `DESIGN-room-scan.md`, iOS-Pro).
