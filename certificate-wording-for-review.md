# SparkQuote Certificate Wording — For Electrician Review

**Purpose:** SparkQuote can generate three types of BS7671 paperwork (Minor Works Certificate, EIC, EICR). The field set and wording were built from the standard published BS7671 Model Form layouts, but have **not** been checked by a qualified electrician. Until this review happens, treat any certificate/report the app produces as a **draft template only** — not certified compliant paperwork.

This document lists every fixed label and every piece of boilerplate text exactly as it appears in the app/PDF, plus specific open questions. It doesn't require installing the app — everything shown to a user is reproduced below verbatim.

---

## 1. Minor Electrical Installation Works Certificate

*(for work not involving a new circuit — e.g. a socket added, a fitting replaced)*

### Part 1 — Description of the minor works
- Client name
- Client address
- Description of the minor works *(free text, e.g. "Replaced socket outlet in kitchen")*
- Date completed

### Part 2 — Installation details
- System earthing arrangement — options offered: **TN-S / TN-C-S / TT / Other**
- Protective device *(free text + rating in A, e.g. "BS EN 60898 Type B, 32A")*
- Comments on existing installation *(free text — adequacy of earthing/bonding etc.)*

### Part 3 — Essential tests
- Continuity of protective conductors (Ω)
- Insulation resistance — Line/Neutral (MΩ)
- Insulation resistance — Line/Earth (MΩ)
- Insulation resistance — Neutral/Earth (MΩ)
- Polarity — Satisfactory / Not satisfactory
- Earth fault loop impedance (Zs) (Ω)
- RCD rated residual operating current (mA)
- RCD disconnection time (ms)

### Comments
- Free text — "departures from BS 7671 or limitations of the work"

### Part 4 — Declaration
> *"I/We, being the person(s) responsible for the above work, certify that the work covered by this certificate has been designed, constructed, inspected and tested in accordance with BS 7671, and that the said work, to the best of my/our knowledge and belief, is in accordance with BS 7671, as amended, except as detailed above."*

- Name (person responsible)
- For (company)
- Recommended next inspection (years) *(free-number field, no guidance text shown for typical intervals)*

### Open questions for review
1. Is the certificate title ("Minor Electrical Installation Works Certificate") and the "BS 7671" subtitle correct/sufficient?
2. Does the declaration paragraph above match acceptable BS 7671 wording closely enough to rely on?
3. Is anything missing from Parts 1–3 that would normally be required for this certificate type?
4. Should the "recommended next inspection" field show guidance (e.g. typical 10-year owner-occupied / 5-year rented intervals) rather than a bare number input?

---

## 2. Electrical Installation Certificate (EIC)

*(for new installations or full circuit alterations)*

**Known simplification, flagged for review:** the real BS7671 Model Form 1 has three separate signatories — Design / Construction / Inspection & Testing — each potentially a different person or company. This app combines them into **one signature**, with checkboxes for which role(s) it covers, on the basis that SparkQuote's target user is a solo/small electrician who is almost always all three. **This needs explicit confirmation that it's acceptable**, or a note on when it isn't (e.g. jobs where a different company designed the installation).

### Part 1 — Client & installation
- Client name / Client address
- Installation address *(if different)*
- Installation type — options offered: **New installation / Alteration / Addition**
- Description of the installation covered by this certificate *(free text)*
- Date completed

### Part 2 — Supply characteristics
- System earthing arrangement — **TN-S / TN-C-S / TT / Other**
- Live conductors *(free text, e.g. "1-phase, 2-wire")*
- Nominal voltage (V) / Nominal frequency (Hz)
- Prospective fault current (kA)
- External loop impedance — Ze (Ω)
- Supply protective device *(free text + rating in A)*

### Part 3 — Particulars of installation at the origin
- Means of earthing
- Maximum demand (A)
- Main switch *(free text + rating in A)*
- Earthing conductor CSA (mm²)
- Main bonding conductors CSA (mm²)

### Part 4 — Schedule of test results
**Known simplification, flagged for review:** the real Model Form 1 also includes a separate Schedule of Inspections (~50-item visual-check checklist). **That is not implemented at all yet** — only the Schedule of Test Results below exists. Confirm whether this is acceptable for a first release or a blocker.

Each circuit is recorded individually with these fields:
- Circuit number / Description
- Wiring type *(free text, e.g. "PVC/PVC T&E")*
- CSA — Line (mm²) / CSA — CPC (mm²)
- Protective device *(free text + rating in A)*
- Max permitted Zs (Ω)
- Continuity R1+R2/R2 (Ω)
- Insulation resistance (MΩ)
- Polarity — Satisfactory / Not satisfactory
- Measured Zs (Ω)
- RCD rated residual operating current (mA) / RCD disconnection time (ms)

**Only these columns are implemented** — confirm nothing critical for typical domestic/small-commercial work is missing (e.g. no separate "type of wiring reference method" column, no spur/point-count column).

### Comments
- Free text — "departures from BS 7671 or limitations of the work"

### Declaration
- Role(s) covered by this signature — checkboxes: **Design / Construction / Inspection & Testing**
> *"I/We, being the person(s) responsible for the role(s) indicated above, certify that the work covered by this certificate has been designed, constructed, inspected and tested in accordance with BS 7671, and that the said work, to the best of my/our knowledge and belief, is in accordance with BS 7671, as amended, except as detailed above."*
- Name / For (company)
- Recommended next inspection (years)

### Open questions for review
1. Is the combined single-signature approach (vs. three separate signatories) acceptable? If not, what's the minimum fix — separate name/signature per role, or a disclaimer?
2. Is the missing Schedule of Inspections a launch blocker, or fine to add later?
3. Are the implemented Schedule of Test Results columns sufficient, or is anything essential missing?
4. Are all units/labels correct (Zs in Ω, insulation in MΩ, RCD in mA/ms, CSA in mm²)?

---

## 3. Electrical Installation Condition Report (EICR)

*(periodic inspection of an EXISTING installation — highest complexity of the three)*

Reuses the same Supply characteristics, Particulars at the origin, and Schedule of Test Results field sets as the EIC above (identical fields — see Part 2/3/4 there), since an EICR tests the same physical characteristics an EIC would certify. Everything below is what's genuinely new for this report type.

### Client & installation
- Client name / Client address / Installation address *(if different)*
- Reason for this report — options offered: **Periodic/routine / Change of occupancy / Pre-sale/purchase / Other**
- Estimated age of installation (years)
- Date of last inspection
- Evidence of alterations — Yes / No
- Extent and limitations of inspection *(free text — what was inspected/tested, and any agreed or operational limitations, e.g. areas not accessible)*

### Schedule of test results
Same per-circuit fields as the EIC above (circuit number/description, wiring type, CSA, protective device, max/measured Zs, continuity, insulation resistance, polarity, RCD) — repeated per circuit tested.

### Observations
**This is the single highest-stakes part of the whole certificate feature.** A repeatable list; each observation has:
- Item number
- Observation *(free text description)*
- Classification code — **C1 (Danger present) / C2 (Potentially dangerous) / C3 (Improvement recommended) / FI (Further investigation required)**

**Built-in safety check:** if any observation is coded C1 or C2 but the Overall assessment (below) is still marked Satisfactory, the app shows a warning: *"You have a C1 or C2 observation but marked the installation Satisfactory — an installation with any C1/C2 is normally Unsatisfactory. Double-check before generating."* This is a non-blocking warning, not a hard stop — the electrician can still proceed if they judge it correct.

### General condition & assessment
- General condition *(free-text summary)*
- Overall assessment — **Satisfactory / Unsatisfactory**

### Comments
- Free text — "departures from BS 7671 or limitations of the inspection"

### Declaration
**Known simplification, flagged for review:** unlike the EIC's three-role declaration, this uses a single "inspected and tested by" signature — no role checkboxes. Confirm this matches how a real EICR declaration should read.
> *"I/We declare that the inspection and testing of the installation covered by this report has been carried out in accordance with BS 7671, and the observations recorded above represent the condition of the installation at the time of the inspection, to the best of my/our knowledge and belief."*
- Name / For (company)
- Recommended next inspection (years)

### Open questions for review
1. Are the C1/C2/C3/FI code meanings shown correct, and is the built-in Satisfactory/C1-C2 warning the right check (or should it be a hard block instead of a non-blocking warning)?
2. Is the single "inspected and tested by" declaration (no separate roles, unlike EIC) correct for an EICR?
3. Is "Reason for this report" missing any common option electricians actually use?
4. Same Schedule of Test Results question as the EIC section: are the implemented columns sufficient, and is the missing Schedule of Inspections checklist acceptable to launch without?

---

## What happens after review

Once an electrician has been through this, the fixes needed are localized:
- Wording/label changes → `src/pdf/render-certificate.ts` (Minor Works), `src/pdf/render-eic-certificate.ts` (EIC), `src/pdf/render-eicr-certificate.ts` (EICR) for the printed documents, plus the matching field labels in `app/certificate/[id].tsx` / `app/certificate/eic/[id].tsx` / `app/certificate/eicr/[id].tsx` for the on-screen forms.
- New fields (e.g. Schedule of Inspections) → would need new fields added to `MinorWorksFields`/`EicFields`/`EicrFields` in `src/domain/types.ts`, plus form UI and PDF template updates to match.
