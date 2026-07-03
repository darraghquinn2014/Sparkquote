/**
 * Parses a spoken transcript into quantity / item / target-project parts for
 * the "add N X to the Y job" voice command. Tolerant of variations ("put",
 * "for the ... job", missing quantity). Falls back to treating the whole
 * transcript as a free-text item search when it doesn't start with a
 * recognised add-verb.
 */

export interface ParsedVoiceCommand {
  quantity: number;
  unit?: 'm' | 'each';
  itemQuery: string;
  projectQuery?: string;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100,
  half: 0.5, quarter: 0.25,
};

const UNIT_WORDS: Record<string, 'm' | 'each'> = {
  metre: 'm', metres: 'm', meter: 'm', meters: 'm', m: 'm',
  each: 'each', box: 'each', boxes: 'each',
};

const ADD_VERB_RE = /^(?:please\s+)?(?:add|put|include|insert)\s+(.+)$/i;
const TO_PROJECT_RE = /^(.+?)\s+(?:to|for)\s+(?:the\s+|a\s+|my\s+)?(.+?)(?:\s+job|\s+project)?$/i;
const QTY_UNIT_RE = /^(\d+(?:\.\d+)?)\s*(metres?|meters?|m|each|boxes?|box)\b\s*(?:of\s+)?(.+)$/i;
const QTY_OF_RE = /^(\d+(?:\.\d+)?)\s+of\s+(.+)$/i;

/** Sums a run of number words, e.g. ["twenty", "five"] -> 25, ["one", "hundred"] -> 100. */
function sumNumberWords(words: string[]): number | null {
  let total = 0;
  let matchedAny = false;
  for (const w of words) {
    const v = NUMBER_WORDS[w];
    if (v == null) return null;
    matchedAny = true;
    total = v === 100 ? (total || 1) * 100 : total + v;
  }
  return matchedAny ? total : null;
}

/** "two point five" -> 2.5. Digits after "point" are read individually. */
export function wordsToNumber(words: string[]): number | null {
  const pointIdx = words.indexOf('point');
  if (pointIdx === -1) return sumNumberWords(words);

  const wholeWords = words.slice(0, pointIdx);
  const fracWords = words.slice(pointIdx + 1);
  const whole = wholeWords.length ? sumNumberWords(wholeWords) : 0;
  if (whole == null || fracWords.length === 0) return null;

  let fracDigits = '';
  for (const w of fracWords) {
    const d = NUMBER_WORDS[w];
    if (d == null || d > 9) return null;
    fracDigits += String(d);
  }
  return parseFloat(`${whole}.${fracDigits}`);
}

function stripLeadingArticle(text: string): string {
  return text.replace(/^(a|an|the)\s+/i, '');
}

/**
 * Pulls a leading number (digit or spoken word form, e.g. "2" or "two point
 * five") off the front of `text`, with no unit/context requirement — unlike
 * extractQuantityAndItem, which only takes a bare number when a unit or "of"
 * follows. Used where the number is the whole point (hours, room counts).
 */
export function parseLeadingNumber(text: string): { value: number; rest: string } | null {
  const trimmed = text.trim();
  const digitMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (digitMatch) return { value: parseFloat(digitMatch[1]), rest: digitMatch[2].trim() };

  const words = trimmed.split(/\s+/);
  for (let len = Math.min(4, words.length); len >= 1; len -= 1) {
    const n = wordsToNumber(words.slice(0, len).map((w) => w.toLowerCase()));
    if (n != null) return { value: n, rest: words.slice(len).join(' ').trim() };
  }
  return null;
}

/**
 * Splits a trailing "to/for [the] X [job/project]" clause off the end of
 * `text`, e.g. "loose socket in the kitchen to the Smith job" ->
 * { rest: "loose socket in the kitchen", projectQuery: "Smith" }. Shared by
 * every intent that can target a named project (add-material, create-snag,
 * estimate-query, ...).
 */
export function splitTrailingProjectClause(text: string): { rest: string; projectQuery?: string } {
  const match = text.match(TO_PROJECT_RE);
  if (!match) return { rest: text };
  return { rest: match[1].trim(), projectQuery: match[2].trim() };
}

/**
 * Pulls a leading quantity (+ optional unit) off the front of `text`, only
 * when the number is followed by a unit word or "of" — a bare leading number
 * with neither (e.g. "2.5 twin and earth") is left as part of the item text,
 * since it's describing the item (a cable's size), not a count.
 */
function extractQuantityAndItem(text: string): { quantity: number; unit?: 'm' | 'each'; itemQuery: string } {
  const trimmed = stripLeadingArticle(text.trim());

  const digitUnitMatch = trimmed.match(QTY_UNIT_RE);
  if (digitUnitMatch) {
    return {
      quantity: parseFloat(digitUnitMatch[1]),
      unit: UNIT_WORDS[digitUnitMatch[2].toLowerCase()],
      itemQuery: digitUnitMatch[3].trim(),
    };
  }
  const digitOfMatch = trimmed.match(QTY_OF_RE);
  if (digitOfMatch) {
    return { quantity: parseFloat(digitOfMatch[1]), itemQuery: digitOfMatch[2].trim() };
  }

  // Word-number fallback: try growing prefixes of words as a number, and
  // require the word right after the prefix to be a unit word or "of".
  const words = trimmed.split(/\s+/);
  for (let len = Math.min(4, words.length - 1); len >= 1; len -= 1) {
    const prefix = words.slice(0, len);
    const rest = words.slice(len);
    const nextWord = rest[0]?.toLowerCase();
    if (!nextWord) continue;
    const n = wordsToNumber(prefix.map((w) => w.toLowerCase()));
    if (n == null) continue;
    if (nextWord in UNIT_WORDS) {
      const afterUnit = rest.slice(1);
      const restText = afterUnit[0]?.toLowerCase() === 'of' ? afterUnit.slice(1) : afterUnit;
      return { quantity: n, unit: UNIT_WORDS[nextWord], itemQuery: restText.join(' ').trim() };
    }
    if (nextWord === 'of') {
      return { quantity: n, itemQuery: rest.slice(1).join(' ').trim() };
    }
  }

  return { quantity: 1, itemQuery: trimmed };
}

/**
 * Parses "add 50 metres of 2.5mm twin and earth to the Smith job" style
 * commands. If the transcript doesn't start with a recognised add-verb, the
 * whole transcript is returned as a plain item search (no quantity/project
 * parsing) — the caller's search fallback.
 */
export function parseVoiceCommand(raw: string): ParsedVoiceCommand {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (!text) return { quantity: 1, itemQuery: '' };

  const verbMatch = text.match(ADD_VERB_RE);
  if (!verbMatch) return { quantity: 1, itemQuery: text };

  const { rest: itemPart, projectQuery } = splitTrailingProjectClause(verbMatch[1]);
  const { quantity, unit, itemQuery } = extractQuantityAndItem(itemPart);
  return { quantity, unit, itemQuery, projectQuery };
}
