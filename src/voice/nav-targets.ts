/**
 * Fixed synonym map for "open X" / "go to X" voice navigation. Checked
 * before falling back to a fuzzy project-name match, so app screens always
 * win over a similarly-named project.
 */
export interface NavTarget {
  patterns: string[];
  path: string;
  label: string;
}

export const NAV_TARGETS: NavTarget[] = [
  { patterns: ['home', 'dashboard', 'the home screen'], path: '/', label: 'Home' },
  { patterns: ['projects', 'the projects', 'project list', 'jobs', 'the jobs'], path: '/projects', label: 'Projects' },
  { patterns: ['settings'], path: '/settings', label: 'Settings' },
  { patterns: ['quick quote'], path: '/quick-quote', label: 'Quick Quote' },
  { patterns: ['estimate', 'the estimate', 'my estimate'], path: '/estimate', label: 'Estimate' },
  { patterns: ['catalogue', 'catalog', 'materials', 'the price book'], path: '/catalogue', label: 'Catalogue' },
  { patterns: ['manage jobs', 'manage assemblies', 'assemblies'], path: '/manage-jobs', label: 'Manage Jobs' },
  { patterns: ['suppliers', 'supplier prices'], path: '/suppliers', label: 'Suppliers' },
  { patterns: ['business profile', 'my business', 'my profile'], path: '/business-profile', label: 'Business Profile' },
  { patterns: ['profit report', 'the profit report', 'profit'], path: '/profit-report', label: 'Profit Report' },
  { patterns: ['cloud backup', 'backup'], path: '/cloud-backup', label: 'Cloud Backup' },
  { patterns: ['photos and storage', 'photo storage', 'media settings'], path: '/media-settings', label: 'Photos & Storage' },
  { patterns: ['import', 'import prices'], path: '/import', label: 'Import' },
  { patterns: ['tools', 'the tools', 'tools hub', 'electrician tools'], path: '/tools', label: 'Tools' },
  { patterns: ['voltage drop', 'the voltage drop calculator', 'voltage drop calculator'], path: '/tools/voltage-drop', label: 'Voltage Drop' },
  { patterns: ["ohm's law", 'ohms law', "the ohm's law calculator", 'power wheel', 'the power wheel'], path: '/tools/ohms-law', label: "Ohm's Law" },
];

/** Exact or substring match against the fixed nav targets, case-insensitive. */
export function matchNavTarget(spoken: string): NavTarget | null {
  const t = spoken.trim().toLowerCase();
  if (!t) return null;
  for (const target of NAV_TARGETS) {
    if (target.patterns.some((p) => t === p || t.includes(p))) return target;
  }
  return null;
}

/** Context-dependent targets that only make sense while inside a project. */
export interface ProjectNavTarget {
  patterns: string[];
  path: (projectId: string) => string;
  label: string;
}

export const PROJECT_NAV_TARGETS: ProjectNavTarget[] = [
  { patterns: ['snags', 'snag list', 'the snag list', 'the snags', 'punch list'], path: (id) => `/project/snag/${id}`, label: 'Snags' },
  { patterns: ['quote', 'the quote', 'quoting', 'the estimate for this job'], path: (id) => `/project/quote/${id}`, label: 'Quote' },
  { patterns: ['documents', 'drawings'], path: (id) => `/project/drawings/${id}`, label: 'Documents' },
  { patterns: ['this project', 'this job', 'the project', 'the job'], path: (id) => `/project/${id}`, label: 'Project' },
];

export function matchProjectNavTarget(spoken: string): ProjectNavTarget | null {
  const t = spoken.trim().toLowerCase();
  if (!t) return null;
  for (const target of PROJECT_NAV_TARGETS) {
    if (target.patterns.some((p) => t === p || t.includes(p))) return target;
  }
  return null;
}
