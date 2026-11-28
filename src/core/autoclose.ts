export interface AutoClosePair {
  open: string;
  close: string;
  enabled: boolean;
  /** When true, suppress this pair inside Markdown fenced/indented code blocks and inline code spans. */
  notInCode: boolean;
}

export interface AutoCloseProfile {
  id: string;
  name: string;
  builtIn?: boolean;
  pairs: AutoClosePair[];
}

export interface AutoCloseSettings {
  enabled: boolean;
  activeProfileId: string;
  skipClosing: boolean;
  deletePairOnBackspace: boolean;
  wrapSelection: boolean;
  pairs: AutoClosePair[];
  profileOverrides: Record<string, AutoClosePair[]>;
  customProfiles: AutoCloseProfile[];
}

export const LATEX_DEFAULT_PAIRS: readonly AutoClosePair[] = [
  { open: '(', close: ')', enabled: true, notInCode: false },
  { open: '[', close: ']', enabled: true, notInCode: false },
  { open: '{', close: '}', enabled: true, notInCode: false },
  { open: '$', close: '$', enabled: true, notInCode: true },
  { open: '\\(', close: '\\)', enabled: true, notInCode: true },
  { open: '\\[', close: '\\]', enabled: true, notInCode: true },
  { open: '\\{', close: '\\}', enabled: true, notInCode: true },
  { open: '\\left(', close: '\\right)', enabled: true, notInCode: true },
  { open: '\\left[', close: '\\right]', enabled: true, notInCode: true },
  { open: '\\left\\{', close: '\\right\\}', enabled: true, notInCode: true },
  { open: '\\left|', close: '\\right|', enabled: true, notInCode: true },
  { open: '"', close: '"', enabled: true, notInCode: false },
  { open: '`', close: '`', enabled: true, notInCode: false },
];

export const MARKDOWN_CODE_PAIRS: readonly AutoClosePair[] = [
  { open: '(', close: ')', enabled: true, notInCode: false },
  { open: '[', close: ']', enabled: true, notInCode: false },
  { open: '{', close: '}', enabled: true, notInCode: false },
  { open: '"', close: '"', enabled: true, notInCode: false },
  { open: "'", close: "'", enabled: true, notInCode: false },
  { open: '`', close: '`', enabled: true, notInCode: false },
];

export const MINIMAL_PAIRS: readonly AutoClosePair[] = [
  { open: '(', close: ')', enabled: true, notInCode: false },
  { open: '[', close: ']', enabled: true, notInCode: false },
  { open: '{', close: '}', enabled: true, notInCode: false },
];

export const BUILTIN_AUTOCLOSE_PROFILES: readonly AutoCloseProfile[] = [
  {
    id: 'latex',
    name: 'LaTeX + Markdown',
    builtIn: true,
    pairs: LATEX_DEFAULT_PAIRS.map((p) => ({ ...p })),
  },
  {
    id: 'markdown',
    name: 'Markdown / Code',
    builtIn: true,
    pairs: MARKDOWN_CODE_PAIRS.map((p) => ({ ...p })),
  },
  {
    id: 'minimal',
    name: 'Brackets Only',
    builtIn: true,
    pairs: MINIMAL_PAIRS.map((p) => ({ ...p })),
  },
];

export const DEFAULT_AUTOCLOSE_SETTINGS: AutoCloseSettings = {
  enabled: true,
  activeProfileId: 'latex',
  skipClosing: true,
  deletePairOnBackspace: true,
  wrapSelection: true,
  pairs: LATEX_DEFAULT_PAIRS.map((p) => ({ ...p })),
  profileOverrides: {},
  customProfiles: [],
};

export function clonePairs(pairs: readonly AutoClosePair[]): AutoClosePair[] {
  return pairs.map((p) => ({
    open: p.open,
    close: p.close,
    enabled: p.enabled,
    notInCode: p.notInCode,
  }));
}

export function cloneAutoCloseSettings(
  settings: AutoCloseSettings = DEFAULT_AUTOCLOSE_SETTINGS
): AutoCloseSettings {
  const overrides: Record<string, AutoClosePair[]> = {};
  for (const [k, v] of Object.entries(settings.profileOverrides)) {
    overrides[k] = clonePairs(v);
  }
  return {
    enabled: settings.enabled,
    activeProfileId: settings.activeProfileId,
    skipClosing: settings.skipClosing,
    deletePairOnBackspace: settings.deletePairOnBackspace,
    wrapSelection: settings.wrapSelection,
    pairs: clonePairs(settings.pairs),
    profileOverrides: overrides,
    customProfiles: settings.customProfiles.map((p) => ({
      id: p.id,
      name: p.name,
      builtIn: false,
      pairs: clonePairs(p.pairs),
    })),
  };
}

export function getBuiltinProfile(id: string): AutoCloseProfile | undefined {
  return BUILTIN_AUTOCLOSE_PROFILES.find((p) => p.id === id);
}

export function getAllProfiles(settings: AutoCloseSettings): AutoCloseProfile[] {
  return [
    ...BUILTIN_AUTOCLOSE_PROFILES.map((p) => ({
      ...p,
      pairs: clonePairs(p.pairs),
    })),
    ...settings.customProfiles.map((p) => ({
      ...p,
      builtIn: false,
      pairs: clonePairs(p.pairs),
    })),
  ];
}

export function pairsEqual(a: readonly AutoClosePair[], b: readonly AutoClosePair[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i]!;
    const pb = b[i]!;
    if (
      pa.open !== pb.open ||
      pa.close !== pb.close ||
      pa.enabled !== pb.enabled ||
      pa.notInCode !== pb.notInCode
    ) {
      return false;
    }
  }
  return true;
}

export function isProfileModified(settings: AutoCloseSettings): boolean {
  const builtin = getBuiltinProfile(settings.activeProfileId);
  if (!builtin) return false;
  return !pairsEqual(settings.pairs, builtin.pairs);
}

export function updateActivePairs(
  settings: AutoCloseSettings,
  nextPairs: AutoClosePair[]
): AutoCloseSettings {
  const next = cloneAutoCloseSettings(settings);
  next.pairs = clonePairs(nextPairs);
  const builtin = getBuiltinProfile(next.activeProfileId);
  if (builtin) {
    if (pairsEqual(next.pairs, builtin.pairs)) {
      delete next.profileOverrides[next.activeProfileId];
    } else {
      next.profileOverrides[next.activeProfileId] = clonePairs(next.pairs);
    }
  } else {
    const custom = next.customProfiles.find((p) => p.id === next.activeProfileId);
    if (custom) {
      custom.pairs = clonePairs(next.pairs);
    }
  }
  return next;
}

export function selectProfile(
  settings: AutoCloseSettings,
  profileId: string
): AutoCloseSettings {
  const next = cloneAutoCloseSettings(settings);
  const builtin = getBuiltinProfile(profileId);
  if (builtin) {
    next.activeProfileId = profileId;
    next.pairs = clonePairs(next.profileOverrides[profileId] ?? builtin.pairs);
    return next;
  }
  const custom = next.customProfiles.find((p) => p.id === profileId);
  if (custom) {
    next.activeProfileId = profileId;
    next.pairs = clonePairs(custom.pairs);
    return next;
  }
  return next;
}

export function saveCustomProfile(
  settings: AutoCloseSettings,
  rawName: string
): AutoCloseSettings {
  const name = rawName.trim() || 'Custom Profile';
  const next = cloneAutoCloseSettings(settings);
  const existingByName = next.customProfiles.find(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );
  if (existingByName) {
    existingByName.name = name;
    existingByName.pairs = clonePairs(next.pairs);
    next.activeProfileId = existingByName.id;
    return next;
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'custom';
  let id = `custom-${slug}`;
  let suffix = 2;
  const taken = new Set([
    ...BUILTIN_AUTOCLOSE_PROFILES.map((p) => p.id),
    ...next.customProfiles.map((p) => p.id),
  ]);
  while (taken.has(id)) {
    id = `custom-${slug}-${suffix++}`;
  }
  next.customProfiles.push({
    id,
    name,
    builtIn: false,
    pairs: clonePairs(next.pairs),
  });
  next.activeProfileId = id;
  return next;
}

export function deleteCustomProfile(
  settings: AutoCloseSettings,
  profileId: string
): AutoCloseSettings {
  const next = cloneAutoCloseSettings(settings);
  next.customProfiles = next.customProfiles.filter((p) => p.id !== profileId);
  if (next.activeProfileId === profileId) {
    return selectProfile(next, 'latex');
  }
  return next;
}

export function resetActiveProfile(settings: AutoCloseSettings): AutoCloseSettings {
  const next = cloneAutoCloseSettings(settings);
  const builtin = getBuiltinProfile(next.activeProfileId);
  if (builtin) {
    delete next.profileOverrides[next.activeProfileId];
    next.pairs = clonePairs(builtin.pairs);
  }
  return next;
}

function sanitizePair(raw: unknown): AutoClosePair | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.open !== 'string' || typeof obj.close !== 'string') return null;
  if (obj.open.length === 0 || obj.close.length === 0) return null;
  return {
    open: obj.open,
    close: obj.close,
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : true,
    notInCode: typeof obj.notInCode === 'boolean' ? obj.notInCode : false,
  };
}

function sanitizePairsArray(raw: unknown): AutoClosePair[] | null {
  if (!Array.isArray(raw)) return null;
  const result: AutoClosePair[] = [];
  for (const item of raw) {
    const pair = sanitizePair(item);
    if (pair) result.push(pair);
  }
  return result;
}

export function sanitizeAutoCloseSettings(raw: unknown): AutoCloseSettings {
  if (!raw || typeof raw !== 'object') {
    return cloneAutoCloseSettings(DEFAULT_AUTOCLOSE_SETTINGS);
  }
  const obj = raw as Record<string, unknown>;

  const customProfiles: AutoCloseProfile[] = [];
  const seenIds = new Set(BUILTIN_AUTOCLOSE_PROFILES.map((p) => p.id));
  if (Array.isArray(obj.customProfiles)) {
    for (const item of obj.customProfiles) {
      if (!item || typeof item !== 'object') continue;
      const pObj = item as Record<string, unknown>;
      if (typeof pObj.id !== 'string' || !pObj.id.trim() || seenIds.has(pObj.id)) continue;
      if (typeof pObj.name !== 'string' || !pObj.name.trim()) continue;
      const pairs = sanitizePairsArray(pObj.pairs);
      if (!pairs) continue;
      seenIds.add(pObj.id);
      customProfiles.push({
        id: pObj.id,
        name: pObj.name.trim(),
        builtIn: false,
        pairs,
      });
    }
  }

  const profileOverrides: Record<string, AutoClosePair[]> = {};
  if (obj.profileOverrides && typeof obj.profileOverrides === 'object' && !Array.isArray(obj.profileOverrides)) {
    for (const [k, v] of Object.entries(obj.profileOverrides as Record<string, unknown>)) {
      if (!getBuiltinProfile(k)) continue;
      const pairs = sanitizePairsArray(v);
      if (pairs) profileOverrides[k] = pairs;
    }
  }

  const requestedProfileId =
    typeof obj.activeProfileId === 'string' && seenIds.has(obj.activeProfileId)
      ? obj.activeProfileId
      : DEFAULT_AUTOCLOSE_SETTINGS.activeProfileId;

  const sanitizedPairs = sanitizePairsArray(obj.pairs);
  const fallbackProfilePairs =
    profileOverrides[requestedProfileId] ??
    getBuiltinProfile(requestedProfileId)?.pairs ??
    customProfiles.find((p) => p.id === requestedProfileId)?.pairs ??
    LATEX_DEFAULT_PAIRS;

  return {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : DEFAULT_AUTOCLOSE_SETTINGS.enabled,
    activeProfileId: requestedProfileId,
    skipClosing:
      typeof obj.skipClosing === 'boolean'
        ? obj.skipClosing
        : DEFAULT_AUTOCLOSE_SETTINGS.skipClosing,
    deletePairOnBackspace:
      typeof obj.deletePairOnBackspace === 'boolean'
        ? obj.deletePairOnBackspace
        : DEFAULT_AUTOCLOSE_SETTINGS.deletePairOnBackspace,
    wrapSelection:
      typeof obj.wrapSelection === 'boolean'
        ? obj.wrapSelection
        : DEFAULT_AUTOCLOSE_SETTINGS.wrapSelection,
    pairs: clonePairs(sanitizedPairs ?? fallbackProfilePairs),
    profileOverrides,
    customProfiles,
  };
}
