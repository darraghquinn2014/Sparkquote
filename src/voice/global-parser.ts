/**
 * App-wide voice command classifier — the entry point for the global mic FAB
 * (as opposed to command-parser.ts's parseVoiceCommand, which is scoped to
 * just the material-add command used by the existing project/quote mic
 * buttons).
 *
 * Classification is keyword-first, not verb-first: every intent below
 * requires its own distinguishing noun ("snag", "floor", "room", "labour",
 * "assembly", "project"/"job", "price", "vat", "currency", "line",
 * "estimate"/"total"/"quote") before it matches. Only once none of those
 * nouns are present does a leading add/put/include/insert verb fall through
 * to the generic material-add command — earlier versions checked that
 * generic pattern too early, so e.g. "add a new floor called X" fell
 * through to an item search.
 *
 * Renames/deletes of floors and rooms deliberately still require their
 * keyword ("the ground FLOOR", "the kitchen ROOM") rather than trying to
 * guess the entity type from a bare name — these are destructive/renaming
 * operations, so an unambiguous trigger word matters more than covering
 * "delete the kitchen" with no noun at all.
 */
import { parseVoiceCommand, parseLeadingNumber, splitTrailingProjectClause, type ParsedVoiceCommand } from './command-parser';
import { matchNavTarget } from './nav-targets';
import { splitRoomFloorClause } from './matcher';

export type GlobalVoiceIntent =
  | { kind: 'navigate'; path: string; label: string }
  /** Doesn't match a fixed app screen — try project-scoped nav targets (needs
   * the current project context) first, then fall back to a project-name
   * search. Resolved by the caller, which knows the current project. */
  | { kind: 'navigate-contextual'; query: string }
  | { kind: 'open-project'; query: string }
  | { kind: 'create-project'; name: string; clientName?: string }
  /** Ambiguous "create a new job" — resolved by the caller: on Quick Quote
   * (no project in view) it means a new assembly; everywhere else, a project. */
  | { kind: 'create-project-or-assembly'; name: string; clientName?: string }
  | { kind: 'rename-project'; query?: string; newName: string }
  | { kind: 'delete-project'; query: string }
  | { kind: 'create-snag'; description: string; projectQuery?: string }
  | { kind: 'delete-snag'; query: string }
  | { kind: 'mark-snag'; query: string; resolved: boolean }
  | { kind: 'create-floor'; name: string; count?: number; projectQuery?: string }
  | { kind: 'rename-floor'; query: string; newName: string }
  | { kind: 'delete-floor'; query: string }
  | { kind: 'create-room'; name: string; count?: number; projectQuery?: string }
  | { kind: 'rename-room'; query: string; newName: string }
  | { kind: 'delete-room'; query: string }
  | { kind: 'room-count-query'; floorQuery?: string; projectQuery?: string }
  | { kind: 'delete-assembly'; query: string }
  | { kind: 'hide-assembly'; query: string }
  | { kind: 'show-assembly'; query: string }
  | { kind: 'open-assembly-builder' }
  | { kind: 'change-material-price'; query: string; priceMinor: number }
  | { kind: 'set-vat-rate'; pct: number }
  | { kind: 'set-currency'; currency: 'GBP' | 'EUR' }
  | { kind: 'set-labour-rate'; amountMinor: number; projectQuery?: string }
  | { kind: 'remove-line'; query: string }
  | { kind: 'set-line-quantity'; query: string; amount: number }
  | { kind: 'edit-labour-line'; hours?: number; flatMinor?: number }
  | { kind: 'clear-estimate' }
  | { kind: 'preview-pdf' }
  | { kind: 'generate-report' }
  | { kind: 'take-photo' }
  | { kind: 'add-material'; parsed: ParsedVoiceCommand }
  | { kind: 'add-labour'; hours?: number; flatMinor?: number; projectQuery?: string }
  | { kind: 'search-material'; query: string }
  | { kind: 'estimate-query'; projectQuery?: string }
  | { kind: 'unknown'; raw: string };

const CREATE_VERB = '(?:add|create|start|make)';
const RENAME_VERB_RE = /^(?:rename|change|update)\s+(.+)$/i;
const DELETE_VERB_RE = /^(?:delete|remove|get rid of)\s+(.+)$/i;
const HIDE_VERB_RE = /^(?:hide|unfavou?rite|unfavorite)\s+(.+)$/i;
const SHOW_VERB_RE = /^(?:show|unhide|favou?rite|favorite|bring\s+back)\s+(.+)$/i;
const MARK_SNAG_DONE_RE = /^(?:mark|set)\s+(.+?)\s+(?:as\s+)?(?:done|resolved|complete|completed|finished)\s*$/i;
const MARK_SNAG_UNDONE_RE = /^(?:mark|set)\s+(.+?)\s+(?:as\s+)?(?:not\s+done|unresolved|outstanding|reopened|open|undone)\s*$/i;

const ENTITY_WORD = {
  project: /\b(?:project|job)\b/i,
  floor: /\bfloors?\b/i,
  room: /\brooms?\b/i,
  snag: /\bsnags?\b/i,
  assembly: /\bassembl(?:y|ies)\b/i,
};

const CREATE_PROJECT_RE = new RegExp(`^${CREATE_VERB}\\s+(?:a\\s+|an\\s+)?new\\s+project\\b\\s*(.*)$`, 'i');
// "job" alone is ambiguous — the app calls a project a "job" (rename/delete
// project already accept it, PROJECT_NAV_TARGETS has "this job") but also
// calls a custom assembly a "job" (the Quick-Quote tile, Manage Jobs
// screen). Resolved by the caller using screen context: on Quick Quote
// there's no project to create, so "job" there means assembly.
const CREATE_JOB_AMBIGUOUS_RE = new RegExp(`^${CREATE_VERB}\\s+(?:a\\s+|an\\s+)?new\\s+job\\b\\s*(.*)$`, 'i');
const CREATE_ASSEMBLY_RE = new RegExp(`^${CREATE_VERB}\\s+(?:a\\s+|an\\s+)?(?:new\\s+)?assembl(?:y|ies)\\b`, 'i');

const SNAG_RE = new RegExp(`^${CREATE_VERB}\\s+(?:a\\s+|an\\s+)?(?:new\\s+)?snags?(?:\\s+item)?\\s*(?:called|named)?\\s*[:\\-]?\\s*(.*)$`, 'i');
// "create 3 floors" / "create three floors" — a count before the noun, no name.
const FLOOR_COUNT_RE = new RegExp(`^${CREATE_VERB}\\s+(\\d+|\\w+)\\s+floors\\b\\s*(.*)$`, 'i');
const FLOOR_RE = new RegExp(`^${CREATE_VERB}\\s+(?:a\\s+|an\\s+)?(?:new\\s+)?floors?\\s*(?:called|named)?\\s*[:\\-]?\\s*(.*)$`, 'i');
// "create 3 rooms" / "create three rooms" — a count before the noun, no name.
const ROOM_COUNT_RE = new RegExp(`^${CREATE_VERB}\\s+(\\d+|\\w+)\\s+rooms\\b\\s*(.*)$`, 'i');
const ROOM_RE = new RegExp(`^${CREATE_VERB}\\s+(?:a\\s+|an\\s+)?(?:new\\s+)?rooms?\\s*(?:called|named)?\\s*[:\\-]?\\s*(.*)$`, 'i');
const ROOM_COUNT_QUERY_WORD_RE = /how many rooms\b/i;
const ROOM_COUNT_FLOOR_RE = /(?:on|in|to|for)\s+(?:the\s+)?(.+?)\s*\??$/i;

const LABOUR_WORD_RE = /\blabou?r\b/i;
const HOURS_RE = /(?:of\s+)?(\d+(?:\.\d+)?)\s*hours?\b/i;
const MONEY_RE = /(?:of\s+)?£?\s*(\d+(?:\.\d+)?)\s*(?:pounds?|quid)?\b/i;

const PRICE_RE = /^(?:set|change|update)\s+(?:the\s+)?price\s+(?:of\s+)?(.+?)\s+to\s+£?\s*(\d+(?:\.\d+)?)\s*(?:pounds?|quid)?$/i;
const VAT_RE = /^(?:set|change|update)\s+(?:the\s+)?vat(?:\s+rate)?\s+to\s+(\d+(?:\.\d+)?)\s*%?(?:\s*percent)?$/i;
const CURRENCY_RE = /^(?:set|change|update)\s+(?:the\s+)?currency\s+to\s+(.+)$/i;
const LABOUR_RATE_RE = /^(?:set|change|update)\s+(?:the\s+)?(?:labou?r|hourly)\s+rate\s+to\s+£?\s*(\d+(?:\.\d+)?)\s*(?:pounds?|per\s+hour|\/?\s*hr)?$/i;
// "change the labour to 3 hours" / "set labour to £200" — editing an EXISTING
// labour line's hours/amount. Checked after LABOUR_RATE_RE (which requires
// the word "rate") so the two never collide.
const LABOUR_LINE_EDIT_RE = /^(?:set|change|update)\s+(?:the\s+)?labou?r\s+to\s+(.+)$/i;
const LINE_WORD_RE = /\bline\b/i;
const SET_QTY_RE = /^(?:set|change|update)\s+(?:the\s+)?(.+?)\s+quantity\s+to\s+(\d+(?:\.\d+)?)$/i;
// Fallback for editing a line without saying "quantity" at all, e.g.
// "change the twin and earth to 30".
const SET_VALUE_FALLBACK_RE = /^(?:set|change|update)\s+(?:the\s+)?(.+?)\s+to\s+(\d+(?:\.\d+)?)$/i;

const CLEAR_ESTIMATE_RE = /^(?:clear|empty|reset)\s+(?:the\s+)?(?:whole\s+|entire\s+|full\s+)?(?:estimate|quote)\b/i;
const CLEAR_ESTIMATE_ALT_RE = /^(?:delete|remove)\s+(?:the\s+)?(?:whole|entire|full)\s+(?:estimate|quote)\b/i;
const START_NEW_ESTIMATE_RE = /^start\s+(?:a\s+)?new\s+estimate\b/i;

const PREVIEW_WORD_RE = /\bpreview\b/i;
const PREVIEW_TARGET_RE = /\b(pdf|quote)\b/i;

const REPORT_RE = /^(?:open|go to|goto|show me|take me to|generate|give me|create|make|share)\s+(?:the\s+|a\s+|my\s+)?report\b/i;
// Checked after REPORT_RE so "take me to the report" isn't misread as a camera command.
const TAKE_PHOTO_RE = /^(?:take|capture)\s+(?:a\s+)?(?:photo|picture|photograph)s?\b/i;

const REVIEW_SIGN_RE = /\breview\b|\bsign(?:ing)?\s+the\s+quote\b|\bsign\s+it\b/i;

const ESTIMATE_QUERY_RE = /\b(estimate|total|quote|cost)\b/i;
const ESTIMATE_VERB_RE = /^(?:what'?s|whats|give me|show me|get me|tell me)\b/i;
const NAV_RE = /^(?:open|go to|goto|navigate to|show me|take me to)\s+(?:the\s+)?(.+)$/i;
const ADD_VERB_RE = /^(?:please\s+)?(?:add|put|include|insert)\s+/i;
// "show"/"show me" are deliberately NOT search triggers here — they're
// already claimed by navigation ("show me projects") and the report/review
// checks above; adding them here would break those.
const SEARCH_RE = /^(?:find|search(?:\s+for)?|look\s+up)\s+(.+)$/i;

function stripFiller(text: string): string {
  return text
    .replace(/\b(called|named|the|this|my|it)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripNoise(text: string, entityWord: RegExp): string {
  return stripFiller(text.replace(entityWord, ''));
}

/** Parses "3 hours" / "£200" / "200 pounds" for the edit-labour-line command. */
function parseLabourEditAmount(text: string): { hours?: number; flatMinor?: number } {
  const hoursMatch = text.match(HOURS_RE);
  if (hoursMatch) return { hours: parseFloat(hoursMatch[1]) };
  const leading = parseLeadingNumber(text.replace(/^of\s+/i, ''));
  if (leading && /^hours?\b/i.test(leading.rest)) return { hours: leading.value };
  const moneyMatch = text.match(MONEY_RE);
  if (moneyMatch) return { flatMinor: Math.round(parseFloat(moneyMatch[1]) * 100) };
  return {};
}

/** "the ground floor to First Floor" -> { oldQuery: "ground", newName: "First Floor" }. */
function parseRenamePhrase(rest: string, entityWord: RegExp): { oldQuery: string; newName: string } | null {
  const toMatch = rest.match(/^(.+?)\s+to\s+(.+)$/i);
  if (!toMatch) return null;
  const newName = toMatch[2].trim();
  if (!newName) return null;
  return { oldQuery: stripNoise(toMatch[1], entityWord), newName };
}

function normalizeCurrency(text: string): 'GBP' | 'EUR' | null {
  if (/pound|gbp|sterling/i.test(text)) return 'GBP';
  if (/euro|eur\b/i.test(text)) return 'EUR';
  return null;
}

/**
 * "name is Murphy's Bar client is John" / "called Smith Rewire for John
 * Smith" / "Oak Street" -> { name, clientName }. Accepts either phrasing so
 * a single sentence like "create a new project name is X client is Y" works
 * alongside the older "called X for Y" form.
 */
function extractNameAndClient(rest: string): { name: string; clientName?: string } {
  let name = rest.trim();
  let clientName: string | undefined;

  const clientMatch = name.match(/\bclient\s+is\s+(.+)$/i) ?? name.match(/\bfor\s+(.+)$/i);
  if (clientMatch && clientMatch.index != null) {
    clientName = clientMatch[1].trim();
    name = name.slice(0, clientMatch.index).trim();
  }

  const nameMatch = name.match(/(?:name\s+is|called|named)\s+(.+)$/i);
  if (nameMatch) name = nameMatch[1].trim();

  return { name, clientName };
}

/** Parses the remainder of an "add labour ..." command: hours, a flat amount, or neither. */
function parseLabourAmount(text: string): { hours?: number; flatMinor?: number } {
  const withoutLabourWord = text.replace(LABOUR_WORD_RE, '').trim();
  if (!withoutLabourWord) return {};

  const hoursMatch = withoutLabourWord.match(HOURS_RE);
  if (hoursMatch) return { hours: parseFloat(hoursMatch[1]) };

  const leading = parseLeadingNumber(withoutLabourWord.replace(/^of\s+/i, ''));
  if (leading && /^hours?\b/i.test(leading.rest)) return { hours: leading.value };

  const moneyMatch = withoutLabourWord.match(MONEY_RE);
  if (moneyMatch) return { flatMinor: Math.round(parseFloat(moneyMatch[1]) * 100) };

  return {};
}

export function parseGlobalVoiceCommand(raw: string): GlobalVoiceIntent {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (!text) return { kind: 'unknown', raw: '' };

  const createProjectMatch = text.match(CREATE_PROJECT_RE);
  if (createProjectMatch) {
    const { name, clientName } = extractNameAndClient(createProjectMatch[1]);
    return { kind: 'create-project', name, clientName };
  }

  const createJobMatch = text.match(CREATE_JOB_AMBIGUOUS_RE);
  if (createJobMatch) {
    const { name, clientName } = extractNameAndClient(createJobMatch[1]);
    return { kind: 'create-project-or-assembly', name, clientName };
  }

  const renameMatch = text.match(RENAME_VERB_RE);
  if (renameMatch && ENTITY_WORD.project.test(renameMatch[1])) {
    const parsed = parseRenamePhrase(renameMatch[1], ENTITY_WORD.project);
    if (parsed) return { kind: 'rename-project', query: parsed.oldQuery || undefined, newName: parsed.newName };
  }

  const deleteMatch = text.match(DELETE_VERB_RE);
  if (deleteMatch && ENTITY_WORD.project.test(deleteMatch[1])) {
    return { kind: 'delete-project', query: stripNoise(deleteMatch[1], ENTITY_WORD.project) };
  }

  if (CREATE_ASSEMBLY_RE.test(text)) {
    return { kind: 'open-assembly-builder' };
  }

  if (deleteMatch && ENTITY_WORD.assembly.test(deleteMatch[1])) {
    return { kind: 'delete-assembly', query: stripNoise(deleteMatch[1], ENTITY_WORD.assembly) };
  }

  const hideMatch = text.match(HIDE_VERB_RE);
  if (hideMatch && ENTITY_WORD.assembly.test(hideMatch[1])) {
    return { kind: 'hide-assembly', query: stripNoise(hideMatch[1], ENTITY_WORD.assembly) };
  }

  const showMatch = text.match(SHOW_VERB_RE);
  if (showMatch && ENTITY_WORD.assembly.test(showMatch[1])) {
    return { kind: 'show-assembly', query: stripNoise(showMatch[1], ENTITY_WORD.assembly) };
  }

  if (renameMatch && ENTITY_WORD.floor.test(renameMatch[1])) {
    const parsed = parseRenamePhrase(renameMatch[1], ENTITY_WORD.floor);
    if (parsed && parsed.oldQuery) return { kind: 'rename-floor', query: parsed.oldQuery, newName: parsed.newName };
  }

  if (deleteMatch && ENTITY_WORD.floor.test(deleteMatch[1])) {
    return { kind: 'delete-floor', query: stripNoise(deleteMatch[1], ENTITY_WORD.floor) };
  }

  if (renameMatch && ENTITY_WORD.room.test(renameMatch[1])) {
    const parsed = parseRenamePhrase(renameMatch[1], ENTITY_WORD.room);
    if (parsed && parsed.oldQuery) return { kind: 'rename-room', query: parsed.oldQuery, newName: parsed.newName };
  }

  if (deleteMatch && ENTITY_WORD.room.test(deleteMatch[1])) {
    return { kind: 'delete-room', query: stripNoise(deleteMatch[1], ENTITY_WORD.room) };
  }

  if (deleteMatch && ENTITY_WORD.snag.test(deleteMatch[1])) {
    return { kind: 'delete-snag', query: stripNoise(deleteMatch[1], ENTITY_WORD.snag) };
  }

  // Checked before the "done" pattern below: "not done"/"unresolved"/etc.
  // would otherwise also satisfy the done pattern (its "as " prefix is
  // optional, so "as not done" can be misread as "as ...not" + "done").
  const markUndoneMatch = text.match(MARK_SNAG_UNDONE_RE);
  if (markUndoneMatch) {
    return { kind: 'mark-snag', query: stripFiller(markUndoneMatch[1]), resolved: false };
  }

  const markDoneMatch = text.match(MARK_SNAG_DONE_RE);
  if (markDoneMatch) {
    return { kind: 'mark-snag', query: stripFiller(markDoneMatch[1]), resolved: true };
  }

  const priceMatch = text.match(PRICE_RE);
  if (priceMatch) {
    return { kind: 'change-material-price', query: priceMatch[1].trim(), priceMinor: Math.round(parseFloat(priceMatch[2]) * 100) };
  }

  const vatMatch = text.match(VAT_RE);
  if (vatMatch) {
    return { kind: 'set-vat-rate', pct: parseFloat(vatMatch[1]) };
  }

  const currencyMatch = text.match(CURRENCY_RE);
  if (currencyMatch) {
    const currency = normalizeCurrency(currencyMatch[1]);
    if (currency) return { kind: 'set-currency', currency };
  }

  const labourRateMatch = text.match(LABOUR_RATE_RE);
  if (labourRateMatch) {
    return { kind: 'set-labour-rate', amountMinor: Math.round(parseFloat(labourRateMatch[1]) * 100) };
  }

  const labourLineEditMatch = text.match(LABOUR_LINE_EDIT_RE);
  if (labourLineEditMatch) {
    const { hours, flatMinor } = parseLabourEditAmount(labourLineEditMatch[1]);
    if (hours != null || flatMinor != null) return { kind: 'edit-labour-line', hours, flatMinor };
  }

  if (CLEAR_ESTIMATE_RE.test(text) || CLEAR_ESTIMATE_ALT_RE.test(text) || START_NEW_ESTIMATE_RE.test(text)) {
    return { kind: 'clear-estimate' };
  }

  if (PREVIEW_WORD_RE.test(text) && PREVIEW_TARGET_RE.test(text)) {
    return { kind: 'preview-pdf' };
  }

  if (REPORT_RE.test(text)) {
    return { kind: 'generate-report' };
  }

  if (TAKE_PHOTO_RE.test(text)) {
    return { kind: 'take-photo' };
  }

  if (REVIEW_SIGN_RE.test(text)) {
    const forMatch = text.match(/\bfor\s+(?:the\s+|a\s+|my\s+)?(.+?)(?:\s+job|\s+project)?$/i);
    return { kind: 'estimate-query', projectQuery: forMatch ? forMatch[1].trim() : undefined };
  }

  if (deleteMatch && LINE_WORD_RE.test(deleteMatch[1])) {
    return { kind: 'remove-line', query: stripNoise(deleteMatch[1], LINE_WORD_RE) };
  }

  const qtyMatch = text.match(SET_QTY_RE);
  if (qtyMatch) {
    return { kind: 'set-line-quantity', query: qtyMatch[1].trim(), amount: parseFloat(qtyMatch[2]) };
  }

  const snagMatch = text.match(SNAG_RE);
  if (snagMatch) {
    const { rest, projectQuery } = splitTrailingProjectClause(snagMatch[1].trim());
    return { kind: 'create-snag', description: rest, projectQuery };
  }

  const floorCountMatch = text.match(FLOOR_COUNT_RE);
  if (floorCountMatch) {
    const countWord = floorCountMatch[1].toLowerCase();
    const count = /^\d+$/.test(countWord) ? parseInt(countWord, 10) : parseLeadingNumber(countWord)?.value;
    if (count && count > 0) {
      const { projectQuery } = splitTrailingProjectClause(floorCountMatch[2].trim());
      return { kind: 'create-floor', name: '', count: Math.min(count, 20), projectQuery };
    }
  }

  const floorMatch = text.match(FLOOR_RE);
  if (floorMatch) {
    const { rest, projectQuery } = splitTrailingProjectClause(floorMatch[1].trim());
    return { kind: 'create-floor', name: rest, projectQuery };
  }

  if (ROOM_COUNT_QUERY_WORD_RE.test(text)) {
    const afterText = text.slice(text.search(ROOM_COUNT_QUERY_WORD_RE)).replace(ROOM_COUNT_QUERY_WORD_RE, '').trim();
    const floorQueryMatch = afterText.match(ROOM_COUNT_FLOOR_RE);
    const target = floorQueryMatch ? floorQueryMatch[1].trim() : '';
    const { rest, projectQuery } = splitTrailingProjectClause(target);
    return { kind: 'room-count-query', floorQuery: rest || undefined, projectQuery };
  }

  const roomCountMatch = text.match(ROOM_COUNT_RE);
  if (roomCountMatch) {
    const countWord = roomCountMatch[1].toLowerCase();
    const count = /^\d+$/.test(countWord) ? parseInt(countWord, 10) : parseLeadingNumber(countWord)?.value;
    if (count && count > 0) {
      // No room name here (count-based creation auto-names "Room 1", "Room
      // 2", ...) — the whole remainder is a floor/project qualifier, e.g.
      // "on the ground floor" or "to the Smith job". Falls back to the raw
      // remainder verbatim when there's no on/in/to/for connector at all
      // ("add 3 rooms ground floor") — there's no room name here to
      // collide with, so the caller can try it straight against real floor
      // names once loaded.
      const remainder = roomCountMatch[2].trim();
      const floorMatch = remainder.match(ROOM_COUNT_FLOOR_RE);
      const projectQuery = floorMatch ? floorMatch[1].trim() : (remainder || undefined);
      return { kind: 'create-room', name: '', count: Math.min(count, 20), projectQuery };
    }
  }

  const roomMatch = text.match(ROOM_RE);
  if (roomMatch) {
    // The trailing clause here is dual-purpose, resolved by the caller: a
    // floor name ("Kitchen on the ground floor") when already inside a
    // project, a project name ("Kitchen to the Smith job") otherwise.
    // splitRoomFloorClause (not splitTrailingProjectClause) is used because
    // "on"/"in" phrasing — how floors are actually spoken — needs to split
    // too, not just "to"/"for".
    const { roomPart, floorPart } = splitRoomFloorClause(roomMatch[1].trim());
    return { kind: 'create-room', name: roomPart, projectQuery: floorPart };
  }

  if (ADD_VERB_RE.test(text) && LABOUR_WORD_RE.test(text)) {
    const body = text.replace(ADD_VERB_RE, '');
    const { rest, projectQuery } = splitTrailingProjectClause(body);
    const { hours, flatMinor } = parseLabourAmount(rest);
    return { kind: 'add-labour', hours, flatMinor, projectQuery };
  }

  if (ESTIMATE_VERB_RE.test(text) && ESTIMATE_QUERY_RE.test(text)) {
    const forMatch = text.match(/\bfor\s+(?:the\s+|a\s+|my\s+)?(.+?)(?:\s+job|\s+project)?$/i);
    return { kind: 'estimate-query', projectQuery: forMatch ? forMatch[1].trim() : undefined };
  }

  if (ADD_VERB_RE.test(text)) {
    return { kind: 'add-material', parsed: parseVoiceCommand(text) };
  }

  // Last-resort fallbacks: a bare "delete X" / "change X to N" that didn't
  // match any more specific entity above is most likely referring to a line
  // on whichever estimate is in view ("delete the RCBO", "change the twin
  // and earth to 30") — no "line"/"quantity" keyword required, since that's
  // not how anyone actually phrases it.
  if (deleteMatch) {
    return { kind: 'remove-line', query: stripFiller(deleteMatch[1]) };
  }

  const setValueFallbackMatch = text.match(SET_VALUE_FALLBACK_RE);
  if (setValueFallbackMatch) {
    return { kind: 'set-line-quantity', query: stripFiller(setValueFallbackMatch[1]), amount: parseFloat(setValueFallbackMatch[2]) };
  }

  const searchMatch = text.match(SEARCH_RE);
  if (searchMatch) {
    return { kind: 'search-material', query: searchMatch[1].trim() };
  }

  const navMatch = text.match(NAV_RE);
  if (navMatch) {
    const target = navMatch[1].trim();
    const navHit = matchNavTarget(target);
    if (navHit) return { kind: 'navigate', path: navHit.path, label: navHit.label };
    return { kind: 'navigate-contextual', query: target };
  }

  return { kind: 'unknown', raw: text };
}
