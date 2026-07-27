/**
 * Help — full app reference. Grouped by workflow; each topic expands to a
 * button-by-button breakdown (what it does, where it goes). Content here
 * must be kept in step with the actual screens — when a screen's buttons
 * change, update the matching topic's `actions` list.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, LayoutAnimation, Platform, UIManager, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, space, radius } from '@/src/ui/theme/tokens';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface HelpAction {
  label: string;
  detail: string;
}

interface HelpTopic {
  key: string;
  icon: string;
  accent: string;
  title: string;
  summary: string;
  actions: HelpAction[];
  note?: string;
}

interface HelpGroup {
  title: string;
  topics: HelpTopic[];
}

const HELP_GROUPS: HelpGroup[] = [
  {
    title: 'Getting started',
    topics: [
      {
        key: 'home',
        icon: '⚡',
        accent: '#F0B730',
        title: 'Home screen',
        summary: 'Your starting point — a quick price, a project, or a tool, one tap away.',
        actions: [
          { label: 'Quick estimate tile', detail: 'Opens the Estimate screen — the same live estimate whether you got there from here or from "+Job" anywhere else. Shows your current item count and total if one is in progress.' },
          { label: 'Projects tile', detail: 'Jumps to the Projects tab. Shows how many projects you have.' },
          { label: 'Catalogue tile', detail: 'Opens materials & assemblies. Shows your material count.' },
          { label: 'Tools bar', detail: 'Opens the site calculators hub (Voltage Drop, Ohm\'s Law).' },
          { label: 'Help bar', detail: 'This screen.' },
          { label: 'Mic button (top-right)', detail: 'Starts voice control — see "Voice control" below.' },
        ],
      },
    ],
  },
  {
    title: 'Quoting',
    topics: [
      {
        key: 'quick-quote',
        icon: '⚡',
        accent: colors.accent,
        title: 'Quick Quote & Estimate',
        summary: 'Build a fast, itemised estimate — jobs, labour, materials — with the total updating live.',
        actions: [
          { label: '+ Job', detail: 'Opens the Assembly Picker — tap one of your saved "Add-Job" assemblies (materials + labour bundled) to add it as a line. Tap again to add another; use remove to take one off.' },
          { label: '+ Labour', detail: 'Opens the Labour sheet — an hours-based line (recalculates if you change your hourly rate) or a fixed flat amount that ignores the rate entirely.' },
          { label: '+ Material', detail: 'Opens the Materials picker to search the catalogue and add an item by quantity or by the metre.' },
          { label: '+ Shop', detail: 'Opens the Shopping List — expands every assembly into its individual materials, grouped and totalled, ready to share (e.g. to yourself before the wholesaler).' },
          { label: 'Tap a line', detail: 'Opens Edit Line — adjust quantity, override the price for this line only, or turn it into a fully custom one-off item.' },
          { label: 'Swipe a line left', detail: 'Reveals Delete.' },
          { label: 'Labour rate row', detail: 'Tap to edit your hourly rate inline; every hours-based labour line recalculates immediately.' },
          { label: 'Preview PDF quote', detail: 'Renders the client-facing PDF (no internal costs or markup — just what the client sees) so you can check it before Review & sign.' },
          { label: '"Last estimate" banner', detail: 'Only shows if you have unsaved work waiting. Resume restores it; ✕ dismisses it for good.' },
        ],
      },
      {
        key: 'materials-picker',
        icon: '🔍',
        accent: colors.catPower,
        title: 'Materials picker',
        summary: 'Search the full catalogue and add items by quantity or by the metre.',
        actions: [
          { label: 'Search box', detail: 'Filters by name or SKU as you type.' },
          { label: 'Tap a material', detail: 'Cable/trunking (metre-priced) items ask for a length in metres; everything else asks for a quantity.' },
        ],
        note: 'The price shown is the live catalogue price. Once added to a quote, that price is locked in at add-time — updating catalogue prices later never silently changes a quote you\'ve already built.',
      },
      {
        key: 'labour',
        icon: '🛠',
        accent: colors.catLighting,
        title: 'Labour',
        summary: 'Set your hourly rate once, then add labour lines two ways.',
        actions: [
          { label: 'Hours-based', detail: 'Type hours; recalculates automatically whenever the hourly rate changes.' },
          { label: 'Flat amount', detail: 'A fixed £/€ figure independent of the hourly rate — useful for a fixed callout charge or a negotiated day rate.' },
        ],
        note: 'The hourly rate itself lives in three places kept in sync: Settings (the default), the Estimate screen footer, and each Project Quote screen (a per-project override).',
      },
      {
        key: 'assemblies',
        icon: '⭐',
        accent: colors.catDistribution,
        title: 'Custom assemblies & Manage Jobs',
        summary: 'Build your own reusable "Add-Job" tiles — materials and labour bundled under one name.',
        actions: [
          { label: 'Reaching it', detail: 'Catalogue → Assemblies tab → "Open Assembly Manager", or Quick Quote\'s own Manage link.' },
          { label: '+ New', detail: 'Opens the Assembly Builder — name it, pick a category (or add your own), set base labour hours, then add catalogue materials with live-costed quantities.' },
          { label: 'Swipe a job right', detail: 'Edit — reopens the Assembly Builder with its current details.' },
          { label: 'Swipe left / Delete', detail: 'Permanently removes the job — no undo. Use Hide instead if you just want it out of Quick Quote.' },
          { label: 'Star / Hide / Show', detail: 'Toggles whether this job appears as a tile in Quick Quote. Hiding is non-destructive — the job and its materials stay intact, ready to Show again.' },
          { label: 'Search box', detail: 'Filters by name, category, labour hours, or material count.' },
        ],
      },
      {
        key: 'catalogue',
        icon: '≡',
        accent: '#9B5DE5',
        title: 'Catalogue & pricing',
        summary: 'Browse every material and assembly, and correct a price on the spot.',
        actions: [
          { label: 'Materials tab', detail: 'Search by name/SKU. With more than one price list installed, a supplier filter row lets you view just one wholesaler\'s items.' },
          { label: 'Tap a material', detail: 'Opens a price-edit sheet — type the new unit price and Save. Applies to new estimate lines going forward; quotes already sent/signed keep their locked-in price.' },
          { label: '"Prices last updated" label', detail: 'Shows when a price was last hand-edited or freshly imported this session.' },
          { label: 'Assemblies tab', detail: 'Shortcuts to "Open Assembly Manager" and "Import wholesale price list".' },
        ],
      },
      {
        key: 'import',
        icon: '⬆',
        accent: colors.catLighting,
        title: 'Import wholesale prices',
        summary: "Bring in a supplier's CSV or spreadsheet export to refresh the catalogue in bulk.",
        actions: [
          { label: 'Choose file', detail: 'Pick a .csv or .xlsx exported from your wholesaler.' },
          { label: 'Name the supplier', detail: 'Labels this price list (shown later in the Price lists screen and the Catalogue\'s supplier filter).' },
          { label: 'Column mapping', detail: 'Tell SparkQuote which spreadsheet column is the description, SKU, unit, and price; review the parsed rows before committing.' },
          { label: 'Commit', detail: 'New items are added, matching items updated, unchanged ones left alone — a summary shows the counts, and any draft estimate using an updated price re-prices itself immediately.' },
        ],
      },
      {
        key: 'suppliers',
        icon: '📦',
        accent: colors.catTesting,
        title: 'Price lists (Suppliers)',
        summary: "Every wholesaler price list you've imported, in one place.",
        actions: [
          { label: '+ Import', detail: 'Jumps straight to Import wholesale prices.' },
          { label: 'Remove', detail: 'Deletes every material from that import. Assemblies using those materials aren\'t deleted, but their cost shows £0 until you re-import or re-price them by hand.' },
        ],
      },
    ],
  },
  {
    title: 'Projects',
    topics: [
      {
        key: 'projects-list',
        icon: '⊞',
        accent: '#1B8FFF',
        title: 'Projects',
        summary: 'Every job you\'re tracking — client, room count, and address at a glance.',
        actions: [
          { label: '+ New project', detail: 'Opens the New Project screen.' },
          { label: 'Search box', detail: 'Filters by project name, client name, or address.' },
          { label: 'Tap a project', detail: 'Opens its detail screen (floors, rooms, quote, snags, certificates…).' },
        ],
      },
      {
        key: 'new-project',
        icon: '+',
        accent: '#1B8FFF',
        title: 'New project',
        summary: 'The minimum to get a job started — everything else can be added later.',
        actions: [
          { label: 'Project name', detail: 'Required, e.g. "Smith Kitchen Rewire".' },
          { label: 'Client name / site address', detail: 'Both optional, editable later from the project screen.' },
          { label: '📍 Use current location', detail: "Captures GPS for sites without a formal address yet (a new build) — pins the site accurately even without a postcode." },
          { label: '+ Add photo', detail: 'Attaches a cover photo shown on the Projects list.' },
          { label: 'Create', detail: 'Saves the project and opens its detail screen immediately.' },
        ],
      },
      {
        key: 'project-detail',
        icon: '🏠',
        accent: colors.catTesting,
        title: 'Project detail',
        summary: 'The hub for one job — floors, rooms, and quick links to everything under it.',
        actions: [
          { label: 'Cover photo', detail: 'Tap to change it.' },
          { label: 'Site address', detail: 'Tap to add/edit it, or refresh its GPS pin.' },
          { label: '£ Quote', detail: 'Opens the per-room Project Quote screen.' },
          { label: '⚠ Snags', detail: "Opens this project's punch list." },
          { label: '▤ Report', detail: 'Generates and shares an internal PDF report (floors, rooms, photos, line items) — for your own records, distinct from the client-facing quote PDF.' },
          { label: '+ Add floor', detail: 'Adds a top-level floor/area — a chip list of common names, or "+ Custom".' },
          { label: 'Floor row', detail: 'Tap to open its Floor detail screen. "Plan" opens/imports its floor plan. Edit/Delete rename or remove it (deleting a floor takes its rooms with it).' },
          { label: '+ Add room', detail: 'Adds a nested room under a floor, same quick-name chips.' },
          { label: 'Room row', detail: 'Tap to open the Room screen (photos, walls). Edit/Delete as above.' },
          { label: '••• overflow', detail: 'Documents (drawings/PDFs/photos filed against the project), Certificates (BS7671/EICR paperwork), Mark project finished/Reopen, and Delete project (destructive).' },
        ],
      },
      {
        key: 'floor-detail',
        icon: '▦',
        accent: colors.catTesting,
        title: 'Floor detail',
        summary: "A more focused view of one floor's rooms — useful once a floor has a lot of them.",
        actions: [
          { label: 'Plan', detail: "Opens this floor's floor plan." },
          { label: '+ Add room', detail: 'Same quick-name chips as the project screen.' },
          { label: 'Select', detail: 'Multi-select rooms to bulk-delete.' },
        ],
        note: 'Each room row shows its wall count, photo count, and quote total at a glance.',
      },
      {
        key: 'room-photos',
        icon: '📷',
        accent: colors.accent,
        title: 'Room photos & measurement',
        summary: 'Reference photos per room — internal only, never on the client PDF — plus wall tracing.',
        actions: [
          { label: '+ Add photo', detail: 'Opens the camera. "Use Photo" saves it, "Retake" discards it.' },
          { label: 'Stage filter (All/Before/During/After)', detail: "Tag a photo's stage from its Edit sheet, then filter the gallery by it." },
          { label: 'Tap a photo', detail: 'Full-screen lightbox with Share, Annotate (draw/mark up, saved per-photo), and Edit (name, note, stage).' },
          { label: 'Long-press a photo', detail: "Delete — if it's a wall's attached photo, this also removes that wall and its tagged symbols." },
          { label: '+ Add height / Edit height', detail: "Sets the room's ceiling height in metres." },
          { label: 'Room size line', detail: 'Shows automatically once the floor plan is calibrated and this room\'s walls are traced; tap the hint if it isn\'t set yet.' },
          { label: 'Walls list', detail: "Tap a wall to open its detail screen. \"Select\" lets you multi-select walls with a photo and share them all in one message." },
        ],
      },
      {
        key: 'floor-plans',
        icon: '⌗',
        accent: colors.accentSecondary,
        title: 'Floor plans & wall tracing',
        summary: 'Import a plan image, calibrate it to scale, then trace walls room by room.',
        actions: [
          { label: 'Import floor plan', detail: 'Pick an image. Replacing one later deletes all walls/symbols/photos traced on the old plan.' },
          { label: 'View mode', detail: 'Pinch to zoom; tap a wall to open its detail screen.' },
          { label: 'Trace walls mode', detail: 'Tap one end of a wall, tap the other (drag either ring to fine-tune, with a magnifier while dragging), then "Save wall" and pick its room — jumps straight to that wall\'s photo-attach screen. Tap the middle of an existing wall to select and edit it; tap near its end to start a new wall from that snapped corner instead.' },
          { label: 'Calibrate mode', detail: 'Mark two points a known distance apart, then type that real-world distance — every wall/room size on this floor is worked out from this scale. A sanity-check line shows the whole plan\'s implied width, to catch an obviously wrong number. Optionally set every room\'s ceiling height at once straight after.' },
          { label: '••• overflow', detail: '"Replace floor plan" or "Delete floor plan" — both remove every wall/symbol/photo on it.' },
        ],
      },
      {
        key: 'wall-symbols',
        icon: '⏚',
        accent: colors.accentSecondary,
        title: 'Wall symbols',
        summary: 'One reference photo per wall/ceiling, marked up with what\'s on it — sockets, switches, spurs.',
        actions: [
          { label: 'Take photo / Choose from library', detail: "Attaches the wall's one reference photo." },
          { label: '+ Add symbol', detail: 'Tap the photo to place a symbol, choose its type from the palette, and confirm.' },
          { label: 'Tag from plan', detail: 'Places the same symbols directly on the floor-plan drawing instead of the photo, if that\'s easier to work from.' },
          { label: 'Drag a placed symbol', detail: 'Nudges its height. Tap it (without dragging) to remove it.' },
          { label: '••• overflow', detail: 'Rename the wall, "Flip symbols left ↔ right" (if the photo faces the wrong way), retake/choose a different photo, or Delete the wall (removes its photo and symbols too).' },
        ],
      },
      {
        key: 'documents',
        icon: '📄',
        accent: colors.catLighting,
        title: 'Documents',
        summary: 'A per-project filing cabinet for drawings, PDFs, and any other reference file.',
        actions: [
          { label: '+ Add', detail: 'Imports one or more files of any type at once.' },
          { label: 'Tap an image', detail: 'Opens a pinch-to-zoom viewer with Share.' },
          { label: 'Tap any other file', detail: 'Opens the system share sheet directly — there\'s no in-app document viewer for PDFs/docs.' },
          { label: 'Long-press', detail: 'Deletes a document.' },
        ],
      },
      {
        key: 'snags',
        icon: '⚠',
        accent: '#F0B730',
        title: 'Snags (punch list)',
        summary: "A running list of loose ends on a job — what's outstanding, in progress, or fixed.",
        actions: [
          { label: '+ Add', detail: 'Type the snag, optionally pick a floor/room and attach a photo.' },
          { label: 'Swipe left', detail: 'Delete.' },
          { label: 'Tap a snag', detail: '"Start work" marks it in progress and lets you log timestamped progress notes. Marking it resolved prompts for an optional note and an "after" photo, shown alongside the original.' },
          { label: 'Share', detail: 'Sends the description, status, and full note history as text.' },
        ],
        note: 'Can also be created hands-free by voice — see Voice control.',
      },
      {
        key: 'project-quote',
        icon: '£',
        accent: colors.accent,
        title: 'Project quote',
        summary: 'The project version of Estimate — items are added per room, with totals rolling up by room and floor.',
        actions: [
          { label: '+ Add item', detail: 'Opens the Materials picker, scoped to that room.' },
          { label: '+ Labour', detail: 'Opens the Labour sheet, scoped to that room.' },
          { label: 'Tap a line', detail: 'Edit (same Edit Line sheet as the main Estimate screen); ✕ removes it.' },
          { label: 'Labour rate', detail: 'Same inline editor as the main Estimate screen, but scoped to this one project.' },
          { label: 'Preview PDF quote', detail: 'Same client-facing preview as Quick Quote, before Review & sign.' },
        ],
      },
    ],
  },
  {
    title: 'Certificates',
    topics: [
      {
        key: 'certificates',
        icon: '📜',
        accent: '#6B4C6E',
        title: 'Certificates (EICR / BS7671)',
        summary: "Generate compliance paperwork for a job — separate from the client quote, and never shown on it.",
        actions: [
          { label: 'Reaching it', detail: "A project's ••• overflow menu → \"Certificates\"." },
          { label: '+ New certificate', detail: 'Choose Minor Works Certificate, Electrical Installation Certificate (EIC), or Electrical Installation Condition Report (EICR).' },
          { label: 'Minor Works form', detail: 'Client/description, installation details (earthing, protective device), the essential test results, and a declaration.' },
          { label: 'EIC form', detail: 'Client/installation details, supply characteristics, particulars at the origin, and a repeatable Schedule of Test Results — "+ Add circuit" per circuit tested, "Remove" takes one off.' },
          { label: 'EICR form', detail: 'Reason for the report, client/installation details, supply characteristics, particulars at the origin, the same repeatable Schedule of Test Results as EIC, and a repeatable Observations list — each with a description and a C1/C2/C3/FI classification code. A warning appears if any C1/C2 observation is present but the overall assessment is still marked Satisfactory.' },
          { label: 'Save details', detail: 'Saves your progress as a Draft without generating anything yet.' },
          { label: 'Generate certificate/report & sign', detail: 'Saves, asks for the signature of the person responsible, renders the finished PDF, and opens the share sheet. Marked Completed afterwards.' },
        ],
        note: "Important: the field wording is a first pass based on the standard BS7671 model forms and hasn't been reviewed by a qualified electrician yet — check it carefully before relying on a generated certificate or report as compliant paperwork.",
      },
    ],
  },
  {
    title: 'Finishing a job',
    topics: [
      {
        key: 'review-sign',
        icon: '✍',
        accent: colors.catPower,
        title: 'Review, sign & share PDF',
        summary: 'The client-facing close: walk them through the total, capture a signature, hand over a PDF on the spot.',
        actions: [
          { label: 'Show labour on quote (toggle)', detail: 'Adds a muted "Includes labour: £X" line to the PDF — never breaks materials/labour apart, never shows your markup.' },
          { label: 'Print quote', detail: 'Prints/previews without signing yet.' },
          { label: 'Signature pad', detail: 'The client signs with a finger. Clear restarts it; Accept & sign locks it in.' },
          { label: 'After signing', detail: 'The PDF (with the embedded signature) opens the share sheet automatically.' },
        ],
      },
      {
        key: 'profit-report',
        icon: '📈',
        accent: '#4CAF50',
        title: 'Profit report',
        summary: 'Revenue, material cost, labour, and gross profit — per project and overall. For your eyes only.',
        actions: [
          { label: 'Summary card', detail: 'Revenue, materials, labour, gross profit, and overall margin across every project.' },
          { label: 'Per-project cards', detail: 'The same breakdown for one job, colour-coded by margin (green ≥30%, amber 15–30%, red below).' },
          { label: 'Share', detail: 'Renders the same breakdown to a PDF for your own records.' },
        ],
        note: 'Gross profit = revenue − material cost. Labour counts as income, not a cost — correct for a self-employed electrician. VAT excluded throughout.',
      },
    ],
  },
  {
    title: 'Voice & tools',
    topics: [
      {
        key: 'voice-control',
        icon: '🎙',
        accent: colors.accentSecondary,
        title: 'Voice control',
        summary: 'A mic button on most screens for hands-free work, without putting down your tools.',
        actions: [
          { label: 'Tap the mic', detail: 'Speak a command — SparkQuote works out what you meant and which screen it applies to (e.g. "add two double sockets to the kitchen" works from anywhere, not just while already in that room).' },
          { label: 'First-run / Settings → Voice & vocabulary', detail: "A one-time setup screen primes the recognizer with your own catalogue/project/client names and any extra words you add. This is vocabulary priming, not accent training — the recognizer is your phone's built-in one and can't be retrained." },
          { label: 'Test recognition', detail: 'Speak and see exactly what was heard, to check a tricky name is being picked up.' },
        ],
      },
      {
        key: 'voltage-drop',
        icon: '⤳',
        accent: '#FF6A3D',
        title: 'Tools — Voltage Drop',
        summary: 'Check a cable run against BS7671\'s voltage-drop limits before committing to a cable size.',
        actions: [
          { label: 'Cable size', detail: 'Pick from the standard T&E table, or type a custom mV/A/m.' },
          { label: 'Design current, run length, phase, supply voltage, circuit limit', detail: 'All feed the live result — lighting circuits use the 3% limit, everything else 5%.' },
          { label: 'Result card', detail: 'Shows the drop in volts and as a percentage of supply, with a clear ✓ Within limit / ✗ Exceeds limit verdict.' },
        ],
      },
      {
        key: 'ohms-law',
        icon: 'Ω',
        accent: colors.accentSecondary,
        title: "Tools — Ohm's Law",
        summary: 'Solve for any one of Voltage, Current, Resistance, or Power from the other two.',
        actions: [
          { label: 'Enter any two values', detail: 'The other two are calculated automatically.' },
        ],
      },
    ],
  },
  {
    title: 'Settings & business',
    topics: [
      {
        key: 'settings',
        icon: '⚙',
        accent: colors.catDistribution,
        title: 'Settings',
        summary: 'Your defaults for every new estimate, plus links to everything else app-wide.',
        actions: [
          { label: 'Labour rate / VAT rate / Currency', detail: 'The defaults new estimates start with — each can still be overridden per-estimate or per-project.' },
          { label: 'Business profile', detail: 'Your logo, company name, and tagline shown on every PDF.' },
          { label: 'Voice & vocabulary', detail: 'Re-opens the voice setup screen any time.' },
          { label: 'Photos & storage', detail: 'Capture quality and cache settings for reference photos.' },
          { label: 'Cloud backup', detail: 'Export/restore your whole database to a file.' },
          { label: 'Profit report / Manage price lists / Import wholesale prices', detail: 'Shortcuts to the screens covered above.' },
        ],
      },
      {
        key: 'business-profile',
        icon: '🏢',
        accent: colors.catDistribution,
        title: 'Business profile',
        summary: 'What appears at the top of every PDF you send.',
        actions: [
          { label: 'Company logo', detail: 'Upload a JPEG/PNG — resized automatically for PDF embedding.' },
          { label: 'Company name / tagline', detail: 'Shown under the logo on both the client quote and any certificate.' },
        ],
      },
      {
        key: 'cloud-backup',
        icon: '☁',
        accent: colors.accent,
        title: 'Cloud backup',
        summary: 'A manual, file-based safety net for your whole on-device database.',
        actions: [
          { label: 'Export', detail: 'Writes every project, estimate, catalogue item, and photo reference to a single backup file you can save somewhere safe.' },
          { label: 'Restore', detail: 'Replaces ALL data on this device with a chosen backup file\'s contents. Export first if you want to keep what\'s currently here.' },
        ],
        note: 'There is no automatic cloud sync yet — backups are manual, on demand.',
      },
    ],
  },
];

export default function HelpScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HELP_GROUPS;
    return HELP_GROUPS
      .map((group) => ({
        ...group,
        topics: group.topics.filter((t) =>
          [t.title, t.summary, ...t.actions.map((a) => `${a.label} ${a.detail}`)]
            .some((s) => s.toLowerCase().includes(q))
        ),
      }))
      .filter((group) => group.topics.length > 0);
  }, [query]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Help</Text>
        <View style={{ width: 50 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search what you need help with…"
          placeholderTextColor={colors.textMuted}
          style={styles.search}
          accessibilityLabel="Search help"
        />
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {filteredGroups.length === 0 && (
          <Text style={styles.empty}>No topics match "{query}".</Text>
        )}
        {filteredGroups.map((group) => (
          <View key={group.title} style={styles.groupBlock}>
            <Text style={styles.groupTitle}>{group.title.toUpperCase()}</Text>
            {group.topics.map((t) => {
              const isOpen = expanded.has(t.key);
              return (
                <View key={t.key} style={[styles.card, { borderTopColor: t.accent }]}>
                  <Pressable style={styles.cardHeader} onPress={() => toggle(t.key)}>
                    <View style={[styles.badge, { backgroundColor: `${t.accent}22` }]}>
                      <Text style={[styles.badgeIcon, { color: t.accent }]}>{t.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardLabel}>{t.title}</Text>
                      <Text style={styles.cardSub}>{t.summary}</Text>
                    </View>
                    <Text style={[styles.chevron, { color: t.accent }]}>{isOpen ? 'Hide' : 'Details'}</Text>
                  </Pressable>

                  {isOpen && (
                    <View style={styles.detail}>
                      {t.actions.map((a) => (
                        <View key={a.label} style={styles.actionRow}>
                          <View style={[styles.actionDot, { backgroundColor: t.accent }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.actionLabel}>{a.label}</Text>
                            <Text style={styles.actionDetail}>{a.detail}</Text>
                          </View>
                        </View>
                      ))}
                      {t.note && (
                        <View style={styles.noteBox}>
                          <Text style={styles.noteText}>{t.note}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  back: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  searchWrap: { paddingHorizontal: space.lg, paddingTop: space.md },
  search: { backgroundColor: colors.surface, borderRadius: radius.bar, paddingHorizontal: space.lg, paddingVertical: space.md, color: colors.textPrimary, fontSize: 16, borderWidth: 1, borderColor: colors.hairline },
  list: { padding: space.lg, paddingBottom: space.xxl },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xxl },
  groupBlock: { marginBottom: space.lg },
  groupTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: space.sm, marginTop: space.xs },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.bar,
    borderWidth: 1, borderColor: colors.hairline, borderTopWidth: 3,
    marginBottom: space.md, overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  badge: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeIcon: { fontSize: 22, fontWeight: '700' },
  cardLabel: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
  cardSub: { fontSize: 13, color: colors.textMuted },
  chevron: { fontSize: 14, fontWeight: '800', marginLeft: space.sm },
  detail: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
  actionRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  actionDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  actionLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  actionDetail: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 1 },
  noteBox: { backgroundColor: colors.ground, borderRadius: radius.tile, padding: space.md, marginTop: space.xs },
  noteText: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, fontStyle: 'italic' },
});
