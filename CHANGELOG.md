# Changelog

All notable changes to this project are documented in this file.

## [0.1.0] - 2026-11-03

### Added

- **Design Plan (`Ultima III–Style RPG Design Plan.md`)**:
  - Defined core scope, 4-stat character model (`STR`, `DEX`, `INT`, `WIS`), 4 races, 6 classes, front/back row mechanics, combat formulas, and milestone roadmap.
- **Data-Driven Architecture (`data/*.json` & `js/data-loader.js`)**:
  - Created JSON data definitions for races (`races.json`), classes (`classes.json`), equipment and consumables (`items.json`), arcane/divine spells (`spells.json`), monsters (`monsters.json`), terrain encounter tables (`encounters.json`), and tile maps (`maps.json`).
- **Character & Roster System (`js/models/character.js`, `js/state.js`)**:
  - Implemented Gilgamesh's Tavern roster management (up to 20 heroes) and active party formation (4–6 heroes) with front/back row assignment.
  - Built character creation with race/class validation, bonus point-buy allocation, random fantasy name generation, starter equipment, and one-click default party generation.
  - Added `localStorage` auto-saving plus JSON save state export and import.
- **Overworld & Town Exploration (`js/overworld.js`)**:
  - Built an 11×11 tile viewport renderer for the Realm of Avalon overworld and the town of Oakhaven.
  - Added directional movement (`WASD` / Arrow keys), terrain passability, NPC conversations (`T`), location entry (`E` / `Enter`), and automatic town-border exit transitions.
  - Implemented persistent HUD with party status cards, shared gold, step counter, active spell buffs, and scrolling adventure log.
- **Menu-Driven Tactical Combat (`js/combat.js`, `js/dice.js`)**:
  - Implemented *Bard's Tale* / *Wasteland*-style round-based combat against up to 3 monster groups (`A`, `B`, `C`).
  - Added surprise/ambush checks, front/back row targeting and weapon range enforcement (melee, reach, ranged), and automatic front-line collapse if all front-row heroes fall.
  - Implemented action declaration (`Attack`, `Cast`, `Use Item`, `Defend`, `Hide`/`Steal`, `Run`) and initiative-sorted round resolution (`DEX + 1d10`).
  - Added enemy AI with weighted actions, special attacks, status infliction, XP splitting, automatic level-ups, gold rewards, and item drops.
- **Inventory, Equipment & Town Services (`js/items.js`)**:
  - Added party pack inventory modal (`I`) and hero equipment management (`weapon`, `armor`, `shield`, `accessory`) with class and stat requirement checks.
  - Built town service modals for **The Royal Armory & Provisions** (buy/sell gear and consumables), **The Wayfarer's Inn** (rest and recover HP/MP), and **Temple of the Triad** (cure status effects and resurrect `Dead` or `Ashes` heroes).
- **Magic & Status Effects (`js/magic.js`)**:
  - Implemented Arcane and Divine spellbooks unlocked by character level (tiers 1–3) using a single MP pool per hero.
  - Added combat spells (single-target damage, group AoE damage, healing, AC/evasion buffs, enemy status effects) and field spells (*Light*, *Heal*, *Detect*, *Open*, *Recall*).
  - Implemented status ailments (`Poison`, `Sleep`, `Paralysis`, `Silence`, `Dead`, `Ashes`) including overworld step-damage ticks for poison and duration tracking for field effects.
