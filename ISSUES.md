# SparkQuote — Issue Tracker

How to use this file:
- Each item has a checkbox. Leave it unchecked until you've tried it on the
  Oppo and it actually does what you want — then tick it `[x]`.
- If something's still wrong, leave it unticked and add a note under it
  (what's still off) so the next round of fixes has something concrete to
  go on.
- Got something new? Add it under **New issues** at the bottom — just
  describe what's wrong or what you want. Tell me to "scan the issues file"
  (or similar) and I'll read it, investigate each new item, ask clarifying
  questions where needed, and implement/fix them the same way as below.

---

## Round 1 (2026-07-20)

### Bugs

- [x] **Voice add lands in the wrong room.** Saying a floor+room before an
  add-material command (e.g. "first floor, kitchen, add 200m of cable")
  wasn't reaching the spoken room — root cause was floors auto-named
  "Floor 1"/"Floor 2" (voice-created) not matching spoken ordinals like
  "first floor". Fixed floor-name matching to treat "Floor 1" and "first
  floor" as equivalent, both directions. Device-verified 2026-07-21
  ("first floor kitchen, add 2 sockets" landed correctly).
  _Changed: `src/voice/matcher.ts`_

- [x] **Cable added as drums, not metres.** Turned out to be correct
  behaviour for genuinely drum-sold cable (not a bug), but there was no way
  to just say "I need 200m" and let the app work out how many drums to
  bill. Material Picker now reads the drum length straight out of the
  catalogue (the number before the word "Drum") and lets you type metres
  needed — rounds up to whole drums billed. Device-verified 2026-07-21.
  _Changed: `src/domain/drum-size.ts`, `src/ui/catalogue/MaterialPicker.tsx`_
  Follow-up (2026-07-21, two rounds of device testing):
  1. Drum detection didn't trigger at all — the real catalogue puts "100m
     drum" in the item's `unit` field (shown as "CEF-001 · 100m drum · cef"
     under the description), not in the description text, so the
     description-only search always came back null. Now checks `unit` as a
     fallback.
  2. Once detected, the amount input/drum-hint/Add button were unreachable
     behind the numeric keypad — several attempts at tuning
     `KeyboardAvoidingView`/sheet height math (Android double-resizes:
     `AndroidManifest.xml` sets `windowSoftInputMode="adjustResize"` *and*
     the sheet was also doing its own height math, so both together either
     hid content behind the keyboard or collapsed the sheet to ~0 height)
     didn't hold up. Fixed properly by sidestepping the problem instead:
     the selected-item card is no longer part of the scrollable
     sheet/keyboard-avoiding flow at all — it now floats as its own
     absolutely-positioned panel pinned near the top of the screen (with a
     ✕ to dismiss), safely clear of the keyboard regardless of platform
     quirks. Device-verified 2026-07-21.
  Note: five other sheets have the same
  `Platform.OS === 'ios' ? 'padding' : 'height'` KeyboardAvoidingView
  pattern (`LabourSheet.tsx`, `catalogue.tsx`, `plan/[id].tsx` ×2,
  `room/[id].tsx` ×2) and may have the same latent keyboard-overlap bug —
  not touched yet, flagging for a future round if they turn out to be
  affected too.
  _Changed: `src/ui/catalogue/MaterialPicker.tsx`_

### Everything else

- [x] **No way to cancel adding a floor/room, and deleting one was hidden.**
  Add-floor/add-room now has a visible Cancel in both the quick-pick chips
  and the custom-name step. Delete is now a visible link next to Edit on
  both floor and room rows (long-press still works too). Device-verified
  2026-07-21.
  _Changed: `app/project/[id].tsx`_

- [x] **"Quote" button looked already-active.** It was styled as a solid
  filled pill (like a selected tab) even though it's just a link to the
  Quote screen. Restyled to match the other nav links (Snags/Report).
  Device-verified 2026-07-21. Follow-up: Darragh wanted some colour added
  back — Quote/Snags/Report are now tinted pills (accent blue / danger red /
  accent-secondary cyan), each a light background+border+text tint of its
  own colour, same pill shape/size across all three. Device-verified
  2026-07-21.
  _Changed: `app/project/[id].tsx`_

- [x] **Snag list: no share, no delete hint, header cramped.** Resolved
  snags now have a "Share" link (shares the photo + note, or just the note
  if there's no photo). A "Share all" link exports the whole list (open +
  resolved) as a text summary. Swipe-to-delete still swipes left, but each
  row now shows a small "‹" hint so it's discoverable. Header title is now
  properly centered instead of crowding the Back button. Device-verified
  2026-07-22.
  _Changed: `app/project/snag/[id].tsx`_
  Follow-up (2026-07-22): added an optional resolution note + "after" photo
  when marking a snag resolved (schema v12→v13, `resolution_note` +
  `resolved_photo_path` columns). Ticking the checkbox (only the checkbox,
  not the whole row) opens a "Mark resolved" card anchored near the top of
  the screen — not a bottom sheet — so it stays clear of the keyboard;
  resolved rows show before/after thumbnails and an "Edit note" link. Also
  fixed two pre-existing share bugs found along the way: (1) sharing a
  resolved snag's photo via `expo-sharing` silently sent only the photo,
  dropping the description/note text entirely (`dialogTitle` isn't part of
  the shared message) — switched to `react-native-share`, matching the
  wall-photo share pattern; (2) that in turn crashed with a null-Uri
  exception because react-native-share's Android FileProvider only exposes
  the cache dir by default, not the app-private "files" storage where snag
  photos live (logcat: "Failed to find configured root") — fixed by copying
  the photo(s) into cache before sharing. Share now attaches both photos
  when both exist, with a single-photo call shaped for more reliable Gmail
  attachment (`url` singular) vs. multi-photo (`urls` array).
  _Changed: `app/project/snag/[id].tsx`, `src/data/schema.ts`,
  `src/data/migrations.ts`, `src/data/models.ts`, `src/data/snag-repo.ts`,
  `src/domain/types.ts`_

- [x] **Labour rate had no Cancel.** Tapping away used to silently save
  whatever was typed. Now there are explicit Save/Cancel buttons — nothing
  changes until you tap Save. Device-verified 2026-07-21.
  _Changed: `app/project/quote/[id].tsx`_

- [x] **Wanted a dedicated page per floor.** New page at a floor's own
  screen (tap a floor's name on the project screen) listing just that
  floor's rooms to add/edit/delete — in addition to the existing inline
  list on the project screen, not instead of it. Device-verified 2026-07-21.
  _New file: `app/project/floor/[id].tsx`_

- [x] **Calibration screen: can't zoom, no height prompt, Android nav bar
  covers Save.** Pinch-zoom now works while tracing walls or calibrating
  (previously view-only), with tap placement corrected for the zoom level.
  After saving a calibration, an optional ceiling-height prompt pops up
  (applies to every room on that floor at once — skippable). The
  Save-scale sheet now pads for the Android system nav bar instead of
  being covered by it.
  _Changed: `app/project/plan/[id].tsx`_
  Follow-up: the first pass only added pinch-zoom, no panning, and the
  canvas wasn't clipped — once zoomed in you were stuck viewing the centre
  and the zoomed image bled over the header/mode buttons, blocking them.
  Added one-finger pan (with correct scale math — translate is raw screen
  pixels applied after scale, not divided by it) and clipped the canvas.
  Device-verified 2026-07-20.
  _Changed: `app/project/plan/[id].tsx`_

- [x] **Plan screen header off-centre, no project name.** Header now shows
  the floor name (capitals, accent-coloured project name underneath),
  properly centered regardless of the Back/••• button widths. Device-verified
  2026-07-21.
  _Changed: `app/project/plan/[id].tsx`_

---

## New issues

<!-- Add new items below this line, one per bullet. -->

- [x] **Selecting multiple wall photos to share only sent 1, even with 3
  selected (WhatsApp and email).** `expo-sharing`'s Android promise
  resolves as soon as the chosen app is *launched*, not once you've
  actually sent from it — so sharing 3 photos sequentially fired the next
  share sheet on top of the app you were still looking at, and only the
  last one you interacted with really went out. Root fix: switched to
  `react-native-share` (new native dependency — needed a local
  `gradlew assembleDebug` rebuild, not just a JS reload) and now render
  every selected wall's flattened photo first, then hand them all to one
  `ACTION_SEND_MULTIPLE` share call — WhatsApp/email now get one message
  with all selected photos attached. Device-verified 2026-07-20.
  _Changed: `app/project/room/[id].tsx`, `package.json` (added
  `react-native-share`)_

- [x] **Room photo annotations: no way to remove a symbol, and symbols
  landed in the wrong place (floating above the photo) once you left the
  editor.** Root cause: symbols/strokes were stored as raw screen pixels
  tied to whatever container placed them — the annotation editor's canvas
  (squeezed by its header/toolbar) and the room lightbox (full screen) are
  different sizes, so the same raw coordinates landed in different spots.
  Switched to normalized (0-1) coordinates relative to the photo's own
  content, the same approach already used for wall/floor-plan symbols, and
  convert to/from pixels at render time in each screen. Also made the
  remove-symbol tap explicitly win over the place-a-new-symbol tap (they
  were two independent, unrelated gesture recognizers with no defined
  priority). Note: any photo annotated before this fix has its symbols
  stored in the old broken format and needs to be cleared (✕ in the
  Annotate screen) and redrawn — existing data isn't auto-migrated.
  Device-verified 2026-07-20.
  _Changed: `src/domain/wall-geometry.ts`, `src/media/annotation-service.ts`,
  `src/ui/annotations/AnnotationEditor.tsx`, `app/project/room/[id].tsx`_

- [x] **Symbols placed on a wall's photo via the room lightbox's Annotate
  screen didn't show up on that wall's own screen or the floor plan.**
  These were two entirely separate systems — Annotate saved to a
  per-photo JSON file, while the wall screen/floor-plan overlay/wall-photo
  shares all read from the `wall_symbols` DB table. When the open lightbox
  photo is a wall's attached photo, Annotate now loads that wall's
  symbols and syncs additions/removals back into `wall_symbols` on Done,
  so they show up in both places. Freehand drawing (Draw mode) is
  unaffected and still stays local to the photo only — `wall_symbols` has
  no concept of freehand strokes. Device-verified 2026-07-20.
  _Changed: `src/ui/annotations/AnnotationEditor.tsx`,
  `app/project/room/[id].tsx`_
