export const VIEWPORT_RADIUS = 5; // 11x11 visible grid (-5..+5)

export const DIRECTION_DELTAS = {
  N: { dx: 0, dy: -1, label: 'North' },
  S: { dx: 0, dy: 1, label: 'South' },
  W: { dx: -1, dy: 0, label: 'West' },
  E: { dx: 1, dy: 0, label: 'East' }
};

export function getMapById(maps, mapId) {
  if (!maps) return null;
  const normalizedId = mapId === 'britannia' ? 'avalon' : mapId === 'town_britain' ? 'town_oakhaven' : mapId;
  return maps[normalizedId] || maps.avalon || Object.values(maps)[0] || null;
}

export function getTileCodeAt(map, x, y) {
  if (!map || !Array.isArray(map.grid)) return '~';
  if (y < 0 || y >= map.height || x < 0 || x >= map.width) {
    return map.mode === 'town' ? '.' : '~';
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

export function getTriggerAt(map, x, y) {
  if (!map || !Array.isArray(map.triggers)) return null;
  return map.triggers.find(t => t.x === x && t.y === y) || null;
}

export function getAdjacentTriggers(map, x, y) {
  if (!map || !Array.isArray(map.triggers)) return [];
  const coords = [
    { dir: 'North', x, y: y - 1 },
    { dir: 'South', x, y: y + 1 },
    { dir: 'West', x: x - 1, y },
    { dir: 'East', x: x + 1, y }
  ];
  const results = [];
  for (const c of coords) {
    const trig = getTriggerAt(map, c.x, c.y);
    if (trig) {
      results.push({ ...trig, direction: c.dir });
    }
  }
  return results;
}

export function buildViewportRows(map, tiles, centerX, centerY, radius = VIEWPORT_RADIUS) {
  if (!map || !tiles) return [];
  const rows = [];
  for (let dy = -radius; dy <= radius; dy++) {
    const rowCells = [];
    const wy = centerY + dy;
    for (let dx = -radius; dx <= radius; dx++) {
      const wx = centerX + dx;
      const inBounds = wx >= 0 && wx < map.width && wy >= 0 && wy < map.height;
      const tile = getTileDefAt(map, tiles, wx, wy);
      const trigger = inBounds ? getTriggerAt(map, wx, wy) : null;
      const isParty = dx === 0 && dy === 0;
      rowCells.push({
        key: `${wx},${wy}`,
        x: wx,
        y: wy,
        inBounds,
        isParty,
        tile,
        trigger
      });
    }
    rows.push({
      rowKey: `row-${wy}`,
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

  const nx = state.location.x + delta.dx;
  const ny = state.location.y + delta.dy;

  // Stepping off the border of a town map exits back to the overworld
  if (nx < 0 || nx >= currentMap.width || ny < 0 || ny >= currentMap.height) {
    if (currentMap.mode === 'town') {
      return exitTownToOverworld(state, maps);
    }
    return {
      moved: false,
      blocked: true,
      log: `${delta.label}: Uncharted ocean beyond the edge of the realm.`
    };
  }

  const triggerAtTarget = getTriggerAt(currentMap, nx, ny);
  // If an NPC stands on the target tile, converse with them instead of trampling them
  if (triggerAtTarget && triggerAtTarget.type === 'npc') {
    return {
      moved: false,
      talked: true,
      trigger: triggerAtTarget,
      log: triggerAtTarget.message
    };
  }

  const targetTile = getTileDefAt(currentMap, tiles, nx, ny);
  if (!targetTile.passable) {
    return {
      moved: false,
      blocked: true,
      tile: targetTile,
      log: `${delta.label}: Blocked — ${targetTile.blockReason || targetTile.name}`
    };
  }

  // Commit move
  state.location.x = nx;
  state.location.y = ny;
  state.location.steps = (state.location.steps || 0) + 1;

  // Check if stepping onto a Town border tile at the edge of town (optional convenience if walking out the gate row)
  if (
    currentMap.mode === 'town' &&
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

export function attemptEnterLocation(state, maps) {
  const currentMap = getMapById(maps, state.location.mapId);
  if (!currentMap) return { ok: false, log: 'No map active.' };

  const trigger = getTriggerAt(currentMap, state.location.x, state.location.y);
  if (!trigger) {
    return {
      ok: false,
      log: 'There is nothing to enter or activate on this tile.'
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

    return {
      ok: true,
      transitioned: true,
      log: `You pass through the gates into ${trigger.name}! (Walk to the town border or press [X] to return to the Overworld).`
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

  const adjacent = getAdjacentTriggers(currentMap, state.location.x, state.location.y);
  const npcOrService = adjacent.find(t => t.type === 'npc' || t.type === 'service');
  if (npcOrService) {
    return {
      ok: true,
      trigger: npcOrService,
      log: npcOrService.message
    };
  }

  const underfoot = getTriggerAt(currentMap, state.location.x, state.location.y);
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
