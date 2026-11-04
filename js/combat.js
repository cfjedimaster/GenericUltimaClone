import { getStatMod, getEffectiveStats, applyXpAndLevelUp } from './models/character.js';
import { addItemToPack, useConsumableOnHero } from './items.js';
import { clearCombatTemporaryStatuses } from './magic.js';
import { dice, getRandomInt } from './dice.js';

const GROUP_LETTERS = ['A', 'B', 'C', 'D'];

export function rollDie(sides) {
  return dice.roll(`1d${sides}`);
}

export function randomInt(min, max) {
  return getRandomInt(min, max);
}

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function shouldTriggerRandomEncounter(tileDef) {
  if (!tileDef || !tileDef.passable) return false;
  const rate = typeof tileDef.encounterRate === 'number' ? tileDef.encounterRate : 0;
  if (rate <= 0) return false;
  return Math.random() < rate;
}

function pickWeightedFormation(formations) {
  if (!Array.isArray(formations) || formations.length === 0) return null;
  const totalWeight = formations.reduce((sum, f) => sum + (f.weight || 10), 0);
  let roll = Math.random() * totalWeight;
  for (const f of formations) {
    roll -= (f.weight || 10);
    if (roll <= 0) return f;
  }
  return formations[formations.length - 1];
}

export function isHeroAlive(hero) {
  return Boolean(
    hero &&
      hero.status !== 'Dead' &&
      hero.status !== 'Ashes' &&
      (hero.derived?.hp ?? 0) > 0
  );
}

export function canHeroActInCombat(hero) {
  if (!isHeroAlive(hero)) return false;
  return hero.status !== 'Sleep' && hero.status !== 'Paralysis';
}

export function getEffectiveHeroRow(hero, partyMembers) {
  if (!hero) return 'back';
  if (hero.row === 'front') return 'front';
  // If every front-row hero has fallen, the front line collapses and back-row survivors are exposed
  const anyLivingFront = partyMembers.some(m => m.row === 'front' && isHeroAlive(m));
  return anyLivingFront ? 'back' : 'front';
}

export function getHeroAttackProfile(hero, effectiveRow, itemsById = {}) {
  const rawWeapon = hero?.equipment?.weapon || null;
  const weaponDef =
    rawWeapon && typeof rawWeapon === 'object'
      ? rawWeapon
      : typeof rawWeapon === 'string'
        ? itemsById[rawWeapon] || null
        : null;

  // Back row requires a ranged or reach weapon to make a weapon attack
  if (effectiveRow === 'back') {
    const canReachFromBack =
      weaponDef && (weaponDef.range === 'ranged' || weaponDef.range === 'reach');
    if (!canReachFromBack) {
      return {
        canAttack: false,
        weaponName: weaponDef ? weaponDef.name : 'Bare Fists',
        dice: weaponDef?.dice || '1d3',
        statKey: weaponDef?.statKey || 'str',
        hitBonus: weaponDef?.hitBonus || 0,
        range: weaponDef?.range || 'melee',
        reason: 'Back Row — Requires a Ranged or Reach weapon (or Cast a Spell)'
      };
    }
  }

  // Front row (or exposed collapsed line) with no weapon uses Bare Fists (1d3 + STR mod)
  if (!weaponDef) {
    return {
      canAttack: true,
      weaponName: 'Bare Fists',
      dice: '1d3',
      statKey: 'str',
      hitBonus: 0,
      range: 'melee',
      reason: 'Unarmed melee (1d3 + STR mod)'
    };
  }

  const statLabel = (weaponDef.statKey || 'str').toUpperCase();
  const rangeLabel =
    weaponDef.range === 'ranged'
      ? 'Ranged'
      : weaponDef.range === 'reach'
        ? 'Reach'
        : 'Melee';

  return {
    canAttack: true,
    weaponName: weaponDef.name || 'Weapon',
    dice: weaponDef.dice || '1d6',
    statKey: weaponDef.statKey || 'str',
    hitBonus: weaponDef.hitBonus || 0,
    range: weaponDef.range || 'melee',
    reason: `${weaponDef.dice || '1d6'} + ${statLabel} mod (${rangeLabel})`
  };
}

export function getLivingUnitsInGroup(group) {
  if (!group || !Array.isArray(group.units)) return [];
  return group.units.filter(u => u.alive && u.hp > 0);
}

export function getLivingEnemyGroups(combatState) {
  if (!combatState || !Array.isArray(combatState.groups)) return [];
  return combatState.groups.filter(g => getLivingUnitsInGroup(g).length > 0);
}

export function createEncounter({
  terrainId = 'grass',
  terrainName = 'Wilderness',
  monstersById = {},
  encounters = {},
  partyMembers = [],
  itemsById = {},
  lightActive = false,
  dungeonDepth = 0,
  fixedGroups = null,
  isDarkness = false,
  onVictoryFlag = null,
  victoryTitle = null,
  bonusLoot = null
}) {
  const table = encounters[terrainId] || encounters.grass || [];
  const formation = Array.isArray(fixedGroups) && fixedGroups.length > 0
    ? { groups: fixedGroups }
    : (pickWeightedFormation(table) || {
        groups: [{ monsterId: 'goblin', min: 1, max: 2 }]
      });

  const depthTier = Math.max(0, Number(dungeonDepth || 0) - 1);
  const hpMultiplier = 1 + depthTier * 0.15;
  const acDepthBonus = Math.floor(depthTier / 2);
  const rewardMultiplier = 1 + depthTier * 0.15;

  const groups = [];
  formation.groups.slice(0, 3).forEach((spec, idx) => {
    const monsterDef = monstersById[spec.monsterId] || Object.values(monstersById)[0];
    if (!monsterDef) return;

    const count = spec.count ? dice.roll(spec.count) : randomInt(spec.min || 1, spec.max || 2);
    const letter = GROUP_LETTERS[idx] || String(idx + 1);
    const units = [];
    for (let i = 1; i <= count; i++) {
      const baseHp = Math.max(1, dice.roll(monsterDef.hp || '1d4'));
      const rolledHp = Math.max(1, Math.ceil(baseHp * hpMultiplier));
      const baseGold = Math.max(0, dice.roll(monsterDef.gold || '1d6'));
      units.push({
        id: `${monsterDef.id}_${letter}_${i}`,
        number: i,
        name: count > 1 ? `${monsterDef.name} #${i}` : monsterDef.name,
        hp: rolledHp,
        maxHp: rolledHp,
        alive: true,
        status: 'OK',
        statusDuration: 0,
        goldRoll: Math.ceil(baseGold * rewardMultiplier)
      });
    }

    groups.push({
      id: `grp_${letter}`,
      letter,
      label: `Group ${letter}`,
      monsterId: monsterDef.id,
      name: monsterDef.name,
      pluralName: monsterDef.pluralName || `${monsterDef.name}s`,
      glyph: monsterDef.glyph || 'm',
      color: monsterDef.color || '#f25f5c',
      undead: Boolean(monsterDef.undead),
      ac: (monsterDef.ac ?? 10) + acDepthBonus,
      dex: monsterDef.dex ?? 10,
      attackName: monsterDef.attackName || 'Attack',
      damageDice: monsterDef.damageDice || '1d4',
      specialAttack: monsterDef.specialAttack || null,
      xpEach: Math.ceil((monsterDef.xp ?? 15) * rewardMultiplier),
      drops: Array.isArray(monsterDef.drops) ? monsterDef.drops : [],
      units
    });
  });

  // Surprise check (DEX based, +2 if Lumina/Torch is active, -4 if in pitch-dark dungeon)
  const livingHeroes = partyMembers.filter(isHeroAlive);
  const partyAvgDex = livingHeroes.length > 0
    ? livingHeroes.reduce((sum, h) => sum + getEffectiveStats(h, itemsById).dex, 0) / livingHeroes.length
    : 10;
  const enemyAvgDex = groups.length > 0
    ? groups.reduce((sum, g) => sum + g.dex, 0) / groups.length
    : 10;

  const lightBonus = lightActive ? 2 : (isDarkness ? -4 : 0);
  const partySurpriseRoll = partyAvgDex + lightBonus + rollDie(10);
  const enemySurpriseRoll = enemyAvgDex + rollDie(10);
  const diff = partySurpriseRoll - enemySurpriseRoll;

  let surprise = 'none';
  if (diff >= 6.5) {
    surprise = 'party';
  } else if (diff <= -6.5) {
    surprise = 'enemy';
  }

  const groupSummary = groups
    .map(g => `${g.units.length} ${g.units.length === 1 ? g.name : g.pluralName}`)
    .join(', ');

  let logSeq = 1;
  const combatState = {
    active: true,
    round: 1,
    terrainId,
    terrainName,
    dungeonDepth,
    onVictoryFlag,
    victoryTitle,
    bonusLoot: Array.isArray(bonusLoot) ? bonusLoot : [],
    surprise,
    phase: 'input', // 'input' | 'victory' | 'defeat' | 'fled'
    recalledToTown: false,
    groups,
    partyBuffs: {
      acBonus: 0,
      hitBonus: 0,
      activeNames: []
    },
    queuedActions: {},
    activeHeroIndex: 0,
    selectingTarget: false,
    selectingItem: false,
    selectedCombatItemId: null,
    selectingSpell: false,
    selectedCombatSpellId: null,
    rewards: null,
    log: [
      {
        id: logSeq++,
        tone: 'warn',
        text: `Encounter in ${terrainName}! Hostiles appear: ${groupSummary}.`
      }
    ],
    nextLogId: logSeq
  };

  if (surprise === 'party') {
    addCombatLog(
      combatState,
      'Surprise! Your party catches the monsters flat-footed — enemies cannot act in Round 1!',
      'victory'
    );
  } else if (surprise === 'enemy') {
    addCombatLog(
      combatState,
      'Ambush! The monsters strike before your party can ready weapons!',
      'enemy'
    );
  }

  return combatState;
}

export function addCombatLog(combatState, text, tone = 'info') {
  if (!combatState || !text) return;
  combatState.log.push({
    id: combatState.nextLogId++,
    text,
    tone
  });
}

function chooseTargetHeroForMonster(livingHeroesWithRows) {
  if (livingHeroesWithRows.length === 0) return null;
  const frontLiners = livingHeroesWithRows.filter(h => h.effectiveRow === 'front');
  const backLiners = livingHeroesWithRows.filter(h => h.effectiveRow === 'back');

  // Front row draws 80% of enemy attacks while standing
  if (frontLiners.length > 0 && (backLiners.length === 0 || Math.random() < 0.8)) {
    return frontLiners[Math.floor(Math.random() * frontLiners.length)];
  }
  return backLiners[Math.floor(Math.random() * backLiners.length)];
}

export function executeEnemyAmbushRound(combatState, state) {
  const getPartyDetailed = () =>
    state.party
      .map(entry => {
        const hero = state.roster.find(c => c.id === entry.charId);
        return hero ? { hero, row: entry.row } : null;
      })
      .filter(Boolean);

  for (const group of getLivingEnemyGroups(combatState)) {
    for (const unit of getLivingUnitsInGroup(group)) {
      const currentParty = getPartyDetailed();
      const living = currentParty
        .filter(p => isHeroAlive(p.hero))
        .map(p => ({
          hero: p.hero,
          effectiveRow: getEffectiveHeroRow(
            { ...p.hero, row: p.row },
            currentParty.map(x => ({ ...x.hero, row: x.row }))
          )
        }));

      if (living.length === 0) break;

      const targetWrap = chooseTargetHeroForMonster(living);
      if (!targetWrap) break;
      const targetHero = targetWrap.hero;

      const hitChance = clamp(55 + group.dex - targetHero.derived.ac * 2, 5, 95);
      const roll = rollDie(100);

      if (roll <= hitChance) {
        const rawDmg = Math.max(1, dice.roll(group.damageDice));
        targetHero.derived.hp = Math.max(0, targetHero.derived.hp - rawDmg);
        if (targetHero.derived.hp <= 0) {
          targetHero.status = 'Dead';
          delete targetHero.statusDuration;
          addCombatLog(
            combatState,
            `[Ambush] ${unit.name} hits ${targetHero.name} (${group.attackName}) for ${rawDmg} dmg — ${targetHero.name} falls!`,
            'enemy'
          );
        } else {
          addCombatLog(
            combatState,
            `[Ambush] ${unit.name} hits ${targetHero.name} (${group.attackName}) for ${rawDmg} dmg (${targetHero.derived.hp}/${targetHero.derived.maxHp} HP).`,
            'enemy'
          );
        }
      } else {
        addCombatLog(
          combatState,
          `[Ambush] ${unit.name} lunges at ${targetHero.name} with ${group.attackName}, but misses.`,
          'info'
        );
      }
    }
  }

  // Check if entire party was wiped in the ambush
  const anySurvivor = state.party.some(entry => {
    const hero = state.roster.find(c => c.id === entry.charId);
    return isHeroAlive(hero);
  });

  if (!anySurvivor) {
    combatState.phase = 'defeat';
    addCombatLog(combatState, 'Your entire party has fallen in the ambush!', 'enemy');
  } else {
    combatState.surprise = 'none';
  }
}

function resolveHeroSpellCast({
  combatState,
  state,
  hero,
  spell,
  targetGroupId,
  targetHeroId,
  itemsById
}) {
  if (!spell) {
    addCombatLog(combatState, `${hero.name}'s spell fizzles.`, 'warn');
    return;
  }

  if (hero.status === 'Silence') {
    addCombatLog(
      combatState,
      `${hero.name} is Silenced and cannot utter the incantation for ${spell.name}!`,
      'warn'
    );
    return;
  }

  if ((hero.derived?.mp ?? 0) < spell.mpCost) {
    addCombatLog(
      combatState,
      `${hero.name} lacks the mana to cast ${spell.name} (${spell.mpCost} MP needed)!`,
      'warn'
    );
    return;
  }

  hero.derived.mp = Math.max(0, hero.derived.mp - spell.mpCost);
  const effStats = getEffectiveStats(hero, itemsById);
  const statMod = Math.max(0, getStatMod(effStats[spell.statKey || 'int'] || 10));

  // 1. Single-target enemy spell (e.g., Arcane Bolt, Sunbeam Smite, Glacial Lance)
  if (spell.effect === 'damage' || spell.effect === 'damage_and_status') {
    let targetGroup = combatState.groups.find(g => g.id === targetGroupId);
    if (!targetGroup || getLivingUnitsInGroup(targetGroup).length === 0) {
      targetGroup = getLivingEnemyGroups(combatState)[0];
    }
    if (!targetGroup) return;

    const targetUnit = getLivingUnitsInGroup(targetGroup)[0];
    if (!targetUnit) return;

    let dmg = Math.max(1, dice.roll(spell.dice || '1d6+2') + statMod);
    let undeadTag = '';
    if (spell.undeadMultiplier && targetGroup.undead) {
      dmg = Math.max(1, Math.round(dmg * spell.undeadMultiplier));
      undeadTag = ' [Undead Bane!]';
    }

    const wokeUp = targetUnit.status === 'Sleep';
    if (wokeUp) {
      targetUnit.status = 'OK';
      targetUnit.statusDuration = 0;
    }

    targetUnit.hp = Math.max(0, targetUnit.hp - dmg);
    if (targetUnit.hp <= 0) {
      targetUnit.alive = false;
      targetUnit.status = 'Dead';
      addCombatLog(
        combatState,
        `${hero.name} casts ${spell.name} (-${spell.mpCost} MP) on ${targetUnit.name} for ${dmg} dmg${undeadTag} — incinerated!`,
        'hit'
      );
    } else {
      let statusTag = '';
      if (spell.effect === 'damage_and_status' && spell.status) {
        const chance = clamp(
          (spell.baseChance || 70) + statMod * 6 - (targetGroup.ac - 10) * 4,
          25,
          95
        );
        if (rollDie(100) <= chance) {
          targetUnit.status = spell.status;
          targetUnit.statusDuration = spell.duration || 2;
          statusTag = ` [${spell.status}!]`;
        }
      }
      addCombatLog(
        combatState,
        `${hero.name} casts ${spell.name} (-${spell.mpCost} MP) on ${targetUnit.name} for ${dmg} dmg${undeadTag}${statusTag} (${targetUnit.hp}/${targetUnit.maxHp} HP).`,
        'hit'
      );
    }
    return;
  }

  // 2. Group AoE damage spell (e.g., Cinder Burst)
  if (spell.effect === 'damage_group') {
    let targetGroup = combatState.groups.find(g => g.id === targetGroupId);
    if (!targetGroup || getLivingUnitsInGroup(targetGroup).length === 0) {
      targetGroup = getLivingEnemyGroups(combatState)[0];
    }
    if (!targetGroup) return;

    const livingUnits = getLivingUnitsInGroup(targetGroup);
    let slainCount = 0;
    let totalDmg = 0;

    for (const unit of livingUnits) {
      let dmg = Math.max(1, dice.roll(spell.dice || '2d4+1') + statMod);
      if (spell.undeadMultiplier && targetGroup.undead) {
        dmg = Math.max(1, Math.round(dmg * spell.undeadMultiplier));
      }
      if (unit.status === 'Sleep') {
        unit.status = 'OK';
        unit.statusDuration = 0;
      }
      unit.hp = Math.max(0, unit.hp - dmg);
      totalDmg += dmg;
      if (unit.hp <= 0) {
        unit.alive = false;
        unit.status = 'Dead';
        slainCount += 1;
      }
    }

    const killNote = slainCount > 0 ? ` (${slainCount} slain!)` : '';
    addCombatLog(
      combatState,
      `${hero.name} unleashes ${spell.name} (-${spell.mpCost} MP) across ${targetGroup.pluralName} for ${totalDmg} total dmg${killNote}!`,
      'hit'
    );
    return;
  }

  // 3. All-Enemies AoE damage spell (e.g., Tempest Arc, Astral Meteor, Judgment of the Triad)
  if (spell.effect === 'damage_all' || spell.effect === 'damage_all_and_heal_party') {
    const livingGroups = getLivingEnemyGroups(combatState);
    let slainCount = 0;
    let hitCount = 0;
    let totalDmg = 0;

    for (const grp of livingGroups) {
      for (const unit of getLivingUnitsInGroup(grp)) {
        let dmg = Math.max(1, dice.roll(spell.dice || '2d6+2') + statMod);
        if (spell.undeadMultiplier && grp.undead) {
          dmg = Math.max(1, Math.round(dmg * spell.undeadMultiplier));
        }
        if (unit.status === 'Sleep') {
          unit.status = 'OK';
          unit.statusDuration = 0;
        }
        unit.hp = Math.max(0, unit.hp - dmg);
        totalDmg += dmg;
        hitCount += 1;
        if (unit.hp <= 0) {
          unit.alive = false;
          unit.status = 'Dead';
          slainCount += 1;
        }
      }
    }

    let healNote = '';
    if (spell.effect === 'damage_all_and_heal_party') {
      let totalHealed = 0;
      for (const entry of state.party) {
        const ally = state.roster.find(c => c.id === entry.charId);
        if (isHeroAlive(ally)) {
          const healAmt = Math.max(1, dice.roll(spell.healDice || '1d6+2') + Math.floor(statMod / 2));
          const before = ally.derived.hp;
          ally.derived.hp = Math.min(ally.derived.maxHp, before + healAmt);
          totalHealed += ally.derived.hp - before;
        }
      }
      if (totalHealed > 0) {
        healNote = ` & restores ${totalHealed} total HP to the party`;
      }
    }

    const killNote = slainCount > 0 ? ` (${slainCount} slain!)` : '';
    addCombatLog(
      combatState,
      `${hero.name} invokes ${spell.name} (-${spell.mpCost} MP)! Strikes ${hitCount} foes for ${totalDmg} total dmg${killNote}${healNote}!`,
      'hit'
    );
    return;
  }

  // 4. Enemy Group Status Affliction (Slumber Mist, Nullifying Hex, Chains of Light)
  if (spell.effect === 'status_enemy') {
    let targetGroup = combatState.groups.find(g => g.id === targetGroupId);
    if (!targetGroup || getLivingUnitsInGroup(targetGroup).length === 0) {
      targetGroup = getLivingEnemyGroups(combatState)[0];
    }
    if (!targetGroup) return;

    const livingUnits = getLivingUnitsInGroup(targetGroup);
    const affected = [];
    const chance = clamp(
      (spell.baseChance || 65) + statMod * 6 - (targetGroup.ac - 10) * 4,
      25,
      92
    );

    for (const unit of livingUnits) {
      if (rollDie(100) <= chance) {
        unit.status = spell.status;
        unit.statusDuration = spell.duration || 2;
        affected.push(unit.name);
      }
    }

    const grpTitle = targetGroup.units.length === 1 ? targetGroup.name : targetGroup.pluralName;
    if (affected.length > 0) {
      addCombatLog(
        combatState,
        `${hero.name} casts ${spell.name} (-${spell.mpCost} MP) on ${grpTitle}: ${affected.join(', ')} afflicted with ${spell.status}!`,
        'victory'
      );
    } else {
      addCombatLog(
        combatState,
        `${hero.name} casts ${spell.name} (-${spell.mpCost} MP) on ${grpTitle}, but the enemies resist!`,
        'info'
      );
    }
    return;
  }

  // 5. Party Buff (Aegis Ward, Benediction, Chronos Veil, Bulwark of the Triad)
  if (spell.effect === 'buff_party' || spell.effect === 'buff_and_cure_party') {
    if (!combatState.partyBuffs) {
      combatState.partyBuffs = { acBonus: 0, hitBonus: 0, activeNames: [] };
    }
    if (!combatState.partyBuffs.activeNames.includes(spell.name)) {
      combatState.partyBuffs.acBonus += spell.acBonus || 0;
      combatState.partyBuffs.hitBonus += spell.hitBonus || 0;
      combatState.partyBuffs.activeNames.push(spell.name);
    }
    const bonusParts = [];
    if (spell.acBonus) bonusParts.push(`+${spell.acBonus} AC`);
    if (spell.hitBonus) bonusParts.push(`+${spell.hitBonus} Hit`);

    const curedNames = [];
    if (spell.effect === 'buff_and_cure_party') {
      const cures = spell.cures || ['Poison', 'Sleep', 'Paralysis', 'Silence'];
      for (const entry of state.party) {
        const ally = state.roster.find(c => c.id === entry.charId);
        if (isHeroAlive(ally) && cures.includes(ally.status)) {
          curedNames.push(`${ally.name} (${ally.status})`);
          ally.status = 'OK';
          delete ally.statusDuration;
        }
      }
    }
    const cureTag = curedNames.length > 0 ? ` Cleansed: ${curedNames.join(', ')}.` : '';
    addCombatLog(
      combatState,
      `${hero.name} weaves ${spell.name} (-${spell.mpCost} MP)! Party gains ${bonusParts.join(', ')} for this battle.${cureTag}`,
      'victory'
    );
    return;
  }

  // 6. Single-Ally Heal / Cure / Revive
  if (spell.effect === 'heal_hp' || spell.effect === 'cure_status' || spell.effect === 'heal_and_cure') {
    let targetHero = state.roster.find(c => c.id === targetHeroId);
    if (!targetHero || !isHeroAlive(targetHero)) {
      // Fallback to most injured living party member
      const livingParty = state.party
        .map(p => state.roster.find(c => c.id === p.charId))
        .filter(isHeroAlive)
        .sort((a, b) => a.derived.hp / a.derived.maxHp - b.derived.hp / b.derived.maxHp);
      targetHero = livingParty[0] || hero;
    }

    const cures = spell.cures || [];
    let curedStatus = null;
    if (cures.includes(targetHero.status)) {
      curedStatus = targetHero.status;
      targetHero.status = 'OK';
      delete targetHero.statusDuration;
    }

    const healAmt = Math.max(
      1,
      dice.roll(spell.dice || '2d4+2') + (spell.effect === 'cure_status' ? 0 : statMod)
    );
    const before = targetHero.derived.hp;
    targetHero.derived.hp = Math.min(targetHero.derived.maxHp, before + healAmt);
    const actual = targetHero.derived.hp - before;

    const cureNote = curedStatus ? ` and cleansed ${curedStatus}` : '';
    addCombatLog(
      combatState,
      `${hero.name} casts ${spell.name} (-${spell.mpCost} MP) on ${targetHero.name}, restoring ${actual} HP${cureNote} (${targetHero.derived.hp}/${targetHero.derived.maxHp} HP)!`,
      'victory'
    );
    return;
  }

  // 7. Party-Wide Heal & Cure (Hymn of Dawn)
  if (spell.effect === 'heal_party') {
    const cures = spell.cures || ['Poison', 'Sleep', 'Silence'];
    const summary = [];
    for (const entry of state.party) {
      const ally = state.roster.find(c => c.id === entry.charId);
      if (!isHeroAlive(ally)) continue;
      const amount = Math.max(1, dice.roll(spell.dice || '2d6+2') + statMod);
      const before = ally.derived.hp;
      ally.derived.hp = Math.min(ally.derived.maxHp, before + amount);
      const gained = ally.derived.hp - before;
      let cured = null;
      if (cures.includes(ally.status)) {
        cured = ally.status;
        ally.status = 'OK';
        delete ally.statusDuration;
      }
      summary.push(`${ally.name} (+${gained} HP${cured ? `, cured ${cured}` : ''})`);
    }
    addCombatLog(
      combatState,
      `${hero.name} chants ${spell.name} (-${spell.mpCost} MP)! ${summary.join(', ')}.`,
      'victory'
    );
    return;
  }

  // 8. Revive Fallen Ally (Breath of Life / Miracle of Rebirth)
  if (spell.effect === 'revive_ally' || spell.effect === 'resurrect_ashes') {
    const canRestoreAshes = spell.effect === 'resurrect_ashes';
    let targetHero = state.roster.find(c => c.id === targetHeroId);
    if (!targetHero || isHeroAlive(targetHero)) {
      targetHero = state.party
        .map(p => state.roster.find(c => c.id === p.charId))
        .find(h => h && (h.status === 'Dead' || (canRestoreAshes && h.status === 'Ashes')));
    }
    if (!targetHero) {
      addCombatLog(
        combatState,
        `${hero.name} casts ${spell.name} (-${spell.mpCost} MP), but no fallen ally needs resurrection!`,
        'warn'
      );
      return;
    }
    if (targetHero.status === 'Ashes' && !canRestoreAshes) {
      addCombatLog(
        combatState,
        `${hero.name} casts ${spell.name}, but ${targetHero.name} is reduced to Ashes! Use Miracle of Rebirth, Celestial Miracle, or visit a Temple.`,
        'warn'
      );
      return;
    }

    const oldStatus = targetHero.status;
    const amount = Math.max(1, dice.roll(spell.dice || '2d6+4') + statMod);
    targetHero.status = 'OK';
    delete targetHero.statusDuration;
    targetHero.derived.hp = Math.min(targetHero.derived.maxHp, amount);
    addCombatLog(
      combatState,
      `${hero.name} invokes ${spell.name} (-${spell.mpCost} MP)! ${targetHero.name} rises from ${oldStatus} with ${targetHero.derived.hp}/${targetHero.derived.maxHp} HP!`,
      'victory'
    );
    return;
  }

  // 8b. Supreme Party Miracle (Celestial Miracle: Revive Dead/Ashes + Cure All + Heal All)
  if (spell.effect === 'miracle_party') {
    const cures = spell.cures || ['Poison', 'Sleep', 'Paralysis', 'Silence'];
    const summary = [];
    for (const entry of state.party) {
      const ally = state.roster.find(c => c.id === entry.charId);
      if (!ally) continue;
      const amount = Math.max(1, dice.roll(spell.dice || '4d6+10') + statMod);
      if (!isHeroAlive(ally)) {
        const oldStatus = ally.status;
        ally.status = 'OK';
        delete ally.statusDuration;
        ally.derived.hp = Math.min(ally.derived.maxHp, amount);
        summary.push(`${ally.name} (risen from ${oldStatus}, ${ally.derived.hp} HP)`);
      } else {
        const before = ally.derived.hp;
        ally.derived.hp = Math.min(ally.derived.maxHp, before + amount);
        const gained = ally.derived.hp - before;
        let cured = null;
        if (cures.includes(ally.status)) {
          cured = ally.status;
          ally.status = 'OK';
          delete ally.statusDuration;
        }
        summary.push(`${ally.name} (+${gained} HP${cured ? `, cured ${cured}` : ''})`);
      }
    }
    addCombatLog(
      combatState,
      `${hero.name} calls down ${spell.name} (-${spell.mpCost} MP)! ${summary.join(', ')}.`,
      'victory'
    );
    return;
  }

  // 9. Ethereal Recall (Teleport out of battle)
  if (spell.effect === 'recall') {
    addCombatLog(
      combatState,
      `${hero.name} casts ${spell.name} (-${spell.mpCost} MP)! A swirling portal warps the party safely out of battle to Oakhaven!`,
      'victory'
    );
    combatState.recalledToTown = true;
    combatState.phase = 'fled';
  }
}

export function resolveCombatRound(combatState, state, gameData) {
  if (!combatState || combatState.phase !== 'input') return;
  const itemsById = gameData?.itemsById || {};
  const spellsById = gameData?.spellsById || {};

  addCombatLog(combatState, `--- Round ${combatState.round} Resolution ---`, 'warn');

  const actions = [];

  // 1. Gather Hero Actions & Roll Initiative (DEX + d10)
  for (const entry of state.party) {
    const hero = state.roster.find(c => c.id === entry.charId);
    if (!isHeroAlive(hero)) continue;

    const effStats = getEffectiveStats(hero, itemsById);
    const queued = combatState.queuedActions[hero.id] || {
      type: canHeroActInCombat(hero) ? 'defend' : 'incapacitated'
    };
    const initiative = effStats.dex + rollDie(10);

    actions.push({
      actorType: 'hero',
      heroId: hero.id,
      actionType: queued.type,
      targetGroupId: queued.targetGroupId || null,
      itemId: queued.itemId || null,
      spellId: queued.spellId || null,
      targetHeroId: queued.targetHeroId || null,
      initiative,
      dexTiebreak: effStats.dex
    });
  }

  // 2. Gather Monster Actions (unless surprised in Round 1)
  if (combatState.surprise === 'party' && combatState.round === 1) {
    addCombatLog(combatState, 'The surprised monsters are still reeling and lose their turn!', 'victory');
  } else {
    for (const group of getLivingEnemyGroups(combatState)) {
      for (const unit of getLivingUnitsInGroup(group)) {
        const initiative = group.dex + rollDie(10);
        actions.push({
          actorType: 'monster',
          groupId: group.id,
          unitId: unit.id,
          initiative,
          dexTiebreak: group.dex
        });
      }
    }
  }

  // Sort by initiative descending (tie-break by DEX)
  actions.sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    return b.dexTiebreak - a.dexTiebreak;
  });

  // Track which heroes are defending this round
  const defendingHeroIds = new Set(
    Object.entries(combatState.queuedActions)
      .filter(([, act]) => act && act.type === 'defend')
      .map(([id]) => id)
  );

  const partyHitBuff = combatState.partyBuffs?.hitBonus || 0;
  const partyAcBuff = combatState.partyBuffs?.acBonus || 0;

  // 3. Resolve Actions One by One
  for (const item of actions) {
    if (combatState.phase !== 'input') break;
    if (getLivingEnemyGroups(combatState).length === 0) break;

    const partySnapshots = state.party
      .map(p => {
        const h = state.roster.find(c => c.id === p.charId);
        return h ? { ...h, row: p.row } : null;
      })
      .filter(Boolean);

    if (!partySnapshots.some(isHeroAlive)) break;

    if (item.actorType === 'hero') {
      const hero = state.roster.find(c => c.id === item.heroId);
      if (!isHeroAlive(hero)) continue;

      if (hero.status === 'Sleep' || hero.status === 'Paralysis') {
        addCombatLog(
          combatState,
          `${hero.name} is ${hero.status === 'Sleep' ? 'fast asleep' : 'paralyzed'} and cannot act!`,
          'warn'
        );
        continue;
      }

      const partyEntry = state.party.find(p => p.charId === hero.id);
      const effectiveRow = getEffectiveHeroRow(
        { ...hero, row: partyEntry?.row || 'back' },
        partySnapshots
      );

      if (item.actionType === 'defend') {
        addCombatLog(
          combatState,
          `${hero.name} braces in a defensive stance (+2 AC, halves damage).`,
          'info'
        );
        continue;
      }

      if (item.actionType === 'cast') {
        const spell = spellsById[item.spellId];
        resolveHeroSpellCast({
          combatState,
          state,
          hero,
          spell,
          targetGroupId: item.targetGroupId,
          targetHeroId: item.targetHeroId,
          itemsById
        });
        if (combatState.phase === 'fled') {
          clearCombatTemporaryStatuses(state);
          return;
        }
        continue;
      }

      if (item.actionType === 'use_item') {
        const targetHero =
          state.roster.find(c => c.id === item.targetHeroId) || hero;
        const result = useConsumableOnHero(state, item.itemId, targetHero, itemsById);
        if (result.ok) {
          addCombatLog(
            combatState,
            `${hero.name} uses an item: ${result.log}`,
            'victory'
          );
        } else {
          addCombatLog(
            combatState,
            `${hero.name} reaches for an item, but ${result.log}`,
            'warn'
          );
        }
        continue;
      }

      if (item.actionType === 'run') {
        const livingHeroes = partySnapshots.filter(isHeroAlive);
        const partyAvgDex =
          livingHeroes.reduce((s, h) => s + getEffectiveStats(h, itemsById).dex, 0) /
          Math.max(1, livingHeroes.length);
        const livingGroups = getLivingEnemyGroups(combatState);
        const enemyAvgDex =
          livingGroups.reduce((s, g) => s + g.dex, 0) /
          Math.max(1, livingGroups.length);

        const runChance = clamp(Math.round(52 + (partyAvgDex - enemyAvgDex) * 4), 25, 90);
        const roll = rollDie(100);
        if (roll <= runChance) {
          addCombatLog(
            combatState,
            `${hero.name} spots an opening and leads the party to safety! (Escaped)`,
            'victory'
          );
          clearCombatTemporaryStatuses(state);
          combatState.phase = 'fled';
          return;
        } else {
          addCombatLog(
            combatState,
            `${hero.name} tries to lead a retreat, but the enemy cuts off escape!`,
            'warn'
          );
          continue;
        }
      }

      if (item.actionType === 'attack') {
        const profile = getHeroAttackProfile(hero, effectiveRow, itemsById);
        if (!profile.canAttack) {
          addCombatLog(
            combatState,
            `${hero.name} is in the Back Row without a ranged or reach weapon and cannot reach the enemy!`,
            'warn'
          );
          continue;
        }

        let targetGroup = combatState.groups.find(g => g.id === item.targetGroupId);
        if (!targetGroup || getLivingUnitsInGroup(targetGroup).length === 0) {
          targetGroup = getLivingEnemyGroups(combatState)[0];
        }
        if (!targetGroup) break;

        const livingUnits = getLivingUnitsInGroup(targetGroup);
        const targetUnit = livingUnits[0];
        const effStats = getEffectiveStats(hero, itemsById);

        const hitChance = clamp(
          68 +
            effStats.dex +
            (hero.level || 1) * 2 +
            ((profile.hitBonus || 0) + partyHitBuff) * 4 -
            targetGroup.ac * 2,
          5,
          95
        );
        const roll = rollDie(100);

        if (roll <= hitChance) {
          const statMod = getStatMod(effStats[profile.statKey] || 10);
          const dmg = Math.max(1, dice.roll(profile.dice) + statMod);
          if (targetUnit.status === 'Sleep') {
            targetUnit.status = 'OK';
            targetUnit.statusDuration = 0;
          }
          targetUnit.hp = Math.max(0, targetUnit.hp - dmg);

          if (targetUnit.hp <= 0) {
            targetUnit.alive = false;
            targetUnit.status = 'Dead';
            addCombatLog(
              combatState,
              `${hero.name} strikes ${targetUnit.name} with ${profile.weaponName} for ${dmg} dmg — slain!`,
              'hit'
            );
          } else {
            addCombatLog(
              combatState,
              `${hero.name} strikes ${targetUnit.name} with ${profile.weaponName} for ${dmg} dmg (${targetUnit.hp}/${targetUnit.maxHp} HP).`,
              'hit'
            );
          }
        } else {
          addCombatLog(
            combatState,
            `${hero.name} attacks ${targetUnit.name} with ${profile.weaponName}, but misses.`,
            'info'
          );
        }
      }
    } else if (item.actorType === 'monster') {
      const group = combatState.groups.find(g => g.id === item.groupId);
      const unit = group?.units.find(u => u.id === item.unitId);
      if (!group || !unit || !unit.alive || unit.hp <= 0) continue;

      if (unit.status === 'Sleep' || unit.status === 'Paralysis') {
        addCombatLog(
          combatState,
          `${unit.name} is ${unit.status === 'Sleep' ? 'asleep' : 'paralyzed'} and skips its turn!`,
          'info'
        );
        continue;
      }

      const livingTargets = state.party
        .map(p => {
          const hero = state.roster.find(c => c.id === p.charId);
          if (!isHeroAlive(hero)) return null;
          return {
            hero,
            effectiveRow: getEffectiveHeroRow({ ...hero, row: p.row }, partySnapshots)
          };
        })
        .filter(Boolean);

      if (livingTargets.length === 0) break;

      const chosen = chooseTargetHeroForMonster(livingTargets);
      const targetHero = chosen.hero;
      const isDefending = defendingHeroIds.has(targetHero.id);
      const effectiveAc =
        (targetHero.derived?.ac || 10) +
        (combatState.partyBuffs?.acBonus || 0) +
        (isDefending ? 2 : 0);

      // Check if monster uses its special attack / spell
      const spec = group.specialAttack;
      const canUseSpec =
        spec &&
        (!spec.isSpell || unit.status !== 'Silence') &&
        Math.random() < (spec.chance || 0.25);

      const attackName = canUseSpec ? spec.name : group.attackName;
      const attackDice = canUseSpec && spec.damageDice ? spec.damageDice : group.damageDice;

      const hitChance = clamp(56 + group.dex - effectiveAc * 2, 5, 95);
      const roll = rollDie(100);

      if (roll <= hitChance) {
        let dmg = Math.max(1, dice.roll(attackDice));
        if (isDefending) {
          dmg = Math.max(1, Math.floor(dmg / 2));
        }

        const wokeFromHit = targetHero.status === 'Sleep';
        if (wokeFromHit) {
          targetHero.status = 'OK';
          delete targetHero.statusDuration;
        }

        targetHero.derived.hp = Math.max(0, targetHero.derived.hp - dmg);
        const defendTag = isDefending ? ' [guarded]' : '';

        if (targetHero.derived.hp <= 0) {
          targetHero.status = 'Dead';
          delete targetHero.statusDuration;
          addCombatLog(
            combatState,
            `${unit.name} hits ${targetHero.name} with ${attackName} for ${dmg} dmg${defendTag} — ${targetHero.name} falls!`,
            'enemy'
          );
        } else {
          let statusTag = wokeFromHit ? ' [woke up!]' : '';
          if (
            canUseSpec &&
            spec.status &&
            targetHero.status === 'OK' &&
            Math.random() < (spec.statusChance || 0.5)
          ) {
            targetHero.status = spec.status;
            if (spec.status !== 'Poison') {
              targetHero.statusDuration = 2;
            }
            statusTag = ` [${targetHero.name} is afflicted with ${spec.status}!]`;
          }
          addCombatLog(
            combatState,
            `${unit.name} hits ${targetHero.name} with ${attackName} for ${dmg} dmg${defendTag}${statusTag} (${targetHero.derived.hp}/${targetHero.derived.maxHp} HP).`,
            'enemy'
          );
        }
      } else {
        addCombatLog(
          combatState,
          `${unit.name} attacks ${targetHero.name} with ${attackName}, but misses.`,
          'info'
        );
      }
    }
  }

  // 4. End of Round Check
  const remainingGroups = getLivingEnemyGroups(combatState);
  let survivingHeroes = state.party
    .map(p => state.roster.find(c => c.id === p.charId))
    .filter(isHeroAlive);

  if (remainingGroups.length === 0) {
    clearCombatTemporaryStatuses(state);
    combatState.phase = 'victory';
    if (combatState.onVictoryFlag) {
      if (!state.flags) state.flags = {};
      state.flags[combatState.onVictoryFlag] = true;
    }

    let xpTotal = 0;
    let goldTotal = 0;
    const dropCounts = new Map();

    if (Array.isArray(combatState.bonusLoot)) {
      for (const itemId of combatState.bonusLoot) {
        if (itemId && itemsById[itemId]) {
          dropCounts.set(itemId, (dropCounts.get(itemId) || 0) + 1);
        }
      }
    }

    for (const grp of combatState.groups) {
      for (const u of grp.units) {
        xpTotal += grp.xpEach;
        goldTotal += u.goldRoll;
        if (Array.isArray(grp.drops)) {
          for (const drop of grp.drops) {
            if (drop.itemId && itemsById[drop.itemId] && Math.random() < (drop.chance || 0.1)) {
              dropCounts.set(drop.itemId, (dropCounts.get(drop.itemId) || 0) + 1);
            }
          }
        }
      }
    }

    const lootDrops = [];
    for (const [itemId, qty] of dropCounts.entries()) {
      addItemToPack(state, itemId, qty);
      lootDrops.push({
        itemId,
        name: itemsById[itemId]?.name || itemId,
        qty
      });
    }

    const survivorCount = Math.max(1, survivingHeroes.length);
    const xpEach = Math.max(1, Math.floor(xpTotal / survivorCount));
    state.gold = (state.gold || 0) + goldTotal;

    const allLevelUps = [];
    for (const hero of survivingHeroes) {
      const ups = applyXpAndLevelUp(
        hero,
        xpEach,
        gameData?.racesById || {},
        gameData?.classesById || {},
        itemsById
      );
      allLevelUps.push(...ups);
    }

    combatState.rewards = {
      xpTotal,
      xpEach,
      goldTotal,
      survivorCount: survivingHeroes.length,
      levelUps: allLevelUps,
      lootDrops
    };

    const dropSuffix =
      lootDrops.length > 0
        ? ` Looted: ${lootDrops.map(d => `${d.name}${d.qty > 1 ? ` x${d.qty}` : ''}`).join(', ')}!`
        : '';

    addCombatLog(
      combatState,
      `Victory! All enemies defeated. Earned ${xpTotal} XP (${xpEach} XP per surviving hero) and ${goldTotal} GP!${dropSuffix}`,
      'victory'
    );

    for (const up of allLevelUps) {
      const statNote = up.statBump ? `, +1 ${up.statBump}` : '';
      const mpNote = up.mpGain > 0 ? `, +${up.mpGain} MP` : '';
      addCombatLog(
        combatState,
        `LEVEL UP! ${up.charName} reached Level ${up.newLevel} (+${up.hpGain} HP${mpNote}${statNote})!`,
        'victory'
      );
    }
    return;
  }

  // 5. End-of-Round Status Ticks (Poison damage & temporary duration countdowns)
  for (const entry of state.party) {
    const hero = state.roster.find(c => c.id === entry.charId);
    if (!isHeroAlive(hero)) continue;

    if (hero.status === 'Poison') {
      const pDmg = dice.roll('1d2');
      hero.derived.hp = Math.max(0, hero.derived.hp - pDmg);
      if (hero.derived.hp <= 0) {
        hero.status = 'Dead';
        delete hero.statusDuration;
        addCombatLog(
          combatState,
          `[Poison] ${hero.name} suffers ${pDmg} poison damage and collapses!`,
          'enemy'
        );
      } else {
        addCombatLog(
          combatState,
          `[Poison] ${hero.name} suffers ${pDmg} poison damage (${hero.derived.hp}/${hero.derived.maxHp} HP).`,
          'enemy'
        );
      }
    } else if (
      hero.status === 'Sleep' ||
      hero.status === 'Paralysis' ||
      hero.status === 'Silence'
    ) {
      hero.statusDuration = (hero.statusDuration ?? 1) - 1;
      if (hero.statusDuration <= 0) {
        const recovered = hero.status;
        hero.status = 'OK';
        delete hero.statusDuration;
        addCombatLog(
          combatState,
          `${hero.name} shakes off ${recovered} and recovers!`,
          'victory'
        );
      }
    }
  }

  for (const grp of remainingGroups) {
    for (const unit of getLivingUnitsInGroup(grp)) {
      if (unit.status && unit.status !== 'OK' && unit.statusDuration > 0) {
        unit.statusDuration -= 1;
        if (unit.statusDuration <= 0) {
          const old = unit.status;
          unit.status = 'OK';
          addCombatLog(combatState, `${unit.name} recovers from ${old}.`, 'info');
        }
      }
    }
  }

  survivingHeroes = state.party
    .map(p => state.roster.find(c => c.id === p.charId))
    .filter(isHeroAlive);

  if (survivingHeroes.length === 0) {
    clearCombatTemporaryStatuses(state);
    combatState.phase = 'defeat';
    addCombatLog(combatState, 'Your party has been defeated!', 'enemy');
    return;
  }

  // Otherwise advance to next round Input Phase
  combatState.round += 1;
  combatState.surprise = 'none';
  combatState.queuedActions = {};
  combatState.activeHeroIndex = 0;
  combatState.selectingTarget = false;
  combatState.selectingItem = false;
  combatState.selectedCombatItemId = null;
  combatState.selectingSpell = false;
  combatState.selectedCombatSpellId = null;
}
