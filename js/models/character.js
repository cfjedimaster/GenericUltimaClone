export const STAT_KEYS = ['str', 'dex', 'int', 'wis'];
export const EQUIPMENT_SLOTS = ['weapon', 'armor', 'accessory'];
export const BONUS_POINT_POOL = 10;

export const STARTER_EQUIPMENT_BY_CLASS = {
  fighter: { weapon: 'short_sword', armor: 'leather_jerkin', accessory: null },
  paladin: { weapon: 'iron_mace', armor: 'leather_jerkin', accessory: null },
  thief: { weapon: 'throwing_dagger', armor: 'leather_jerkin', accessory: null },
  ranger: { weapon: 'shortbow', armor: 'leather_jerkin', accessory: null },
  cleric: { weapon: 'leather_sling', armor: 'cloth_vestments', accessory: null },
  wizard: { weapon: 'apprentice_staff', armor: 'mage_robe', accessory: null }
};

const FANTASY_NAMES = [
  'Shamino', 'Iolo', 'Dupre', 'Jaana', 'Katrina', 'Gwenno', 'Julia', 'Mariah',
  'Geoffrey', 'Sentri', 'Tseramed', 'Spark', 'Beregorn', 'Tharion', 'Vaelen',
  'Brynja', 'Kaelen', 'Mordecai', 'Rowena', 'Torunn', 'Alaric', 'Pippin',
  'Finbar', 'Syllva', 'Durnik', 'Polgara', 'Silk', 'Garion', 'Belgarath'
];

export function randomFantasyName(existingNames = []) {
  const used = new Set(existingNames.map(n => n.toLowerCase()));
  const available = FANTASY_NAMES.filter(n => !used.has(n.toLowerCase()));
  const pool = available.length > 0 ? available : FANTASY_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getStatMod(val) {
  return Math.floor((val - 10) / 2);
}

export function getXpForNextLevel(level) {
  const safeLevel = Math.max(1, level || 1);
  // Lv 1 -> 2 = 100 XP, Lv 2 -> 3 = 300 XP, Lv 3 -> 4 = 600 XP, Lv 4 -> 5 = 1000 XP
  return 50 * safeLevel * (safeLevel + 1);
}

export function getStarterEquipmentForClass(classId) {
  const kit = STARTER_EQUIPMENT_BY_CLASS[classId] || {
    weapon: null,
    armor: null,
    accessory: null
  };
  return {
    weapon: kit.weapon || null,
    armor: kit.armor || null,
    accessory: kit.accessory || null
  };
}

export function getEquipmentBonuses(equipment = {}, itemsById = {}) {
  const totals = {
    str: 0,
    dex: 0,
    int: 0,
    wis: 0,
    ac: 0,
    maxHp: 0,
    maxMp: 0
  };
  if (!equipment || typeof equipment !== 'object') return totals;

  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = equipment[slot];
    if (!itemId) continue;
    const itemDef = typeof itemId === 'object' ? itemId : itemsById[itemId];
    if (!itemDef) continue;

    if (typeof itemDef.acBonus === 'number') {
      totals.ac += itemDef.acBonus;
    }
    if (itemDef.bonuses && typeof itemDef.bonuses === 'object') {
      for (const k of STAT_KEYS) {
        if (typeof itemDef.bonuses[k] === 'number') {
          totals[k] += itemDef.bonuses[k];
        }
      }
      if (typeof itemDef.bonuses.ac === 'number') {
        totals.ac += itemDef.bonuses.ac;
      }
      if (typeof itemDef.bonuses.maxHp === 'number') {
        totals.maxHp += itemDef.bonuses.maxHp;
      }
      if (typeof itemDef.bonuses.maxMp === 'number') {
        totals.maxMp += itemDef.bonuses.maxMp;
      }
    }
  }
  return totals;
}

export function getEffectiveStats(char, itemsById = {}) {
  const base = char?.stats || { str: 10, dex: 10, int: 10, wis: 10 };
  const bonuses = getEquipmentBonuses(char?.equipment, itemsById);
  return {
    str: (base.str || 10) + bonuses.str,
    dex: (base.dex || 10) + bonuses.dex,
    int: (base.int || 10) + bonuses.int,
    wis: (base.wis || 10) + bonuses.wis
  };
}

export function computeDerivedStats(
  stats,
  raceDef,
  classDef,
  level = 1,
  equipment = null,
  itemsById = {}
) {
  const eqBonuses = getEquipmentBonuses(equipment, itemsById);
  const effStr = (stats.str || 10) + eqBonuses.str;
  const effDex = (stats.dex || 10) + eqBonuses.dex;
  const effInt = (stats.int || 10) + eqBonuses.int;
  const effWis = (stats.wis || 10) + eqBonuses.wis;

  const strMod = getStatMod(effStr);
  const dexMod = getStatMod(effDex);

  const levelOneHp = Math.max(4, classDef.baseHp + strMod + (raceDef.bonuses?.hp || 0));
  const extraLevelsHp = (level - 1) * Math.max(2, classDef.hpPerLevel + strMod);
  const maxHp = Math.max(1, levelOneHp + extraLevelsHp + eqBonuses.maxHp);

  let maxMp = 0;
  if (classDef.magicSchool === 'arcane') {
    maxMp = Math.max(1, Math.floor(effInt * classDef.mpRate) + (level - 1) * 3 + eqBonuses.maxMp);
  } else if (classDef.magicSchool === 'divine') {
    const baseCasting = Math.floor(effWis * classDef.mpRate);
    const perLevel = classDef.mpRate < 1 ? 2 : 3;
    maxMp = Math.max(
      classDef.mpRate < 1 ? 0 : 1,
      baseCasting + (level - 1) * perLevel + eqBonuses.maxMp
    );
  }

  const ac = 10 + dexMod + (raceDef.bonuses?.ac || 0) + eqBonuses.ac;

  return {
    hp: maxHp,
    maxHp,
    mp: maxMp,
    maxMp,
    ac,
    initiativeMod: dexMod
  };
}

export function syncCharacterDerivedStats(
  char,
  racesById = {},
  classesById = {},
  itemsById = {},
  { fillVitals = false } = {}
) {
  if (!char) return char;

  // Normalize 3-slot equipment and backfill starter kit for pre-Step-4 characters
  const rawEq = char.equipment && typeof char.equipment === 'object' ? char.equipment : {};
  char.equipment = {
    weapon: typeof rawEq.weapon === 'string' && itemsById[rawEq.weapon] ? rawEq.weapon : (typeof rawEq.weapon === 'string' ? rawEq.weapon : null),
    armor: typeof rawEq.armor === 'string' && itemsById[rawEq.armor] ? rawEq.armor : (typeof rawEq.armor === 'string' ? rawEq.armor : null),
    accessory: typeof rawEq.accessory === 'string' && itemsById[rawEq.accessory] ? rawEq.accessory : (typeof rawEq.accessory === 'string' ? rawEq.accessory : null)
  };

  if (!char.starterKitGranted) {
    if (!char.equipment.weapon && !char.equipment.armor) {
      const starter = getStarterEquipmentForClass(char.class);
      char.equipment.weapon = starter.weapon;
      char.equipment.armor = starter.armor;
      char.equipment.accessory = starter.accessory;
    }
    char.starterKitGranted = true;
  }

  const raceDef = racesById[char.race];
  const classDef = classesById[char.class];
  if (!raceDef || !classDef) return char;

  const computed = computeDerivedStats(
    char.stats,
    raceDef,
    classDef,
    char.level || 1,
    char.equipment,
    itemsById
  );

  const prevHp = char.derived?.hp ?? computed.maxHp;
  const prevMp = char.derived?.mp ?? computed.maxMp;

  char.derived = {
    hp: fillVitals
      ? computed.maxHp
      : char.status === 'Dead' || char.status === 'Ashes'
        ? 0
        : Math.max(1, Math.min(computed.maxHp, prevHp)),
    maxHp: computed.maxHp,
    mp: fillVitals ? computed.maxMp : Math.max(0, Math.min(computed.maxMp, prevMp)),
    maxMp: computed.maxMp,
    ac: computed.ac,
    initiativeMod: computed.initiativeMod
  };

  return char;
}

export function applyXpAndLevelUp(char, xpGained, racesById = {}, classesById = {}, itemsById = {}) {
  if (!char || xpGained <= 0) return [];
  char.xp = (char.xp || 0) + xpGained;

  const raceDef = racesById[char.race];
  const classDef = classesById[char.class];
  if (!raceDef || !classDef) return [];

  const priorities = {
    fighter: ['str', 'dex', 'wis', 'int'],
    paladin: ['str', 'wis', 'dex', 'int'],
    thief: ['dex', 'str', 'int', 'wis'],
    ranger: ['dex', 'wis', 'str', 'int'],
    cleric: ['wis', 'str', 'dex', 'int'],
    wizard: ['int', 'dex', 'wis', 'str']
  }[char.class] || STAT_KEYS;

  const levelUps = [];

  while (char.level < 20 && char.xp >= getXpForNextLevel(char.level)) {
    const oldMaxHp = char.derived?.maxHp || 1;
    const oldMaxMp = char.derived?.maxMp || 0;

    char.level += 1;

    let bumpedStat = null;
    if (char.level % 2 === 0) {
      for (const key of priorities) {
        if (char.stats[key] < raceDef.maxStats[key]) {
          char.stats[key] += 1;
          bumpedStat = key.toUpperCase();
          break;
        }
      }
    }

    const nextDerived = computeDerivedStats(
      char.stats,
      raceDef,
      classDef,
      char.level,
      char.equipment,
      itemsById
    );
    const hpGain = Math.max(1, nextDerived.maxHp - oldMaxHp);
    const mpGain = Math.max(0, nextDerived.maxMp - oldMaxMp);

    char.derived.maxHp = nextDerived.maxHp;
    char.derived.hp = Math.min(nextDerived.maxHp, (char.derived.hp || 0) + hpGain);
    char.derived.maxMp = nextDerived.maxMp;
    char.derived.mp = Math.min(nextDerived.maxMp, (char.derived.mp || 0) + mpGain);
    char.derived.ac = nextDerived.ac;
    char.derived.initiativeMod = nextDerived.initiativeMod;
    delete char.derived.carryLimit;

    levelUps.push({
      charId: char.id,
      charName: char.name,
      newLevel: char.level,
      hpGain,
      mpGain,
      statBump: bumpedStat
    });
  }

  return levelUps;
}

export function isComboValid(raceDef, classDef) {
  if (!raceDef || !classDef) return false;
  if (classDef.invalidRaces && classDef.invalidRaces.includes(raceDef.id)) {
    return false;
  }
  let requiredPoints = 0;
  for (const key of STAT_KEYS) {
    const minReq = classDef.minStats[key] || 0;
    if (minReq > raceDef.maxStats[key]) return false;
    if (minReq > raceDef.baseStats[key]) {
      requiredPoints += (minReq - raceDef.baseStats[key]);
    }
  }
  return requiredPoints <= BONUS_POINT_POOL;
}

export function validateCharacterDraft({ name, raceDef, classDef, allocatedPoints }) {
  const errors = [];
  if (!name || !name.trim()) {
    errors.push('Character must have a name.');
  }
  if (!raceDef || !classDef) {
    errors.push('Race and Class must be selected.');
    return { valid: false, errors };
  }
  if (!isComboValid(raceDef, classDef)) {
    errors.push(`${raceDef.name} cannot become a ${classDef.name}.`);
  }

  let totalSpent = 0;
  for (const key of STAT_KEYS) {
    const spent = allocatedPoints[key] || 0;
    if (spent < 0) errors.push(`${key.toUpperCase()} allocation cannot be negative.`);
    totalSpent += spent;
    const finalVal = raceDef.baseStats[key] + spent;
    if (finalVal > raceDef.maxStats[key]) {
      errors.push(`${key.toUpperCase()} exceeds ${raceDef.name} maximum (${raceDef.maxStats[key]}).`);
    }
    if (finalVal < classDef.minStats[key]) {
      errors.push(`${classDef.name} requires at least ${classDef.minStats[key]} ${key.toUpperCase()}.`);
    }
  }

  if (totalSpent !== BONUS_POINT_POOL) {
    errors.push(`You must spend all ${BONUS_POINT_POOL} bonus points (${BONUS_POINT_POOL - totalSpent} remaining).`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function createCharacter({ name, raceDef, classDef, stats, itemsById = {} }) {
  const equipment = getStarterEquipmentForClass(classDef.id);
  const derived = computeDerivedStats(stats, raceDef, classDef, 1, equipment, itemsById);
  return {
    id: `chr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim().slice(0, 16),
    race: raceDef.id,
    raceName: raceDef.name,
    class: classDef.id,
    className: classDef.name,
    preferredRow: classDef.preferredRow || 'front',
    level: 1,
    xp: 0,
    stats: { ...stats },
    derived,
    equipment,
    starterKitGranted: true,
    status: 'OK'
  };
}

export function generateDefaultParty(gameData, existingNames = []) {
  const archetypes = [
    { race: 'dwarf', class: 'fighter', row: 'front' },
    { race: 'human', class: 'paladin', row: 'front' },
    { race: 'halfling', class: 'thief', row: 'back' },
    { race: 'human', class: 'cleric', row: 'back' },
    { race: 'elf', class: 'wizard', row: 'back' },
    { race: 'elf', class: 'ranger', row: 'back' }
  ];

  const usedNames = [...existingNames];
  const created = [];

  for (const arch of archetypes) {
    const raceDef = gameData.racesById[arch.race];
    const classDef = gameData.classesById[arch.class];
    const stats = { ...raceDef.baseStats };
    let remaining = BONUS_POINT_POOL;

    // 1. Meet class minimums first
    for (const key of STAT_KEYS) {
      if (stats[key] < classDef.minStats[key]) {
        const diff = classDef.minStats[key] - stats[key];
        stats[key] += diff;
        remaining -= diff;
      }
    }

    // 2. Prioritize class primary stats
    const priorities = {
      fighter: ['str', 'dex', 'wis', 'int'],
      paladin: ['str', 'wis', 'dex', 'int'],
      thief: ['dex', 'str', 'int', 'wis'],
      ranger: ['dex', 'wis', 'str', 'int'],
      cleric: ['wis', 'str', 'dex', 'int'],
      wizard: ['int', 'dex', 'wis', 'str']
    }[arch.class];

    let safety = 0;
    while (remaining > 0 && safety < 50) {
      safety++;
      for (const statKey of priorities) {
        if (remaining <= 0) break;
        if (stats[statKey] < raceDef.maxStats[statKey]) {
          stats[statKey] += 1;
          remaining -= 1;
        }
      }
    }

    const name = randomFantasyName(usedNames);
    usedNames.push(name);
    created.push(
      createCharacter({
        name,
        raceDef,
        classDef,
        stats,
        itemsById: gameData.itemsById || {}
      })
    );
  }

  return created;
}
