# Ultima III–Style RPG: Design Plan

A classic party-based RPG with an Ultima III structure (roster, overworld, towns, dungeons) and Bard's Tale / Wasteland style menu-driven combat. No food system. No positional combat grid.

## 1. Scope and Decisions

**In scope**

- Roster and party creation
- Three play modes: overworld, town, dungeon
- Menu-driven, round-based combat against enemy groups
- Single-pool MP magic (arcane and divine)
- Shops, inns, temples, leveling, save/load

**Explicitly out**

- Food and step-based hunger
- Tactical battle maps, movement, and line of sight in combat
- Vancian spell slots
- Day/night cycle (can be added later)

**Simplifications adopted**

- 4 stats
- Small class list (6 to start)
- One MP pool per character
- Small status effect set
- Front/back rows as the only positioning mechanic

## 2. Party Creation

**Model:** create a roster of characters (up to 20), then choose an active party of 4 to 6.

**Character fields**

- Name
- Race
- Class
- Stats: STR, DEX, INT, WIS
- Derived: HP, MP, AC, level, XP
- Equipment slots: weapon, armor, shield, accessory
- Status

**Races (4 to start)**

| Race | Stat leaning | Notes |
| --- | --- | --- |
| Human | Balanced | Highest stat caps overall |
| Elf | DEX, INT | Lower STR cap |
| Dwarf | STR, WIS | Lower DEX cap |
| Halfling | DEX, WIS | Small HP bonus to dodge, lower STR cap |

**Classes (6 to start)**

| Class | Role | Weapons/Armor | Magic |
| --- | --- | --- | --- |
| Fighter | Front-line damage | All weapons, heavy armor | None |
| Paladin | Tank/support | Most weapons, heavy armor | Divine (slow) |
| Thief | Utility/damage | Light weapons, light armor | None; traps, locks, steal |
| Ranger | Ranged damage | Bows, medium armor | Divine (slow) |
| Cleric | Healer | Blunt weapons, medium armor | Divine |
| Wizard | Caster | Staves/daggers, robes | Arcane |

**Stat model**

- STR: melee damage, carry limit
- DEX: hit chance, dodge, initiative
- INT: arcane MP and spell power
- WIS: divine MP and spell power

**Creation flow**

1. Pick race, then class (invalid combos disabled or flagged)
2. Allocate a fixed point pool across 4 stats within race/class min and max
3. Name the character, confirm, add to roster
4. From the roster screen: add/remove from active party, delete, rename

## 3. UI and Play Modes

| Mode | View | Movement | Purpose |
| --- | --- | --- | --- |
| Overworld | Top-down tile map | One tile per move | Travel, find towns and dungeons, random encounters |
| Town | Top-down tile map (small) | One tile per move | Shops, NPCs, inn, temple, guild |
| Dungeon | First-person grid view | Step forward/back, turn 90° | Exploration, traps, combat, loot |

**Persistent HUD**

- Party panel: name, class, HP, MP, status
- Shared gold
- Scrolling message log
- Command prompt with single-key commands: Attack, Cast, Use, Enter, Talk, Open, Search, Wait, Camp

**Resource pressure without food**

- HP and MP attrition between safe points
- Distance from town/inn
- Limited healing consumables
- Dungeon difficulty scaling with depth

**Town services**

- Shop (weapons, armor, consumables)
- Inn (rest: restore HP/MP, save)
- Temple (cure status, resurrect)
- Guild (optional: level up, change party)

## 4. Combat (Bard's Tale / Wasteland Style)

**Structure:** menu-driven rounds. Declare actions, then resolve in initiative order.

**Encounter flow**

1. Trigger: random roll while moving, or contact with a visible monster
2. Surprise check (DEX based; can grant a free round to either side)
3. **Input phase:** choose an action for each party member
4. **Resolution phase:** all actions sorted by initiative and resolved one at a time
5. Combat log reports results; repeat until one side is defeated or the party flees
6. Rewards: XP, gold, item drops

**Party actions**

- Attack (choose an enemy group)
- Cast (spell, target)
- Use item
- Defend (damage reduction this round)
- Hide / Steal (Thief)
- Run (party-wide, chance based on DEX)

**Enemies**

- Presented as groups with counts, e.g. "3 Goblins, 2 Archers"
- Each group acts as a unit type with shared stats; individual HP tracked per monster
- Enemy AI: pick action from a small weighted list (attack, special, cast, flee)

**Rows**

- Front row (2 slots): can melee, targeted most often by melee enemies
- Back row (2 to 4 slots): can cast and use ranged weapons, targeted less often, cannot melee without reach weapons

**Formulas (starting values, tune in playtest)**

- Hit chance = base + attacker DEX/level − target AC, clamped 5 to 95%
- Melee damage = weapon dice + STR modifier
- Spell damage/heal = spell dice + INT or WIS modifier
- Initiative = DEX + d10

**Status effects**

- Poison (HP loss per round/step)
- Sleep (skips actions until hit or timeout)
- Paralysis (cannot act)
- Silence (cannot cast)
- Dead (revive at temple)
- Ashes (requires high-tier resurrection; difficulty lever)

## 5. Magic

- **Schools:** Arcane (damage, control, utility) and Divine (heal, buff, cure)
- **Cost:** single MP pool per character
- **Tiers:** unlock by level (roughly one new tier every 2 levels)
- **Field spells:** Light, Heal, Detect, Open, Recall (teleport to town)
- **Hybrids** (Paladin, Ranger): slower MP growth and later tier access

## 6. Progression

- XP is split among surviving party members
- Level-up either automatic after combat (Wasteland style) or at the guild (Ultima style). **Decision needed.**
- Per level: HP and MP gains by class, occasional stat bump
- Gear gated by class and by stat requirements
- Death: revive at temple for a gold cost; Ashes tier optional

## 7. Data Model (for build tooling)

Data-driven definitions so content can be edited without code changes:

- `races`: stat modifiers, min/max caps
- `classes`: allowed gear, HP/MP growth, spell school, skills
- `spells`: school, tier, MP cost, target type, effect, dice
- `items`: type, slot, class restrictions, stats, price
- `monsters`: group name, HP, AC, attacks, special actions, XP, gold, drops
- `encounters`: tables by overworld region and dungeon depth
- `maps`: overworld, towns, dungeon floors (tile grids plus entities and triggers)
- `save`: roster, active party, gold, location, flags

## 8. Build Order

1. **Foundation:** data loading, save/load, roster and party creation screens
2. **Overworld:** tile map, movement, enter/exit towns and dungeons
3. **HUD:** party panel, message log, command prompt
4. **Combat v1:** one enemy group, attack/defend/run, XP and gold rewards
5. **Town services:** shop, inn, temple
6. **Items and equipment:** inventory, equip rules, class restrictions
7. **Magic and status effects**
8. **Dungeon mode:** first-person grid, doors, traps, stairs
9. **Content pass:** encounter tables, loot, monster roster, level curve
10. **Balance and polish:** formula tuning, difficulty options, playtesting

## 9. Milestones

| Milestone | Definition of done |
| --- | --- |
| M1: Playable skeleton | Create a party, walk the overworld, enter one town |
| M2: First fight | Random encounter triggers combat with rewards and level-up |
| M3: Full town loop | Buy gear, heal at inn, resurrect at temple, save/load |
| M4: Magic | Both schools usable in and out of combat |
| M5: First dungeon | First-person floor with stairs, loot, and a boss group |
| M6: Vertical slice | One region, one town, one dungeon, full loop balanced |

## 10. Open Questions

- Party size: 4 fixed, or up to 6?
- Level-up: automatic or at a guild?
- Permadeath or Ashes: on, off, or a difficulty setting?
- Dungeon view: true first-person 3D, or pseudo-3D wireframe?
- Does the target tool/engine impose constraints on rendering, input, or data format?
