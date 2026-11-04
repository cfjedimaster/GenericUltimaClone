import { dice } from './dice.js';
import { EQUIPMENT_SLOTS, syncCharacterDerivedStats } from './models/character.js';

export function getSellPrice(itemDef) {
  if (!itemDef || typeof itemDef.price !== 'number') return 1;
  return Math.max(1, Math.floor(itemDef.price / 2));
}

export function getInventoryQty(state, itemId) {
  if (!state || !Array.isArray(state.inventory) || !itemId) return 0;
  const found = state.inventory.find(e => e.itemId === itemId);
  return found ? found.qty : 0;
}

export function addItemToPack(state, itemId, qty = 1) {
  if (!state || !itemId || qty <= 0) return;
  if (!Array.isArray(state.inventory)) {
    state.inventory = [];
  }
  const existing = state.inventory.find(e => e.itemId === itemId);
  if (existing) {
    existing.qty += qty;
  } else {
    state.inventory.push({ itemId, qty });
  }
}

export function removeItemFromPack(state, itemId, qty = 1) {
  if (!state || !Array.isArray(state.inventory) || !itemId || qty <= 0) return false;
  const idx = state.inventory.findIndex(e => e.itemId === itemId);
  if (idx === -1 || state.inventory[idx].qty < qty) return false;

  state.inventory[idx].qty -= qty;
  if (state.inventory[idx].qty <= 0) {
    state.inventory.splice(idx, 1);
  }
  return true;
}

const CLASS_LABELS = {
  fighter: 'Fighter',
  paladin: 'Paladin',
  thief: 'Thief',
  ranger: 'Ranger',
  cleric: 'Cleric',
  wizard: 'Wizard'
};

export function formatAllowedClasses(allowedClasses) {
  if (!Array.isArray(allowedClasses) || allowedClasses.length === 0 || allowedClasses.length >= 6) {
    return 'All Classes';
  }
  return allowedClasses.map(c => CLASS_LABELS[c] || c).join(' / ');
}

export function canHeroEquipItem(hero, itemDef) {
  if (!hero || !itemDef) return { ok: false, reason: 'Invalid item.' };
  if (!EQUIPMENT_SLOTS.includes(itemDef.slot)) {
    return { ok: false, reason: 'Not an equippable item.' };
  }
  if (
    Array.isArray(itemDef.allowedClasses) &&
    itemDef.allowedClasses.length > 0 &&
    !itemDef.allowedClasses.includes(hero.class)
  ) {
    return {
      ok: false,
      reason: `${formatAllowedClasses(itemDef.allowedClasses)} Only`
    };
  }
  return { ok: true, reason: '' };
}

export function formatItemSummary(itemDef) {
  if (!itemDef) return 'None';
  if (itemDef.slot === 'weapon') {
    const parts = [itemDef.dice];
    if (itemDef.range === 'ranged') parts.push('Ranged');
    else if (itemDef.range === 'reach') parts.push('Reach');
    if (itemDef.hitBonus) parts.push(`+${itemDef.hitBonus} Hit`);
    const bonusParts = formatBonusTags(itemDef.bonuses);
    if (bonusParts) parts.push(bonusParts);
    return parts.join(', ');
  }
  if (itemDef.slot === 'armor' || itemDef.slot === 'accessory') {
    const parts = [];
    if (itemDef.acBonus) {
      parts.push(`+${itemDef.acBonus} AC`);
    }
    const bonusParts = formatBonusTags(itemDef.bonuses);
    if (bonusParts) parts.push(bonusParts);
    return parts.join(', ') || 'Trinket';
  }
  if (itemDef.slot === 'consumable') {
    if (itemDef.effect === 'heal_hp') return `Restores ${itemDef.dice} HP`;
    if (itemDef.effect === 'restore_mp') return `Restores ${itemDef.dice} MP`;
    if (itemDef.effect === 'cure_status') return `Cures Poison / Sleep / Paralysis / Silence (+${itemDef.dice} HP)`;
    if (itemDef.effect === 'revive_or_heal') return `Revives Dead / Heals ${itemDef.dice} HP`;
    if (itemDef.effect === 'field_light') return `Torchlight for ${itemDef.durationSteps || 35} steps`;
    if (itemDef.effect === 'unlock_door') return `Unlocks any barred dungeon door ([O] in Dungeon)`;
    if (itemDef.effect === 'exit_dungeon') return `Teleports party out of a dungeon to its surface entrance`;
  }
  return itemDef.description || '';
}

function formatBonusTags(bonuses) {
  if (!bonuses || typeof bonuses !== 'object') return '';
  const tags = [];
  if (bonuses.str) tags.push(`+${bonuses.str} STR`);
  if (bonuses.dex) tags.push(`+${bonuses.dex} DEX`);
  if (bonuses.int) tags.push(`+${bonuses.int} INT`);
  if (bonuses.wis) tags.push(`+${bonuses.wis} WIS`);
  if (bonuses.maxHp) tags.push(`+${bonuses.maxHp} Max HP`);
  if (bonuses.maxMp) tags.push(`+${bonuses.maxMp} Max MP`);
  if (bonuses.ac) tags.push(`+${bonuses.ac} AC`);
  return tags.join(', ');
}

export function equipFromPack(state, hero, itemId, gameData) {
  const itemsById = gameData?.itemsById || {};
  const itemDef = itemsById[itemId];
  if (!hero || !itemDef) return { ok: false, log: 'Item not found.' };

  const check = canHeroEquipItem(hero, itemDef);
  if (!check.ok) {
    return { ok: false, log: `${hero.name}: ${check.reason}.` };
  }

  const slot = itemDef.slot;
  if (getInventoryQty(state, itemId) <= 0) {
    return { ok: false, log: `No ${itemDef.name} left in the party pack.` };
  }

  // Remove new item from pack
  removeItemFromPack(state, itemId, 1);

  // Return currently equipped item (if any) back to pack
  const prevItemId = hero.equipment?.[slot] || null;
  if (prevItemId && itemsById[prevItemId]) {
    addItemToPack(state, prevItemId, 1);
  }

  if (!hero.equipment) {
    hero.equipment = { weapon: null, armor: null, accessory: null };
  }
  hero.equipment[slot] = itemId;

  syncCharacterDerivedStats(
    hero,
    gameData.racesById,
    gameData.classesById,
    itemsById
  );

  return {
    ok: true,
    log: `${hero.name} equipped ${itemDef.name} (${formatItemSummary(itemDef)}).`
  };
}

export function unequipSlotToPack(state, hero, slot, gameData) {
  const itemsById = gameData?.itemsById || {};
  if (!hero || !EQUIPMENT_SLOTS.includes(slot)) {
    return { ok: false, log: 'Invalid equipment slot.' };
  }

  const equippedId = hero.equipment?.[slot];
  if (!equippedId) {
    return { ok: false, log: 'That slot is already empty.' };
  }

  const itemDef = itemsById[equippedId];
  if (itemDef) {
    addItemToPack(state, equippedId, 1);
  }
  hero.equipment[slot] = null;

  syncCharacterDerivedStats(
    hero,
    gameData.racesById,
    gameData.classesById,
    itemsById
  );

  return {
    ok: true,
    log: `${hero.name} unequipped ${itemDef ? itemDef.name : equippedId} into the party pack.`
  };
}

export function useConsumableOnHero(state, itemId, targetHero, itemsById = {}) {
  const itemDef = itemsById[itemId];
  if (!itemDef || itemDef.slot !== 'consumable') {
    return { ok: false, log: 'That item cannot be used as a consumable.' };
  }
  if (!targetHero) {
    return { ok: false, log: 'Choose a party member first.' };
  }
  if (getInventoryQty(state, itemId) <= 0) {
    return { ok: false, log: `No ${itemDef.name} remaining in the party pack!` };
  }

  const isDead =
    targetHero.status === 'Dead' ||
    targetHero.status === 'Ashes' ||
    (targetHero.derived?.hp ?? 0) <= 0;

  if (itemDef.effect === 'cure_status') {
    if (isDead) {
      return {
        ok: false,
        log: `${targetHero.name} has fallen and cannot drink ${itemDef.name}.`
      };
    }
    const curable = ['Poison', 'Sleep', 'Paralysis', 'Silence'];
    const hadAilment = curable.includes(targetHero.status);
    const missingHp = targetHero.derived.hp < targetHero.derived.maxHp;
    if (!hadAilment && !missingHp) {
      return {
        ok: false,
        log: `${targetHero.name} is already healthy (${targetHero.status}) and at full HP.`
      };
    }
    removeItemFromPack(state, itemId, 1);
    const oldStatus = targetHero.status;
    if (hadAilment) {
      targetHero.status = 'OK';
      delete targetHero.statusDuration;
    }
    const healAmt = Math.max(1, dice.roll(itemDef.dice || '1d4'));
    const before = targetHero.derived.hp;
    targetHero.derived.hp = Math.min(targetHero.derived.maxHp, before + healAmt);
    const actual = targetHero.derived.hp - before;
    const statusNote = hadAilment ? `cures ${oldStatus}` : 'refreshes spirits';
    const hpNote = actual > 0 ? ` and restores ${actual} HP` : '';
    return {
      ok: true,
      amount: actual,
      log: `${targetHero.name} uses ${itemDef.name}: ${statusNote}${hpNote} (${targetHero.derived.hp}/${targetHero.derived.maxHp} HP).`
    };
  }

  if (itemDef.effect === 'heal_hp') {
    if (isDead) {
      return {
        ok: false,
        log: `${targetHero.name} has fallen! Use Triad Resurrection Salts or visit a Temple.`
      };
    }
    if (targetHero.derived.hp >= targetHero.derived.maxHp) {
      return {
        ok: false,
        log: `${targetHero.name} is already at full HP (${targetHero.derived.hp}/${targetHero.derived.maxHp}).`
      };
    }
    removeItemFromPack(state, itemId, 1);
    const amount = Math.max(1, dice.roll(itemDef.dice || '2d4+4'));
    const before = targetHero.derived.hp;
    targetHero.derived.hp = Math.min(targetHero.derived.maxHp, before + amount);
    const actual = targetHero.derived.hp - before;
    return {
      ok: true,
      amount: actual,
      log: `${targetHero.name} drinks ${itemDef.name} and recovers ${actual} HP (${targetHero.derived.hp}/${targetHero.derived.maxHp} HP).`
    };
  }

  if (itemDef.effect === 'restore_mp') {
    if (isDead) {
      return { ok: false, log: `${targetHero.name} has fallen and cannot drink ${itemDef.name}.` };
    }
    if ((targetHero.derived.maxMp || 0) <= 0) {
      return { ok: false, log: `${targetHero.name} has no mana pool to restore.` };
    }
    if (targetHero.derived.mp >= targetHero.derived.maxMp) {
      return {
        ok: false,
        log: `${targetHero.name} is already at full MP (${targetHero.derived.mp}/${targetHero.derived.maxMp}).`
      };
    }
    removeItemFromPack(state, itemId, 1);
    const amount = Math.max(1, dice.roll(itemDef.dice || '2d4+3'));
    const before = targetHero.derived.mp;
    targetHero.derived.mp = Math.min(targetHero.derived.maxMp, before + amount);
    const actual = targetHero.derived.mp - before;
    return {
      ok: true,
      amount: actual,
      log: `${targetHero.name} quaffs ${itemDef.name} and restores ${actual} MP (${targetHero.derived.mp}/${targetHero.derived.maxMp} MP).`
    };
  }

  if (itemDef.effect === 'revive_or_heal') {
    if (targetHero.status === 'Ashes') {
      return {
        ok: false,
        log: `${targetHero.name} has been reduced to Ashes! Only a Temple can restore Ashes.`
      };
    }
    if (!isDead && targetHero.derived.hp >= targetHero.derived.maxHp) {
      return {
        ok: false,
        log: `${targetHero.name} is already alive and at full HP.`
      };
    }
    removeItemFromPack(state, itemId, 1);
    const amount = Math.max(1, dice.roll(itemDef.dice || '2d6+4'));
    if (isDead) {
      targetHero.status = 'OK';
      targetHero.derived.hp = Math.min(targetHero.derived.maxHp, amount);
      return {
        ok: true,
        amount: targetHero.derived.hp,
        revived: true,
        log: `${itemDef.name} revives ${targetHero.name} from death with ${targetHero.derived.hp}/${targetHero.derived.maxHp} HP!`
      };
    } else {
      const before = targetHero.derived.hp;
      targetHero.derived.hp = Math.min(targetHero.derived.maxHp, before + amount);
      const actual = targetHero.derived.hp - before;
      return {
        ok: true,
        amount: actual,
        log: `${itemDef.name} restores ${actual} HP to ${targetHero.name} (${targetHero.derived.hp}/${targetHero.derived.maxHp} HP).`
      };
    }
  }

  if (itemDef.effect === 'field_light') {
    removeItemFromPack(state, itemId, 1);
    const steps = itemDef.durationSteps || 35;
    if (!state.location) state.location = {};
    state.location.lightSteps = Math.max(state.location.lightSteps || 0, steps);
    return {
      ok: true,
      amount: state.location.lightSteps,
      log: `${targetHero.name} lights a ${itemDef.name}! Warm torchlight illuminates the party for ${state.location.lightSteps} steps.`
    };
  }

  if (itemDef.effect === 'unlock_door') {
    return {
      ok: false,
      log: `Face a locked dungeon door and press [O] (Unlock Door) to automatically use a ${itemDef.name}.`
    };
  }

  if (itemDef.effect === 'exit_dungeon') {
    if (state.location?.mode !== 'dungeon') {
      return {
        ok: false,
        log: `${itemDef.name} can only be used inside a dungeon to return to the surface.`
      };
    }
    removeItemFromPack(state, itemId, 1);
    const mapIdStr = String(state.location.mapId || '');
    let dest = { mapId: 'avalon', x: 16, y: 14 };
    if (state.location.returnOverworld && state.location.returnOverworld.mapId) {
      dest = { ...state.location.returnOverworld };
    } else if (mapIdStr.includes('doom')) {
      dest = { mapId: 'avalon', x: 10, y: 26 };
    } else if (mapIdStr.includes('despise')) {
      dest = { mapId: 'avalon', x: 25, y: 7 };
    }

    state.location.mode = 'overworld';
    state.location.mapId = dest.mapId;
    state.location.x = dest.x;
    state.location.y = dest.y;
    state.location.lightSteps = 0;
    state.location.detectSteps = 0;

    return {
      ok: true,
      exitedDungeon: true,
      log: `${targetHero.name} raises the ${itemDef.name}! Golden wings of light lift the party out of the depths and set you down at the surface entrance!`
    };
  }

  return { ok: false, log: 'Nothing happens.' };
}
