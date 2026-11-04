export const SAVE_STORAGE_KEY = 'ultima3_save_v1';
export const MAX_ROSTER_SIZE = 20;
export const MIN_PARTY_SIZE = 4;
export const MAX_PARTY_SIZE = 6;
export const MAX_FRONT_ROW = 2;

export function createDefaultState() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    roster: [],
    // Array of { charId: string, row: 'front' | 'back' }
    party: [],
    gold: 200,
    // Shared party pack: Array of { itemId: string, qty: number }
    inventory: [
      { itemId: 'healing_draught', qty: 2 },
      { itemId: 'dungeon_torch', qty: 1 },
      { itemId: 'camping_tent', qty: 1 }
    ],
    location: {
      mode: 'overworld',
      mapId: 'avalon',
      x: 16,
      y: 14,
      facing: 'N',
      steps: 0,
      returnOverworld: {
        mapId: 'avalon',
        x: 16,
        y: 13
      }
    },
    flags: {}
  };
}

export function loadStateFromStorage() {
  try {
    const raw = localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw);
    return normalizeSaveState(parsed);
  } catch (err) {
    console.warn('Could not parse saved state, returning fresh state:', err);
    return createDefaultState();
  }
}

export function saveStateToStorage(state) {
  if (state && typeof state === 'object') {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(state));
    return state;
  }
  const payload = {
    ...createDefaultState(),
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(payload));
  return payload;
}

export function resetStorageState() {
  localStorage.removeItem(SAVE_STORAGE_KEY);
  return createDefaultState();
}

export function normalizeSaveState(raw) {
  const base = createDefaultState();
  if (!raw || typeof raw !== 'object') return base;

  const roster = Array.isArray(raw.roster) ? raw.roster.slice(0, MAX_ROSTER_SIZE) : [];
  const rosterIds = new Set(roster.map(c => c.id));

  const party = Array.isArray(raw.party)
    ? raw.party
        .map(entry => (typeof entry === 'string' ? { charId: entry, row: 'back' } : entry))
        .filter(entry => entry && rosterIds.has(entry.charId))
        .slice(0, MAX_PARTY_SIZE)
    : [];

  // Enforce max 2 in front row
  let frontCount = 0;
  for (const member of party) {
    if (member.row === 'front') {
      frontCount++;
      if (frontCount > MAX_FRONT_ROW) {
        member.row = 'back';
      }
    } else {
      member.row = 'back';
    }
  }

  // Normalize shared party pack
  const invMap = new Map();
  if (Array.isArray(raw.inventory)) {
    for (const entry of raw.inventory) {
      if (!entry) continue;
      const itemId = typeof entry === 'string' ? entry : entry.itemId;
      const qty = typeof entry === 'object' && typeof entry.qty === 'number' ? Math.floor(entry.qty) : 1;
      if (itemId && qty > 0) {
        invMap.set(itemId, (invMap.get(itemId) || 0) + qty);
      }
    }
  } else {
    // Backfill default healing potions if loading an older save with no inventory key
    for (const defEntry of base.inventory) {
      invMap.set(defEntry.itemId, defEntry.qty);
    }
  }
  const inventory = Array.from(invMap.entries()).map(([itemId, qty]) => ({ itemId, qty }));

  const loc = raw.location && typeof raw.location === 'object'
    ? { ...base.location, ...raw.location }
    : base.location;

  if (loc.mapId === 'britannia') loc.mapId = 'avalon';
  if (loc.mapId === 'town_britain') loc.mapId = 'town_oakhaven';
  if (loc.returnOverworld && loc.returnOverworld.mapId === 'britannia') {
    loc.returnOverworld.mapId = 'avalon';
  }

  return {
    version: 1,
    updatedAt: raw.updatedAt || base.updatedAt,
    roster,
    party,
    gold: typeof raw.gold === 'number' ? raw.gold : base.gold,
    inventory,
    location: loc,
    flags: raw.flags && typeof raw.flags === 'object' ? raw.flags : {}
  };
}
