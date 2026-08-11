# SparkQuote — Go-to-Market Roadmap

Eight phases from "field test in progress" to "sold on iOS &amp; Android." Tackle them one at a time — Phases 1–3 can run in parallel with each other and with Phase 0 wrapping up; Phases 4–5 need 1–3 done; 6 follows 5; 7 follows launch.

Tick a box by changing `- [ ]` to `- [x]` as you go. There's also a live interactive version of this (checkboxes that save automatically, click-to-jump flow diagram) at: https://claude.ai/code/artifact/1b6359bf-88c7-4a88-973e-865a3cb260c4

```
0 Field Test (gate)
 ├─▶ 1 Close Product Gaps ─┐
 ├─▶ 2 Rebrand UI          ├─▶ 4 Monetization ─▶ 5 Store Submission ─▶ 6 Marketing & Launch ─▶ 7 Post-Launch Ops
 └─▶ 3 Business & Legal ───┘
```

---

## Phase 0 — Field test (gate)

Prove the core workflow with a real electrician before anything below gets switched on for real money.

- [ ] Real electrician using the app on live jobs for a meaningful stretch
- [ ] Structured feedback captured — confusing bits, missing bits, bugs
- [ ] Go/no-go: is the core workflow proven enough to charge for it?

## Phase 1 — Close known product gaps

*Can start now, alongside Phase 0.* The things already flagged as unfinished or unsigned-off, pulled straight from the project's own notes.

- [ ] Catalogue prices (125 items) signed off by a qualified electrician — currently placeholders
- [ ] Certificate wording (Minor Works / EIC / EICR) reviewed against BS7671 — review doc already prepared (`certificate-wording-for-review.md`), just needs a qualified electrician's eyes
- [ ] VAT / reverse-charge treatment confirmed with an accountant
- [ ] Signature legal weight confirmed with a solicitor — do on-screen signatures hold up for certificates and signed quotes?
- [ ] Act on whatever Phase 0's field test surfaces
- [ ] Decide cloud sync's fate for v1 — infra exists, needs OAuth client IDs; either finish it or explicitly cut to v1.1 (offline-first is already the core pitch)
- [ ] Persist "show labour breakdown" per estimate (minor, currently resets — needs a small schema migration)
- [ ] Fix the "348 of 500 claimed" landing-page copy — it's a hardcoded number with no real counter behind it, a real trust/compliance risk if it's not true by the time real visitors see it. Either wire it to a real count or drop the specific number.

## Phase 2 — Rebrand the in-app UI to dark/amber

*Can run in parallel with Phase 0–1.* Unify the actual app screens with the dark/amber mascot brand now used on the landing page and app icon.

- [ ] Update `src/ui/theme/tokens.ts` to dark ground / amber accent
- [ ] Sweep every screen for hardcoded colors that bypass the token file
- [ ] Re-test core flows on-device after the reskin — Quick estimate, Review & sign, PDF generation, Projects (global color swaps are easy to break silently)
- [ ] Update illustration/icon colors that were tuned for the old light background
- [ ] Real on-site daylight-glare check once it's dark — the light theme was a deliberate "legible in bright sunlight, one-handed, gloved taps" choice recorded in the theme file's own comments; worth actually re-checking outdoors, not just eyeballing it on a desk

## Phase 3 — Business & legal foundation

*Can run in parallel with Phase 0–2.* Starting from zero — the paperwork that has to exist before you can legally take anyone's money.

- [ ] Decide business structure — sole trader vs limited company
- [ ] Register the business (HMRC self-assessment if sole trader, or Companies House if limited)
- [ ] Open a business bank account
- [ ] Engage an accountant (also covers the VAT item in Phase 1)
- [ ] VAT registration decision, including digital-services treatment for Irish/EU customers if selling there directly
- [ ] Write a Privacy Policy — required by both App Store and Play Store, and by UK GDPR (the app handles location, photos, and client business data)
- [ ] Write Terms of Service / EULA
- [ ] Consider professional indemnity insurance — the app generates legal certificates electricians may rely on
- [ ] Decide the support email / business address to publish on store listings

## Phase 4 — Monetization infrastructure

*Needs Phase 3's business entity in place.* Selling subscriptions from inside the app means going through Apple/Google's own purchase systems — that's a store policy requirement, not a choice.

- [ ] Decide the IAP approach — **RevenueCat** (managed, small fee once revenue scales, much less engineering work) vs **native StoreKit2 + Play Billing** directly (no fee, you build/maintain receipt validation and entitlements yourself on both platforms). Still open.
- [ ] Create the 3 products in App Store Connect + Google Play Console — Monthly £10, Annual £99, Founder's Lifetime £249
- [ ] Wire up entitlement gating in the app — what's actually locked behind payment vs free
- [ ] Reconfirm "no free tier" still holds, or decide a trial period
- [ ] Build the restore-purchases flow (required by both stores' review guidelines)
- [ ] Note for the accountant: Apple/Google are merchant of record for IAP sales — they collect/remit VAT on IAP sales themselves, simplifying the Phase 3 VAT conversation for revenue sold this way

## Phase 5 — Store submission readiness

Everything both stores need before they'll even look at the app.

- [x] Apple Developer Program enrolled — Darragh Quinn, Individual account, team ID `3P627FCS88`
- [ ] Set up a Google Play Console developer account ($25 one-time fee — not started yet)
- [ ] Real device screenshots for both stores
- [ ] App Store listing content — description, keywords, category, age rating, privacy "nutrition label"
- [ ] Google Play listing content — description, Data Safety form, content rating questionnaire
- [ ] Review permission justifications — camera, microphone, location, photo library (the app uses all of these, and both stores scrutinize this closely)
- [ ] Run a beta round before public release — TestFlight on iOS, internal/closed testing track on Play Console
- [ ] Production builds for both platforms (`eas build --profile production`)
- [ ] Submit for review on both stores

## Phase 6 — Marketing & launch

Turning the waitlist and the store listing into actual customers.

- [x] Landing page live on real hosting
- [ ] Plan how to convert the Formspree waitlist into a launch announcement — may be worth moving to a proper sender like Mailchimp once the list is large enough
- [ ] Collect early testimonials from the field-test electrician (with permission)
- [ ] Line up launch channels — UK/Ireland electrician forums, trade Facebook groups, local trade contacts
- [ ] App Store Optimization keyword research — "electrician quoting app UK", "job estimating", etc.
- [ ] Consider a soft launch to the waitlist before the wide public release

## Phase 7 — Post-launch operations

Keeping the lights on once real customers are paying.

- [ ] Add crash reporting / analytics (nothing integrated yet — e.g. Sentry)
- [ ] Set up a real support channel beyond the in-app Help screen
- [ ] Have a process for responding to App Store / Play Store reviews
- [ ] Iterate on real usage data — LiDAR/RoomPlan room scan stays deferred as an iOS-Pro feature for later
