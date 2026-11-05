import { syncCharacterDerivedStats } from './models/character.js';

export const VIEWPORT_RADIUS = 5; // 11x11 visible grid (-5..+5)

export const DIRECTION_DELTAS = {
  N: { dx: 0, dy: -1, label: 'North' },
  S: { dx: 0, dy: 1, label: 'South' },
  W: { dx: -1, dy: 0, label: 'West' },
  E: { dx: 1, dy: 0, label: 'East' }
};

export function revealOverworldArea(state, centerX, centerY, radius = VIEWPORT_RADIUS) {
  if (!state) return;
  if (!state.location) state.location = {};
  if (!state.location.exploredOverworld || typeof state.location.exploredOverworld !== 'object') {
    state.location.exploredOverworld = {};
  }
  const mapStore = state.location.exploredOverworld;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const wx = centerX + dx;
      const wy = centerY + dy;
      if (wx >= 0 && wx < 32 && wy >= 0 && wy < 32) {
        mapStore[`${wx},${wy}`] = true;
      }
    }
  }
}

export function isOverworldTileExplored(state, x, y) {
  return Boolean(state?.location?.exploredOverworld?.[`${x},${y}`]);
}

export function buildOverworldAtlasData(map, tiles, state) {
  if (!map || !tiles) {
    return { rows: [], exploredCount: 0, totalTiles: 0, percent: 0, landmarks: [] };
  }
  const isOnOverworld = state?.location?.mode === 'overworld';
  const partyX = isOnOverworld
    ? (state?.location?.x ?? 16)
    : (state?.location?.returnOverworld?.x ?? 16);
  const partyY = isOnOverworld
    ? (state?.location?.y ?? 14)
    : (state?.location?.returnOverworld?.y ?? 13);

  revealOverworldArea(state, partyX, partyY, VIEWPORT_RADIUS);

  let exploredCount = 0;
  const totalTiles = map.width * map.height;
  const rows = [];

  for (let y = 0; y < map.height; y++) {
    const cells = [];
    for (let x = 0; x < map.width; x++) {
      const explored = isOverworldTileExplored(state, x, y);
      if (explored) exploredCount += 1;

      const isParty = x === partyX && y === partyY;
      const tile = getTileDefAt(map, tiles, x, y);
      const trigger = getTriggerAt(map, x, y);

      let glyph = ' ';
      let fg = '#242b3d';
      let bg = '#07090f';
      let title = `Uncharted (${x}, ${y})`;

      if (isParty) {
        glyph = state?.flags?.has_skiff && tile.code === '=' ? '⛵' : '@';
        fg = '#ffe680';
        bg = '#382c10';
        title = `Your Party (${x}, ${y}) — ${trigger ? trigger.name : tile.name}`;
      } else if (explored) {
        glyph = tile.glyph;
        fg = tile.fg;
        bg = tile.bg;
        title = trigger
          ? `${trigger.name} (${x}, ${y}) — ${tile.name}`
          : `${tile.name} (${x}, ${y})`;
      }

      cells.push({
        key: `${x},${y}-${isParty ? 'p' : 't'}-${explored ? 1 : 0}`,
        x,
        y,
        explored,
        isParty,
        isLandmark: Boolean(explored && trigger),
        glyph,
        fg,
        bg,
        title
      });
    }
    rows.push({
      rowKey: `atlas-row-${y}`,
      cells
    });
  }

  const landmarks = (map.triggers || [])
    .filter(t => isOverworldTileExplored(state, t.x, t.y))
    .map(t => ({
      ...t,
      blessed: Boolean(t.flag && state?.flags?.[t.flag])
    }));

  const percent = totalTiles > 0 ? Math.round((exploredCount / totalTiles) * 100) : 0;

  return {
    rows,
    exploredCount,
    totalTiles,
    percent,
    landmarks
  };
}

export function getMapById(maps, mapId) {
  if (!maps) return null;
  const normalizedId = mapId === 'britannia' ? 'avalon' : mapId === 'town_britain' ? 'town_oakhaven' : mapId;
  return maps[normalizedId] || maps.avalon || Object.values(maps)[0] || null;
}

export function isSanctumUnlocked(state) {
  return Boolean(
    state?.flags?.boss_despise_malakor &&
      state?.flags?.boss_doom_pyrothrax &&
      state?.flags?.sanctum_unlocked
  );
}

export function isSanctumInteriorShrouded(map, state, x, y) {
  const b = map?.sanctumBounds;
  if (!b || isSanctumUnlocked(state)) return false;
  return x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2;
}

export function getTileCodeAt(map, x, y) {
  if (!map || !Array.isArray(map.grid)) return '~';
  if (y < 0 || y >= map.height || x < 0 || x >= map.width) {
    return map.mode === 'town' || map.mode === 'castle' ? '.' : '~';
  }
  const row = map.grid[y];
  if (!row || x >= row.length) return '~';
  return row[x];
}

export function getTileDefAt(map, tiles, x, y) {
  const code = getTileCodeAt(map, x, y);
  return (
    (tiles && tiles[code]) || {
      id: 'unknown',
      code,
      name: 'Unknown Terrain',
      glyph: '?',
      fg: '#9aa7c2',
      bg: '#090b10',
      passable: false,
      encounterRate: 0
    }
  );
}

export function getEffectiveSurfaceTileAt(map, tiles, state, x, y) {
  const baseTile = getTileDefAt(map, tiles, x, y);
  if (!map || !baseTile) return baseTile;

  if (isSanctumInteriorShrouded(map, state, x, y)) {
    return {
      id: 'shrouded_sanctum',
      code: ' ',
      name: 'Unknown',
      glyph: ' ',
      fg: '#05070c',
      bg: '#05070c',
      passable: false,
      shrouded: true,
      encounterRate: 0
    };
  }

  if (baseTile.code === 'V') {
    if (isSanctumUnlocked(state)) {
      return {
        ...(tiles?.['+'] || baseTile),
        id: 'sanctum_arch_open',
        code: '+',
        name: 'Unsealed Sanctum Archway',
        glyph: 'Π',
        fg: '#5ce1e6',
        bg: '#162936',
        passable: true,
        encounterRate: 0
      };
    }
    const bothSlain = Boolean(
      state?.flags?.boss_despise_malakor && state?.flags?.boss_doom_pyrothrax
    );
    if (bothSlain) {
      return {
        ...baseTile,
        blockReason:
          'Strange energy hums beyond the door! Speak with Queen Romana upon her throne to unseal the Royal Sanctum.'
      };
    }
    return baseTile;
  }

  if (baseTile.code === 'O' && !isSanctumUnlocked(state)) {
    return {
      ...(tiles?.['_'] || baseTile),
      id: 'dormant_sanctum_floor',
      code: '_',
      name: 'Sanctum Runic Circle',
      glyph: '·',
      fg: '#8a96ad',
      bg: '#181d29',
      passable: true,
      encounterRate: 0
    };
  }

  return baseTile;
}

export function getTriggerAt(map, x, y, state = null) {
  if (!map || !Array.isArray(map.triggers)) return null;
  if (state && isSanctumInteriorShrouded(map, state, x, y)) {
    return null;
  }
  const found = map.triggers.find(t => t.x === x && t.y === y) || null;
  if (found && found.type === 'portal' && state && !isSanctumUnlocked(state)) {
    return null;
  }
  return found;
}

export function getAdjacentTriggers(map, x, y, state = null) {
  if (!map || !Array.isArray(map.triggers)) return [];
  const coords = [
    { dir: 'North', x, y: y - 1 },
    { dir: 'South', x, y: y + 1 },
    { dir: 'West', x: x - 1, y },
    { dir: 'East', x: x + 1, y }
  ];
  const results = [];
  for (const c of coords) {
    const trig = getTriggerAt(map, c.x, c.y, state);
    if (trig) {
      results.push({ ...trig, direction: c.dir });
    }
  }
  return results;
}

export function buildViewportRows(map, tiles, centerX, centerY, radius = VIEWPORT_RADIUS, state = null) {
  if (!map || !tiles) return [];
  const rows = [];
  for (let dy = -radius; dy <= radius; dy++) {
    const rowCells = [];
    const wy = centerY + dy;
    for (let dx = -radius; dx <= radius; dx++) {
      const wx = centerX + dx;
      const inBounds = wx >= 0 && wx < map.width && wy >= 0 && wy < map.height;
      const tile = getEffectiveSurfaceTileAt(map, tiles, state, wx, wy);
      const trigger = inBounds ? getTriggerAt(map, wx, wy, state) : null;
      const isParty = dx === 0 && dy === 0;
      rowCells.push({
        key: `vcell-${dx},${dy}-${wx},${wy}-${isParty ? 'party' : 'tile'}`,
        x: wx,
        y: wy,
        inBounds,
        isParty,
        tile,
        trigger
      });
    }
    rows.push({
      rowKey: `vrow-${dy}-${centerX},${centerY}`,
      cells: rowCells
    });
  }
  return rows;
}

export function exitTownToOverworld(state, maps) {
  const currentMap = getMapById(maps, state.location.mapId);
  const fallbackExit = currentMap?.exitTo || { mapId: 'avalon', x: 16, y: 13 };
  const ret = state.location.returnOverworld || fallbackExit;
  const targetMap = getMapById(maps, ret.mapId);

  state.location.mode = targetMap?.mode || 'overworld';
  state.location.mapId = targetMap ? targetMap.id : 'avalon';
  state.location.x = typeof ret.x === 'number' ? ret.x : 16;
  state.location.y = typeof ret.y === 'number' ? ret.y : 13;

  return {
    moved: true,
    transitioned: true,
    log: `You depart ${currentMap ? currentMap.name : 'the town'} and return to ${targetMap ? targetMap.name : 'the Overworld'}.`
  };
}

export function attemptMove(state, maps, tiles, dirKey) {
  const delta = DIRECTION_DELTAS[dirKey];
  if (!delta) return { moved: false, log: 'Unknown direction.' };

  const currentMap = getMapById(maps, state.location.mapId);
  if (!currentMap) return { moved: false, log: 'No active map loaded.' };

  const isSettlement = currentMap.mode === 'town' || currentMap.mode === 'castle';
  const nx = state.location.x + delta.dx;
  const ny = state.location.y + delta.dy;

  // Stepping off the border of a town or castle map exits back to the overworld
  if (nx < 0 || nx >= currentMap.width || ny < 0 || ny >= currentMap.height) {
    if (isSettlement) {
      return exitTownToOverworld(state, maps);
    }
    return {
      moved: false,
      blocked: true,
      log: `${delta.label}: Uncharted ocean beyond the edge of the realm.`
    };
  }

  const triggerAtTarget = getTriggerAt(currentMap, nx, ny, state);
  // Stepping into Queen Romana opens the Royal Audience modal
  if (triggerAtTarget && triggerAtTarget.type === 'queen') {
    return {
      moved: false,
      talked: true,
      openQueenModal: true,
      trigger: triggerAtTarget,
      log: 'You step before the Golden Throne for an audience with Queen Romana.'
    };
  }
  // If an NPC stands on the target tile, converse with them instead of trampling them
  if (triggerAtTarget && triggerAtTarget.type === 'npc') {
    return {
      moved: false,
      talked: true,
      trigger: triggerAtTarget,
      log: triggerAtTarget.message
    };
  }

  const targetTile = getEffectiveSurfaceTileAt(currentMap, tiles, state, nx, ny);
  const canSailShallows = Boolean(
    currentMap.mode === 'overworld' &&
      targetTile.code === '=' &&
      state?.flags?.has_skiff
  );

  if (!targetTile.passable && !canSailShallows) {
    const blockNote =
      targetTile.code === '='
        ? currentMap.mode === 'castle'
          ? 'The castle moat is deep and patrolled by armored pike-fish.'
          : 'The shallow waters are too deep to wade without a vessel. Charter a Skiff at the Coastal Port of Moon!'
        : targetTile.blockReason || targetTile.name;
    return {
      moved: false,
      blocked: true,
      tile: targetTile,
      log: `${delta.label}: Blocked — ${blockNote}`
    };
  }

  // Commit move
  state.location.x = nx;
  state.location.y = ny;
  state.location.steps = (state.location.steps || 0) + 1;

  if (currentMap.mode === 'overworld') {
    revealOverworldArea(state, nx, ny, VIEWPORT_RADIUS);
  }

  // Check if stepping onto a Town/Castle border tile at the edge of the map
  if (
    isSettlement &&
    (nx === 0 || nx === currentMap.width - 1 || ny === 0 || ny === currentMap.height - 1)
  ) {
    return exitTownToOverworld(state, maps);
  }

  if (triggerAtTarget) {
    return {
      moved: true,
      tile: targetTile,
      trigger: triggerAtTarget,
      log: `[${triggerAtTarget.name}] ${triggerAtTarget.message}`
    };
  }

  return {
    moved: true,
    tile: targetTile,
    log: `${delta.label} — ${targetTile.name}`
  };
}

export function attemptEnterLocation(state, maps, gameData = {}) {
  const currentMap = getMapById(maps, state.location.mapId);
  if (!currentMap) return { ok: false, log: 'No map active.' };

  const trigger = getTriggerAt(currentMap, state.location.x, state.location.y, state);
  if (!trigger) {
    return {
      ok: false,
      log: 'There is nothing to enter or activate on this tile.'
    };
  }

  if (trigger.type === 'queen') {
    return {
      ok: true,
      openQueenModal: true,
      trigger,
      log: 'You step before the Golden Throne for an audience with Queen Romana.'
    };
  }

  if (trigger.type === 'portal') {
    return {
      ok: true,
      openPortalModal: true,
      trigger,
      log: 'Eldritch Rift Portal: COMING SOON!'
    };
  }

  if (trigger.type === 'shrine') {
    if (!state.flags) state.flags = {};
    if (trigger.flag && state.flags[trigger.flag]) {
      for (const entry of state.party || []) {
        const hero = state.roster.find(c => c.id === entry.charId);
        if (hero && hero.status !== 'Dead' && hero.status !== 'Ashes' && hero.derived?.hp > 0) {
          hero.derived.hp = hero.derived.maxHp;
          hero.derived.mp = hero.derived.maxMp;
        }
      }
      return {
        ok: true,
        shrineRestored: true,
        trigger,
        log: `[${trigger.name}] Your party already carries this Shrine's permanent blessing. Its warm radiance restores all living heroes to full HP and MP!`
      };
    }

    if (trigger.flag) {
      state.flags[trigger.flag] = true;
    }

    const statBonuses = trigger.statBonuses || {};
    const hpBonus = trigger.hpBonus || 0;
    const mpBonus = trigger.mpBonus || 0;
    const blessedNames = [];

    for (const entry of state.party || []) {
      const hero = state.roster.find(c => c.id === entry.charId);
      if (!hero) continue;
      if (!hero.stats) hero.stats = { str: 10, dex: 10, int: 10, wis: 10 };
      for (const [statKey, amt] of Object.entries(statBonuses)) {
        if (typeof amt === 'number') {
          hero.stats[statKey] = (hero.stats[statKey] || 10) + amt;
        }
      }
      if (!hero.shrineBonuses || typeof hero.shrineBonuses !== 'object') {
        hero.shrineBonuses = { maxHp: 0, maxMp: 0 };
      }
      hero.shrineBonuses.maxHp = (hero.shrineBonuses.maxHp || 0) + hpBonus;
      hero.shrineBonuses.maxMp = (hero.shrineBonuses.maxMp || 0) + mpBonus;

      syncCharacterDerivedStats(
        hero,
        gameData.racesById || {},
        gameData.classesById || {},
        gameData.itemsById || {},
        { fillVitals: hero.status !== 'Dead' && hero.status !== 'Ashes' }
      );
      blessedNames.push(hero.name);
    }

    const bonusTags = [];
    for (const [k, v] of Object.entries(statBonuses)) {
      if (v) bonusTags.push(`+${v} ${k.toUpperCase()}`);
    }
    if (hpBonus) bonusTags.push(`+${hpBonus} Max HP`);
    if (mpBonus) bonusTags.push(`+${mpBonus} Max MP`);

    return {
      ok: true,
      shrineBlessed: true,
      trigger,
      log: `☼ [${trigger.name}] Sacred light descends upon ${blessedNames.join(', ')}! Permanent blessing granted: ${bonusTags.join(', ')} (HP & MP fully restored)!`
    };
  }

  if ((trigger.type === 'town' || trigger.type === 'castle') && trigger.targetMapId) {
    const destMap = getMapById(maps, trigger.targetMapId);
    if (!destMap) {
      return { ok: false, log: `Destination map ${trigger.targetMapId} not found.` };
    }
    state.location.returnOverworld = {
      mapId: currentMap.id,
      x: state.location.x,
      y: state.location.y
    };
    state.location.mode = destMap.mode || 'town';
    state.location.mapId = destMap.id;
    state.location.x = typeof trigger.targetX === 'number' ? trigger.targetX : destMap.defaultSpawn.x;
    state.location.y = typeof trigger.targetY === 'number' ? trigger.targetY : destMap.defaultSpawn.y;

    const enterNote =
      destMap.mode === 'castle'
        ? `You cross the drawbridge into ${trigger.name}! (Walk out the southern gatehouse or press [X] to return to the Overworld).`
        : `You pass through the gates into ${trigger.name}! (Walk to the town border or press [X] to return to the Overworld).`;

    return {
      ok: true,
      transitioned: true,
      log: enterNote
    };
  }

  if (trigger.type === 'dungeon') {
    if (trigger.targetMapId) {
      const destMap = getMapById(maps, trigger.targetMapId);
      if (!destMap) {
        return { ok: false, log: `Dungeon map ${trigger.targetMapId} not found.` };
      }
      state.location.returnOverworld = {
        mapId: currentMap.id,
        x: state.location.x,
        y: state.location.y
      };
      state.location.mode = destMap.mode || 'dungeon';
      state.location.mapId = destMap.id;
      state.location.x = typeof trigger.targetX === 'number' ? trigger.targetX : destMap.defaultSpawn.x;
      state.location.y = typeof trigger.targetY === 'number' ? trigger.targetY : destMap.defaultSpawn.y;
      state.location.facing = trigger.targetFacing || destMap.defaultSpawn?.facing || 'N';

      return {
        ok: true,
        transitioned: true,
        enteredDungeon: true,
        log: `You descend into ${destMap.name}! (W/S step forward/back, A/D turn 90°, [O] Unlock, [F] Search/Disarm, [E] Stairs/Chest).`
      };
    }
    return {
      ok: false,
      log: trigger.message
    };
  }

  if (trigger.type === 'service') {
    return {
      ok: true,
      service: trigger.service,
      trigger,
      log: trigger.message
    };
  }

  if (trigger.type === 'fountain') {
    return {
      ok: true,
      service: 'fountain',
      trigger,
      log: 'You drink deeply from the cool fountain waters. Your spirits are refreshed!'
    };
  }

  return {
    ok: true,
    trigger,
    log: trigger.message
  };
}

export function attemptTalkNearby(state, maps) {
  const currentMap = getMapById(maps, state.location.mapId);
  if (!currentMap) return { ok: false, log: 'No map active.' };

  const adjacent = getAdjacentTriggers(currentMap, state.location.x, state.location.y, state);
  const queenAdjacent = adjacent.find(t => t.type === 'queen');
  if (queenAdjacent) {
    return {
      ok: true,
      openQueenModal: true,
      trigger: queenAdjacent,
      log: 'You step before the Golden Throne for an audience with Queen Romana.'
    };
  }

  const npcOrService = adjacent.find(t => t.type === 'npc' || t.type === 'service');
  if (npcOrService) {
    return {
      ok: true,
      trigger: npcOrService,
      log: npcOrService.message
    };
  }

  const underfoot = getTriggerAt(currentMap, state.location.x, state.location.y, state);
  if (underfoot && underfoot.type === 'queen') {
    return {
      ok: true,
      openQueenModal: true,
      trigger: underfoot,
      log: 'You step before the Golden Throne for an audience with Queen Romana.'
    };
  }
  if (underfoot && (underfoot.type === 'npc' || underfoot.type === 'service')) {
    return {
      ok: true,
      trigger: underfoot,
      log: underfoot.message
    };
  }

  return {
    ok: false,
    log: 'There is no one adjacent to talk to.'
  };
}
