/**
 * App-wide voice control — a floating mic button (mounted once in the root
 * layout, so it's available on every screen) plus its command modal.
 *
 * Covers: navigation, creating/renaming/deleting projects, floors, rooms
 * and snags, adding materials/labour (to a project or the standalone Estimate
 * screen), deleting/hiding assemblies, catalogue price edits, VAT/currency/
 * labour-rate settings, and removing or changing the quantity of a line on
 * whichever estimate is currently in view.
 *
 * Writes reuse the same repo/store functions the manual screens use
 * (createProject, renameProject, deleteProject, addLocation, renameLocation,
 * deleteLocation, createSnagItem, deleteSnagItem, deleteAssembly,
 * setAssemblyFavourite, updateMaterialPrice, useSettingsStore,
 * useEstimateStore, addMaterialToProjectByVoice, addLabourToProjectByVoice)
 * — nothing here duplicates a write path, only the command interpretation
 * and confirmation UI are new.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Assembly, LineItem, Location, Material, Project, SnagItem } from '../../domain/types';
import { colors, space, radius } from '../theme/tokens';
import { formatMoney } from '../../domain/money';
import {
  loadProjects, createProject, renameProject, deleteProject,
  loadLocations, addLocation, renameLocation, deleteLocation,
} from '../../data/project-repo';
import { loadCatalogue, deleteAssembly, setAssemblyFavourite, nextFavouriteRank, updateMaterialPrice } from '../../data/catalogue-repo';
import { createSnagItem, snagItemsForProject, deleteSnagItem, setSnagResolved } from '../../data/snag-repo';
import { loadProjectEstimate, saveProjectEstimate } from '../../data/project-estimate-repo';
import { useEstimateStore } from '../../state/estimateStore';
import { useSettingsStore } from '../../state/settingsStore';
import { addAssemblyToProjectByVoice, addLabourToProjectByVoice, addMaterialToProjectByVoice } from '../../voice/voice-write';
import { materialLookupFrom } from '../../domain/assembly';
import { priceLine } from '../../domain/pricing';
import { lineFromAssembly } from '../../data/estimate-service';
import { toLaborToggle } from '../../data/mappers';
import { seedLaborToggles } from '../../data/seed/assemblies';
import { isLabourOnlyLine, materialLinesForLocation, formatMaterialLineSummary } from '../../domain/materials-query';
import { parseGlobalVoiceCommand, type GlobalVoiceIntent } from '../../voice/global-parser';
import { matchProjectNavTarget } from '../../voice/nav-targets';
import { buildVoiceVocabulary } from '../../voice/vocabulary';
import { emitVoiceAction, useVoiceAction } from '../../voice/voice-bus';
import {
  matchAssemblies, matchLines, matchLocations, matchMaterials, matchProjects, matchRoomWithFloor, matchSnags,
  stripKnownFloorName,
  type AssemblyMatch, type MaterialMatch, type ProjectMatch,
} from '../../voice/matcher';
import type { ParsedVoiceCommand } from '../../voice/command-parser';
import { useVoiceCommand } from '../../voice/useVoiceCommand';
import { useCurrentProjectContext } from '../../voice/useCurrentProjectContext';
import { useTabBarHeightStore } from '../../state/tabBarHeightStore';

type Step =
  | 'idle' | 'listening' | 'processing'
  | 'project-pick' | 'floor-pick' | 'item-pick' | 'assembly-pick' | 'manual-search' | 'entity-pick'
  | 'confirm-project' | 'confirm-snag' | 'confirm-floor' | 'confirm-room' | 'confirm-labour'
  | 'confirm-material' | 'confirm-add-assembly' | 'confirm-delete-assembly'
  | 'confirm-rename' | 'confirm-delete-entity' | 'confirm-mark-snag' | 'confirm-setting' | 'confirm-price' | 'confirm-line-op'
  | 'confirm-clear-estimate'
  | 'saving' | 'saved' | 'unknown' | 'info';

type PickPurpose =
  | 'open' | 'snag' | 'estimate' | 'material' | 'floor' | 'room' | 'labour' | 'room-count' | 'materials-query'
  | 'rename-project' | 'delete-project' | 'floor-room-op' | 'labour-rate-setting' | 'found-material';

type EntityKind = 'project' | 'floor' | 'room' | 'snag';

type FloorRoomOp =
  | { kind: 'rename-floor'; query: string; newName: string }
  | { kind: 'delete-floor'; query: string }
  | { kind: 'rename-room'; query: string; newName: string }
  | { kind: 'delete-room'; query: string }
  | { kind: 'delete-snag'; query: string }
  | { kind: 'mark-snag'; query: string; resolved: boolean };

type SettingKind = 'vat' | 'currency' | 'labourRate';

/** Fields on a confirm screen that can be voice-filled in place, e.g. when a
 * command like "create a new project" or "add a new snag" arrives with no
 * name/description spoken yet. The indexed variants let a batch of floors or
 * rooms ("add 3 floors") each get their own name by voice, one at a time. */
type DictateTarget =
  | { kind: 'projectName' | 'clientName' | 'snagDescription' | 'floorName' | 'roomName' | 'renameDraft' }
  | { kind: 'floorNameAt' | 'roomNameAt'; index: number };

const CONFIDENT_SCORE = 0.25;
/** Matches a plain project-detail route ("/project/abc123"), same pattern as
 * useCurrentProjectContext's PLAIN_PROJECT_RE — not exported from there since
 * that hook only needs it internally, so duplicated here rather than adding a
 * cross-file dependency for one regex. */
const PLAIN_PROJECT_RE = /^\/project\/([^/]+)$/;
const allLaborToggles = seedLaborToggles.map(toLaborToggle);
const laborToggleIndex = new Map(allLaborToggles.map((t) => [t.id, t]));

export function GlobalVoiceControl() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeightStore((s) => s.height);
  const pathname = usePathname();
  const isQuickQuote = pathname === '/estimate';
  const isTabScreen = pathname === '/' || pathname === '/projects' || pathname === '/settings';
  const isPlainProjectDetail = PLAIN_PROJECT_RE.test(pathname)
    && !['new', 'room', 'plan', 'wall', 'quote', 'snag', 'drawings', 'floor'].includes(pathname.split('/')[2] ?? '');
  /** These screens have their own header mic button (see
   * TabBarHeightReporter's sibling pattern) instead of the floating one, so
   * users always have exactly one visible mic trigger, never two. */
  const hasOwnHeaderMic = pathname === '/' || pathname === '/estimate' || pathname === '/projects'
    || pathname === '/catalogue' || isPlainProjectDetail;
  /** Tools and Help are reference/utility screens with no voice actions of
   * their own — no mic trigger needed here at all, header or floating. */
  const isVoiceFreeScreen = pathname === '/help' || pathname === '/tools' || pathname.startsWith('/tools/');
  const { projectId: currentProjectId, locationId: currentLocationId } = useCurrentProjectContext();
  const voice = useVoiceCommand();

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [rawTranscript, setRawTranscript] = useState('');
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  const [projects, setProjects] = useState<Project[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);

  const [projectCandidates, setProjectCandidates] = useState<ProjectMatch[]>([]);
  const [pickPurpose, setPickPurpose] = useState<PickPurpose | null>(null);
  const [floorCandidates, setFloorCandidates] = useState<Location[]>([]);
  const [itemCandidates, setItemCandidates] = useState<MaterialMatch[]>([]);
  const [assemblyCandidates, setAssemblyCandidates] = useState<AssemblyMatch[]>([]);
  const [manualQuery, setManualQuery] = useState('');
  const [materialPickPurpose, setMaterialPickPurpose] = useState<'add' | 'price' | 'search'>('add');

  // Generic entity picker (floors/rooms/snags/lines resolved for the newer commands).
  const [entityPickLabel, setEntityPickLabel] = useState('');
  const [entityPickItems, setEntityPickItems] = useState<{ id: string; label: string; sublabel?: string }[]>([]);
  const entityPickCallback = useRef<((item: { id: string; label: string }) => void) | null>(null);

  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(null);
  const [resolvedLocationId, setResolvedLocationId] = useState<string | null>(null);
  const [resolvedProjectName, setResolvedProjectName] = useState('');
  const [targetIsQuickQuote, setTargetIsQuickQuote] = useState(false);
  const [resolvedFloorId, setResolvedFloorId] = useState<string | null>(null);
  const [resolvedFloorName, setResolvedFloorName] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [selectedAssembly, setSelectedAssembly] = useState<Assembly | null>(null);
  const [addAssemblyTarget, setAddAssemblyTarget] = useState<Assembly | null>(null);
  const [addAssemblyQtyText, setAddAssemblyQtyText] = useState('1');
  const [assemblyAction, setAssemblyAction] = useState<'delete' | 'hide' | 'show'>('delete');
  const [amountText, setAmountText] = useState('1');
  const [snagDescription, setSnagDescription] = useState('');
  const [floorNameDraft, setFloorNameDraft] = useState('');
  const [floorCountDraft, setFloorCountDraft] = useState(1);
  const [floorNamesDraft, setFloorNamesDraft] = useState<string[]>([]);
  const [roomNameDraft, setRoomNameDraft] = useState('');
  const [roomCountDraft, setRoomCountDraft] = useState(1);
  const [roomNamesDraft, setRoomNamesDraft] = useState<string[]>([]);
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [clientNameDraft, setClientNameDraft] = useState('');
  const [labourMode, setLabourMode] = useState<'hours' | 'flat'>('hours');
  const [labourAmountText, setLabourAmountText] = useState('1');
  const [labourConfirmMode, setLabourConfirmMode] = useState<'add' | 'edit'>('add');
  const [labourEditTarget, setLabourEditTarget] = useState<{ lineId: string; scope: { isQuickQuote: boolean; projectId?: string } } | null>(null);
  const [clearEstimateScope, setClearEstimateScope] = useState<{ isQuickQuote: boolean; projectId?: string; label: string } | null>(null);
  const [infoMessage, setInfoMessage] = useState('');

  // Voice-filling a single text field on a confirm screen (name/client/
  // description, or one item in a batch of floor/room names) rather than
  // reparsing a whole new command.
  const [dictateTarget, setDictateTarget] = useState<DictateTarget | null>(null);

  // Rename (project/floor/room)
  const [renameTarget, setRenameTarget] = useState<{ kind: EntityKind; id: string; oldName: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  // Delete (project/floor/room/snag)
  const [deleteTarget, setDeleteTarget] = useState<{ kind: EntityKind; id: string; label: string } | null>(null);

  // Mark a snag resolved/unresolved
  const [snagDoneTarget, setSnagDoneTarget] = useState<{ id: string; label: string; resolved: boolean } | null>(null);

  // Settings (VAT / currency / labour rate)
  const [settingKind, setSettingKind] = useState<SettingKind>('vat');
  const [settingValueDraft, setSettingValueDraft] = useState('');
  const [settingCurrencyDraft, setSettingCurrencyDraft] = useState<'GBP' | 'EUR'>('GBP');
  const [settingLabourScope, setSettingLabourScope] = useState<{ isQuickQuote: boolean; projectId?: string; projectName?: string } | null>(null);

  // Catalogue price change
  const [priceTarget, setPriceTarget] = useState<{ materialId: string; materialName: string; priceDraft: string } | null>(null);

  // Line-item remove / quantity change (on whichever estimate is in view)
  const [lineOpTarget, setLineOpTarget] = useState<{
    kind: 'remove' | 'setQuantity'; lineId: string; description: string; quantityDraft: string;
    scope: { isQuickQuote: boolean; projectId?: string };
  } | null>(null);

  const pendingParsed = useRef<ParsedVoiceCommand | null>(null);
  const pendingRoomName = useRef<string>('');
  const pendingRoomCount = useRef<number>(1);
  const pendingFloorCount = useRef<number>(1);
  const pendingLabour = useRef<{ hours?: number; flatMinor?: number }>({});
  const pendingFloorQuery = useRef<string | undefined>(undefined);
  const pendingRoomQuery = useRef<string>('');
  const pendingRenameNewName = useRef<string>('');
  const pendingFloorRoomOp = useRef<FloorRoomOp | null>(null);
  const pendingPriceMinor = useRef<number>(0);
  const pendingLabourRateMinor = useRef<number>(0);
  const pendingFoundMaterial = useRef<Material | null>(null);
  /** Recognizer vocabulary hint list — rebuilt once per FAB press (not per
   * command) so a whole multi-command session shares one biasing list. */
  const vocabRef = useRef<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    loadProjects().then(setProjects).catch(() => {});
    loadCatalogue().then((c) => { setMaterials(c.materials); setAssemblies(c.assemblies); }).catch(() => {});
  }, [visible]);

  const assemblyLookup = useMemo(() => materialLookupFrom(materials), [materials]);

  const open = async () => {
    setVisible(true);
    setRawTranscript('');
    voice.reset();
    try {
      vocabRef.current = await buildVoiceVocabulary(useSettingsStore.getState().customVoiceWords);
    } catch {
      vocabRef.current = [];
    }
    startListening();
  };

  useVoiceAction('openVoiceControl', open);

  const close = () => {
    setVisible(false);
    voice.reset();
  };

  /**
   * Resets all transient per-command state and immediately starts listening
   * again — used after every command completes (Cancel, Try again, OK, and
   * the post-save timeouts) so one FAB press covers a whole multi-command
   * session instead of requiring a tap before each command.
   */
  const backToIdle = () => {
    setRawTranscript('');
    setProjectCandidates([]);
    setFloorCandidates([]);
    setItemCandidates([]);
    setAssemblyCandidates([]);
    setManualQuery('');
    setMaterialPickPurpose('add');
    setEntityPickItems([]);
    setEntityPickLabel('');
    entityPickCallback.current = null;
    setSelectedMaterial(null);
    setSelectedAssembly(null);
    setAssemblyAction('delete');
    setAddAssemblyTarget(null);
    setAddAssemblyQtyText('1');
    setResolvedProjectId(null);
    setResolvedLocationId(null);
    setResolvedFloorId(null);
    setTargetIsQuickQuote(false);
    setRoomCountDraft(1);
    setInfoMessage('');
    setRenameTarget(null);
    setRenameDraft('');
    setDeleteTarget(null);
    setSnagDoneTarget(null);
    setSettingLabourScope(null);
    setPriceTarget(null);
    setLineOpTarget(null);
    setLabourConfirmMode('add');
    setLabourEditTarget(null);
    setClearEstimateScope(null);
    setPickPurpose(null);
    pendingParsed.current = null;
    pendingRoomName.current = '';
    pendingRoomCount.current = 1;
    pendingLabour.current = {};
    pendingFloorQuery.current = undefined;
    pendingRoomQuery.current = '';
    pendingRenameNewName.current = '';
    pendingFloorRoomOp.current = null;
    pendingPriceMinor.current = 0;
    pendingLabourRateMinor.current = 0;
    pendingFoundMaterial.current = null;
    pendingFloorCount.current = 1;
    setFloorCountDraft(1);
    setFloorNamesDraft([]);
    setRoomNamesDraft([]);
    setDictateTarget(null);
    startListening();
  };

  const applyDictation = (target: DictateTarget, text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    switch (target.kind) {
      case 'projectName': setProjectNameDraft(cleaned); return;
      case 'clientName': setClientNameDraft(cleaned); return;
      case 'snagDescription': setSnagDescription(cleaned); return;
      case 'floorName': setFloorNameDraft(cleaned); return;
      case 'roomName': setRoomNameDraft(cleaned); return;
      case 'renameDraft': setRenameDraft(cleaned); return;
      case 'floorNameAt':
        setFloorNamesDraft((prev) => prev.map((v, i) => (i === target.index ? cleaned : v)));
        return;
      case 'roomNameAt':
        setRoomNamesDraft((prev) => prev.map((v, i) => (i === target.index ? cleaned : v)));
        return;
    }
  };

  const startDictation = async (target: DictateTarget) => {
    setDictateTarget(target);
    voice.reset();
    await voice.start(vocabRef.current);
  };

  useEffect(() => {
    if (!voice.transcript) return;
    if (dictateTarget) {
      applyDictation(dictateTarget, voice.transcript);
      setDictateTarget(null);
      voice.reset();
      return;
    }
    if (step === 'listening') {
      setRawTranscript(voice.transcript);
      setStep('processing');
      runPipeline(voice.transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.transcript]);

  const startListening = async () => {
    setStep('listening');
    await voice.start(vocabRef.current);
  };

  const openProjectScreen = (project: Project) => {
    router.push(`/project/${project.id}` as any);
    backToIdle();
  };

  const openReview = (projectId: string) => {
    router.push(`/review?projectId=${projectId}` as any);
    backToIdle();
  };

  const showEntityPick = (label: string, items: { id: string; label: string; sublabel?: string }[], onPick: (item: { id: string; label: string }) => void) => {
    setEntityPickLabel(label);
    setEntityPickItems(items);
    entityPickCallback.current = onPick;
    setStep('entity-pick');
  };

  const resolveProjectPick = (query: string, purpose: PickPurpose) => {
    const matches = matchProjects(query, projects, 3);
    if (matches.length === 1 && matches[0].score < CONFIDENT_SCORE) {
      return matches[0].project;
    }
    setProjectCandidates(matches.length > 0 ? matches : projects.map((p) => ({ project: p, score: 1 })));
    setPickPurpose(purpose);
    setStep('project-pick');
    return null;
  };

  const resolveMaterial = (parsed: ParsedVoiceCommand, target: { projectId: string; projectName: string } | { quickQuote: true }) => {
    if ('quickQuote' in target) {
      setTargetIsQuickQuote(true);
      setResolvedProjectId(null);
      setResolvedProjectName('Estimate');
    } else {
      setTargetIsQuickQuote(false);
      setResolvedProjectId(target.projectId);
      setResolvedProjectName(target.projectName);
    }
    setAmountText(String(parsed.quantity));
    const matches = matchMaterials(parsed.itemQuery, materials, 20);
    if (matches.length === 1 && matches[0].score < CONFIDENT_SCORE) {
      setSelectedMaterial(matches[0].material);
      setStep('confirm-material');
      return;
    }
    if (matches.length > 0) {
      setItemCandidates(matches);
      setStep('item-pick');
      return;
    }
    setManualQuery(parsed.itemQuery);
    setStep('manual-search');
  };

  const beginAddAssemblyConfirm = (
    assembly: Assembly,
    quantity: number,
    target: { projectId: string; projectName: string } | { quickQuote: true },
  ) => {
    if ('quickQuote' in target) {
      setTargetIsQuickQuote(true);
      setResolvedProjectId(null);
      setResolvedProjectName('Estimate');
    } else {
      setTargetIsQuickQuote(false);
      setResolvedProjectId(target.projectId);
      setResolvedProjectName(target.projectName);
    }
    setAddAssemblyTarget(assembly);
    setAddAssemblyQtyText(String(quantity && quantity > 0 ? quantity : 1));
    setStep('confirm-add-assembly');
  };

  /**
   * When adding a material/assembly/labour line while already inside a
   * project (currentProjectId set), the trailing "to/for X" clause the
   * parser captured as projectQuery is actually a room name in this
   * context — the project is already known, so that clause can only be
   * describing where in the project the line goes ("add a socket to the
   * kitchen"). Resolves it against the project's rooms via fuzzy match,
   * asking the user when ambiguous, and calls onResolved with the room's
   * locationId (or undefined if no room was said / none matched).
   */
  const resolveRoomThenAdd = async (
    projectId: string,
    roomQuery: string | undefined,
    onResolved: (locationId?: string) => void,
  ) => {
    if (!roomQuery) { onResolved(undefined); return; }
    const locations = await loadLocations(projectId).catch(() => [] as Location[]);
    const rooms = locations.filter((l) => l.parentId != null);
    const floors = locations.filter((l) => l.parentId == null);
    const matches = matchRoomWithFloor(roomQuery, rooms, floors);
    if (matches.length === 1 && matches[0].score < CONFIDENT_SCORE) { onResolved(matches[0].location.id); return; }
    if (matches.length > 0) {
      showEntityPick('Which room?', matches.map((m) => ({ id: m.location.id, label: m.location.name })), (item) => onResolved(item.id));
      return;
    }
    onResolved(undefined);
  };

  /**
   * "add X" resolves against assemblies (Add-Job tiles) as well as
   * raw materials — voice previously could only add materials, but tapping a
   * favourited assembly tile is the single most common add-job action.
   * An assembly only wins when it's a confident match and at least as good
   * as the best material match, so genuine material queries ("twin and
   * earth") aren't hijacked by a loosely-related assembly name.
   */
  const resolveAddTarget = (
    parsed: ParsedVoiceCommand,
    target: { projectId: string; projectName: string } | { quickQuote: true },
  ) => {
    const bestAssembly = matchAssemblies(parsed.itemQuery, assemblies, 1)[0];
    const bestMaterial = matchMaterials(parsed.itemQuery, materials, 1)[0];
    const assemblyWins = !!bestAssembly && bestAssembly.score < CONFIDENT_SCORE && (!bestMaterial || bestAssembly.score <= bestMaterial.score);
    if (assemblyWins) {
      beginAddAssemblyConfirm(bestAssembly.assembly, parsed.quantity, target);
      return;
    }
    resolveMaterial(parsed, target);
  };

  const beginLabourConfirm = (
    amount: { hours?: number; flatMinor?: number },
    target: { projectId: string; projectName: string } | { quickQuote: true },
  ) => {
    if ('quickQuote' in target) {
      setTargetIsQuickQuote(true);
      setResolvedProjectId(null);
      setResolvedProjectName('Estimate');
    } else {
      setTargetIsQuickQuote(false);
      setResolvedProjectId(target.projectId);
      setResolvedProjectName(target.projectName);
    }
    if (amount.flatMinor != null) {
      setLabourMode('flat');
      setLabourAmountText(String(amount.flatMinor / 100));
    } else {
      setLabourMode('hours');
      setLabourAmountText(String(amount.hours ?? 1));
    }
    setStep('confirm-labour');
  };

  const beginFloorCreate = (name: string, count: number, projectId: string, projectName: string) => {
    setResolvedProjectId(projectId);
    setResolvedProjectName(projectName);
    setFloorCountDraft(count);
    if (count > 1) {
      setFloorNamesDraft(Array.from({ length: count }, (_, i) => `Floor ${i + 1}`));
    } else {
      setFloorNameDraft(name);
    }
    setStep('confirm-floor');
  };

  /**
   * Rooms need a floor too — resolve it from the project's existing floors.
   * `floorQuery` is the trailing "on/to/for the X floor" clause the parser
   * captured (dual-purpose field, see the 'create-room' case) — when the
   * electrician actually named a floor, it should win over the "only one
   * floor exists" / "ask me" defaults below, not be silently dropped.
   */
  const beginRoomCreate = async (
    roomName: string, count: number, projectId: string, projectName: string, floorQuery?: string,
  ) => {
    setResolvedProjectId(projectId);
    setResolvedProjectName(projectName);
    setRoomCountDraft(count);
    const locations = await loadLocations(projectId).catch(() => []);
    const floors = locations.filter((l) => l.parentId == null);
    if (floors.length === 0) {
      if (count > 1) setRoomNamesDraft(Array.from({ length: count }, (_, i) => `Room ${i + 1}`));
      else setRoomNameDraft(roomName);
      setInfoMessage(`"${projectName}" has no floors yet — add a floor first, then a room.`);
      setStep('info');
      return;
    }
    // A floor name might not have been split off by the parser at all —
    // "Kitchen ground floor" with no comma/on/to/for connector parses as
    // one bare room name. Now that the project's real floor names are
    // loaded, check whether one of them is hiding inside the room name
    // before falling back to grammar-based parsing.
    let effectiveFloorQuery = floorQuery;
    let effectiveRoomName = roomName;
    if (!effectiveFloorQuery && count === 1 && roomName) {
      const { rest, floor } = stripKnownFloorName(roomName, floors);
      if (floor) {
        effectiveFloorQuery = floor.name;
        effectiveRoomName = rest || roomName;
      }
    }
    if (count > 1) {
      setRoomNamesDraft(Array.from({ length: count }, (_, i) => `Room ${i + 1}`));
    } else {
      setRoomNameDraft(effectiveRoomName);
    }
    if (effectiveFloorQuery) {
      const matches = matchLocations(effectiveFloorQuery, floors, 5);
      if (matches.length === 1 && matches[0].score < CONFIDENT_SCORE) {
        setResolvedFloorId(matches[0].location.id);
        setResolvedFloorName(matches[0].location.name);
        setStep('confirm-room');
        return;
      }
      if (matches.length > 0) {
        setFloorCandidates(matches.map((m) => m.location));
        setStep('floor-pick');
        return;
      }
    }
    if (floors.length === 1) {
      setResolvedFloorId(floors[0].id);
      setResolvedFloorName(floors[0].name);
      setStep('confirm-room');
      return;
    }
    setFloorCandidates(floors);
    setStep('floor-pick');
  };

  const pickFloor = (floor: Location) => {
    setResolvedFloorId(floor.id);
    setResolvedFloorName(floor.name);
    setStep('confirm-room');
  };

  const resolveAssemblyAction = (query: string, action: 'delete' | 'hide' | 'show') => {
    setAssemblyAction(action);
    const matches = matchAssemblies(query, assemblies, 3);
    if (matches.length === 1 && matches[0].score < CONFIDENT_SCORE) {
      setSelectedAssembly(matches[0].assembly);
      setStep('confirm-delete-assembly');
      return;
    }
    if (matches.length > 0) {
      setAssemblyCandidates(matches);
      setStep('assembly-pick');
      return;
    }
    setInfoMessage(`No assembly matches "${query}".`);
    setStep('info');
  };

  const showRoomCount = async (projectId: string, projectName: string, floorQuery?: string) => {
    const locations = await loadLocations(projectId).catch(() => []);
    const floors = locations.filter((l) => l.parentId == null);
    const roomsOf = (floorId: string) => locations.filter((l) => l.parentId === floorId);
    let message: string;
    if (floorQuery) {
      const floor = floors.find((f) => f.name.toLowerCase().includes(floorQuery.toLowerCase()));
      message = floor
        ? `${floor.name}: ${roomsOf(floor.id).length} room${roomsOf(floor.id).length === 1 ? '' : 's'}`
        : `Couldn't find a floor matching "${floorQuery}" in ${projectName}.`;
    } else if (floors.length === 0) {
      message = `${projectName} has no floors yet.`;
    } else {
      message = floors.map((f) => `${f.name}: ${roomsOf(f.id).length} room${roomsOf(f.id).length === 1 ? '' : 's'}`).join('\n');
    }
    setInfoMessage(message);
    setStep('info');
  };

  const showMaterialsForRoom = async (projectId: string, projectName: string, roomQuery: string) => {
    const locations = await loadLocations(projectId).catch(() => [] as Location[]);
    const rooms = locations.filter((l) => l.parentId != null);
    const floors = locations.filter((l) => l.parentId == null);
    const matches = matchRoomWithFloor(roomQuery, rooms, floors);

    const answer = async (room: Location) => {
      const estimate = await loadProjectEstimate(projectId).catch(() => null);
      const materialLines = materialLinesForLocation(estimate?.lineItems ?? [], room.id);
      const message = materialLines.length === 0
        ? `No materials recorded yet for ${room.name}.`
        : `${room.name}:\n${materialLines.map(formatMaterialLineSummary).join('\n')}`;
      setInfoMessage(message);
      setStep('info');
    };

    if (matches.length === 1 && matches[0].score < CONFIDENT_SCORE) {
      await answer(matches[0].location);
      return;
    }
    if (matches.length > 0) {
      showEntityPick('Which room?', matches.map((m) => ({ id: m.location.id, label: m.location.name })), (item) => {
        const room = rooms.find((r) => r.id === item.id);
        if (room) answer(room);
      });
      return;
    }
    setInfoMessage(`No room matches "${roomQuery}" in ${projectName}.`);
    setStep('info');
  };

  /** Shared resolver for rename-floor / delete-floor / rename-room / delete-room / delete-snag. */
  const runFloorRoomOp = async (projectId: string, op: FloorRoomOp) => {
    const proj = projects.find((p) => p.id === projectId);
    const projectName = proj?.name ?? '';

    if (op.kind === 'delete-snag') {
      const snags = await snagItemsForProject(projectId).catch(() => [] as SnagItem[]);
      const matches = matchSnags(op.query, snags, 3);
      if (matches.length === 1 && matches[0].score < CONFIDENT_SCORE) {
        setDeleteTarget({ kind: 'snag', id: matches[0].snag.id, label: matches[0].snag.description });
        setStep('confirm-delete-entity');
        return;
      }
      if (matches.length > 0) {
        showEntityPick('Which snag?', matches.map((m) => ({ id: m.snag.id, label: m.snag.description })), (item) => {
          setDeleteTarget({ kind: 'snag', id: item.id, label: item.label });
          setStep('confirm-delete-entity');
        });
        return;
      }
      setInfoMessage(`No snag matches "${op.query}" in ${projectName}.`);
      setStep('info');
      return;
    }

    if (op.kind === 'mark-snag') {
      const snags = await snagItemsForProject(projectId).catch(() => [] as SnagItem[]);
      const matches = matchSnags(op.query, snags, 3);
      if (matches.length === 1 && matches[0].score < CONFIDENT_SCORE) {
        setSnagDoneTarget({ id: matches[0].snag.id, label: matches[0].snag.description, resolved: op.resolved });
        setStep('confirm-mark-snag');
        return;
      }
      if (matches.length > 0) {
        showEntityPick('Which snag?', matches.map((m) => ({ id: m.snag.id, label: m.snag.description })), (item) => {
          setSnagDoneTarget({ id: item.id, label: item.label, resolved: op.resolved });
          setStep('confirm-mark-snag');
        });
        return;
      }
      setInfoMessage(`No snag matches "${op.query}" in ${projectName}.`);
      setStep('info');
      return;
    }

    const isFloorOp = op.kind === 'rename-floor' || op.kind === 'delete-floor';
    const locations = await loadLocations(projectId).catch(() => []);
    const pool = isFloorOp ? locations.filter((l) => l.parentId == null) : locations.filter((l) => l.parentId != null);
    const matches = matchLocations(op.query, pool, 3);

    const finish = (loc: Location) => {
      if (op.kind === 'rename-floor' || op.kind === 'rename-room') {
        setRenameTarget({ kind: isFloorOp ? 'floor' : 'room', id: loc.id, oldName: loc.name });
        setRenameDraft(op.newName);
        setStep('confirm-rename');
      } else {
        setDeleteTarget({ kind: isFloorOp ? 'floor' : 'room', id: loc.id, label: loc.name });
        setStep('confirm-delete-entity');
      }
    };

    if (matches.length === 1 && matches[0].score < CONFIDENT_SCORE) { finish(matches[0].location); return; }
    if (matches.length > 0) {
      showEntityPick(isFloorOp ? 'Which floor?' : 'Which room?', matches.map((m) => ({ id: m.location.id, label: m.location.name })), (item) => {
        const loc = pool.find((l) => l.id === item.id);
        if (loc) finish(loc);
      });
      return;
    }
    setInfoMessage(`No ${isFloorOp ? 'floor' : 'room'} matches "${op.query}" in ${projectName}.`);
    setStep('info');
  };

  /** Resolves a line on whichever estimate is currently in view (the standalone Estimate or the current project). */
  const resolveLineOp = async (query: string, kind: 'remove' | 'setQuantity', amount?: number) => {
    let lines: LineItem[];
    const scope = isQuickQuote
      ? { isQuickQuote: true as const }
      : currentProjectId
        ? { isQuickQuote: false as const, projectId: currentProjectId }
        : null;

    if (!scope) {
      setInfoMessage('Open a project or the Estimate screen first to edit its lines.');
      setStep('info');
      return;
    }

    if (scope.isQuickQuote) {
      lines = useEstimateStore.getState().estimate.lineItems;
    } else {
      const est = await loadProjectEstimate(scope.projectId).catch(() => null);
      lines = est?.lineItems ?? [];
    }

    const finish = (line: LineItem) => {
      if (kind === 'setQuantity' && isLabourOnlyLine(line)) {
        setInfoMessage(`"${line.description}" is a labour line — say "change the labour to X hours" instead.`);
        setStep('info');
        return;
      }
      const currentAmount = line.quantityMeters ?? line.quantity ?? 1;
      setLineOpTarget({
        kind, lineId: line.id, description: line.description,
        quantityDraft: String(amount ?? currentAmount), scope,
      });
      setStep('confirm-line-op');
    };

    const matches = matchLines(query, lines, 3);
    if (matches.length === 1 && matches[0].score < CONFIDENT_SCORE) { finish(matches[0].line); return; }
    if (matches.length > 0) {
      showEntityPick('Which line?', matches.map((m) => ({ id: m.line.id, label: m.line.description })), (item) => {
        const line = lines.find((l) => l.id === item.id);
        if (line) finish(line);
      });
      return;
    }
    setInfoMessage(`No line matches "${query}".`);
    setStep('info');
  };

  /** Resolves the (usually single) labour line on the current estimate to edit its hours/flat amount. */
  const resolveLabourLineEdit = async (amount: { hours?: number; flatMinor?: number }) => {
    const scope = isQuickQuote
      ? { isQuickQuote: true as const }
      : currentProjectId
        ? { isQuickQuote: false as const, projectId: currentProjectId }
        : null;
    if (!scope) {
      setInfoMessage('Open a project or the Estimate screen first to edit its labour.');
      setStep('info');
      return;
    }

    let lines: LineItem[];
    let scopeLabel = 'Estimate';
    if (scope.isQuickQuote) {
      lines = useEstimateStore.getState().estimate.lineItems;
    } else {
      const est = await loadProjectEstimate(scope.projectId).catch(() => null);
      lines = est?.lineItems ?? [];
      scopeLabel = projects.find((p) => p.id === scope.projectId)?.name ?? '';
    }

    const labourLines = lines.filter((l) => l.overrides?.customLaborHours != null || l.overrides?.customLaborFlatMinor != null);
    if (labourLines.length === 0) {
      setInfoMessage('No labour line found to edit — add one first.');
      setStep('info');
      return;
    }

    const beginEdit = (line: LineItem) => {
      setLabourEditTarget({ lineId: line.id, scope });
      setLabourConfirmMode('edit');
      setResolvedProjectName(scopeLabel);
      if (amount.flatMinor != null) {
        setLabourMode('flat');
        setLabourAmountText(String(amount.flatMinor / 100));
      } else if (amount.hours != null) {
        setLabourMode('hours');
        setLabourAmountText(String(amount.hours));
      } else if (line.overrides?.customLaborFlatMinor != null) {
        setLabourMode('flat');
        setLabourAmountText(String(line.overrides.customLaborFlatMinor / 100));
      } else {
        setLabourMode('hours');
        setLabourAmountText(String(line.overrides?.customLaborHours ?? 1));
      }
      setStep('confirm-labour');
    };

    if (labourLines.length > 1) {
      showEntityPick('Which labour line?', labourLines.map((l) => ({ id: l.id, label: l.description })), (item) => {
        const line = labourLines.find((l) => l.id === item.id);
        if (line) beginEdit(line);
      });
      return;
    }
    beginEdit(labourLines[0]);
  };

  const runPipeline = (transcript: string) => {
    const intent: GlobalVoiceIntent = parseGlobalVoiceCommand(transcript);

    switch (intent.kind) {
      case 'navigate': {
        router.push(intent.path as any);
        backToIdle();
        return;
      }
      case 'navigate-contextual': {
        if (currentProjectId) {
          const target = matchProjectNavTarget(intent.query);
          if (target) {
            router.push(target.path(currentProjectId) as any);
            backToIdle();
            return;
          }
        }
        const project = resolveProjectPick(intent.query, 'open');
        if (project) openProjectScreen(project);
        return;
      }
      case 'open-project': {
        const project = resolveProjectPick(intent.query, 'open');
        if (project) openProjectScreen(project);
        return;
      }
      case 'create-project': {
        setProjectNameDraft(intent.name);
        setClientNameDraft(intent.clientName ?? '');
        setStep('confirm-project');
        return;
      }
      case 'create-project-or-assembly': {
        if (isQuickQuote) {
          router.push('/manage-jobs' as any);
          backToIdle();
          return;
        }
        setProjectNameDraft(intent.name);
        setClientNameDraft(intent.clientName ?? '');
        setStep('confirm-project');
        return;
      }
      case 'rename-project': {
        pendingRenameNewName.current = intent.newName;
        const proceed = (project: Project) => {
          setRenameTarget({ kind: 'project', id: project.id, oldName: project.name });
          setRenameDraft(intent.newName);
          setStep('confirm-rename');
        };
        if (intent.query) {
          const project = resolveProjectPick(intent.query, 'rename-project');
          if (project) proceed(project);
          return;
        }
        if (currentProjectId) {
          const proj = projects.find((p) => p.id === currentProjectId);
          if (proj) { proceed(proj); return; }
        }
        setProjectCandidates(projects.map((p) => ({ project: p, score: 1 })));
        setPickPurpose('rename-project');
        setStep('project-pick');
        return;
      }
      case 'delete-project': {
        const project = resolveProjectPick(intent.query, 'delete-project');
        if (project) {
          setDeleteTarget({ kind: 'project', id: project.id, label: project.name });
          setStep('confirm-delete-entity');
        }
        return;
      }
      case 'create-snag': {
        setSnagDescription(intent.description);
        if (currentProjectId) {
          const proj = projects.find((p) => p.id === currentProjectId);
          setResolvedProjectId(currentProjectId);
          setResolvedProjectName(proj?.name ?? '');
          setStep('confirm-snag');
          return;
        }
        if (intent.projectQuery) {
          const project = resolveProjectPick(intent.projectQuery, 'snag');
          if (project) {
            setResolvedProjectId(project.id);
            setResolvedProjectName(project.name);
            setStep('confirm-snag');
          }
          return;
        }
        setProjectCandidates(projects.map((p) => ({ project: p, score: 1 })));
        setPickPurpose('snag');
        setStep('project-pick');
        return;
      }
      case 'delete-snag': {
        const op: FloorRoomOp = { kind: 'delete-snag', query: intent.query };
        if (currentProjectId) { runFloorRoomOp(currentProjectId, op); return; }
        pendingFloorRoomOp.current = op;
        setProjectCandidates(projects.map((p) => ({ project: p, score: 1 })));
        setPickPurpose('floor-room-op');
        setStep('project-pick');
        return;
      }
      case 'mark-snag': {
        const op: FloorRoomOp = { kind: 'mark-snag', query: intent.query, resolved: intent.resolved };
        if (currentProjectId) { runFloorRoomOp(currentProjectId, op); return; }
        pendingFloorRoomOp.current = op;
        setProjectCandidates(projects.map((p) => ({ project: p, score: 1 })));
        setPickPurpose('floor-room-op');
        setStep('project-pick');
        return;
      }
      case 'create-floor': {
        const count = intent.count ?? 1;
        if (currentProjectId) {
          const proj = projects.find((p) => p.id === currentProjectId);
          beginFloorCreate(intent.name, count, currentProjectId, proj?.name ?? '');
          return;
        }
        if (intent.projectQuery) {
          const project = resolveProjectPick(intent.projectQuery, 'floor');
          if (project) beginFloorCreate(intent.name, count, project.id, project.name);
          return;
        }
        pendingRoomName.current = intent.name;
        pendingFloorCount.current = count;
        setProjectCandidates(projects.map((p) => ({ project: p, score: 1 })));
        setPickPurpose('floor');
        setStep('project-pick');
        return;
      }
      case 'rename-floor': {
        const op: FloorRoomOp = { kind: 'rename-floor', query: intent.query, newName: intent.newName };
        if (currentProjectId) { runFloorRoomOp(currentProjectId, op); return; }
        pendingFloorRoomOp.current = op;
        setProjectCandidates(projects.map((p) => ({ project: p, score: 1 })));
        setPickPurpose('floor-room-op');
        setStep('project-pick');
        return;
      }
      case 'delete-floor': {
        const op: FloorRoomOp = { kind: 'delete-floor', query: intent.query };
        if (currentProjectId) { runFloorRoomOp(currentProjectId, op); return; }
        pendingFloorRoomOp.current = op;
        setProjectCandidates(projects.map((p) => ({ project: p, score: 1 })));
        setPickPurpose('floor-room-op');
        setStep('project-pick');
        return;
      }
      case 'create-room': {
        const count = intent.count ?? 1;
        if (currentProjectId) {
          // Already inside a project — the trailing clause can only be
          // naming a floor ("Kitchen on the ground floor"), not a project.
          const proj = projects.find((p) => p.id === currentProjectId);
          beginRoomCreate(intent.name, count, currentProjectId, proj?.name ?? '', intent.projectQuery);
          return;
        }
        if (intent.projectQuery) {
          const project = resolveProjectPick(intent.projectQuery, 'room');
          if (project) beginRoomCreate(intent.name, count, project.id, project.name);
          return;
        }
        pendingRoomName.current = intent.name;
        pendingRoomCount.current = count;
        setProjectCandidates(projects.map((p) => ({ project: p, score: 1 })));
        setPickPurpose('room');
        setStep('project-pick');
        return;
      }
      case 'rename-room': {
        const op: FloorRoomOp = { kind: 'rename-room', query: intent.query, newName: intent.newName };
        if (currentProjectId) { runFloorRoomOp(currentProjectId, op); return; }
        pendingFloorRoomOp.current = op;
        setProjectCandidates(projects.map((p) => ({ project: p, score: 1 })));
        setPickPurpose('floor-room-op');
        setStep('project-pick');
        return;
      }
      case 'delete-room': {
        const op: FloorRoomOp = { kind: 'delete-room', query: intent.query };
        if (currentProjectId) { runFloorRoomOp(currentProjectId, op); return; }
        pendingFloorRoomOp.current = op;
        setProjectCandidates(projects.map((p) => ({ project: p, score: 1 })));
        setPickPurpose('floor-room-op');
        setStep('project-pick');
        return;
      }
      case 'room-count-query': {
        if (currentProjectId) {
          const proj = projects.find((p) => p.id === currentProjectId);
          showRoomCount(currentProjectId, proj?.name ?? '', intent.floorQuery);
          return;
        }
        if (intent.projectQuery) {
          const project = resolveProjectPick(intent.projectQuery, 'room-count');
          if (project) showRoomCount(project.id, project.name, intent.floorQuery);
          return;
        }
        pendingFloorQuery.current = intent.floorQuery;
        setProjectCandidates(projects.map((p) => ({ project: p, score: 1 })));
        setPickPurpose('room-count');
        setStep('project-pick');
        return;
      }
      case 'materials-query': {
        if (currentProjectId) {
          const proj = projects.find((p) => p.id === currentProjectId);
          showMaterialsForRoom(currentProjectId, proj?.name ?? '', intent.roomQuery);
          return;
        }
        if (intent.projectQuery) {
          const project = resolveProjectPick(intent.projectQuery, 'materials-query');
          if (project) showMaterialsForRoom(project.id, project.name, intent.roomQuery);
          return;
        }
        pendingRoomQuery.current = intent.roomQuery;
        setProjectCandidates(projects.map((p) => ({ project: p, score: 1 })));
        setPickPurpose('materials-query');
        setStep('project-pick');
        return;
      }
      case 'delete-assembly': {
        resolveAssemblyAction(intent.query, 'delete');
        return;
      }
      case 'hide-assembly': {
        resolveAssemblyAction(intent.query, 'hide');
        return;
      }
      case 'show-assembly': {
        resolveAssemblyAction(intent.query, 'show');
        return;
      }
      case 'open-assembly-builder': {
        router.push('/manage-jobs' as any);
        backToIdle();
        return;
      }
      case 'change-material-price': {
        const matches = matchMaterials(intent.query, materials, 20);
        if (matches.length === 1 && matches[0].score < CONFIDENT_SCORE) {
          setPriceTarget({ materialId: matches[0].material.id, materialName: matches[0].material.description, priceDraft: (intent.priceMinor / 100).toFixed(2) });
          setStep('confirm-price');
          return;
        }
        if (matches.length > 0) {
          pendingPriceMinor.current = intent.priceMinor;
          setMaterialPickPurpose('price');
          setItemCandidates(matches);
          setStep('item-pick');
          return;
        }
        setInfoMessage(`No material matches "${intent.query}".`);
        setStep('info');
        return;
      }
      case 'set-vat-rate': {
        setSettingKind('vat');
        setSettingValueDraft(String(intent.pct));
        setStep('confirm-setting');
        return;
      }
      case 'set-currency': {
        setSettingKind('currency');
        setSettingCurrencyDraft(intent.currency);
        setStep('confirm-setting');
        return;
      }
      case 'set-labour-rate': {
        setSettingKind('labourRate');
        setSettingValueDraft((intent.amountMinor / 100).toFixed(2));
        pendingLabourRateMinor.current = intent.amountMinor;
        if (isQuickQuote) {
          setSettingLabourScope({ isQuickQuote: true });
          setStep('confirm-setting');
          return;
        }
        if (currentProjectId) {
          const proj = projects.find((p) => p.id === currentProjectId);
          setSettingLabourScope({ isQuickQuote: false, projectId: currentProjectId, projectName: proj?.name ?? '' });
          setStep('confirm-setting');
          return;
        }
        if (intent.projectQuery) {
          const project = resolveProjectPick(intent.projectQuery, 'labour-rate-setting');
          if (project) {
            setSettingLabourScope({ isQuickQuote: false, projectId: project.id, projectName: project.name });
            setStep('confirm-setting');
          }
          return;
        }
        setSettingLabourScope(null); // null = the global Settings default
        setStep('confirm-setting');
        return;
      }
      case 'remove-line': {
        resolveLineOp(intent.query, 'remove');
        return;
      }
      case 'set-line-quantity': {
        resolveLineOp(intent.query, 'setQuantity', intent.amount);
        return;
      }
      case 'edit-labour-line': {
        resolveLabourLineEdit({ hours: intent.hours, flatMinor: intent.flatMinor });
        return;
      }
      case 'clear-estimate': {
        if (isQuickQuote) {
          setClearEstimateScope({ isQuickQuote: true, label: 'Estimate' });
          setStep('confirm-clear-estimate');
          return;
        }
        if (currentProjectId) {
          const proj = projects.find((p) => p.id === currentProjectId);
          setClearEstimateScope({ isQuickQuote: false, projectId: currentProjectId, label: proj?.name ?? '' });
          setStep('confirm-clear-estimate');
          return;
        }
        setInfoMessage('Open a project or the Estimate screen first to clear its estimate.');
        setStep('info');
        return;
      }
      case 'preview-pdf': {
        const handled = emitVoiceAction('previewPdf');
        if (!handled) {
          setInfoMessage("Open the Estimate screen or a job's Quote screen first to preview its PDF.");
          setStep('info');
          return;
        }
        close();
        return;
      }
      case 'generate-report': {
        if (!currentProjectId) {
          setInfoMessage('Open a project first to generate its report.');
          setStep('info');
          return;
        }
        const handled = emitVoiceAction('generateReport');
        if (!handled) {
          setInfoMessage("Open the job's project screen first to generate its report.");
          setStep('info');
          return;
        }
        close();
        return;
      }
      case 'take-photo': {
        const handled = emitVoiceAction('takePhoto');
        if (!handled) {
          setInfoMessage('Open a room or wall photo screen first to take a photo.');
          setStep('info');
          return;
        }
        close();
        return;
      }
      case 'estimate-query': {
        if (currentProjectId) { openReview(currentProjectId); return; }
        if (isQuickQuote) { router.push('/review' as any); backToIdle(); return; }
        if (intent.projectQuery) {
          const project = resolveProjectPick(intent.projectQuery, 'estimate');
          if (project) openReview(project.id);
          return;
        }
        setProjectCandidates(projects.map((p) => ({ project: p, score: 1 })));
        setPickPurpose('estimate');
        setStep('project-pick');
        return;
      }
      case 'add-material': {
        pendingParsed.current = intent.parsed;
        if (isQuickQuote) {
          resolveAddTarget(intent.parsed, { quickQuote: true });
          return;
        }
        if (currentProjectId) {
          const proj = projects.find((p) => p.id === currentProjectId);
          resolveRoomThenAdd(currentProjectId, intent.parsed.projectQuery, (locationId) => {
            setResolvedLocationId(locationId ?? currentLocationId ?? null);
            resolveAddTarget(intent.parsed, { projectId: currentProjectId, projectName: proj?.name ?? '' });
          });
          return;
        }
        if (intent.parsed.projectQuery) {
          const project = resolveProjectPick(intent.parsed.projectQuery, 'material');
          if (project) resolveAddTarget(intent.parsed, { projectId: project.id, projectName: project.name });
          return;
        }
        setProjectCandidates(projects.map((p) => ({ project: p, score: 1 })));
        setPickPurpose('material');
        setStep('project-pick');
        return;
      }
      case 'add-labour': {
        pendingLabour.current = { hours: intent.hours, flatMinor: intent.flatMinor };
        if (isQuickQuote) {
          beginLabourConfirm(pendingLabour.current, { quickQuote: true });
          return;
        }
        if (currentProjectId) {
          const proj = projects.find((p) => p.id === currentProjectId);
          resolveRoomThenAdd(currentProjectId, intent.projectQuery, (locationId) => {
            setResolvedLocationId(locationId ?? currentLocationId ?? null);
            beginLabourConfirm(pendingLabour.current, { projectId: currentProjectId, projectName: proj?.name ?? '' });
          });
          return;
        }
        if (intent.projectQuery) {
          const project = resolveProjectPick(intent.projectQuery, 'labour');
          if (project) beginLabourConfirm(pendingLabour.current, { projectId: project.id, projectName: project.name });
          return;
        }
        setProjectCandidates(projects.map((p) => ({ project: p, score: 1 })));
        setPickPurpose('labour');
        setStep('project-pick');
        return;
      }
      case 'search-material': {
        const matches = matchMaterials(intent.query, materials, 20);
        if (matches.length === 0) {
          setInfoMessage(`No materials match "${intent.query}".`);
          setStep('info');
          return;
        }
        setMaterialPickPurpose('search');
        setItemCandidates(matches);
        setStep('item-pick');
        return;
      }
      case 'unknown':
      default:
        setStep('unknown');
    }
  };

  const pickProject = (project: Project) => {
    switch (pickPurpose) {
      case 'open': openProjectScreen(project); return;
      case 'estimate': openReview(project.id); return;
      case 'snag':
        setResolvedProjectId(project.id);
        setResolvedProjectName(project.name);
        setStep('confirm-snag');
        return;
      case 'floor':
        beginFloorCreate(pendingRoomName.current, pendingFloorCount.current, project.id, project.name);
        return;
      case 'room':
        beginRoomCreate(pendingRoomName.current, pendingRoomCount.current, project.id, project.name);
        return;
      case 'material':
        if (pendingParsed.current) resolveAddTarget(pendingParsed.current, { projectId: project.id, projectName: project.name });
        return;
      case 'labour':
        beginLabourConfirm(pendingLabour.current, { projectId: project.id, projectName: project.name });
        return;
      case 'room-count':
        showRoomCount(project.id, project.name, pendingFloorQuery.current);
        return;
      case 'materials-query':
        showMaterialsForRoom(project.id, project.name, pendingRoomQuery.current);
        return;
      case 'rename-project':
        setRenameTarget({ kind: 'project', id: project.id, oldName: project.name });
        setRenameDraft(pendingRenameNewName.current);
        setStep('confirm-rename');
        return;
      case 'delete-project':
        setDeleteTarget({ kind: 'project', id: project.id, label: project.name });
        setStep('confirm-delete-entity');
        return;
      case 'floor-room-op':
        if (pendingFloorRoomOp.current) runFloorRoomOp(project.id, pendingFloorRoomOp.current);
        return;
      case 'labour-rate-setting':
        setSettingLabourScope({ isQuickQuote: false, projectId: project.id, projectName: project.name });
        setStep('confirm-setting');
        return;
      case 'found-material':
        if (pendingFoundMaterial.current) {
          setTargetIsQuickQuote(false);
          setResolvedProjectId(project.id);
          setResolvedProjectName(project.name);
          setSelectedMaterial(pendingFoundMaterial.current);
          setStep('confirm-material');
        }
        return;
    }
  };

  /** A material picked from search results — resolve where it's going, then reuse the normal add-confirm step. */
  const beginAddFoundMaterial = (m: Material) => {
    setAmountText('1');
    setSelectedMaterial(m);
    if (isQuickQuote) {
      setTargetIsQuickQuote(true);
      setResolvedProjectId(null);
      setResolvedProjectName('Estimate');
      setStep('confirm-material');
      return;
    }
    if (currentProjectId) {
      const proj = projects.find((p) => p.id === currentProjectId);
      setTargetIsQuickQuote(false);
      setResolvedProjectId(currentProjectId);
      setResolvedProjectName(proj?.name ?? '');
      setStep('confirm-material');
      return;
    }
    pendingFoundMaterial.current = m;
    setProjectCandidates(projects.map((p) => ({ project: p, score: 1 })));
    setPickPurpose('found-material');
    setStep('project-pick');
  };

  const pickMaterial = (m: Material) => {
    if (materialPickPurpose === 'price') {
      setPriceTarget({ materialId: m.id, materialName: m.description, priceDraft: (pendingPriceMinor.current / 100).toFixed(2) });
      setStep('confirm-price');
      return;
    }
    if (materialPickPurpose === 'search') {
      beginAddFoundMaterial(m);
      return;
    }
    setSelectedMaterial(m);
    setStep('confirm-material');
  };

  const pickAssembly = (a: Assembly) => {
    setSelectedAssembly(a);
    setStep('confirm-delete-assembly');
  };

  const manualMatches = useMemo(() => {
    const q = manualQuery.trim().toLowerCase();
    if (!q) return [];
    return materials
      .filter((m) => m.description.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q))
      .slice(0, 20);
  }, [manualQuery, materials]);

  const confirmCreateProject = async () => {
    const name = projectNameDraft.trim();
    if (!name) return;
    setStep('saving');
    try {
      const id = await createProject(name, clientNameDraft.trim() || undefined);
      router.push(`/project/${id}` as any);
      backToIdle();
    } catch {
      setStep('confirm-project');
    }
  };

  const confirmCreateSnag = async () => {
    if (!resolvedProjectId || !snagDescription.trim()) return;
    setStep('saving');
    try {
      const item = await createSnagItem(resolvedProjectId, snagDescription.trim());
      // If the Snag List screen is already mounted, hand off to its own
      // existing camera/library flow so the photo can be attached — same
      // offer the manual "+ Add" flow gives, without rebuilding a camera UI
      // here. Otherwise (voice can create a snag from any screen) navigate
      // there so it can offer the same prompt on arrival.
      const offeredPhoto = emitVoiceAction('snagPhotoPrompt', { snagId: item.id });
      if (offeredPhoto) {
        close();
        return;
      }
      router.push(`/project/snag/${resolvedProjectId}?promptPhotoFor=${item.id}` as any);
      backToIdle();
    } catch {
      setStep('confirm-snag');
    }
  };

  const confirmCreateFloor = async () => {
    if (!resolvedProjectId) return;
    if (floorCountDraft > 1) {
      if (floorNamesDraft.some((n) => !n.trim())) return;
    } else if (!floorNameDraft.trim()) return;
    setStep('saving');
    try {
      if (floorCountDraft > 1) {
        for (const name of floorNamesDraft) {
          await addLocation(resolvedProjectId, name.trim());
        }
      } else {
        await addLocation(resolvedProjectId, floorNameDraft.trim());
      }
      router.push(`/project/${resolvedProjectId}` as any);
      backToIdle();
    } catch {
      setStep('confirm-floor');
    }
  };

  const confirmCreateRoom = async () => {
    if (!resolvedProjectId || !resolvedFloorId) return;
    if (roomCountDraft > 1) {
      if (roomNamesDraft.some((n) => !n.trim())) return;
    } else if (!roomNameDraft.trim()) return;
    setStep('saving');
    try {
      if (roomCountDraft > 1) {
        for (const name of roomNamesDraft) {
          await addLocation(resolvedProjectId, name.trim(), resolvedFloorId);
        }
      } else {
        await addLocation(resolvedProjectId, roomNameDraft.trim(), resolvedFloorId);
      }
      router.push(`/project/${resolvedProjectId}` as any);
      backToIdle();
    } catch {
      setStep('confirm-room');
    }
  };

  const confirmAddMaterial = async () => {
    if (!selectedMaterial) return;
    const n = parseFloat(amountText);
    const amount = Number.isFinite(n) && n > 0 ? n : 1;
    setStep('saving');
    try {
      if (targetIsQuickQuote) {
        useEstimateStore.getState().addMaterial(selectedMaterial, amount);
      } else {
        if (!resolvedProjectId) return;
        await addMaterialToProjectByVoice(resolvedProjectId, selectedMaterial, amount, resolvedLocationId ?? undefined);
        emitVoiceAction('projectEstimateChanged', { projectId: resolvedProjectId });
      }
      setStep('saved');
      setTimeout(backToIdle, 900);
    } catch {
      setStep('confirm-material');
    }
  };

  const confirmAddAssembly = async () => {
    if (!addAssemblyTarget) return;
    const n = parseFloat(addAssemblyQtyText);
    const times = Number.isFinite(n) && n > 0 ? Math.round(n) : 1;
    setStep('saving');
    try {
      if (targetIsQuickQuote) {
        for (let i = 0; i < times; i += 1) useEstimateStore.getState().addAssembly(addAssemblyTarget, assemblyLookup);
      } else {
        if (!resolvedProjectId) return;
        await addAssemblyToProjectByVoice(resolvedProjectId, addAssemblyTarget, assemblyLookup, times, resolvedLocationId ?? undefined);
        emitVoiceAction('projectEstimateChanged', { projectId: resolvedProjectId });
      }
      setStep('saved');
      setTimeout(backToIdle, 900);
    } catch {
      setStep('confirm-add-assembly');
    }
  };

  const confirmAddLabour = async () => {
    const n = parseFloat(labourAmountText);
    if (!Number.isFinite(n) || n <= 0) return;
    const opts = labourMode === 'hours' ? { hours: n } : { flatMinor: Math.round(n * 100) };
    setStep('saving');
    try {
      if (targetIsQuickQuote) {
        useEstimateStore.getState().addLabour(opts);
      } else {
        if (!resolvedProjectId) return;
        await addLabourToProjectByVoice(resolvedProjectId, opts, resolvedLocationId ?? undefined);
        emitVoiceAction('projectEstimateChanged', { projectId: resolvedProjectId });
      }
      setStep('saved');
      setTimeout(backToIdle, 900);
    } catch {
      setStep('confirm-labour');
    }
  };

  const confirmEditLabourLine = async () => {
    if (!labourEditTarget) return;
    const n = parseFloat(labourAmountText);
    if (!Number.isFinite(n) || n <= 0) return;
    setStep('saving');
    try {
      const overridesPatch = labourMode === 'hours'
        ? { customLaborHours: n, customLaborFlatMinor: undefined }
        : { customLaborHours: 0, customLaborFlatMinor: Math.round(n * 100) };
      if (labourEditTarget.scope.isQuickQuote) {
        const line = useEstimateStore.getState().estimate.lineItems.find((l) => l.id === labourEditTarget.lineId);
        if (line) {
          useEstimateStore.getState().replaceLine({ ...line, overrides: { ...line.overrides, isCustom: true, customCostMinor: 0, ...overridesPatch } });
        }
      } else if (labourEditTarget.scope.projectId) {
        const projectId = labourEditTarget.scope.projectId;
        const est = await loadProjectEstimate(projectId);
        if (est) {
          const lineItems = est.lineItems.map((l) =>
            l.id === labourEditTarget.lineId
              ? { ...l, overrides: { ...l.overrides, isCustom: true, customCostMinor: 0, ...overridesPatch } }
              : l,
          );
          await saveProjectEstimate(projectId, { ...est, lineItems });
          emitVoiceAction('projectEstimateChanged', { projectId });
        }
      }
      setStep('saved');
      setTimeout(backToIdle, 900);
    } catch {
      setStep('confirm-labour');
    }
  };

  const confirmClearEstimate = async () => {
    if (!clearEstimateScope) return;
    setStep('saving');
    try {
      if (clearEstimateScope.isQuickQuote) {
        useEstimateStore.getState().clear();
      } else if (clearEstimateScope.projectId) {
        const est = await loadProjectEstimate(clearEstimateScope.projectId);
        if (est) {
          await saveProjectEstimate(clearEstimateScope.projectId, { ...est, lineItems: [] });
          emitVoiceAction('projectEstimateChanged', { projectId: clearEstimateScope.projectId });
        }
      }
      setStep('saved');
      setTimeout(backToIdle, 900);
    } catch {
      setStep('confirm-clear-estimate');
    }
  };

  const confirmAssemblyAction = async () => {
    if (!selectedAssembly) return;
    setStep('saving');
    try {
      if (assemblyAction === 'hide') {
        await setAssemblyFavourite(selectedAssembly.id, null);
      } else if (assemblyAction === 'show') {
        await setAssemblyFavourite(selectedAssembly.id, await nextFavouriteRank());
      } else {
        await deleteAssembly(selectedAssembly.id);
      }
      setStep('saved');
      setTimeout(backToIdle, 900);
    } catch {
      setStep('confirm-delete-assembly');
    }
  };

  const confirmRename = async () => {
    if (!renameTarget || !renameDraft.trim()) return;
    setStep('saving');
    try {
      const newName = renameDraft.trim();
      if (renameTarget.kind === 'project') {
        const proj = projects.find((p) => p.id === renameTarget.id);
        await renameProject(renameTarget.id, newName, proj?.clientName);
      } else {
        await renameLocation(renameTarget.id, newName);
      }
      setStep('saved');
      setTimeout(backToIdle, 900);
    } catch {
      setStep('confirm-rename');
    }
  };

  const confirmDeleteEntity = async () => {
    if (!deleteTarget) return;
    setStep('saving');
    try {
      if (deleteTarget.kind === 'project') await deleteProject(deleteTarget.id);
      else if (deleteTarget.kind === 'floor' || deleteTarget.kind === 'room') await deleteLocation(deleteTarget.id);
      else if (deleteTarget.kind === 'snag') await deleteSnagItem(deleteTarget.id);
      setStep('saved');
      setTimeout(backToIdle, 900);
    } catch {
      setStep('confirm-delete-entity');
    }
  };

  const confirmMarkSnag = async () => {
    if (!snagDoneTarget) return;
    setStep('saving');
    try {
      await setSnagResolved(snagDoneTarget.id, snagDoneTarget.resolved);
      setStep('saved');
      setTimeout(backToIdle, 900);
    } catch {
      setStep('confirm-mark-snag');
    }
  };

  const confirmSetting = async () => {
    setStep('saving');
    try {
      if (settingKind === 'vat') {
        const n = parseFloat(settingValueDraft);
        if (Number.isFinite(n) && n >= 0) useSettingsStore.getState().setVatRate(n);
      } else if (settingKind === 'currency') {
        useSettingsStore.getState().setCurrency(settingCurrencyDraft);
      } else if (settingKind === 'labourRate') {
        const n = parseFloat(settingValueDraft);
        if (Number.isFinite(n) && n > 0) {
          const minor = Math.round(n * 100);
          if (settingLabourScope?.isQuickQuote) {
            useEstimateStore.getState().setHourlyRate(minor);
          } else if (settingLabourScope?.projectId) {
            const est = await loadProjectEstimate(settingLabourScope.projectId);
            if (est) {
              await saveProjectEstimate(settingLabourScope.projectId, { ...est, hourlyRateMinor: minor });
              emitVoiceAction('projectEstimateChanged', { projectId: settingLabourScope.projectId });
            }
          } else {
            useSettingsStore.getState().setHourlyRate(minor);
          }
        }
      }
      setStep('saved');
      setTimeout(backToIdle, 900);
    } catch {
      setStep('confirm-setting');
    }
  };

  const confirmPriceChange = async () => {
    if (!priceTarget) return;
    const n = parseFloat(priceTarget.priceDraft);
    if (!Number.isFinite(n) || n < 0) return;
    setStep('saving');
    try {
      await updateMaterialPrice(priceTarget.materialId, Math.round(n * 100));
      setStep('saved');
      setTimeout(backToIdle, 900);
    } catch {
      setStep('confirm-price');
    }
  };

  const confirmLineOp = async () => {
    if (!lineOpTarget) return;
    setStep('saving');
    try {
      if (lineOpTarget.scope.isQuickQuote) {
        if (lineOpTarget.kind === 'remove') {
          useEstimateStore.getState().remove(lineOpTarget.lineId);
        } else {
          const line = useEstimateStore.getState().estimate.lineItems.find((l) => l.id === lineOpTarget.lineId);
          const n = parseFloat(lineOpTarget.quantityDraft);
          if (line && Number.isFinite(n) && n > 0) {
            const updated = line.quantityMeters != null ? { ...line, quantityMeters: n } : { ...line, quantity: n };
            useEstimateStore.getState().replaceLine(updated);
          }
        }
      } else if (lineOpTarget.scope.projectId) {
        const projectId = lineOpTarget.scope.projectId;
        const est = await loadProjectEstimate(projectId);
        if (est) {
          if (lineOpTarget.kind === 'remove') {
            await saveProjectEstimate(projectId, { ...est, lineItems: est.lineItems.filter((l) => l.id !== lineOpTarget.lineId) });
            emitVoiceAction('projectEstimateChanged', { projectId });
          } else {
            const n = parseFloat(lineOpTarget.quantityDraft);
            if (Number.isFinite(n) && n > 0) {
              const lineItems = est.lineItems.map((l) =>
                l.id === lineOpTarget.lineId
                  ? (l.quantityMeters != null ? { ...l, quantityMeters: n } : { ...l, quantity: n })
                  : l,
              );
              await saveProjectEstimate(projectId, { ...est, lineItems });
              emitVoiceAction('projectEstimateChanged', { projectId });
            }
          }
        }
      }
      setStep('saved');
      setTimeout(backToIdle, 900);
    } catch {
      setStep('confirm-line-op');
    }
  };

  const isMetres = selectedMaterial?.unit === 'm';
  const amountNum = parseFloat(amountText);
  const previewTotal = selectedMaterial && Number.isFinite(amountNum)
    ? Math.round(amountNum * selectedMaterial.unitCostMinor)
    : 0;

  const settingsHourlyRateMinor = useSettingsStore((s) => s.hourlyRateMinor);
  const assemblyQtyNum = parseFloat(addAssemblyQtyText);
  let assemblyUnitPriceMinor = 0;
  if (addAssemblyTarget) {
    try {
      assemblyUnitPriceMinor = priceLine(lineFromAssembly(addAssemblyTarget, assemblyLookup), settingsHourlyRateMinor, laborToggleIndex, []).lineTotalMinor;
    } catch (e) {
      console.error('confirm-add-assembly: could not price assembly', addAssemblyTarget.id, e);
    }
  }
  const assemblyPreviewTotal = Number.isFinite(assemblyQtyNum) ? Math.round(assemblyQtyNum * assemblyUnitPriceMinor) : 0;

  const entityLabel = (kind: EntityKind) => kind === 'project' ? 'job' : kind === 'floor' ? 'floor' : kind === 'room' ? 'room' : 'snag';

  return (
    <>
      {pathname !== '/voice-setup' && !hasOwnHeaderMic && !isVoiceFreeScreen && (
        <Pressable
          style={[
            styles.fab,
            { bottom: isTabScreen ? tabBarHeight + 8 : insets.bottom + 24 },
            !visible && styles.fabIdle,
          ]}
          onPress={open}
          hitSlop={8}
        >
          <Text style={styles.fabGlyph}>🎤</Text>
        </Pressable>
      )}

      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.scrim}>
          <Pressable style={styles.scrimTap} onPress={close} accessibilityLabel="Close" />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kavWrapper}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.grabber} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>Voice control</Text>
              <Pressable onPress={close}><Text style={styles.done}>Done</Text></Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: kbHeight }}>
            {(step === 'idle' || step === 'listening' || step === 'processing') && (
              <View style={styles.micArea}>
                {voice.error && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{errorMessage(voice.error)}</Text>
                  </View>
                )}
                <Pressable
                  style={[styles.micBtn, step === 'listening' && styles.micBtnActive]}
                  onPress={startListening}
                  disabled={step === 'processing'}
                >
                  <Text style={styles.micGlyph}>{step === 'listening' ? '●' : '🎤'}</Text>
                </Pressable>
                <Text style={styles.micHint}>
                  {step === 'listening' ? 'Listening… speak your command' : step === 'processing' ? 'Working it out…' : 'Try "open projects", "rename this project to X", "delete the RCBO", "change the labour to 3 hours", "clear the estimate", "preview PDF quote", "sign the quote", or "set VAT to 20%"'}
                </Text>
                {(voice.interimTranscript || rawTranscript) ? (
                  <Text style={styles.transcript}>"{voice.interimTranscript || rawTranscript}"</Text>
                ) : null}
              </View>
            )}

            {step === 'unknown' && (
              <View style={styles.micArea}>
                <Text style={styles.micHint}>Didn't catch a command in "{rawTranscript}"</Text>
                <Pressable style={styles.retryBtn} onPress={backToIdle}><Text style={styles.retryBtnText}>Try again</Text></Pressable>
              </View>
            )}

            {step === 'info' && (
              <View style={styles.micArea}>
                <ScrollView style={styles.infoScroll}>
                  <Text style={[styles.micHint, styles.infoText]}>{infoMessage}</Text>
                </ScrollView>
                <Pressable style={styles.retryBtn} onPress={backToIdle}><Text style={styles.retryBtnText}>OK</Text></Pressable>
              </View>
            )}

            {step === 'project-pick' && (
              <View style={styles.pickArea}>
                <Text style={styles.pickLabel}>Which job?</Text>
                <ScrollView style={styles.pickList}>
                  {projectCandidates.map(({ project }) => (
                    <Pressable key={project.id} style={styles.pickRow} onPress={() => pickProject(project)}>
                      <Text style={styles.pickRowTitle}>{project.name}</Text>
                      {project.clientName ? <Text style={styles.pickRowMeta}>{project.clientName}</Text> : null}
                    </Pressable>
                  ))}
                  {projectCandidates.length === 0 && <Text style={styles.empty}>No projects yet — create one first.</Text>}
                </ScrollView>
                <Pressable style={styles.cancelLink} onPress={backToIdle}><Text style={styles.cancelLinkText}>Cancel</Text></Pressable>
              </View>
            )}

            {step === 'floor-pick' && (
              <View style={styles.pickArea}>
                <Text style={styles.pickLabel}>Which floor?</Text>
                <ScrollView style={styles.pickList}>
                  {floorCandidates.map((floor) => (
                    <Pressable key={floor.id} style={styles.pickRow} onPress={() => pickFloor(floor)}>
                      <Text style={styles.pickRowTitle}>{floor.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable style={styles.cancelLink} onPress={backToIdle}><Text style={styles.cancelLinkText}>Cancel</Text></Pressable>
              </View>
            )}

            {step === 'entity-pick' && (
              <View style={styles.pickArea}>
                <Text style={styles.pickLabel}>{entityPickLabel}</Text>
                <ScrollView style={styles.pickList}>
                  {entityPickItems.map((item) => (
                    <Pressable key={item.id} style={styles.pickRow} onPress={() => entityPickCallback.current?.(item)}>
                      <Text style={styles.pickRowTitle}>{item.label}</Text>
                      {item.sublabel ? <Text style={styles.pickRowMeta}>{item.sublabel}</Text> : null}
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable style={styles.cancelLink} onPress={backToIdle}><Text style={styles.cancelLinkText}>Cancel</Text></Pressable>
              </View>
            )}

            {step === 'item-pick' && (
              <View style={styles.pickArea}>
                <Text style={styles.pickLabel}>Which item?</Text>
                <ScrollView style={styles.pickList}>
                  {itemCandidates.map(({ material }) => (
                    <Pressable key={material.id} style={styles.pickRow} onPress={() => pickMaterial(material)}>
                      <Text style={styles.pickRowTitle}>{material.description}</Text>
                      <Text style={styles.pickRowMeta}>{material.sku} · {formatMoney(material.unitCostMinor, 'GBP')}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable
                  style={styles.cancelLink}
                  onPress={() => { setManualQuery(pendingParsed.current?.itemQuery ?? rawTranscript); setStep('manual-search'); }}
                >
                  <Text style={styles.cancelLinkText}>None of these — search manually</Text>
                </Pressable>
              </View>
            )}

            {step === 'assembly-pick' && (
              <View style={styles.pickArea}>
                <Text style={styles.pickLabel}>Which assembly?</Text>
                <ScrollView style={styles.pickList}>
                  {assemblyCandidates.map(({ assembly }) => (
                    <Pressable key={assembly.id} style={styles.pickRow} onPress={() => pickAssembly(assembly)}>
                      <Text style={styles.pickRowTitle}>{assembly.name}</Text>
                      <Text style={styles.pickRowMeta}>{assembly.category}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable style={styles.cancelLink} onPress={backToIdle}><Text style={styles.cancelLinkText}>Cancel</Text></Pressable>
              </View>
            )}

            {step === 'manual-search' && (
              <View style={styles.pickArea}>
                <Text style={styles.pickLabel}>Search for the item</Text>
                <TextInput
                  value={manualQuery}
                  onChangeText={setManualQuery}
                  placeholder="Search by name or code"
                  placeholderTextColor={colors.textMuted}
                  style={styles.search}
                  autoFocus
                />
                <ScrollView style={styles.pickList}>
                  {manualMatches.map((m) => (
                    <Pressable key={m.id} style={styles.pickRow} onPress={() => pickMaterial(m)}>
                      <Text style={styles.pickRowTitle}>{m.description}</Text>
                      <Text style={styles.pickRowMeta}>{m.sku} · {formatMoney(m.unitCostMinor, 'GBP')}</Text>
                    </Pressable>
                  ))}
                  {manualQuery.trim() && manualMatches.length === 0 && (
                    <Text style={styles.empty}>No materials match "{manualQuery}".</Text>
                  )}
                </ScrollView>
                <Pressable style={styles.cancelLink} onPress={backToIdle}><Text style={styles.cancelLinkText}>Cancel</Text></Pressable>
              </View>
            )}

            {step === 'confirm-project' && (
              <View style={styles.confirmArea}>
                <Text style={styles.confirmItem}>New project</Text>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Name</Text>
                  <TextInput value={projectNameDraft} onChangeText={setProjectNameDraft} style={styles.confirmInputWide} />
                  <FieldMicButton active={dictateTarget?.kind === 'projectName'} onPress={() => startDictation({ kind: 'projectName' })} />
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Client</Text>
                  <TextInput value={clientNameDraft} onChangeText={setClientNameDraft} style={styles.confirmInputWide} placeholder="(optional)" placeholderTextColor={colors.textMuted} />
                  <FieldMicButton active={dictateTarget?.kind === 'clientName'} onPress={() => startDictation({ kind: 'clientName' })} />
                </View>
                <View style={styles.confirmActions}>
                  <Pressable style={[styles.bigBtn, styles.cancelBtn]} onPress={backToIdle}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
                  <Pressable style={[styles.bigBtn, styles.confirmBtn]} onPress={confirmCreateProject} disabled={!projectNameDraft.trim()}>
                    <Text style={styles.confirmBtnText}>Create</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {step === 'confirm-snag' && (
              <View style={styles.confirmArea}>
                <Text style={styles.confirmItem}>New snag</Text>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Description</Text>
                  <TextInput value={snagDescription} onChangeText={setSnagDescription} style={styles.confirmInputWide} multiline />
                  <FieldMicButton active={dictateTarget?.kind === 'snagDescription'} onPress={() => startDictation({ kind: 'snagDescription' })} />
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Job</Text>
                  <Text style={styles.confirmValue} numberOfLines={1}>{resolvedProjectName}</Text>
                </View>
                <View style={styles.confirmActions}>
                  <Pressable style={[styles.bigBtn, styles.cancelBtn]} onPress={backToIdle}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
                  <Pressable style={[styles.bigBtn, styles.confirmBtn]} onPress={confirmCreateSnag} disabled={!snagDescription.trim()}>
                    <Text style={styles.confirmBtnText}>Add snag</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {step === 'confirm-floor' && (
              <View style={styles.confirmArea}>
                <Text style={styles.confirmItem}>{floorCountDraft > 1 ? `${floorCountDraft} new floors` : 'New floor'}</Text>
                {floorCountDraft > 1 ? (
                  floorNamesDraft.map((name, i) => (
                    <View style={styles.confirmRow} key={i}>
                      <Text style={styles.confirmLabel}>Floor {i + 1}</Text>
                      <TextInput
                        value={name}
                        onChangeText={(t) => setFloorNamesDraft((prev) => prev.map((v, j) => (j === i ? t : v)))}
                        style={styles.confirmInputWide}
                      />
                      <FieldMicButton active={dictateTarget?.kind === 'floorNameAt' && dictateTarget.index === i} onPress={() => startDictation({ kind: 'floorNameAt', index: i })} />
                    </View>
                  ))
                ) : (
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>Name</Text>
                    <TextInput value={floorNameDraft} onChangeText={setFloorNameDraft} style={styles.confirmInputWide} placeholder="e.g. Ground Floor" placeholderTextColor={colors.textMuted} />
                    <FieldMicButton active={dictateTarget?.kind === 'floorName'} onPress={() => startDictation({ kind: 'floorName' })} />
                  </View>
                )}
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Job</Text>
                  <Text style={styles.confirmValue} numberOfLines={1}>{resolvedProjectName}</Text>
                </View>
                <View style={styles.confirmActions}>
                  <Pressable style={[styles.bigBtn, styles.cancelBtn]} onPress={backToIdle}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
                  <Pressable
                    style={[styles.bigBtn, styles.confirmBtn]}
                    onPress={confirmCreateFloor}
                    disabled={floorCountDraft > 1 ? floorNamesDraft.some((n) => !n.trim()) : !floorNameDraft.trim()}
                  >
                    <Text style={styles.confirmBtnText}>{floorCountDraft > 1 ? `Add ${floorCountDraft} floors` : 'Add floor'}</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {step === 'confirm-room' && (
              <View style={styles.confirmArea}>
                <Text style={styles.confirmItem}>{roomCountDraft > 1 ? `${roomCountDraft} new rooms` : 'New room'}</Text>
                {roomCountDraft > 1 ? (
                  roomNamesDraft.map((name, i) => (
                    <View style={styles.confirmRow} key={i}>
                      <Text style={styles.confirmLabel}>Room {i + 1}</Text>
                      <TextInput
                        value={name}
                        onChangeText={(t) => setRoomNamesDraft((prev) => prev.map((v, j) => (j === i ? t : v)))}
                        style={styles.confirmInputWide}
                      />
                      <FieldMicButton active={dictateTarget?.kind === 'roomNameAt' && dictateTarget.index === i} onPress={() => startDictation({ kind: 'roomNameAt', index: i })} />
                    </View>
                  ))
                ) : (
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>Name</Text>
                    <TextInput value={roomNameDraft} onChangeText={setRoomNameDraft} style={styles.confirmInputWide} placeholder="e.g. Kitchen" placeholderTextColor={colors.textMuted} />
                    <FieldMicButton active={dictateTarget?.kind === 'roomName'} onPress={() => startDictation({ kind: 'roomName' })} />
                  </View>
                )}
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Floor</Text>
                  <Text style={styles.confirmValue} numberOfLines={1}>{resolvedFloorName}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Job</Text>
                  <Text style={styles.confirmValue} numberOfLines={1}>{resolvedProjectName}</Text>
                </View>
                <View style={styles.confirmActions}>
                  <Pressable style={[styles.bigBtn, styles.cancelBtn]} onPress={backToIdle}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
                  <Pressable
                    style={[styles.bigBtn, styles.confirmBtn]}
                    onPress={confirmCreateRoom}
                    disabled={roomCountDraft > 1 ? roomNamesDraft.some((n) => !n.trim()) : !roomNameDraft.trim()}
                  >
                    <Text style={styles.confirmBtnText}>{roomCountDraft > 1 ? `Add ${roomCountDraft} rooms` : 'Add room'}</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {step === 'confirm-labour' && (
              <View style={styles.confirmArea}>
                <Text style={styles.confirmItem}>{labourConfirmMode === 'edit' ? 'Edit labour' : 'Add labour'}</Text>
                <View style={styles.modeRow}>
                  <Pressable style={[styles.modeBtn, labourMode === 'hours' && styles.modeBtnActive]} onPress={() => setLabourMode('hours')}>
                    <Text style={[styles.modeBtnText, labourMode === 'hours' && styles.modeBtnTextActive]}>Hours</Text>
                  </Pressable>
                  <Pressable style={[styles.modeBtn, labourMode === 'flat' && styles.modeBtnActive]} onPress={() => setLabourMode('flat')}>
                    <Text style={[styles.modeBtnText, labourMode === 'flat' && styles.modeBtnTextActive]}>Flat amount</Text>
                  </Pressable>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>{labourMode === 'hours' ? 'Hours' : 'Amount (£)'}</Text>
                  <TextInput value={labourAmountText} onChangeText={(t) => setLabourAmountText(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" style={styles.confirmInput} selectTextOnFocus />
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Job</Text>
                  <Text style={styles.confirmValue} numberOfLines={1}>{resolvedProjectName}</Text>
                </View>
                <View style={styles.confirmActions}>
                  <Pressable style={[styles.bigBtn, styles.cancelBtn]} onPress={backToIdle}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
                  <Pressable style={[styles.bigBtn, styles.confirmBtn]} onPress={labourConfirmMode === 'edit' ? confirmEditLabourLine : confirmAddLabour}>
                    <Text style={styles.confirmBtnText}>{labourConfirmMode === 'edit' ? 'Save' : 'Add labour'}</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {step === 'confirm-material' && selectedMaterial && (
              <View style={styles.confirmArea}>
                <Text style={styles.confirmItem}>{selectedMaterial.description}</Text>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Unit price</Text>
                  <Text style={styles.confirmValue}>{formatMoney(selectedMaterial.unitCostMinor, 'GBP')} / {selectedMaterial.unit}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>{isMetres ? 'Metres' : 'Quantity'}</Text>
                  <TextInput value={amountText} onChangeText={(t) => setAmountText(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" style={styles.confirmInput} selectTextOnFocus />
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Total</Text>
                  <Text style={styles.confirmValue}>{formatMoney(previewTotal, 'GBP')}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Job</Text>
                  <Text style={styles.confirmValue} numberOfLines={1}>{resolvedProjectName}</Text>
                </View>
                <View style={styles.confirmActions}>
                  <Pressable style={[styles.bigBtn, styles.cancelBtn]} onPress={backToIdle}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
                  <Pressable style={[styles.bigBtn, styles.confirmBtn]} onPress={confirmAddMaterial}><Text style={styles.confirmBtnText}>Confirm</Text></Pressable>
                </View>
              </View>
            )}

            {step === 'confirm-add-assembly' && addAssemblyTarget && (
              <View style={styles.confirmArea}>
                <Text style={styles.confirmItem}>{addAssemblyTarget.name}</Text>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Unit price</Text>
                  <Text style={styles.confirmValue}>{formatMoney(assemblyUnitPriceMinor, 'GBP')} each</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Quantity</Text>
                  <TextInput value={addAssemblyQtyText} onChangeText={(t) => setAddAssemblyQtyText(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" style={styles.confirmInput} selectTextOnFocus />
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Total</Text>
                  <Text style={styles.confirmValue}>{formatMoney(assemblyPreviewTotal, 'GBP')}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Job</Text>
                  <Text style={styles.confirmValue} numberOfLines={1}>{resolvedProjectName}</Text>
                </View>
                <View style={styles.confirmActions}>
                  <Pressable style={[styles.bigBtn, styles.cancelBtn]} onPress={backToIdle}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
                  <Pressable style={[styles.bigBtn, styles.confirmBtn]} onPress={confirmAddAssembly}><Text style={styles.confirmBtnText}>Confirm</Text></Pressable>
                </View>
              </View>
            )}

            {step === 'confirm-delete-assembly' && selectedAssembly && (
              <View style={styles.confirmArea}>
                <Text style={styles.confirmItem}>
                  {assemblyAction === 'hide' ? `Hide "${selectedAssembly.name}"?`
                    : assemblyAction === 'show' ? `Show "${selectedAssembly.name}" in Add Job?`
                    : `Delete "${selectedAssembly.name}"?`}
                </Text>
                <Text style={styles.micHint}>
                  {assemblyAction === 'hide'
                    ? 'Removes it from the Add Job picker. You can bring it back any time from Manage Jobs.'
                    : assemblyAction === 'show'
                    ? 'Adds it back to the Add Job picker as a favourite.'
                    : "This removes it from the catalogue and the Add Job picker. This can't be undone by voice."}
                </Text>
                <View style={styles.confirmActions}>
                  <Pressable style={[styles.bigBtn, styles.cancelBtn]} onPress={backToIdle}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
                  <Pressable
                    style={[styles.bigBtn, assemblyAction === 'delete' ? styles.dangerBtn : styles.confirmBtn]}
                    onPress={confirmAssemblyAction}
                  >
                    <Text style={styles.confirmBtnText}>{assemblyAction === 'hide' ? 'Hide' : assemblyAction === 'show' ? 'Show' : 'Delete'}</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {step === 'confirm-rename' && renameTarget && (
              <View style={styles.confirmArea}>
                <Text style={styles.confirmItem}>Rename {entityLabel(renameTarget.kind)}</Text>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>From</Text>
                  <Text style={styles.confirmValue} numberOfLines={1}>{renameTarget.oldName}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>To</Text>
                  <TextInput value={renameDraft} onChangeText={setRenameDraft} style={styles.confirmInputWide} autoFocus />
                  <FieldMicButton active={dictateTarget?.kind === 'renameDraft'} onPress={() => startDictation({ kind: 'renameDraft' })} />
                </View>
                <View style={styles.confirmActions}>
                  <Pressable style={[styles.bigBtn, styles.cancelBtn]} onPress={backToIdle}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
                  <Pressable style={[styles.bigBtn, styles.confirmBtn]} onPress={confirmRename} disabled={!renameDraft.trim()}>
                    <Text style={styles.confirmBtnText}>Rename</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {step === 'confirm-delete-entity' && deleteTarget && (
              <View style={styles.confirmArea}>
                <Text style={styles.confirmItem}>Delete {entityLabel(deleteTarget.kind)} "{deleteTarget.label}"?</Text>
                <Text style={styles.micHint}>
                  {deleteTarget.kind === 'project'
                    ? "This permanently removes the job and everything in it. This can't be undone by voice."
                    : "This can't be undone by voice."}
                </Text>
                <View style={styles.confirmActions}>
                  <Pressable style={[styles.bigBtn, styles.cancelBtn]} onPress={backToIdle}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
                  <Pressable style={[styles.bigBtn, styles.dangerBtn]} onPress={confirmDeleteEntity}><Text style={styles.confirmBtnText}>Delete</Text></Pressable>
                </View>
              </View>
            )}

            {step === 'confirm-mark-snag' && snagDoneTarget && (
              <View style={styles.confirmArea}>
                <Text style={styles.confirmItem}>
                  {snagDoneTarget.resolved ? `Mark "${snagDoneTarget.label}" done?` : `Reopen "${snagDoneTarget.label}"?`}
                </Text>
                <View style={styles.confirmActions}>
                  <Pressable style={[styles.bigBtn, styles.cancelBtn]} onPress={backToIdle}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
                  <Pressable style={[styles.bigBtn, styles.confirmBtn]} onPress={confirmMarkSnag}>
                    <Text style={styles.confirmBtnText}>{snagDoneTarget.resolved ? 'Mark done' : 'Reopen'}</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {step === 'confirm-clear-estimate' && clearEstimateScope && (
              <View style={styles.confirmArea}>
                <Text style={styles.confirmItem}>Clear the whole estimate?</Text>
                <Text style={styles.micHint}>This removes every line from {clearEstimateScope.label}'s quote. This can't be undone by voice.</Text>
                <View style={styles.confirmActions}>
                  <Pressable style={[styles.bigBtn, styles.cancelBtn]} onPress={backToIdle}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
                  <Pressable style={[styles.bigBtn, styles.dangerBtn]} onPress={confirmClearEstimate}><Text style={styles.confirmBtnText}>Clear</Text></Pressable>
                </View>
              </View>
            )}

            {step === 'confirm-setting' && (
              <View style={styles.confirmArea}>
                <Text style={styles.confirmItem}>
                  {settingKind === 'vat' ? 'Set VAT rate' : settingKind === 'currency' ? 'Set currency' : 'Set labour rate'}
                </Text>
                {settingKind === 'currency' ? (
                  <View style={styles.modeRow}>
                    <Pressable style={[styles.modeBtn, settingCurrencyDraft === 'GBP' && styles.modeBtnActive]} onPress={() => setSettingCurrencyDraft('GBP')}>
                      <Text style={[styles.modeBtnText, settingCurrencyDraft === 'GBP' && styles.modeBtnTextActive]}>GBP (£)</Text>
                    </Pressable>
                    <Pressable style={[styles.modeBtn, settingCurrencyDraft === 'EUR' && styles.modeBtnActive]} onPress={() => setSettingCurrencyDraft('EUR')}>
                      <Text style={[styles.modeBtnText, settingCurrencyDraft === 'EUR' && styles.modeBtnTextActive]}>EUR (€)</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>{settingKind === 'vat' ? 'VAT %' : 'Rate (£/hr)'}</Text>
                    <TextInput value={settingValueDraft} onChangeText={(t) => setSettingValueDraft(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" style={styles.confirmInput} selectTextOnFocus />
                  </View>
                )}
                {settingKind === 'labourRate' && (
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>Applies to</Text>
                    <Text style={styles.confirmValue} numberOfLines={1}>
                      {settingLabourScope?.isQuickQuote ? 'Estimate' : settingLabourScope?.projectName ?? 'Default (Settings)'}
                    </Text>
                  </View>
                )}
                <View style={styles.confirmActions}>
                  <Pressable style={[styles.bigBtn, styles.cancelBtn]} onPress={backToIdle}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
                  <Pressable style={[styles.bigBtn, styles.confirmBtn]} onPress={confirmSetting}><Text style={styles.confirmBtnText}>Set</Text></Pressable>
                </View>
              </View>
            )}

            {step === 'confirm-price' && priceTarget && (
              <View style={styles.confirmArea}>
                <Text style={styles.confirmItem}>{priceTarget.materialName}</Text>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>New price (£)</Text>
                  <TextInput
                    value={priceTarget.priceDraft}
                    onChangeText={(t) => setPriceTarget({ ...priceTarget, priceDraft: t.replace(/[^0-9.]/g, '') })}
                    keyboardType="decimal-pad"
                    style={styles.confirmInput}
                    selectTextOnFocus
                  />
                </View>
                <View style={styles.confirmActions}>
                  <Pressable style={[styles.bigBtn, styles.cancelBtn]} onPress={backToIdle}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
                  <Pressable style={[styles.bigBtn, styles.confirmBtn]} onPress={confirmPriceChange}><Text style={styles.confirmBtnText}>Save price</Text></Pressable>
                </View>
              </View>
            )}

            {step === 'confirm-line-op' && lineOpTarget && (
              <View style={styles.confirmArea}>
                <Text style={styles.confirmItem}>{lineOpTarget.description}</Text>
                {lineOpTarget.kind === 'setQuantity' && (
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>New quantity</Text>
                    <TextInput
                      value={lineOpTarget.quantityDraft}
                      onChangeText={(t) => setLineOpTarget({ ...lineOpTarget, quantityDraft: t.replace(/[^0-9.]/g, '') })}
                      keyboardType="decimal-pad"
                      style={styles.confirmInput}
                      selectTextOnFocus
                    />
                  </View>
                )}
                {lineOpTarget.kind === 'remove' && (
                  <Text style={styles.micHint}>This removes the line from {lineOpTarget.scope.isQuickQuote ? 'Estimate' : 'this job\'s quote'}.</Text>
                )}
                <View style={styles.confirmActions}>
                  <Pressable style={[styles.bigBtn, styles.cancelBtn]} onPress={backToIdle}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
                  <Pressable
                    style={[styles.bigBtn, lineOpTarget.kind === 'remove' ? styles.dangerBtn : styles.confirmBtn]}
                    onPress={confirmLineOp}
                  >
                    <Text style={styles.confirmBtnText}>{lineOpTarget.kind === 'remove' ? 'Remove' : 'Update'}</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {step === 'saving' && <View style={styles.micArea}><Text style={styles.micHint}>Working…</Text></View>}
            {step === 'saved' && <View style={styles.micArea}><Text style={styles.savedText}>Done ✓</Text></View>}
            </ScrollView>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

/** Small per-field mic button on confirm screens — dictates straight into one text field. */
function FieldMicButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={[styles.fieldMicBtn, active && styles.fieldMicBtnActive]}>
      <Text style={styles.fieldMicGlyph}>{active ? '●' : '🎤'}</Text>
    </Pressable>
  );
}

function errorMessage(error: 'permission-denied' | 'no-speech' | 'other'): string {
  switch (error) {
    case 'permission-denied':
      return 'Microphone / speech permission denied. Enable it in phone Settings › Apps › SparkQuote, then try again.';
    case 'no-speech':
      return "Didn't catch that — tap the mic and try again.";
    default:
      return 'Speech recognition error — tap the mic to try again.';
  }
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', left: '50%', marginLeft: -30, width: 60, height: 60, borderRadius: 30,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabIdle: {
    opacity: 0.35, shadowOpacity: 0, elevation: 0,
  },
  fabGlyph: { fontSize: 26 },

  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  scrimTap: { flex: 1 },
  kavWrapper: { width: '100%' },
  sheet: { minHeight: 260, backgroundColor: colors.ground, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: space.lg, paddingTop: space.sm },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.hairline, marginBottom: space.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  done: { fontSize: 16, fontWeight: '700', color: colors.accent },

  micArea: { alignItems: 'center', paddingVertical: space.lg, gap: space.sm },
  micBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  micBtnActive: { backgroundColor: colors.danger },
  micGlyph: { fontSize: 30 },
  micHint: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: space.lg },
  transcript: { color: colors.textPrimary, fontSize: 16, fontStyle: 'italic', textAlign: 'center', paddingHorizontal: space.lg },
  errorBox: { backgroundColor: colors.danger + '22', borderColor: colors.danger + '55', borderWidth: 1, borderRadius: radius.tile, padding: space.md },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  retryBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.xl, paddingVertical: space.md },
  retryBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 15 },
  infoText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  modeRow: { flexDirection: 'row', gap: space.sm },
  modeBtn: { flex: 1, paddingVertical: space.md, borderRadius: radius.tile, backgroundColor: colors.surface, alignItems: 'center' },
  modeBtnActive: { backgroundColor: colors.accent },
  modeBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 15 },
  modeBtnTextActive: { color: colors.accentInk },

  pickArea: { paddingVertical: space.md, gap: space.sm },
  pickLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  pickList: { maxHeight: 320 },
  infoScroll: { maxHeight: 320 },
  pickRow: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  pickRowTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  pickRowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: space.xl },
  cancelLink: { alignSelf: 'center', paddingVertical: space.md },
  cancelLinkText: { color: colors.danger, fontWeight: '600', fontSize: 14 },
  search: { backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.md, color: colors.textPrimary, fontSize: 16, marginBottom: space.sm },

  confirmArea: { paddingVertical: space.lg, gap: space.md },
  confirmItem: { color: colors.textPrimary, fontSize: 19, fontWeight: '800' },
  confirmRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.md, paddingVertical: space.md, gap: space.sm },
  confirmLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  confirmValue: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  confirmInput: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', minWidth: 70, textAlign: 'right' },
  confirmInputWide: { flex: 1, color: colors.textPrimary, fontSize: 16, fontWeight: '600', textAlign: 'right' },
  fieldMicBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center' },
  fieldMicBtnActive: { backgroundColor: colors.danger },
  fieldMicGlyph: { fontSize: 15 },
  confirmActions: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  bigBtn: { flex: 1, paddingVertical: space.lg, borderRadius: radius.tile, alignItems: 'center' },
  cancelBtn: { backgroundColor: colors.surface },
  cancelBtnText: { color: colors.danger, fontWeight: '800', fontSize: 17 },
  confirmBtn: { backgroundColor: colors.accent },
  dangerBtn: { backgroundColor: colors.danger },
  confirmBtnText: { color: colors.accentInk, fontWeight: '800', fontSize: 17 },
  savedText: { color: colors.accent, fontWeight: '800', fontSize: 20 },
});
