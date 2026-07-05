/**
 * Builds the speech-recognizer's vocabulary hint list (Android
 * `EXTRA_BIASING_STRINGS` / iOS `contextualStrings`, both API 33+/iOS-only
 * features exposed by expo-speech-recognition as `contextualStrings`).
 *
 * This is NOT per-user voice/accent adaptation — the OS recognizer has no
 * such API. It's a bias list of words the recognizer should expect to hear,
 * built from the electrician's own price list, job names and trade jargon,
 * so domain words compete better against the recognizer's general-English
 * language model. Rebuilt fresh each time recognition starts, since the
 * catalogue and project list change over time.
 */
import { loadCatalogue } from '../data/catalogue-repo';
import { loadProjects } from '../data/project-repo';
import { CANONICAL_CATEGORIES } from '../domain/categories';

/** Trade jargon + the app's own command nouns — words a general English
 * language model is unlikely to expect on a construction site. */
const STATIC_TERMS = [
  'consumer unit', 'RCBO', 'RCD', 'MCB', 'twin and earth', 'conduit',
  'containment', 'trunking', 'distribution board', 'fuse board', 'socket',
  'circuit', 'cable', 'earthing', 'bonding', 'BS7671', 'EICR',
  'snag', 'assembly', 'assemblies', 'labour', 'VAT', 'estimate', 'quote',
  'catalogue', 'quick quote', 'project',
];

/** Android's biasing extra and iOS's contextualStrings both work best with a
 * short, high-value list rather than a dump of everything on file. */
const MAX_TERMS = 300;

function dedupe(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const term = raw.trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

/** Builds the current recognition vocabulary hint list: catalogue + project
 * names + trade jargon + whatever custom words the user added at setup. */
export async function buildVoiceVocabulary(customWords: string[] = []): Promise<string[]> {
  const [{ materials, assemblies }, projects] = await Promise.all([
    loadCatalogue(),
    loadProjects(),
  ]);

  const terms = [
    ...customWords,
    ...assemblies.map((a) => a.name),
    ...materials.map((m) => m.description),
    ...projects.flatMap((p) => [p.name, p.clientName].filter((v): v is string => !!v)),
    ...CANONICAL_CATEGORIES,
    ...STATIC_TERMS,
  ];

  return dedupe(terms).slice(0, MAX_TERMS);
}
