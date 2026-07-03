import { describe, expect, it } from 'vitest';
import { parseGlobalVoiceCommand } from '../global-parser';

describe('parseGlobalVoiceCommand', () => {
  it('classifies a static navigation command', () => {
    const intent = parseGlobalVoiceCommand('open projects');
    expect(intent).toEqual({ kind: 'navigate', path: '/projects', label: 'Projects' });
  });

  it('classifies an unrecognised "open X" as a project name to search', () => {
    const intent = parseGlobalVoiceCommand('open the Smith job');
    expect(intent).toEqual({ kind: 'navigate-contextual', query: 'Smith job' });
  });

  it('classifies "create a new project called X for Y"', () => {
    const intent = parseGlobalVoiceCommand('create a new project called Smith Rewire for John Smith');
    expect(intent).toEqual({ kind: 'create-project', name: 'Smith Rewire', clientName: 'John Smith' });
  });

  it('classifies "create a new project called X" with no client', () => {
    const intent = parseGlobalVoiceCommand('create a new project called Oak Street');
    expect(intent).toEqual({ kind: 'create-project', name: 'Oak Street', clientName: undefined });
  });

  it('classifies a snag command with a target job', () => {
    const intent = parseGlobalVoiceCommand('add a snag: loose socket in the kitchen to the Smith job');
    expect(intent).toEqual({ kind: 'create-snag', description: 'loose socket in the kitchen', projectQuery: 'Smith' });
  });

  it('classifies a snag command with no target job', () => {
    const intent = parseGlobalVoiceCommand('add a snag broken light switch');
    expect(intent).toEqual({ kind: 'create-snag', description: 'broken light switch', projectQuery: undefined });
  });

  it('classifies an estimate query', () => {
    const intent = parseGlobalVoiceCommand('give me an estimate for the Smith job');
    expect(intent).toEqual({ kind: 'estimate-query', projectQuery: 'Smith' });
  });

  it('classifies an add-material command (delegates to the existing parser)', () => {
    const intent = parseGlobalVoiceCommand('add 50 metres of 2.5mm twin and earth to the Smith job');
    expect(intent.kind).toBe('add-material');
    if (intent.kind === 'add-material') {
      expect(intent.parsed.quantity).toBe(50);
      expect(intent.parsed.itemQuery).toBe('2.5mm twin and earth');
      expect(intent.parsed.projectQuery).toBe('Smith');
    }
  });

  it('falls back to unknown for gibberish', () => {
    const intent = parseGlobalVoiceCommand('purple elephant sandwich');
    expect(intent.kind).toBe('unknown');
  });

  it('returns unknown for an empty transcript', () => {
    expect(parseGlobalVoiceCommand('')).toEqual({ kind: 'unknown', raw: '' });
  });

  // Regression coverage: these all start with "add" but must NOT fall
  // through to the generic add-material command, which was the reported bug.
  it('classifies "add a new floor called X" as create-floor, not a material search', () => {
    const intent = parseGlobalVoiceCommand('add a new floor called Ground Floor');
    expect(intent).toEqual({ kind: 'create-floor', name: 'Ground Floor', projectQuery: undefined });
  });

  it('classifies "add a new floor" with no name yet as create-floor with an empty name', () => {
    const intent = parseGlobalVoiceCommand('add a new floor');
    expect(intent).toEqual({ kind: 'create-floor', name: '', projectQuery: undefined });
  });

  it('classifies a floor command with a target job', () => {
    const intent = parseGlobalVoiceCommand('add a floor called First Floor to the Smith job');
    expect(intent).toEqual({ kind: 'create-floor', name: 'First Floor', projectQuery: 'Smith' });
  });

  it('classifies "add a room called X"', () => {
    const intent = parseGlobalVoiceCommand('add a room called Kitchen');
    expect(intent).toEqual({ kind: 'create-room', name: 'Kitchen', projectQuery: undefined });
  });

  it('classifies "add a new snag" with no description yet as create-snag with an empty description', () => {
    const intent = parseGlobalVoiceCommand('add a new snag');
    expect(intent).toEqual({ kind: 'create-snag', description: '', projectQuery: undefined });
  });

  it('classifies "delete the X assembly" as delete-assembly', () => {
    const intent = parseGlobalVoiceCommand('delete the RCBO assembly');
    expect(intent).toEqual({ kind: 'delete-assembly', query: 'RCBO' });
  });

  it('classifies "remove assembly called X"', () => {
    const intent = parseGlobalVoiceCommand('remove assembly called Light Switch');
    expect(intent).toEqual({ kind: 'delete-assembly', query: 'Light Switch' });
  });

  it('does not treat a plain delete-project command as delete-assembly', () => {
    const intent = parseGlobalVoiceCommand('delete the Smith job');
    expect(intent.kind).not.toBe('delete-assembly');
  });

  it('classifies "create a new assembly" as open-assembly-builder', () => {
    const intent = parseGlobalVoiceCommand('create a new assembly');
    expect(intent).toEqual({ kind: 'open-assembly-builder' });
  });

  it('classifies "add a new assembly" as open-assembly-builder, not material search', () => {
    const intent = parseGlobalVoiceCommand('add a new assembly');
    expect(intent).toEqual({ kind: 'open-assembly-builder' });
  });

  // Flexible project-creation phrasing ("name is X client is Y"), a second
  // way of saying it besides "called X for Y".
  it('classifies "create new project name is X client is Y"', () => {
    const intent = parseGlobalVoiceCommand("create new project name is Murphy's Bar client is John");
    expect(intent).toEqual({ kind: 'create-project', name: "Murphy's Bar", clientName: 'John' });
  });

  it('classifies "create a new project" alone with an empty name', () => {
    const intent = parseGlobalVoiceCommand('create a new project');
    expect(intent).toEqual({ kind: 'create-project', name: '', clientName: undefined });
  });

  it('classifies "add labour two hours" (spoken number) as add-labour, not material search', () => {
    const intent = parseGlobalVoiceCommand('add labour two hours');
    expect(intent).toEqual({ kind: 'add-labour', hours: 2, flatMinor: undefined, projectQuery: undefined });
  });

  it('classifies "add 2 hours labour to the Smith job"', () => {
    const intent = parseGlobalVoiceCommand('add 2 hours labour to the Smith job');
    expect(intent).toEqual({ kind: 'add-labour', hours: 2, flatMinor: undefined, projectQuery: 'Smith' });
  });

  it('classifies a flat labour amount', () => {
    const intent = parseGlobalVoiceCommand('add labour of 250 pounds to the Smith job');
    expect(intent).toEqual({ kind: 'add-labour', hours: undefined, flatMinor: 25000, projectQuery: 'Smith' });
  });

  it('classifies "add labour" alone with no amount yet', () => {
    const intent = parseGlobalVoiceCommand('add labour');
    expect(intent).toEqual({ kind: 'add-labour', hours: undefined, flatMinor: undefined, projectQuery: undefined });
  });

  it('classifies "add 3 rooms" as a batch create-room with a count', () => {
    const intent = parseGlobalVoiceCommand('add 3 rooms');
    expect(intent).toEqual({ kind: 'create-room', name: '', count: 3, projectQuery: undefined });
  });

  it('classifies a spoken-number room count ("add three rooms")', () => {
    const intent = parseGlobalVoiceCommand('add three rooms');
    expect(intent).toEqual({ kind: 'create-room', name: '', count: 3, projectQuery: undefined });
  });

  it('classifies "add 3 floors" as a batch create-floor with a count', () => {
    const intent = parseGlobalVoiceCommand('add 3 floors');
    expect(intent).toEqual({ kind: 'create-floor', name: '', count: 3, projectQuery: undefined });
  });

  it('classifies a spoken-number floor count ("create three floors")', () => {
    const intent = parseGlobalVoiceCommand('create three floors');
    expect(intent).toEqual({ kind: 'create-floor', name: '', count: 3, projectQuery: undefined });
  });

  it('still classifies a single named floor as before (no count field)', () => {
    const intent = parseGlobalVoiceCommand('add a new floor called Ground Floor');
    expect(intent).toEqual({ kind: 'create-floor', name: 'Ground Floor', projectQuery: undefined });
  });

  it('classifies a room-count query', () => {
    const intent = parseGlobalVoiceCommand('how many rooms are on the ground floor');
    expect(intent).toEqual({ kind: 'room-count-query', floorQuery: 'ground floor', projectQuery: undefined });
  });

  it('classifies a room-count query with no floor named', () => {
    const intent = parseGlobalVoiceCommand('how many rooms are there');
    expect(intent.kind).toBe('room-count-query');
  });

  // --- Project rename/delete ---
  it('classifies "rename the Smith job to Smith Rewire"', () => {
    const intent = parseGlobalVoiceCommand('rename the Smith job to Smith Rewire');
    expect(intent).toEqual({ kind: 'rename-project', query: 'Smith', newName: 'Smith Rewire' });
  });

  it('classifies "rename this project to X" with no old-name reference', () => {
    const intent = parseGlobalVoiceCommand('rename this project to Murphy\'s Bar');
    expect(intent).toEqual({ kind: 'rename-project', query: undefined, newName: "Murphy's Bar" });
  });

  it('classifies "delete the Smith job" as delete-project', () => {
    const intent = parseGlobalVoiceCommand('delete the Smith job');
    expect(intent).toEqual({ kind: 'delete-project', query: 'Smith' });
  });

  // --- Assembly hide (bug fix regression: "hide" must NOT permanently delete) ---
  it('classifies "hide the RCBO assembly" as hide-assembly, not delete-assembly', () => {
    const intent = parseGlobalVoiceCommand('hide the RCBO assembly');
    expect(intent).toEqual({ kind: 'hide-assembly', query: 'RCBO' });
  });

  it('still classifies "remove assembly called X" as delete-assembly', () => {
    const intent = parseGlobalVoiceCommand('remove assembly called Light Switch');
    expect(intent).toEqual({ kind: 'delete-assembly', query: 'Light Switch' });
  });

  // --- Floor/room rename/delete ---
  it('classifies "rename the ground floor to First Floor"', () => {
    const intent = parseGlobalVoiceCommand('rename the ground floor to First Floor');
    expect(intent).toEqual({ kind: 'rename-floor', query: 'ground', newName: 'First Floor' });
  });

  it('classifies "delete the ground floor"', () => {
    const intent = parseGlobalVoiceCommand('delete the ground floor');
    expect(intent).toEqual({ kind: 'delete-floor', query: 'ground' });
  });

  it('classifies "rename the kitchen room to Utility Room"', () => {
    const intent = parseGlobalVoiceCommand('rename the kitchen room to Utility Room');
    expect(intent).toEqual({ kind: 'rename-room', query: 'kitchen', newName: 'Utility Room' });
  });

  it('classifies "delete the kitchen room"', () => {
    const intent = parseGlobalVoiceCommand('delete the kitchen room');
    expect(intent).toEqual({ kind: 'delete-room', query: 'kitchen' });
  });

  // --- Snag delete ---
  it('classifies "delete the snag about the loose socket"', () => {
    const intent = parseGlobalVoiceCommand('delete the snag about the loose socket');
    expect(intent).toEqual({ kind: 'delete-snag', query: 'about loose socket' });
  });

  // --- Catalogue price / settings ---
  it('classifies a material price change', () => {
    const intent = parseGlobalVoiceCommand('change the price of 2.5mm twin and earth to £1.20');
    expect(intent).toEqual({ kind: 'change-material-price', query: '2.5mm twin and earth', priceMinor: 120 });
  });

  it('classifies a VAT rate change', () => {
    const intent = parseGlobalVoiceCommand('set the vat rate to 20 percent');
    expect(intent).toEqual({ kind: 'set-vat-rate', pct: 20 });
  });

  it('classifies a currency change to euros', () => {
    const intent = parseGlobalVoiceCommand('set currency to euros');
    expect(intent).toEqual({ kind: 'set-currency', currency: 'EUR' });
  });

  it('classifies a currency change to pounds', () => {
    const intent = parseGlobalVoiceCommand('change currency to pounds');
    expect(intent).toEqual({ kind: 'set-currency', currency: 'GBP' });
  });

  it('classifies a labour rate change, distinct from adding a labour line', () => {
    const intent = parseGlobalVoiceCommand('set the labour rate to £55');
    expect(intent).toEqual({ kind: 'set-labour-rate', amountMinor: 5500 });
  });

  // --- Line-item remove / quantity change ---
  it('classifies removing a line by description', () => {
    const intent = parseGlobalVoiceCommand('remove the RCBO line');
    expect(intent).toEqual({ kind: 'remove-line', query: 'RCBO' });
  });

  it('does not treat "remove the RCBO line" as delete-assembly', () => {
    const intent = parseGlobalVoiceCommand('remove the RCBO line');
    expect(intent.kind).not.toBe('delete-assembly');
  });

  it('classifies changing a line quantity', () => {
    const intent = parseGlobalVoiceCommand('change the twin and earth quantity to 30');
    expect(intent).toEqual({ kind: 'set-line-quantity', query: 'twin and earth', amount: 30 });
  });

  it('classifies opening Photos & Storage', () => {
    const intent = parseGlobalVoiceCommand('open photos and storage');
    expect(intent).toEqual({ kind: 'navigate', path: '/media-settings', label: 'Photos & Storage' });
  });

  // --- Natural-phrasing fallbacks (no "line"/"quantity" keyword needed) ---
  it('classifies "delete the RCBO" (no "line" word) as remove-line', () => {
    const intent = parseGlobalVoiceCommand('delete the RCBO');
    expect(intent).toEqual({ kind: 'remove-line', query: 'RCBO' });
  });

  it('classifies "remove the twin and earth" as remove-line', () => {
    const intent = parseGlobalVoiceCommand('remove the twin and earth');
    expect(intent).toEqual({ kind: 'remove-line', query: 'twin and earth' });
  });

  it('classifies "delete the labour" as remove-line', () => {
    const intent = parseGlobalVoiceCommand('delete the labour');
    expect(intent).toEqual({ kind: 'remove-line', query: 'labour' });
  });

  it('classifies "change the twin and earth to 30" (no "quantity" word) as set-line-quantity', () => {
    const intent = parseGlobalVoiceCommand('change the twin and earth to 30');
    expect(intent).toEqual({ kind: 'set-line-quantity', query: 'twin and earth', amount: 30 });
  });

  it('still prefers delete-project over the generic remove-line fallback', () => {
    const intent = parseGlobalVoiceCommand('delete the Smith job');
    expect(intent.kind).toBe('delete-project');
  });

  it('still prefers delete-floor over the generic remove-line fallback', () => {
    const intent = parseGlobalVoiceCommand('delete the ground floor');
    expect(intent.kind).toBe('delete-floor');
  });

  // --- Editing an existing labour line (distinct from "add labour" and "set labour rate") ---
  it('classifies "change the labour to 3 hours" as edit-labour-line', () => {
    const intent = parseGlobalVoiceCommand('change the labour to 3 hours');
    expect(intent).toEqual({ kind: 'edit-labour-line', hours: 3, flatMinor: undefined });
  });

  it('classifies "set labour to £200" as edit-labour-line with a flat amount', () => {
    const intent = parseGlobalVoiceCommand('set labour to £200');
    expect(intent).toEqual({ kind: 'edit-labour-line', hours: undefined, flatMinor: 20000 });
  });

  it('does not confuse "set the labour rate to 55" with edit-labour-line', () => {
    const intent = parseGlobalVoiceCommand('set the labour rate to 55');
    expect(intent.kind).toBe('set-labour-rate');
  });

  // --- Clear whole estimate ---
  it('classifies "clear the estimate"', () => {
    expect(parseGlobalVoiceCommand('clear the estimate')).toEqual({ kind: 'clear-estimate' });
  });

  it('classifies "delete the whole quote"', () => {
    expect(parseGlobalVoiceCommand('delete the whole quote')).toEqual({ kind: 'clear-estimate' });
  });

  it('classifies "start a new estimate"', () => {
    expect(parseGlobalVoiceCommand('start a new estimate')).toEqual({ kind: 'clear-estimate' });
  });

  // --- Preview PDF ---
  it('classifies "preview pdf quote"', () => {
    expect(parseGlobalVoiceCommand('preview pdf quote')).toEqual({ kind: 'preview-pdf' });
  });

  it('classifies "show me a preview of the pdf"', () => {
    expect(parseGlobalVoiceCommand('show me a preview of the pdf')).toEqual({ kind: 'preview-pdf' });
  });

  // --- Project report ---
  it('classifies "open report"', () => {
    expect(parseGlobalVoiceCommand('open report')).toEqual({ kind: 'generate-report' });
  });

  it('classifies "generate the report"', () => {
    expect(parseGlobalVoiceCommand('generate the report')).toEqual({ kind: 'generate-report' });
  });

  it('classifies "share the report"', () => {
    expect(parseGlobalVoiceCommand('share the report')).toEqual({ kind: 'generate-report' });
  });

  // --- Plain catalogue lookup (no add/create verb) ---
  it('classifies "find twin and earth" as a material search', () => {
    expect(parseGlobalVoiceCommand('find twin and earth')).toEqual({ kind: 'search-material', query: 'twin and earth' });
  });

  it('classifies "search for RCBO"', () => {
    expect(parseGlobalVoiceCommand('search for RCBO')).toEqual({ kind: 'search-material', query: 'RCBO' });
  });

  it('classifies "search cable" (no "for")', () => {
    expect(parseGlobalVoiceCommand('search cable')).toEqual({ kind: 'search-material', query: 'cable' });
  });

  it('classifies "look up MCB"', () => {
    expect(parseGlobalVoiceCommand('look up MCB')).toEqual({ kind: 'search-material', query: 'MCB' });
  });

  it('does not let the search verbs break "show me" navigation', () => {
    const intent = parseGlobalVoiceCommand('show me projects');
    expect(intent).toEqual({ kind: 'navigate', path: '/projects', label: 'Projects' });
  });

  // --- Review & Sign, reachable from anywhere ---
  it('classifies "open review and sign" as an estimate-query (opens the Review screen)', () => {
    const intent = parseGlobalVoiceCommand('open review and sign');
    expect(intent).toEqual({ kind: 'estimate-query', projectQuery: undefined });
  });

  it('classifies "sign the quote" as an estimate-query', () => {
    const intent = parseGlobalVoiceCommand('sign the quote');
    expect(intent).toEqual({ kind: 'estimate-query', projectQuery: undefined });
  });

  it('classifies "give me the review for the Smith job" with a project target', () => {
    const intent = parseGlobalVoiceCommand('give me the review for the Smith job');
    expect(intent).toEqual({ kind: 'estimate-query', projectQuery: 'Smith' });
  });

  it('still routes "open the quote" to project quote navigation, not the review screen', () => {
    const intent = parseGlobalVoiceCommand('open the quote');
    expect(intent.kind).toBe('navigate-contextual');
  });
});
