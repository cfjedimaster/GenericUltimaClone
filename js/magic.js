import { dice } from './dice.js';
import { getStatMod, getEffectiveStats } from './models/character.js';

export const PERSISTENT_AILMENTS = ['Poison', 'Dead', 'Ashes'];
export const COMBAT_TEMP_AILMENTS = ['Sleep', 'Paralysis', 'Silence'];

export function isHeroDead(hero) {
  return Boolean(
    !hero ||
      hero.status === 'Dead' ||
      hero.status === 'Ashes' ||
      (hero.derived?.hp ?? 0) <= 0
  );
}

export function isHeroIncapacitated(hero) {
  if (isHeroDead(hero)) return true;
  return hero.status === 'Sleep' || hero.status === 'Paralysis';
}

export function isHeroSilenced(hero) {
  return hero?.status === 'Silence';
}

export function getRequiredLevelForTier(classDef, tier) {
  if (!classDef || !classDef.magicSchool) return null;
  const isHybrid = (classDef.mpRate || 0) < 1;
  if (isHybrid) {
    if (tier === 1) return 1;
    if (tier === 2) return 4;
    if (tier === 3) return 7;
    return null; // Tier 4 is exclusive to pure casters
  }
  // Pure caster (Wizard, Cleric): Tier 1 @ Lv 1, Tier 2 @ Lv 3, Tier 3 @ Lv 5, Tier 4 @ Lv 7
  return 1 + (tier - 1) * 2;
}

export function getMaxUnlockedSpellTier(hero, classesById = {}) {
  if (!hero) return 0;
  const classDef = classesById[hero.class];
  if (!classDef || !classDef.magicSchool) return 0;
  const level = hero.level || 1;
  let maxTier = 0;
  for (let t = 1; t <= 4; t++) {
    const req = getRequiredLevelForTier(classDef, t);
    if (req !== null && level >= req) {
      maxTier = t;
    }
  }
  return maxTier;
}

export function formatSpellSummary(spell) {
  if (!spell) return '';
  const statLabel = (spell.statKey || 'int').toUpperCase();
  if (spell.effect === 'damage') {
    const undeadTag = spell.undeadMultiplier ? ' (1.5x vs Undead)' : '';
    return `${spell.dice} + ${statLabel} mod single target${undeadTag}`;
  }
  if (spell.effect === 'damage_group') {
    return `${spell.dice} + ${statLabel} mod to Enemy Group`;
  }
  if (spell.effect === 'damage_all') {
    return `${spell.dice} + ${statLabel} mod to ALL Enemies`;
  }
  if (spell.effect === 'damage_all_and_heal_party') {
    return `${spell.dice} + ${statLabel} mod to All Foes & Heals Party ${spell.healDice}`;
  }
  if (spell.effect === 'status_enemy') {
    return `Inflicts ${spell.status} (${spell.duration || 2} rds) on Enemy Group`;
  }
  if (spell.effect === 'buff_party') {
    const parts = [];
    if (spell.acBonus) parts.push(`+${spell.acBonus} AC`);
    if (spell.hitBonus) parts.push(`+${spell.hitBonus} Hit`);
    return `Party Buff: ${parts.join(', ')} for battle`;
  }
  if (spell.effect === 'heal_hp') {
    return `Restores ${spell.dice} + ${statLabel} mod HP`;
  }
  if (spell.effect === 'cure_status') {
    return `Cures ${(spell.cures || []).join(' / ')} & heals ${spell.dice} HP`;
  }
  if (spell.effect === 'heal_and_cure') {
    return `Restores ${spell.dice} + ${statLabel} mod HP & cures ailments`;
  }
  if (spell.effect === 'heal_party') {
    return `Party Heal: ${spell.dice} + ${statLabel} mod HP & cures Poison / Sleep / Silence`;
  }
  if (spell.effect === 'revive_ally') {
    return `Revives Dead ally with ${spell.dice} + ${statLabel} mod HP`;
  }
  if (spell.effect === 'field_light') {
    return `Mage-Light (${spell.durationSteps || 30} steps, +Surprise bonus)`;
  }
  if (spell.effect === 'recall') {
    return `Teleports party to Oakhaven gates / escapes battle`;
  }
  return spell.description || '';
}

export function getHeroSpellbook(hero, spells = [], classesById = {}, context = null) {
  if (!hero) return [];
  const classDef = classesById[hero.class];
  if (!classDef || !classDef.magicSchool) return [];

  const schoolSpells = spells.filter(s => s.school === classDef.magicSchool);
  const currentMp = hero.derived?.mp ?? 0;
  const heroLevel = hero.level || 1;
  const dead = isHeroDead(hero);
  const silenced = isHeroSilenced(hero);
  const incapacitated = isHeroIncapacitated(hero);

  return schoolSpells
    .filter(spell => {
      const req = getRequiredLevelForTier(classDef, spell.tier);
      if (req === null || heroLevel < req) return false;
      if (context === 'combat') {
        return Array.isArray(spell.usableIn) && spell.usableIn.includes('combat');
      }
      return true;
    })
    .map(spell => {
      const requiredLevel = getRequiredLevelForTier(classDef, spell.tier);
      const unlocked = true;
      const validContext = !context || (Array.isArray(spell.usableIn) && spell.usableIn.includes(context));
      const enoughMp = currentMp >= spell.mpCost;

      let reason = '';
      if (dead) {
        reason = `${hero.name} has fallen`;
      } else if (incapacitated) {
        reason = `${hero.name} is ${hero.status}`;
      } else if (silenced) {
        reason = 'Silenced — cannot cast spells';
      } else if (!validContext) {
        reason = context === 'field' ? 'Combat-only spell' : 'Field-only spell';
      } else if (!enoughMp) {
        reason = `Needs ${spell.mpCost} MP (have ${currentMp})`;
      }

      return {
        spell,
        unlocked,
        requiredLevel,
        validContext,
        enoughMp,
        canCast: unlocked && validContext && enoughMp && !dead && !incapacitated && !silenced,
        reason,
        summary: formatSpellSummary(spell)
      };
    });
}

export function castFieldSpell({
  state,
  caster,
  spell,
  targetHero = null,
  itemsById = {}
}) {
  if (!state || !caster || !spell) {
    return { ok: false, log: 'Invalid spell invocation.' };
  }
  if (isHeroDead(caster)) {
    return { ok: false, log: `${caster.name} has fallen and cannot cast spells.` };
  }
  if (isHeroIncapacitated(caster)) {
    return { ok: false, log: `${caster.name} is afflicted with ${caster.status} and cannot cast.` };
  }
  if (isHeroSilenced(caster)) {
    return { ok: false, log: `${caster.name} is Silenced and cannot utter incantations!` };
  }
  if (!Array.isArray(spell.usableIn) || !spell.usableIn.includes('field')) {
    return { ok: false, log: `${spell.name} can only be cast during combat.` };
  }
  if ((caster.derived?.mp ?? 0) < spell.mpCost) {
    return { ok: false, log: `${caster.name} lacks the mana for ${spell.name} (${spell.mpCost} MP required).` };
  }

  const effStats = getEffectiveStats(caster, itemsById);
  const statMod = Math.max(0, getStatMod(effStats[spell.statKey || 'wis'] || 10));

  // Single-Ally Healing
  if (spell.effect === 'heal_hp') {
    if (!targetHero) return { ok: false, log: 'Select a party member to heal.' };
    if (isHeroDead(targetHero)) {
      return { ok: false, log: `${targetHero.name} is ${targetHero.status}! Use Breath of Life or visit a Temple.` };
    }
    if (targetHero.derived.hp >= targetHero.derived.maxHp) {
      return { ok: false, log: `${targetHero.name} is already at full HP (${targetHero.derived.hp}/${targetHero.derived.maxHp}).` };
    }
    caster.derived.mp -= spell.mpCost;
    const amount = Math.max(1, dice.roll(spell.dice || '2d4+2') + statMod);
    const before = targetHero.derived.hp;
    targetHero.derived.hp = Math.min(targetHero.derived.maxHp, before + amount);
    const actual = targetHero.derived.hp - before;
    return {
      ok: true,
      log: `${caster.name} casts ${spell.name} (-${spell.mpCost} MP) on ${targetHero.name}, restoring ${actual} HP (${targetHero.derived.hp}/${targetHero.derived.maxHp} HP).`
    };
  }

  // Single-Ally Cure Status
  if (spell.effect === 'cure_status') {
    if (!targetHero) return { ok: false, log: 'Select a party member to purify.' };
    if (isHeroDead(targetHero)) {
      return { ok: false, log: `${targetHero.name} has fallen and requires resurrection.` };
    }
    const cures = spell.cures || ['Poison', 'Sleep', 'Paralysis', 'Silence'];
    const hadAilment = cures.includes(targetHero.status);
    const missingHp = targetHero.derived.hp < targetHero.derived.maxHp;

    if (!hadAilment && !missingHp) {
      return { ok: false, log: `${targetHero.name} is already healthy (${targetHero.status}) and at full HP.` };
    }

    caster.derived.mp -= spell.mpCost;
    const oldStatus = targetHero.status;
    if (hadAilment) {
      targetHero.status = 'OK';
    }
    const healRoll = Math.max(1, dice.roll(spell.dice || '1d4'));
    const before = targetHero.derived.hp;
    targetHero.derived.hp = Math.min(targetHero.derived.maxHp, before + healRoll);
    const actual = targetHero.derived.hp - before;

    const cureNote = hadAilment ? `cleansed ${oldStatus}` : 'soothed wounds';
    const hpNote = actual > 0 ? ` and restored ${actual} HP` : '';
    return {
      ok: true,
      log: `${caster.name} casts ${spell.name} (-${spell.mpCost} MP) on ${targetHero.name}: ${cureNote}${hpNote}!`
    };
  }

  // Single-Ally Greater Heal + Cure
  if (spell.effect === 'heal_and_cure') {
    if (!targetHero) return { ok: false, log: 'Select a party member to mend.' };
    if (isHeroDead(targetHero)) {
      return { ok: false, log: `${targetHero.name} has fallen and requires resurrection.` };
    }
    const cures = spell.cures || ['Poison', 'Sleep', 'Paralysis', 'Silence'];
    const hadAilment = cures.includes(targetHero.status);
    if (!hadAilment && targetHero.derived.hp >= targetHero.derived.maxHp) {
      return { ok: false, log: `${targetHero.name} is already at full HP and free of ailments.` };
    }

    caster.derived.mp -= spell.mpCost;
    const oldStatus = targetHero.status;
    if (hadAilment) {
      targetHero.status = 'OK';
    }
    const amount = Math.max(1, dice.roll(spell.dice || '3d6+4') + statMod);
    const before = targetHero.derived.hp;
    targetHero.derived.hp = Math.min(targetHero.derived.maxHp, before + amount);
    const actual = targetHero.derived.hp - before;
    const cureTag = hadAilment ? ` and cured ${oldStatus}` : '';
    return {
      ok: true,
      log: `${caster.name} casts ${spell.name} (-${spell.mpCost} MP) on ${targetHero.name}, restoring ${actual} HP${cureTag}!`
    };
  }

  // Party-Wide Heal & Cure
  if (spell.effect === 'heal_party') {
    const partyHeroes = state.party
      .map(p => state.roster.find(c => c.id === p.charId))
      .filter(h => h && !isHeroDead(h));

    if (partyHeroes.length === 0) {
      return { ok: false, log: 'No living party members to heal.' };
    }

    const cures = spell.cures || ['Poison', 'Sleep', 'Silence'];
    const anyNeedsHelp = partyHeroes.some(
      h => h.derived.hp < h.derived.maxHp || cures.includes(h.status)
    );
    if (!anyNeedsHelp) {
      return { ok: false, log: 'All living party members are already at full HP and healthy.' };
    }

    caster.derived.mp -= spell.mpCost;
    const results = [];
    for (const member of partyHeroes) {
      const amount = Math.max(1, dice.roll(spell.dice || '2d6+2') + statMod);
      const before = member.derived.hp;
      member.derived.hp = Math.min(member.derived.maxHp, before + amount);
      const gained = member.derived.hp - before;
      const cured = cures.includes(member.status) ? member.status : null;
      if (cured) member.status = 'OK';
      if (gained > 0 || cured) {
        results.push(`${member.name} (+${gained} HP${cured ? `, cured ${cured}` : ''})`);
      }
    }

    return {
      ok: true,
      log: `${caster.name} invokes ${spell.name} (-${spell.mpCost} MP)! ${results.join(', ')}.`
    };
  }

  // Revive Fallen Ally
  if (spell.effect === 'revive_ally') {
    if (!targetHero) return { ok: false, log: 'Select a fallen party member to revive.' };
    if (targetHero.status === 'Ashes') {
      return {
        ok: false,
        log: `${targetHero.name} has been reduced to Ashes! Only the High Priests at a Temple can restore Ashes.`
      };
    }
    if (!isHeroDead(targetHero)) {
      return { ok: false, log: `${targetHero.name} is still alive and does not need resurrection.` };
    }

    caster.derived.mp -= spell.mpCost;
    const amount = Math.max(1, dice.roll(spell.dice || '2d6+4') + statMod);
    targetHero.status = 'OK';
    targetHero.derived.hp = Math.min(targetHero.derived.maxHp, amount);
    return {
      ok: true,
      log: `${caster.name} casts ${spell.name} (-${spell.mpCost} MP)! ${targetHero.name} returns to life with ${targetHero.derived.hp}/${targetHero.derived.maxHp} HP!`
    };
  }

  // Field Mage-Light
  if (spell.effect === 'field_light') {
    caster.derived.mp -= spell.mpCost;
    const steps = (spell.durationSteps || 30) + statMod * 5;
    if (!state.location) state.location = {};
    state.location.lightSteps = Math.max(state.location.lightSteps || 0, steps);
    return {
      ok: true,
      log: `${caster.name} conjures ${spell.name} (-${spell.mpCost} MP)! A radiant orb illuminates the party for ${state.location.lightSteps} steps (+Surprise bonus).`
    };
  }

  // Ethereal Recall (Teleport to Oakhaven Gates)
  if (spell.effect === 'recall') {
    caster.derived.mp -= spell.mpCost;
    state.location.mode = 'overworld';
    state.location.mapId = 'avalon';
    state.location.x = 16;
    state.location.y = 13;
    return {
      ok: true,
      recalled: true,
      log: `${caster.name} weaves ${spell.name} (-${spell.mpCost} MP)! Spatial rifts fold and deposit the party before the gates of Oakhaven!`
    };
  }

  return { ok: false, log: 'The spell fizzles with no effect.' };
}

export function clearCombatTemporaryStatuses(state) {
  if (!state || !Array.isArray(state.roster)) return;
  for (const char of state.roster) {
    if (!char) continue;
    if (char.derived?.hp <= 0 && char.status !== 'Ashes') {
      char.status = 'Dead';
    } else if (COMBAT_TEMP_AILMENTS.includes(char.status)) {
      char.status = 'OK';
    }
    delete char.statusDuration;
  }
}

export function tickOverworldStepEffects(state) {
  if (!state) return { notes: [] };
  const notes = [];

  if (state.location && typeof state.location.lightSteps === 'number' && state.location.lightSteps > 0) {
    state.location.lightSteps = Math.max(0, state.location.lightSteps - 1);
    if (state.location.lightSteps === 0) {
      notes.push('Your Lumina Orb flickers and fades into darkness.');
    }
  }

  const poisonedNames = [];
  for (const entry of state.party || []) {
    const hero = state.roster.find(c => c.id === entry.charId);
    if (!hero || isHeroDead(hero)) continue;
    if (hero.status === 'Poison') {
      if (hero.derived.hp > 1) {
        hero.derived.hp = Math.max(1, hero.derived.hp - 1);
        poisonedNames.push(`${hero.name} (-1 HP)`);
      } else {
        poisonedNames.push(`${hero.name} (1 HP crit!)`);
      }
    }
  }

  if (poisonedNames.length > 0) {
    notes.push(`Poison courses through veins: ${poisonedNames.join(', ')}.`);
  }

  return { notes };
}
