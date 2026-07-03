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
