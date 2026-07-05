/**
 * Fuzzy matching of spoken queries against real app data, using Fuse.js.
 * Tolerant of electrician shorthand (e.g. "2.5 twin and earth" vs "Twin &
 * Earth Cable 2.5mm Grey").
 */
import Fuse from 'fuse.js';
import type { Assembly, Location, Material, Project, LineItem, SnagItem } from '../domain/types';

export interface MaterialMatch {
  material: Material;
  score: number;
}

export interface ProjectMatch {
  project: Project;
  score: number;
}

export interface AssemblyMatch {
  assembly: Assembly;
  score: number;
}

export interface LocationMatch {
  location: Location;
  score: number;
}

export interface SnagMatch {
  snag: SnagItem;
  score: number;
}

export interface LineMatch {
  line: LineItem;
  score: number;
}

const MATCH_THRESHOLD = 0.4;

export function matchMaterials(query: string, materials: Material[], limit = 3): MaterialMatch[] {
  const q = query.trim();
  if (!q || materials.length === 0) return [];
  const fuse = new Fuse(materials, {
    includeScore: true,
    threshold: MATCH_THRESHOLD,
    ignoreLocation: true,
    keys: [
      { name: 'description', weight: 0.7 },
      { name: 'sku', weight: 0.3 },
    ],
  });
  return fuse.search(q, { limit }).map((r) => ({ material: r.item, score: r.score ?? 1 }));
}

export function matchProjects(query: string, projects: Project[], limit = 3): ProjectMatch[] {
  const q = query.trim();
  if (!q || projects.length === 0) return [];
  const fuse = new Fuse(projects, {
    includeScore: true,
    threshold: MATCH_THRESHOLD,
    ignoreLocation: true,
    keys: [
      { name: 'name', weight: 0.7 },
      { name: 'clientName', weight: 0.3 },
    ],
  });
  return fuse.search(q, { limit }).map((r) => ({ project: r.item, score: r.score ?? 1 }));
}

export function matchAssemblies(query: string, assemblies: Assembly[], limit = 3): AssemblyMatch[] {
  const q = query.trim();
  if (!q || assemblies.length === 0) return [];
  const fuse = new Fuse(assemblies, {
    includeScore: true,
    threshold: MATCH_THRESHOLD,
    ignoreLocation: true,
    keys: [
      { name: 'name', weight: 0.7 },
      { name: 'category', weight: 0.3 },
    ],
  });
  return fuse.search(q, { limit }).map((r) => ({ assembly: r.item, score: r.score ?? 1 }));
}

/** Matches floor or room names — pass a pre-filtered list (by parentId) for either. */
export function matchLocations(query: string, locations: Location[], limit = 3): LocationMatch[] {
  const q = query.trim();
  if (!q || locations.length === 0) return [];
  const fuse = new Fuse(locations, {
    includeScore: true,
    threshold: MATCH_THRESHOLD,
    ignoreLocation: true,
    keys: ['name'],
  });
  return fuse.search(q, { limit }).map((r) => ({ location: r.item, score: r.score ?? 1 }));
}

const ROOM_FLOOR_SPLIT_RE = /^(.*?)\s*(?:,|\bon\b|\bin\b|\bto\b|\bfor\b)\s*(?:the\s+)?(.+)$/i;

/**
 * Splits a spoken room/floor clause like "kitchen, ground floor", "kitchen
 * on the ground floor", or "kitchen to the ground floor" into a name part
 * and an optional qualifier part. Fuse's fuzzy scoring compares the *whole*
 * query string against the *whole* candidate name, so matching a compound
 * phrase straight against a short name like "Kitchen" fails outright (the
 * extra words push it past Fuse's own threshold) — the name part needs
 * matching on its own, with the qualifier part used separately (to
 * disambiguate same-named rooms on different floors, or to pick which floor
 * a new room goes on).
 */
export function splitRoomFloorClause(query: string): { roomPart: string; floorPart?: string } {
  const trimmed = query.trim();
  const m = trimmed.match(ROOM_FLOOR_SPLIT_RE);
  if (!m || !m[1].trim()) return { roomPart: trimmed };
  return { roomPart: m[1].trim(), floorPart: m[2].trim() };
}

/**
 * Looks for one of the project's actual floor names appearing literally
 * inside the spoken clause (case-insensitive, word-bounded), e.g. "ground
 * floor" inside "kitchen ground floor" — checked longest-name-first so a
 * more specific floor ("First Floor") wins over a shorter one that happens
 * to be a substring of it. This is tried before any grammar-based split
 * because real speech is often connector-free: "kitchen ground floor" has
 * no comma or "on"/"to" to split on at all, but the floor names themselves
 * are known data, so they can be found directly rather than guessed at
 * from sentence structure.
 */
export function stripKnownFloorName(query: string, floors: Location[]): { rest: string; floor?: Location } {
  const sorted = [...floors].sort((a, b) => b.name.length - a.name.length);
  for (const floor of sorted) {
    const name = floor.name.trim();
    if (name.length < 3) continue;
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const m = query.match(re);
    if (m) {
      const rest = (query.slice(0, m.index) + ' ' + query.slice((m.index ?? 0) + m[0].length))
        .replace(/\s+/g, ' ').trim();
      return { rest, floor };
    }
  }
  return { rest: query };
}

/**
 * Resolves a spoken room-target clause against a project's rooms.
 * Prefers finding one of the project's real floor names literally in the
 * clause (handles connector-free phrasing like "kitchen ground floor");
 * falls back to a grammar-based split (comma/"on"/"to"/"for") for a floor
 * name the recognizer garbled; falls back again to matching the room-name
 * part alone, then the whole clause, against room names directly.
 */
export function matchRoomWithFloor(query: string, rooms: Location[], floors: Location[]): LocationMatch[] {
  const trimmed = query.trim();

  const { rest, floor } = stripKnownFloorName(trimmed, floors);
  if (floor) {
    const roomsOnFloor = rooms.filter((r) => r.parentId === floor.id);
    const pool = roomsOnFloor.length > 0 ? roomsOnFloor : rooms;
    const roomQuery = rest || trimmed;
    let onFloorMatches = matchLocations(roomQuery, pool, 5);
    if (onFloorMatches.length === 0 && pool !== rooms) onFloorMatches = matchLocations(roomQuery, rooms, 5);
    if (onFloorMatches.length > 0) return onFloorMatches;
  }

  const { roomPart, floorPart } = splitRoomFloorClause(trimmed);
  let matches = matchLocations(roomPart, rooms, 5);
  if (matches.length === 0 && roomPart !== trimmed) {
    matches = matchLocations(trimmed, rooms, 5);
  }
  if (floorPart && matches.length > 1) {
    const floorMatches = matchLocations(floorPart, floors, 3);
    if (floorMatches.length > 0) {
      const floorIds = new Set(floorMatches.map((f) => f.location.id));
      const narrowed = matches.filter((m) => m.location.parentId && floorIds.has(m.location.parentId));
      if (narrowed.length > 0) matches = narrowed;
    }
  }
  return matches;
}

export function matchSnags(query: string, snags: SnagItem[], limit = 3): SnagMatch[] {
  const q = query.trim();
  if (!q || snags.length === 0) return [];
  const fuse = new Fuse(snags, {
    includeScore: true,
    threshold: MATCH_THRESHOLD,
    ignoreLocation: true,
    keys: ['description'],
  });
  return fuse.search(q, { limit }).map((r) => ({ snag: r.item, score: r.score ?? 1 }));
}

/** Matches line-item descriptions on a live estimate, for voice remove/edit commands. */
export function matchLines(query: string, lines: LineItem[], limit = 3): LineMatch[] {
  const q = query.trim();
  if (!q || lines.length === 0) return [];
  const fuse = new Fuse(lines, {
    includeScore: true,
    threshold: MATCH_THRESHOLD,
    ignoreLocation: true,
    keys: ['description'],
  });
  return fuse.search(q, { limit }).map((r) => ({ line: r.item, score: r.score ?? 1 }));
}
