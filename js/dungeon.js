import { dice } from './dice.js';
import { getStatMod, getEffectiveStats } from './models/character.js';
import { addItemToPack, getInventoryQty, removeItemFromPack } from './items.js';
import { getMapById, getTileDefAt, getTriggerAt } from './overworld.js';
import { isHeroDead } from './magic.js';

export const FACINGS = ['N', 'E', 'S', 'W'];

export const FACING_META = {
  N: { dx: 0, dy: -1, label: 'North', short: 'N', arrow: '▲' },
  E: { dx: 1, dy: 0, label: 'East', short: 'E', arrow: '▶' },
  S: { dx: 0, dy: 1, label: 'South', short: 'S', arrow: '▼' },
  W: { dx: -1, dy: 0, label: 'West', short: 'W', arrow: '◀' }
};

export const DUNGEON_MINIMAP_RADIUS = 3; // 7x7 local sensor grid

export function normalizeFacing(facing) {
  return FACINGS.includes(facing) ? facing : 'N';
}

export function turnFacing(facing, turnDir = 'right') {
  const current = normalizeFacing(facing);
  const idx = FACINGS.indexOf(current);
  if (turnDir === 'left') {
    return FACINGS[(idx + 3) % 4];
  }
  if (turnDir === 'around') {
    return FACINGS[(idx + 2) % 4];
  }
  return FACINGS[(idx + 1) % 4];
}

export function getRelativeVectors(facing) {
  const f = normalizeFacing(facing);
  const leftFace = turnFacing(f, 'left');
  const rightFace = turnFacing(f, 'right');
  const backFace = turnFacing(f, 'around');
  return {
    forward: { dx: FACING_META[f].dx, dy: FACING_META[f].dy },
    left: { dx: FACING_META[leftFace].dx, dy: FACING_META[leftFace].dy },
    right: { dx: FACING_META[rightFace].dx, dy: FACING_META[rightFace].dy },
    back: { dx: FACING_META[backFace].dx, dy: FACING_META[backFace].dy }
  };
}

export function markDungeonTileExplored(state, mapId, x, y) {
  if (!state || !mapId) return;
  if (!state.flags) state.flags = {};
  const key = `explored_${mapId}`;
  if (!Array.isArray(state.flags[key])) {
    state.flags[key] = [];
  }
  const coordStr = `${x},${y}`;
  if (!state.flags[key].includes(coordStr)) {
    state.flags[key].push(coordStr);
  }
  // Also reveal immediate orthogonal neighbors so walls framing the corridor show on the mini-map
  for (const dir of Object.values(FACING_META)) {
    const nStr = `${x + dir.dx},${y + dir.dy}`;
    if (!state.flags[key].includes(nStr)) {
      state.flags[key].push(nStr);
    }
  }
}

export function isDungeonTileExplored(state, mapId, x, y) {
  const key = `explored_${mapId}`;
  const list = state?.flags?.[key];
  if (!Array.isArray(list)) return false;
  return list.includes(`${x},${y}`);
}

export function isDoorUnlocked(state, trigger) {
  if (!trigger || trigger.type !== 'locked_door') return true;
  if (!trigger.flag) return false;
  return Boolean(state?.flags?.[trigger.flag]);
}

export function isFeatureConsumed(state, trigger) {
  if (!trigger || !trigger.flag) return false;
  return Boolean(state?.flags?.[trigger.flag]);
}

export function isChestTrapDisarmed(state, trigger) {
  if (!trigger || !trigger.trap) return true;
  if (!trigger.flag) return false;
  return Boolean(state?.flags?.[`${trigger.flag}_disarmed`]);
}

export function getEffectiveDungeonTileAt(map, tiles, state, x, y) {
  if (!map || !tiles) {
    return {
      id: 'wall',
      code: '#',
      name: 'Stone Wall',
      glyph: '█',
      fg: '#6e7a94',
      bg: '#363e4f',
      passable: false
    };
  }
  if (x < 0 || x >= map.width || y < 0 || y >= map.height) {
    return tiles['#'];
  }
  const baseTile = getTileDefAt(map, tiles, x, y);
  const trigger = getTriggerAt(map, x, y);

  if (baseTile.code === 'L' && trigger && isDoorUnlocked(state, trigger)) {
    return {
      ...tiles['+'],
      name: `${trigger.name} (Unlocked)`
    };
  }

  if (baseTile.code === '$' && trigger && isFeatureConsumed(state, trigger)) {
    return {
      ...baseTile,
      glyph: '□',
      fg: '#7a8599',
      name: `${trigger.name} (Opened)`
    };
  }

  if (baseTile.code === '!' && trigger) {
    const detectActive = (state?.location?.detectSteps || 0) > 0;
    const consumed = isFeatureConsumed(state, trigger);
    if (!detectActive && !consumed) {
      // Concealed floor trap looks like normal dungeon floor until detected or sprung
      return tiles['_'] || tiles['.'];
    }
    if (consumed) {
      return {
        ...baseTile,
        fg: '#6e7a94',
        name: `${trigger.name} (Disarmed/Sprung)`
      };
    }
  }

  return baseTile;
}

export function buildDungeonMinimapRows(map, tiles, state, radius = DUNGEON_MINIMAP_RADIUS) {
  if (!map || !tiles || !state?.location) return [];
  const centerX = state.location.x ?? 1;
  const centerY = state.location.y ?? 1;
  const facing = normalizeFacing(state.location.facing);
  const partyArrow = FACING_META[facing].arrow;
  const detectActive = (state.location.detectSteps || 0) > 0;

  const rows = [];
  for (let dy = -radius; dy <= radius; dy++) {
    const wy = centerY + dy;
    const cells = [];
    for (let dx = -radius; dx <= radius; dx++) {
      const wx = centerX + dx;
      const inBounds = wx >= 0 && wx < map.width && wy >= 0 && wy < map.height;
      const isParty = dx === 0 && dy === 0;
      const dist = Math.abs(dx) + Math.abs(dy);
      const explored = isParty || dist <= 1 || detectActive || isDungeonTileExplored(state, map.id, wx, wy);

      if (!inBounds || !explored) {
        cells.push({
          key: `${wx},${wy}`,
          x: wx,
          y: wy,
          inBounds,
          explored: false,
          isParty: false,
          glyph: ' ',
          fg: '#222b42',
          bg: '#05070c',
          title: 'Unexplored Darkness'
        });
        continue;
      }

      const tile = getEffectiveDungeonTileAt(map, tiles, state, wx, wy);
      const trigger = getTriggerAt(map, wx, wy);
      cells.push({
        key: `${wx},${wy}`,
        x: wx,
        y: wy,
        inBounds,
        explored: true,
        isParty,
        glyph: isParty ? partyArrow : tile.glyph,
        fg: isParty ? '#ffffff' : tile.fg,
        bg: tile.bg,
        tile,
        trigger,
        title: isParty
          ? `Party (${wx},${wy}) Facing ${FACING_META[facing].label}`
          : trigger
            ? tile.name.includes(trigger.name)
              ? tile.name
              : `${trigger.name} (${tile.name})`
            : tile.name
      });
    }
    rows.push({
      rowKey: `drow-${wy}`,
      cells
    });
  }
  return rows;
}

export function getTriggerAhead(state, maps) {
  const currentMap = getMapById(maps, state?.location?.mapId);
  if (!currentMap || currentMap.mode !== 'dungeon') return null;
  const facing = normalizeFacing(state.location.facing);
  const vec = FACING_META[facing];
  const tx = (state.location.x ?? 1) + vec.dx;
  const ty = (state.location.y ?? 1) + vec.dy;
  const trig = getTriggerAt(currentMap, tx, ty);
  if (!trig) return null;
  return { ...trig, x: tx, y: ty, direction: vec.label };
}

export function applyTrapEffectToParty(state, trapSpec, partyMembers) {
  if (!trapSpec) return { log: 'A trap clicks harmlessly.' };
  const living = (partyMembers || [])
    .map(m => state.roster.find(c => c.id === m.id))
    .filter(h => h && !isHeroDead(h));

  if (living.length === 0) return { log: 'The trap triggers in an empty hall.' };

  const isAoE = trapSpec.type === 'gas_cloud' || trapSpec.type === 'explosive_rune' || trapSpec.type === 'shock_ward';
  const targets = isAoE
    ? living
    : [living[Math.floor(Math.random() * Math.min(2, living.length))]];

  const notes = [];
  for (const hero of targets) {
    const dmg = Math.max(1, dice.roll(trapSpec.damageDice || '1d6'));
    hero.derived.hp = Math.max(0, hero.derived.hp - dmg);
    let statusNote = '';
    if (hero.derived.hp <= 0) {
      hero.status = 'Dead';
      statusNote = ' -> SLAIN!';
    } else if (trapSpec.status && hero.status === 'OK') {
      if (Math.random() < 0.65) {
        hero.status = trapSpec.status;
        if (trapSpec.status !== 'Poison') {
          hero.statusDuration = 2;
        }
        statusNote = ` & ${trapSpec.status}`;
      }
    }
    notes.push(`${hero.name} (-${dmg} HP${statusNote})`);
  }

  return {
    sprung: true,
    log: `TRAP SPRUNG — ${trapSpec.name || 'Dungeon Trap'}! ${notes.join(', ')}.`
  };
}

function findBestTrapHandler(partyMembers, itemsById = {}) {
  const living = (partyMembers || []).filter(h => h && !isHeroDead(h));
  if (living.length === 0) return null;
  const thieves = living.filter(h => h.class === 'thief');
  if (thieves.length > 0) {
    return thieves.sort(
      (a, b) => getEffectiveStats(b, itemsById).dex - getEffectiveStats(a, itemsById).dex
    )[0];
  }
  return living.sort(
    (a, b) => getEffectiveStats(b, itemsById).dex - getEffectiveStats(a, itemsById).dex
  )[0];
}

export function stepDungeon(state, maps, tiles, stepDir = 'forward', partyMembers = [], itemsById = {}) {
  const currentMap = getMapById(maps, state?.location?.mapId);
  if (!currentMap || currentMap.mode !== 'dungeon') {
    return { moved: false, log: 'Not inside a dungeon.' };
  }

  const facing = normalizeFacing(state.location.facing);
  const vectors = getRelativeVectors(facing);
  const delta = stepDir === 'back' ? vectors.back : vectors.forward;
  const moveLabel = stepDir === 'back' ? 'Step Backward' : `Forward (${FACING_META[facing].label})`;

  const nx = (state.location.x ?? 1) + delta.dx;
  const ny = (state.location.y ?? 1) + delta.dy;

  if (nx < 0 || nx >= currentMap.width || ny < 0 || ny >= currentMap.height) {
    return {
      moved: false,
      blocked: true,
      log: `${moveLabel}: Solid bedrock wall.`
    };
  }

  const triggerAtTarget = getTriggerAt(currentMap, nx, ny);
  if (triggerAtTarget && triggerAtTarget.type === 'locked_door' && !isDoorUnlocked(state, triggerAtTarget)) {
    markDungeonTileExplored(state, currentMap.id, nx, ny);
    return {
      moved: false,
      blocked: true,
      lockedDoor: triggerAtTarget,
      log: `[${triggerAtTarget.name}] ${triggerAtTarget.message}`
    };
  }

  const targetTile = getEffectiveDungeonTileAt(currentMap, tiles, state, nx, ny);
  if (!targetTile.passable) {
    return {
      moved: false,
      blocked: true,
      tile: targetTile,
      log: `${moveLabel}: Blocked by ${targetTile.name}.`
    };
  }

  state.location.x = nx;
  state.location.y = ny;
  state.location.steps = (state.location.steps || 0) + 1;
  markDungeonTileExplored(state, currentMap.id, nx, ny);

  if (triggerAtTarget) {
    // Floor Trap Handling
    if (triggerAtTarget.type === 'trap' && !isFeatureConsumed(state, triggerAtTarget)) {
      const detectActive = (state.location.detectSteps || 0) > 0;
      const scout = findBestTrapHandler(partyMembers, itemsById);
      const scoutDexMod = scout ? getStatMod(getEffectiveStats(scout, itemsById).dex) : 0;
      const thiefBonus = scout?.class === 'thief' ? 6 + (scout.level || 1) : 0;
      const spotRoll = dice.roll('1d20') + scoutDexMod + thiefBonus + (detectActive ? 8 : 0);
      const diff = triggerAtTarget.trap?.difficulty || 14;

      if (spotRoll >= diff + 2) {
        return {
          moved: true,
          tile: targetTile,
          trigger: triggerAtTarget,
          log: `${scout ? scout.name : 'Your party'} spots a ${triggerAtTarget.trap?.name || 'Floor Trap'} before stepping on the pressure plate! Press [F] to disarm.`
        };
      }

      state.flags[triggerAtTarget.flag] = true;
      const trapRes = applyTrapEffectToParty(state, triggerAtTarget.trap, partyMembers);
      return {
        moved: true,
        tile: targetTile,
        trigger: triggerAtTarget,
        trapSprung: true,
        log: `${triggerAtTarget.message} ${trapRes.log}`
      };
    }

    // Fixed Room or Boss Encounter
    if (triggerAtTarget.type === 'fixed_encounter' || triggerAtTarget.type === 'boss') {
      if (!isFeatureConsumed(state, triggerAtTarget)) {
        return {
          moved: true,
          tile: targetTile,
          trigger: triggerAtTarget,
          fixedEncounter: triggerAtTarget,
          log: `[${triggerAtTarget.name}] ${triggerAtTarget.message}`
        };
      }
      return {
        moved: true,
        tile: targetTile,
        trigger: triggerAtTarget,
        log: `[${triggerAtTarget.name}] ${triggerAtTarget.clearedMessage || 'The guardian of this chamber has already been vanquished.'}`
      };
    }

    // Chest
    if (triggerAtTarget.type === 'chest') {
      if (isFeatureConsumed(state, triggerAtTarget)) {
        return {
          moved: true,
          tile: targetTile,
          trigger: triggerAtTarget,
          log: `[${triggerAtTarget.name}] This chest has already been opened and emptied.`
        };
      }
      const trapStatus = !triggerAtTarget.trap
        ? 'Untrapped'
        : isChestTrapDisarmed(state, triggerAtTarget)
          ? 'Trap Disarmed'
          : 'Possible Trap — [F] Search/Disarm';
      return {
        moved: true,
        tile: targetTile,
        trigger: triggerAtTarget,
        log: `[${triggerAtTarget.name} (${trapStatus})] ${triggerAtTarget.message}`
      };
    }

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
    log: `${moveLabel} — (${nx}, ${ny}) ${currentMap.name}`
  };
}

export function attemptUnlockDungeonDoor({
  state,
  maps,
  partyMembers = [],
  itemsById = {},
  viaSpell = false,
  casterName = ''
}) {
  const currentMap = getMapById(maps, state?.location?.mapId);
  if (!currentMap || currentMap.mode !== 'dungeon') {
    return { ok: false, log: 'You are not in a dungeon.' };
  }

  const ahead = getTriggerAhead(state, maps);
  const underfoot = getTriggerAt(currentMap, state.location.x, state.location.y);

  // Also allow Arcane Knock to disarm & unseal a chest underfoot or ahead
  if (viaSpell) {
    const targetChest =
      (underfoot && underfoot.type === 'chest' && !isFeatureConsumed(state, underfoot) ? underfoot : null) ||
      (ahead && ahead.type === 'chest' && !isFeatureConsumed(state, ahead) ? ahead : null);

    if (targetChest && (!ahead || ahead.type !== 'locked_door' || isDoorUnlocked(state, ahead))) {
      if (targetChest.trap && !isChestTrapDisarmed(state, targetChest)) {
        state.flags[`${targetChest.flag}_disarmed`] = true;
        return {
          ok: true,
          log: `${casterName} casts Arcane Knock! The ward on ${targetChest.name} snaps open harmlessly — press [E] to loot!`
        };
      }
    }
  }

  if (!ahead || ahead.type !== 'locked_door') {
    return {
      ok: false,
      log: 'Face a locked dungeon door first before attempting to unlock it.'
    };
  }

  if (isDoorUnlocked(state, ahead)) {
    return {
      ok: false,
      log: `${ahead.name} is already unlocked and open.`
    };
  }

  if (viaSpell) {
    state.flags[ahead.flag] = true;
    return {
      ok: true,
      unlocked: true,
      log: `${casterName} invokes Arcane Knock! The heavy bolts of ${ahead.name} slide back with a resonant clang!`
    };
  }

  // Check if party has a Skeleton Key (master_key)
  if (getInventoryQty(state, 'master_key') > 0) {
    removeItemFromPack(state, 'master_key', 1);
    state.flags[ahead.flag] = true;
    return {
      ok: true,
      unlocked: true,
      log: `Used a Skeleton Key (-1) to unbar ${ahead.name}! The passage ahead is open.`
    };
  }

  // Otherwise attempt Thief lockpicking or party force check
  const handler = findBestTrapHandler(partyMembers, itemsById);
  if (!handler) {
    return { ok: false, log: 'No living party member can attempt the lock.' };
  }

  const eff = getEffectiveStats(handler, itemsById);
  const isThief = handler.class === 'thief';
  const statBonus = isThief
    ? getStatMod(eff.dex) * 2 + (handler.level || 1) * 2 + 6
    : Math.max(getStatMod(eff.dex), getStatMod(eff.str)) + (handler.level || 1);
  const roll = dice.roll('1d20') + statBonus;
  const diff = ahead.difficulty || 14;

  if (roll >= diff) {
    state.flags[ahead.flag] = true;
    const method = isThief ? 'deftly picks the tumblers of' : 'forces open the rusted lock of';
    return {
      ok: true,
      unlocked: true,
      log: `${handler.name} ${method} ${ahead.name} (Roll ${roll} vs DC ${diff})! The doorway opens.`
    };
  }

  // On failure, non-thieves strain themselves slightly hammering the iron door
  const rosterHero = state.roster.find(c => c.id === handler.id);
  let strainNote = '';
  if (rosterHero && !isThief && rosterHero.derived.hp > 1) {
    const recoil = 1;
    rosterHero.derived.hp = Math.max(1, rosterHero.derived.hp - recoil);
    strainNote = ` (${handler.name} takes 1 HP strain)`;
  }

  return {
    ok: false,
    log: `${handler.name} fails to open ${ahead.name} (Roll ${roll} vs DC ${diff})${strainNote}. Try again, bring a Thief, use a Skeleton Key, or cast Arcane Knock!`
  };
}

export function attemptSearchAndDisarm({
  state,
  maps,
  partyMembers = [],
  itemsById = {}
}) {
  const currentMap = getMapById(maps, state?.location?.mapId);
  if (!currentMap || currentMap.mode !== 'dungeon') {
    return { ok: false, log: 'Nothing unusual found nearby.' };
  }

  const underfoot = getTriggerAt(currentMap, state.location.x, state.location.y);
  const ahead = getTriggerAhead(state, maps);
  const detectBonus = (state.location?.detectSteps || 0) > 0 ? 5 : 0;
  const handler = findBestTrapHandler(partyMembers, itemsById);

  if (!handler) {
    return { ok: false, log: 'No living heroes available to search.' };
  }

  const eff = getEffectiveStats(handler, itemsById);
  const isThief = handler.class === 'thief';
  const skillBonus =
    getStatMod(eff.dex) * 2 +
    Math.max(0, getStatMod(eff.int)) +
    (handler.level || 1) * 2 +
    (isThief ? 6 : 0) +
    detectBonus;

  // 1. Check chest underfoot or ahead
  const chestTarget =
    (underfoot && underfoot.type === 'chest' ? underfoot : null) ||
    (ahead && ahead.type === 'chest' ? ahead : null);

  if (chestTarget) {
    if (isFeatureConsumed(state, chestTarget)) {
      return { ok: true, log: `${chestTarget.name} has already been opened and emptied.` };
    }
    if (!chestTarget.trap || isChestTrapDisarmed(state, chestTarget)) {
      return {
        ok: true,
        log: `${handler.name} inspects ${chestTarget.name}: No active traps remain. Safe to open with [E]!`
      };
    }

    const diff = chestTarget.trap.difficulty || 14;
    const roll = dice.roll('1d20') + skillBonus;
    if (roll >= diff) {
      state.flags[`${chestTarget.flag}_disarmed`] = true;
      return {
        ok: true,
        disarmed: true,
        log: `${handler.name} disarms the ${chestTarget.trap.name} on ${chestTarget.name} (Roll ${roll} vs DC ${diff})! Press [E] to safely claim the treasure.`
      };
    }

    if (roll <= diff - 6) {
      state.flags[`${chestTarget.flag}_disarmed`] = true;
      const trapRes = applyTrapEffectToParty(state, chestTarget.trap, partyMembers);
      return {
        ok: false,
        trapSprung: true,
        log: `${handler.name} fumbles the mechanism on ${chestTarget.name} (Roll ${roll} vs DC ${diff})! ${trapRes.log}`
      };
    }

    return {
      ok: false,
      log: `${handler.name} detects a ${chestTarget.trap.name} (DC ${diff}) on ${chestTarget.name} but hasn't disarmed it yet (Roll ${roll}). Try [F] again or cast Arcane Knock!`
    };
  }

  // 2. Check floor trap underfoot or ahead
  const trapTarget =
    (ahead && ahead.type === 'trap' && !isFeatureConsumed(state, ahead) ? ahead : null) ||
    (underfoot && underfoot.type === 'trap' && !isFeatureConsumed(state, underfoot) ? underfoot : null);

  if (trapTarget) {
    const diff = trapTarget.trap?.difficulty || 14;
    const roll = dice.roll('1d20') + skillBonus;
    if (roll >= diff) {
      state.flags[trapTarget.flag] = true;
      return {
        ok: true,
        disarmed: true,
        log: `${handler.name} wedges the pressure plate of ${trapTarget.trap?.name || trapTarget.name} (Roll ${roll} vs DC ${diff}), disarming it permanently!`
      };
    }
    return {
      ok: false,
      log: `${handler.name} spots ${trapTarget.trap?.name || trapTarget.name} (DC ${diff}) but fails to jam the mechanism (Roll ${roll}).`
    };
  }

  // 3. Check locked door ahead
  if (ahead && ahead.type === 'locked_door' && !isDoorUnlocked(state, ahead)) {
    return {
      ok: true,
      log: `${handler.name} examines ${ahead.name}: Lock difficulty DC ${ahead.difficulty || 14}. Press [O] to Pick Lock / Use Skeleton Key.`
    };
  }

  return {
    ok: true,
    log: `${handler.name} searches the surrounding stonework — no hidden traps or mechanisms nearby.`
  };
}

export function attemptDungeonInteract({
  state,
  maps,
  partyMembers = [],
  itemsById = {}
}) {
  const currentMap = getMapById(maps, state?.location?.mapId);
  if (!currentMap || currentMap.mode !== 'dungeon') {
    return { ok: false, log: 'No dungeon active.' };
  }

  const trigger = getTriggerAt(currentMap, state.location.x, state.location.y);
  const ahead = getTriggerAhead(state, maps);

  // Convenience: if nothing underfoot, but facing a locked door ahead, try unlocking it
  if (!trigger && ahead && ahead.type === 'locked_door' && !isDoorUnlocked(state, ahead)) {
    return attemptUnlockDungeonDoor({ state, maps, partyMembers, itemsById });
  }

  if (!trigger) {
    return {
      ok: false,
      log: 'There is nothing on this floor tile to activate. (Step onto Stairs, a Chest, or a Fountain first.)'
    };
  }

  // Stairs Up or Down
  if ((trigger.type === 'stairs_up' || trigger.type === 'stairs_down') && trigger.targetMapId) {
    const destMap = getMapById(maps, trigger.targetMapId);
    if (!destMap) {
      return { ok: false, log: `Target map ${trigger.targetMapId} not found.` };
    }
    state.location.mode = destMap.mode || 'overworld';
    state.location.mapId = destMap.id;
    state.location.x = typeof trigger.targetX === 'number' ? trigger.targetX : destMap.defaultSpawn.x;
    state.location.y = typeof trigger.targetY === 'number' ? trigger.targetY : destMap.defaultSpawn.y;
    if (destMap.mode === 'dungeon') {
      state.location.facing = normalizeFacing(trigger.targetFacing || destMap.defaultSpawn?.facing || state.location.facing);
      markDungeonTileExplored(state, destMap.id, state.location.x, state.location.y);
    }

    const dirWord = trigger.type === 'stairs_up' ? 'ascend' : 'descend';
    const destLabel =
      destMap.mode === 'dungeon'
        ? trigger.type === 'stairs_up'
          ? 'to the higher level'
          : 'to the lower level'
        : `into ${destMap.name}`;
    return {
      ok: true,
      transitioned: true,
      log: `You ${dirWord} the stone steps ${destLabel}!`
    };
  }

  // Treasure Chest
  if (trigger.type === 'chest') {
    if (isFeatureConsumed(state, trigger)) {
      return { ok: false, log: `${trigger.name} has already been looted.` };
    }

    let trapLog = '';
    if (trigger.trap && !isChestTrapDisarmed(state, trigger)) {
      const trapRes = applyTrapEffectToParty(state, trigger.trap, partyMembers);
      trapLog = `${trapRes.log} `;
      state.flags[`${trigger.flag}_disarmed`] = true;
    }

    state.flags[trigger.flag] = true;
    const goldGained = Math.max(0, dice.roll(trigger.gold || '3d8+15'));
    state.gold = (state.gold || 0) + goldGained;

    const itemNames = [];
    if (Array.isArray(trigger.items)) {
      for (const itemId of trigger.items) {
        const def = itemsById[itemId];
        if (def) {
          addItemToPack(state, itemId, 1);
          itemNames.push(def.name);
        }
      }
    }

    const itemsText = itemNames.length > 0 ? ` and found: ${itemNames.join(', ')}` : '';
    return {
      ok: true,
      looted: true,
      log: `${trapLog}Opened ${trigger.name}! Looted ${goldGained} GP${itemsText}!`
    };
  }

  // Dungeon Fountain
  if (trigger.type === 'fountain') {
    const hpAmt = trigger.healHp || 15;
    const mpAmt = trigger.restoreMp || 8;
    for (const entry of state.party || []) {
      const hero = state.roster.find(c => c.id === entry.charId);
      if (hero && !isHeroDead(hero)) {
        hero.derived.hp = Math.min(hero.derived.maxHp, hero.derived.hp + hpAmt);
        hero.derived.mp = Math.min(hero.derived.maxMp, hero.derived.mp + mpAmt);
        if (hero.status === 'Poison') {
          hero.status = 'OK';
        }
      }
    }
    return {
      ok: true,
      log: `Your party drinks from ${trigger.name}, restoring up to +${hpAmt} HP, +${mpAmt} MP, and cleansing Poison!`
    };
  }

  // Boss or Fixed Encounter
  if (trigger.type === 'boss' || trigger.type === 'fixed_encounter') {
    if (!isFeatureConsumed(state, trigger)) {
      return {
        ok: true,
        fixedEncounter: trigger,
        log: `[${trigger.name}] ${trigger.message}`
      };
    }
    return {
      ok: true,
      log: trigger.clearedMessage || 'The guardians of this chamber have already been defeated.'
    };
  }

  return {
    ok: true,
    log: trigger.message || `Activated ${trigger.name}.`
  };
}

// ============================================================================
// FIRST-PERSON 3D WIREFRAME / RETRO SHADED CANVAS RENDERER
// ============================================================================

const DEPTH_RECTS = [
  { x0: 0, y0: 0, x1: 420, y1: 300 },     // d = 0 (player's current tile edges)
  { x0: 58, y0: 38, x1: 362, y1: 262 },   // d = 1 (1 tile ahead)
  { x0: 118, y0: 78, x1: 302, y1: 222 },  // d = 2 (2 tiles ahead)
  { x0: 162, y0: 110, x1: 258, y1: 190 }, // d = 3 (3 tiles ahead)
  { x0: 192, y0: 132, x1: 228, y1: 168 }  // d = 4 (vanishing horizon)
];

function isBlockingWallCode(code) {
  return code === '#' || code === '+' || code === 'L';
}

export function renderDungeonViewport(canvas, { map, tiles, state }) {
  if (!canvas || !map || !tiles || !state?.location) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const px = state.location.x ?? 1;
  const py = state.location.y ?? 1;
  const facing = normalizeFacing(state.location.facing);
  const vecs = getRelativeVectors(facing);
  const lightSteps = state.location.lightSteps || 0;
  const detectSteps = state.location.detectSteps || 0;
  const lightActive = lightSteps > 0;
  const maxDepth = lightActive ? 3 : 1;

  const isAbyss = map.dungeonId === 'doom';
  const strokeMain = isAbyss ? '#f0a85a' : '#5ce1e6';
  const strokeDim = isAbyss ? '#7a4928' : '#2f5d78';
  const wallFillBase = isAbyss ? [44, 24, 22] : [26, 34, 52];

  ctx.clearRect(0, 0, W, H);

  // 1. Ceiling & Floor Gradient Background
  const ceilGrad = ctx.createLinearGradient(0, 0, 0, H / 2);
  ceilGrad.addColorStop(0, isAbyss ? '#160a0c' : '#080c16');
  ceilGrad.addColorStop(1, '#04060a');
  ctx.fillStyle = ceilGrad;
  ctx.fillRect(0, 0, W, H / 2);

  const floorGrad = ctx.createLinearGradient(0, H / 2, 0, H);
  floorGrad.addColorStop(0, '#05070c');
  floorGrad.addColorStop(1, isAbyss ? '#221315' : '#121928');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, H / 2, W, H / 2);

  // Subtle perspective floor/ceiling grid lines
  ctx.strokeStyle = 'rgba(92, 225, 230, 0.08)';
  ctx.lineWidth = 1;
  for (let d = 1; d <= maxDepth; d++) {
    const r = DEPTH_RECTS[d];
    ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  }

  // Find how far forward the corridor goes before hitting a blocking wall/door
  let stopDepth = maxDepth;
  for (let d = 1; d <= maxDepth; d++) {
    const cx = px + vecs.forward.dx * d;
    const cy = py + vecs.forward.dy * d;
    const cTile = getEffectiveDungeonTileAt(map, tiles, state, cx, cy);
    if (isBlockingWallCode(cTile.code)) {
      stopDepth = d;
      break;
    }
  }

  // Helper for depth-shaded stone color
  const getWallShade = (depth, boost = 0) => {
    const factor = Math.max(0.28, 1 - depth * 0.22 + boost);
    const r = Math.round(wallFillBase[0] * factor);
    const g = Math.round(wallFillBase[1] * factor);
    const b = Math.round(wallFillBase[2] * factor);
    return `rgb(${r}, ${g}, ${b})`;
  };

  // 2. Render from farthest visible depth back-to-front
  for (let d = stopDepth; d >= 0; d--) {
    const near = DEPTH_RECTS[d];
    const far = DEPTH_RECTS[d + 1];
    const cx = px + vecs.forward.dx * d;
    const cy = py + vecs.forward.dy * d;

    // Draw side walls for corridor slice d (between near and far)
    if (d < stopDepth || d === 0) {
      const lx = cx + vecs.left.dx;
      const ly = cy + vecs.left.dy;
      const rx = cx + vecs.right.dx;
      const ry = cy + vecs.right.dy;

      const leftTile = getEffectiveDungeonTileAt(map, tiles, state, lx, ly);
      const rightTile = getEffectiveDungeonTileAt(map, tiles, state, rx, ry);

      // Left Wall or Side Passage
      if (isBlockingWallCode(leftTile.code)) {
        ctx.fillStyle = getWallShade(d);
        ctx.strokeStyle = d <= 1 ? strokeMain : strokeDim;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(near.x0, near.y0);
        ctx.lineTo(far.x0, far.y0);
        ctx.lineTo(far.x0, far.y1);
        ctx.lineTo(near.x0, near.y1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // If the left wall is actually a door (+ or L), draw side doorway arch
        if (leftTile.code === '+' || leftTile.code === 'L') {
          drawSideDoorOnWall(ctx, near, far, 'left', leftTile.code === 'L');
        }
      } else {
        // Open side passage on the left
        ctx.fillStyle = getWallShade(d + 1, -0.08);
        ctx.strokeStyle = strokeDim;
        ctx.lineWidth = 1.2;
        ctx.fillRect(near.x0, far.y0, far.x0 - near.x0, far.y1 - far.y0);
        ctx.strokeRect(near.x0, far.y0, far.x0 - near.x0, far.y1 - far.y0);
      }

      // Right Wall or Side Passage
      if (isBlockingWallCode(rightTile.code)) {
        ctx.fillStyle = getWallShade(d);
        ctx.strokeStyle = d <= 1 ? strokeMain : strokeDim;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(near.x1, near.y0);
        ctx.lineTo(far.x1, far.y0);
        ctx.lineTo(far.x1, far.y1);
        ctx.lineTo(near.x1, near.y1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        if (rightTile.code === '+' || rightTile.code === 'L') {
          drawSideDoorOnWall(ctx, near, far, 'right', rightTile.code === 'L');
        }
      } else {
        // Open side passage on the right
        ctx.fillStyle = getWallShade(d + 1, -0.08);
        ctx.strokeStyle = strokeDim;
        ctx.lineWidth = 1.2;
        ctx.fillRect(far.x1, far.y0, near.x1 - far.x1, far.y1 - far.y0);
        ctx.strokeRect(far.x1, far.y0, near.x1 - far.x1, far.y1 - far.y0);
      }
    }

    // Draw Front Blocking Wall / Door at depth d (for d >= 1)
    if (d >= 1 && d === stopDepth) {
      const centerTile = getEffectiveDungeonTileAt(map, tiles, state, cx, cy);
      const centerTrigger = getTriggerAt(map, cx, cy);
      if (isBlockingWallCode(centerTile.code)) {
        const wRect = DEPTH_RECTS[d];
        const rw = wRect.x1 - wRect.x0;
        const rh = wRect.y1 - wRect.y0;

        ctx.fillStyle = getWallShade(d - 0.3, 0.08);
        ctx.strokeStyle = d === 1 ? strokeMain : strokeDim;
        ctx.lineWidth = 2;
        ctx.fillRect(wRect.x0, wRect.y0, rw, rh);
        ctx.strokeRect(wRect.x0, wRect.y0, rw, rh);

        // Subtle stone brick course lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(wRect.x0, wRect.y0 + rh * 0.33);
        ctx.lineTo(wRect.x1, wRect.y0 + rh * 0.33);
        ctx.moveTo(wRect.x0, wRect.y0 + rh * 0.66);
        ctx.lineTo(wRect.x1, wRect.y0 + rh * 0.66);
        ctx.stroke();

        if (centerTile.code === '+' || centerTile.code === 'L') {
          const isLocked = centerTile.code === 'L' && !isDoorUnlocked(state, centerTrigger);
          drawFrontDoor(ctx, wRect, isLocked);
        }
      } else if (!lightActive && d === maxDepth) {
        // Darkness curtain beyond 1 tile when no light is active
        const wRect = DEPTH_RECTS[d];
        ctx.fillStyle = '#020306';
        ctx.fillRect(wRect.x0, wRect.y0, wRect.x1 - wRect.x0, wRect.y1 - wRect.y0);
      }
    }

    // Draw Floor/Room Objects (Chests, Stairs, Fountains, Traps, Boss Altars) at depth d
    if (d < stopDepth || !isBlockingWallCode(getEffectiveDungeonTileAt(map, tiles, state, cx, cy).code)) {
      const tileAtD = getEffectiveDungeonTileAt(map, tiles, state, cx, cy);
      const trigAtD = getTriggerAt(map, cx, cy);
      drawFeatureInCorridor(ctx, d, tileAtD, trigAtD, state, detectSteps > 0);
    }
  }

  // 3. Torch / Mage-Light Vignette
  if (!lightActive) {
    const radGrad = ctx.createRadialGradient(W / 2, H / 2, 45, W / 2, H / 2, 210);
    radGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    radGrad.addColorStop(1, 'rgba(2, 3, 7, 0.88)');
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawSideDoorOnWall(ctx, near, far, side, isLocked) {
  const xStart = side === 'left' ? near.x0 : far.x1;
  const xEnd = side === 'left' ? far.x0 : near.x1;
  const mx1 = xStart + (xEnd - xStart) * 0.25;
  const mx2 = xStart + (xEnd - xStart) * 0.75;

  const yTop1 = near.y0 + (far.y0 - near.y0) * 0.25 + (near.y1 - near.y0) * 0.18;
  const yTop2 = near.y0 + (far.y0 - near.y0) * 0.75 + (far.y1 - far.y0) * 0.18;
  const yBot1 = near.y1 + (far.y1 - near.y1) * 0.25;
  const yBot2 = near.y1 + (far.y1 - near.y1) * 0.75;

  ctx.fillStyle = isLocked ? '#331216' : '#2a1d11';
  ctx.strokeStyle = isLocked ? '#f25f5c' : '#f0c45a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(mx1, yTop1);
  ctx.lineTo(mx2, yTop2);
  ctx.lineTo(mx2, yBot2);
  ctx.lineTo(mx1, yBot1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawFrontDoor(ctx, rect, isLocked) {
  const rw = rect.x1 - rect.x0;
  const rh = rect.y1 - rect.y0;
  const dw = rw * 0.52;
  const dh = rh * 0.76;
  const dx = rect.x0 + (rw - dw) / 2;
  const dy = rect.y1 - dh;

  ctx.fillStyle = isLocked ? '#2c1014' : '#2d2012';
  ctx.strokeStyle = isLocked ? '#f25f5c' : '#f0c45a';
  ctx.lineWidth = 2;

  ctx.fillRect(dx, dy, dw, dh);
  ctx.strokeRect(dx, dy, dw, dh);

  if (isLocked) {
    // Iron portcullis bars + lock emblem
    ctx.strokeStyle = '#f25f5c';
    ctx.lineWidth = 1.5;
    for (let i = 1; i <= 3; i++) {
      const bx = dx + (dw * i) / 4;
      ctx.beginPath();
      ctx.moveTo(bx, dy);
      ctx.lineTo(bx, dy + dh);
      ctx.stroke();
    }
    ctx.fillStyle = '#f25f5c';
    ctx.fillRect(dx + dw / 2 - 5, dy + dh / 2 - 5, 10, 10);
  } else {
    // Open archway center split
    ctx.strokeStyle = '#d69e49';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dx + dw / 2, dy);
    ctx.lineTo(dx + dw / 2, dy + dh);
    ctx.stroke();
  }
}

function drawFeatureInCorridor(ctx, depth, tile, trigger, state, detectActive) {
  const near = DEPTH_RECTS[depth];
  const far = DEPTH_RECTS[depth + 1];
  const cx = (near.x0 + near.x1) / 2;
  const floorY = (near.y1 + far.y1) / 2;
  const ceilY = (near.y0 + far.y0) / 2;
  const scale = Math.max(0.32, 1 - depth * 0.25);

  const code = tile.code;

  // 1. Stairs Ascending (<)
  if (code === '<') {
    const w = 54 * scale;
    const h = (floorY - ceilY) * 0.85;
    ctx.strokeStyle = '#5ce1e6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, floorY);
    ctx.lineTo(cx - w * 0.35, ceilY + 6);
    ctx.moveTo(cx + w / 2, floorY);
    ctx.lineTo(cx + w * 0.35, ceilY + 6);
    for (let s = 1; s <= 4; s++) {
      const sy = floorY - (h * s) / 5;
      const sw = w * (1 - s * 0.07);
      ctx.moveTo(cx - sw / 2, sy);
      ctx.lineTo(cx + sw / 2, sy);
    }
    ctx.stroke();
    return;
  }

  // 2. Stairs Descending (>)
  if (code === '>') {
    const w = 64 * scale;
    const h = 26 * scale;
    ctx.fillStyle = '#05070c';
    ctx.strokeStyle = '#f0c45a';
    ctx.lineWidth = 2;
    ctx.fillRect(cx - w / 2, floorY - h / 2, w, h);
    ctx.strokeRect(cx - w / 2, floorY - h / 2, w, h);
    for (let s = 1; s <= 3; s++) {
      const sy = floorY - h / 2 + (h * s) / 4;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2 + s * 4 * scale, sy);
      ctx.lineTo(cx + w / 2 - s * 4 * scale, sy);
      ctx.stroke();
    }
    return;
  }

  // 3. Treasure Chest ($)
  if (code === '$') {
    const looted = isFeatureConsumed(state, trigger);
    const w = 44 * scale;
    const h = 28 * scale;
    ctx.fillStyle = looted ? '#1e2433' : '#4a3214';
    ctx.strokeStyle = looted ? '#6e7a94' : '#f0c45a';
    ctx.lineWidth = 2;
    ctx.fillRect(cx - w / 2, floorY - h, w, h);
    ctx.strokeRect(cx - w / 2, floorY - h, w, h);

    // Chest lid line & clasp
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, floorY - h * 0.62);
    ctx.lineTo(cx + w / 2, floorY - h * 0.62);
    ctx.stroke();

    if (!looted) {
      ctx.fillStyle = '#f0c45a';
      ctx.fillRect(cx - 4 * scale, floorY - h * 0.72, 8 * scale, 8 * scale);
    }
    return;
  }

  // 4. Mystic Fountain (F)
  if (code === 'F') {
    const w = 52 * scale;
    const h = 24 * scale;
    ctx.fillStyle = '#102938';
    ctx.strokeStyle = '#5ce1e6';
    ctx.lineWidth = 2;
    ctx.fillRect(cx - w / 2, floorY - h, w, h);
    ctx.strokeRect(cx - w / 2, floorY - h, w, h);

    ctx.beginPath();
    ctx.arc(cx, floorY - h - 6 * scale, 10 * scale, Math.PI, 0);
    ctx.stroke();
    return;
  }

  // 5. Dread Boss Altar (A) or Fixed Encounter
  if (code === 'A' || (trigger && trigger.type === 'fixed_encounter' && !isFeatureConsumed(state, trigger))) {
    const cleared = isFeatureConsumed(state, trigger);
    const w = 58 * scale;
    const h = 46 * scale;
    ctx.fillStyle = cleared ? '#1e2230' : '#2d112b';
    ctx.strokeStyle = cleared ? '#6e7a94' : '#e298ff';
    ctx.lineWidth = 2;
    ctx.fillRect(cx - w / 2, floorY - h, w, h);
    ctx.strokeRect(cx - w / 2, floorY - h, w, h);

    if (!cleared) {
      ctx.fillStyle = '#f25f5c';
      ctx.beginPath();
      ctx.arc(cx, floorY - h / 2, 9 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // 6. Floor Trap (!) when detected or sprung
  if (trigger && trigger.type === 'trap') {
    const sprung = isFeatureConsumed(state, trigger);
    if (detectActive || sprung) {
      const r = 18 * scale;
      ctx.strokeStyle = sprung ? '#6e7a94' : '#ff924c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, floorY - r);
      ctx.lineTo(cx + r, floorY);
      ctx.lineTo(cx, floorY + r * 0.5);
      ctx.lineTo(cx - r, floorY);
      ctx.closePath();
      ctx.stroke();
    }
  }
}
