# HANDOVER — SparkQuote

**Purpose of this file:** `CLAUDE.md`/`SPARKQUOTE.md` describes the project setup and rules but stops narrating progress after "Projects Phase 2 next" — that milestone and roughly 30 commits of work since have landed and it was never updated. This file is the up-to-date recap. Read `CLAUDE.md` first for environment/build rules (those are still accurate), then this for "where things actually stand." Update this file instead of letting it go stale again — or fold it back into `CLAUDE.md` if you're doing a proper rewrite.

Last updated: 2026-07-21, after commit `e8bf948`.

## What's real now that CLAUDE.md doesn't mention

- **Quick Quote is retired.** It and Estimate wrote to the same shared estimate, so Quick Quote was a redundant entry point. The Estimate screen now has "+ Job" (opens `AssemblyPicker`) alongside "+ Labour"/"+ Material" — it covers everything Quick Quote did. Don't reintroduce a separate Quick Quote flow.
- **Light theme, not dark.** `src/ui/theme/tokens.ts` was rewritten: `ground #F5F7FA`, `surface #FFFFFF`, accent `#1B8FFF` electric blue (was amber `#FFB020` on dark `#14181F`). If you're pattern-matching old screens for colours, check the current token file, not CLAUDE.md's colour list.
- **Nav is 3 tabs:** Home / Projects / Settings (`app/(tabs)/`). Tools, Catalogue, Review, etc. are stack screens off those.
- **Schema is at v11** (`src/data/schema.ts`), not v2. Migrations are wired up (`src/data/migrations.ts`) and have been run/verified on-device multiple times without data loss.

## Major features built since the last CLAUDE.md update (commit `b80e4f3`)

All device-verified on the Oppo X5 unless noted.

- **Floor plans**: trace walls, calibrate real-world scale (tap two points, enter metres), pinch-zoom + one-finger pan while tracing/calibrating, room L×W derived from traced wall bounding box (`src/domain/wall-geometry.ts`).
- **Room dimensions on photos**: once a room's footprint is known, photos get stamped with "RoomName — LxWm × Hm" burned into the file (one-way, permanent — shipped as a reversible caption-only version first, then upgraded on request).
- **Electrical symbols**: placed on wall photos, synced to a `wall_symbols` DB table so they show consistently across the wall's own screen, the floor-plan overlay, and shared wall photos. Symbols are tappable to remove. Freehand drawing stays local to the photo (not synced).
- **Room-photo annotations**: normalized (0–1) coordinates so symbols/strokes land correctly regardless of which screen's canvas placed them (editor vs. lightbox are different sizes) — this was a real bug, fixed `e8bf948`. **Any photo annotated before that fix has broken coordinates and needs re-drawing** (clear via ✕ in Annotate, no auto-migration).
- **Multi-photo sharing**: switched from `expo-sharing` (which fired the next share before the user finished the first — Android quirk) to `react-native-share` with `ACTION_SEND_MULTIPLE`, so selecting 3 wall photos actually sends all 3 in one message.
- **Snags**: floor/room + photo capture on snag items, resolved-item sharing (photo+note or note-only), "Share all" text export, swipe-to-delete with a visible hint.
- **Voice control**: app-wide voice command system (`src/voice/` + `src/ui/voice/GlobalVoiceControl.tsx`) — see `voice_control_architecture` memory for the architecture map. Covers add-material/add-labour/add-assembly with room+floor targeting (four rounds of fixes, all device-verified), nav commands, snag resolve/unresolve, take-photo, vocabulary biasing setup (`app/voice-setup.tsx`).
- **Site tools**: Voltage Drop and Ohm's Law calculators (`app/tools/`, pure logic in `src/domain/electrical-calcs.ts`).
- **Per-room quoting** inside projects, plus the standalone project-level quote screen (`app/project/quote/[id].tsx`) — labour rate now has explicit Save/Cancel (no more save-on-blur).
- **Dedicated floor page** (`app/project/floor/[id].tsx`) in addition to the inline floor/room list on the project screen; visible Cancel/Delete affordances for adding/removing floors and rooms.

## Open items (see `ISSUES.md` for full detail and file pointers)

`ISSUES.md` is the live issue tracker — checkboxes get ticked only after Oppo confirmation. As of this commit, unticked (not yet device-confirmed by Darragh, even though the code change is in):
- Voice add landing in the wrong room (floor-name ordinal matching fix)
- Drum→metres conversion in Material Picker
- Floor/room add-cancel and delete-affordance visibility
- Quote button styling
- Snag share/delete-hint/header changes
- Labour rate Save/Cancel
- Dedicated floor page
- Plan screen header centering

Everything else in the "New issues" section is ticked (device-verified 2026-07-20).

## Known gaps / not started

- Cloud sync: infra exists, needs OAuth client IDs.
- iOS: EAS Build workflow documented in CLAUDE.md, needs a real device pass.
- `showLaborBreakdown` isn't persisted per-estimate (needs another migration).
- Catalogue prices are still placeholders — no electrician sign-off yet.
- VAT/reverse-charge treatment — no accountant check yet.

## Where to look for more context

- `ISSUES.md` — the working issue list, keep using it the same way (add new items at the bottom, Darragh says "scan the issues file").
- Memory (`~/.claude/projects/.../memory/`): `project_state.md` (feature status, more granular than this file but running ~1–2 weeks stale — this HANDOVER.md is the fresher snapshot as of today), `feedback_working.md` (hard-won conventions — babel.config.js, lucide icons, Vitest not Jest, nested Pressables, etc.), `voice_control_architecture.md`, `local_android_build.md` (standalone release APK build/install via adb, wireless-debugging gotchas), `user_profile.md`.
