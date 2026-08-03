# SparkQuote — Landing Page Content (v2, trimmed)

Plain-text/markdown copy of everything on the landing page (`landing-page.html`), kept in the repo for easy reference/editing outside the HTML. If you change the page, update this file to match (or vice versa).

Live page: https://claude.ai/code/artifact/834190e9-82a0-4aa6-ae7a-91bf6a13a34e
Local file: `landing-page.html` (self-contained, downloadable)

This version replaced the original 8-section wordy draft (see git history for the old copy) with a 4-section cut: hero, standout feature, compact feature grid, pricing+CTA. Screenshots are **real app screens** (estimate breakdown, floor-plan tracing, calibration, symbol tagging) captured from the dev client on the Oppo, using a throwaway demo project ("3 Elm Grove" / "J Harte") — not any of Darragh's real client jobs. The one exception is the "Share it" step, which is an illustrated mock-up (a real wall photo existed but had an identifiable person in frame, so it was excluded).

---

## Header

**SparkQuote** · UK & Ireland · Electrical · Early Access

---

## Hero

**STATUS: EARLY ACCESS · ANDROID / iOS**

# Lose the signal. Not the job.

Price it, get it signed, and send it — from the plant room, the basement, the new-build with no wifi yet. No laptop. No waiting till you're back at the yard.

**[Notify me when it's ready]**
> First **500** sign-ups lock Founder's Lifetime at **£249** — forever. Price rises once early access opens.

**Hero visual:** real screenshot of the "Current estimate" screen — Cable ties £4.80, Install Double Socket £230.00, Labour rate £50.00/hr, Materials £214.80, Labour £20.00, Subtotal £234.80, VAT (20%) £46.96, Total £281.76, "Preview PDF quote" button. Tagged "ACTUAL APP SCREEN."

---

## The standout feature: Trace it. Calibrate it. Mark it. Send it.

This is the bit no generic quoting app does. Turn a floor-plan photo into a calibrated, symbol-marked reference — then hand it to a colleague, no app required on their end.

**01 — Trace** *(real screenshot)*
Trace the walls — tap one end of a wall, then the other. Drag the rings to fine-tune.

**02 — Calibrate** *(real screenshot)*
Calibrate to real life — type one known distance. Every wall and room size scales from it, with a built-in sanity check (shown: "5 metres" → "Sanity check: that makes the whole plan ≈ 15.3m across").

**03 — Mark** *(real screenshot)*
Mark every point — tap a symbol printed on the plan to tag it: socket, switch, ceiling rose, downlight.

**04 — Share** *(illustrated mock-up, not a real screenshot)*
Share it, no app needed — symbols flatten onto the wall photo. Anyone can open the image, not just SparkQuote users. Mock-up shows a stylised wall card with calibration line, three symbol markers, and "Shared to D. Quinn — second fix."

---

## Circuit schedule (compact feature grid)

| Tag | Feature | Description |
|---|---|---|
| 01 · Ring | Quick Quote | Tap a favourited job, adjust the numbers, done before the kettle's boiled. |
| 02 · Supply | Assemblies & catalogue | Build priced assemblies from your own material list. No one else's prices, no guessing. |
| 03 · Labour | Labour, your way | Hourly or a flat fee per job. The client PDF shows the total, never the split. |
| 04 · Sub-main | Projects | Floors, rooms, jobs — organised the way the site actually is, not a flat list. |
| 05 · RCD | Snag lists | Punch-list every room with before/after photos and dated notes. |
| 06 · Test | Certificates, built in | Minor Works, EIC and EICR — BS 7671 model-form certs, signed and shared as a PDF. |
| 07 · 2-Way | Hands-free, by voice | Add materials, log labour, raise a snag — say it instead of swiping, gloves and all. |
| 08 · Ltg | Sign & send | Client signs on your screen. PDF's away before you're back in the van. |

*(Cut from the original 12-row table: floor-plan tracing & wall symbols — now covered by the standout section above — plus on-site tools/calculators and "works offline," which is already covered in the hero.)*

---

## Pricing

### No per-seat surprises.

Most quoting platforms charge £17–£100+ a month, per seat. SparkQuote doesn't. Indicative early-access pricing, locked in for the first wave.

| Plan | Price | Description |
|---|---|---|
| Monthly | £10/mo | Unlimited projects, clean client PDFs, full catalogue and assemblies. Cancel any time, no contract. |
| **Pro — Annual** *(featured, save £21/yr)* | £99/yr (~£8.25/mo) | Everything in Monthly, billed once a year instead of twelve times. Same features, less admin. |
| Founder's Lifetime | £249 one-time | Everything in Pro, forever. No renewal, ever. *(348 of 500 claimed)* |

**Included note:** Already paying separately for certificate software? Minor Works, EIC and EICR come built into SparkQuote — drafted from the job you quoted, signed on-screen, shared as a PDF.

---

## Sign off (final CTA)

### Be first on the list.

One email when SparkQuote is ready for wider release. No spam, no per-seat sales calls.

**[Reserve my spot]**

> Know an electrician who'd want this too? Refer 2 mates and jump the Founder's Lifetime queue.

---

## Footer

**SparkQuote** — built offline-first for UK & Ireland electricians.
REV: PROTOTYPE · STATUS: EARLY ACCESS

---

## Design notes

- **Theme:** committed dark "instrument panel" theme (ground #10141b, surface #1b212b, amber accent #ffb020) — matches the app's own dark UI tokens, deliberately single-theme rather than a weaker light fallback (per standing feedback on this project).
- **Type:** system sans for display/body, monospace for eyebrows/labels/tags/prices — echoes the dimension labels (`10.00`, `5.00`) visible in the real floor-plan screenshots and the electrician's own "circuit schedule" vocabulary (Ring, Sub-main, RCD, etc. are real consumer-unit circuit labels).
- **Motion:** animated circuit-trace pulse lines in the background, a pulsing LED dot on each section eyebrow — resting-state motion, not hover-gated. Respects `prefers-reduced-motion`.
- **Images:** all inlined as base64 data URIs inside `landing-page.html` — the file is fully self-contained/portable, no external assets.
