# Changelog

All notable changes to this project are documented in this file.

## [0.3.0] - 2026-11-04

### Added

- **Overworld Atlas (`[M]`), Skiff Sailing & Island Shrines (`js/overworld.js`, `data/maps.json`, `index.html`, `css/style.css`)**:
  - Added the **Cartographer's Atlas of Avalon (`[M]`)** modal showing a 32×32 world map grid with automatic fog-of-war charting, exploration progress (`X / 1024 tiles`), party beacon (`@` / `⛵`), and discovered landmarks.
  - Added **Moon Harbor Dock & Skiff Charter** (`7, 2` in Coastal Port of Moon) where the party can charter a shallow-draft **Skiff** (`150 GP`) to sail across Shallow Water (`=`) tiles on the Overworld.
  - Added three offshore **Island Shrines of the Triad** reachable by Skiff that grant permanent stat and vital blessings to all active party members:
    - **Shrine of Valor (Sanctuary Isle — `20, 25`)**: `+1 STR`, `+4 Max HP`
    - **Shrine of Wisdom (Starlight Atoll — `16, 2`)**: `+1 INT`, `+1 WIS`, `+4 Max MP`
    - **Shrine of Swift Grace (Tempest Reef — `29, 14`)**: `+1 DEX`, `+2 Max HP`, `+2 Max MP`
- **Expanded Spellbook & Tier 5 Magic (`data/spells.json`, `js/magic.js`, `js/combat.js`)**:
  - Extended spell tier progression to **Tier 5 (Level 9)** for pure casters and **Tier 4 (Level 10)** for hybrid casters.
  - Added 8 new Arcane and Divine spells: **Glacial Lance** (`arc_frost_lance`), **Chronos Veil** (`arc_haste`), **All-Seeing Eye** (`arc_eye`), **Void Singularity** (`arc_supernova`), **Solar Pillar** (`div_exorcism`), **Bulwark of the Triad** (`div_aegis`), **Miracle of Rebirth** (`div_phoenix` — restores `Ashes` in the field or combat), and **Celestial Miracle** (`div_apotheosis`).
- **Retro Chiptune Background Music (`js/audio.js`, `js/app.js`, `index.html`)**:
  - Built a zero-dependency Web Audio API synthesizer with four distinct themes (*Overworld*, *Town & Tavern*, spooky 3-voice *Dungeon*, and fast, thrilling 3-voice *Combat*) and a persistent `♫ Music: ON/OFF` toggle in the top header.

## [0.2.1] - 2026-11-04

### Added

- **Town-Specific Shop Inventories & Late-Game Gear (`data/items.json`, `js/app.js`)**:
  - Scoped shop catalogs by town (`town_oakhaven`, `town_yew`, `town_moon`) so each town outfitter stocks tiered regional gear and supplies.
  - Added three late-game items in Port of Moon: **Shadowsteel Stiletto** (`shadow_stiletto`), **Moonshadow Brigandine** (`moonshadow_armor`), and **Archmage Astral Mantle** (`astral_mantle`).
- **Shop Equipped Gear Comparison Strip (`index.html`, `css/style.css`, `js/app.js`)**:
  - Added a live equipped-slot summary strip (`WPN`, `ARM`, `ACC`, and `AC`) for the selected hero in the shop modal.
  - Added `EQUIPPED` status badges and `Already Equipped` button guards so players don't accidentally re-buy gear a hero is already wearing.

### Changed

- **Dungeon & Combat Readability Polish (`data/maps.json`, `js/dungeon.js`, `js/combat.js`, `js/app.js`)**:
  - Updated dungeon level labels from `Level B1–B3` to `Floor 1–3` and simplified stair transition messages to `"to the lower/higher level"`.
  - Hid looted treasure chests immediately on the party's current tile until the party steps away.
  - Updated combat target and log messages to use singular or plural monster names based on surviving unit count without redundant `Group A/B/C` prefixes.

## [0.2.0] - 2026-11-04

### Added

- **First-Person Dungeon Mode (`js/dungeon.js`, `data/maps.json`)**:
  - Built a first-person 3D perspective `<canvas>` renderer displaying corridors, archways, locked iron doors, ascending/descending stairs, treasure chests, fountains, floor traps, and boss altars up to 3 tiles deep.
  - Added a 7×7 local Automap Sensor grid that tracks explored tiles per dungeon floor and reveals concealed traps and features when *Triad Sight* is active.
  - Implemented 5 handcrafted dungeon floors across two multi-level dungeons: **Cavern of Despise** (Levels B1–B2) and **Abyss of Doom** (Levels B1–B3).
  - Added directional turning (`A`/`D` or Left/Right Arrows), forward/backward stepping (`W`/`S` or Up/Down Arrows), lockpicking/door unlocking (`[O]`), trap searching and disarming (`[F]`), and chest/stair/fountain activation (`[E]`).
- **Expanded Bestiary, Encounter Tables & Depth Scaling (`data/monsters.json`, `data/encounters.json`, `js/combat.js`)**:
  - Added 13 new dungeon monsters and bosses: *Crypt Ghoul*, *Hobgoblin Vanguard*, *Cave Wyvernling*, *Shadow Warlock*, *Stone Gargoyle*, *Barrow Wight*, *Ogre Crusher*, *Abyssal Chanter*, *Infernal Hellhound*, *Deep Cave Troll*, *Dread Death Knight*, **Malakor the Lich Lord** (Despise B2 Boss), and **Pyrothrax the Abyssal Wyrm** (Doom B3 Boss).
  - Created depth-tiered encounter tables (`despise_b1`, `despise_b2`, `doom_b1`, `doom_b2`, `doom_b3`) and per-depth monster stat/reward scaling in `createEncounter`.
  - Added darkness visibility limits (1 tile ahead) and a `-4` Surprise roll penalty when exploring dungeons without active light.
- **New Dungeon Utility Spells & Items (`data/spells.json`, `data/items.json`)**:
  - Added **Arcane Knock** (`arc_open`) to unlock barred dungeon doors or disarm chest wards, and **Triad Sight** (`div_detect`) to reveal dungeon traps and grant a disarm bonus.
  - Added **Pitch Torch** (`dungeon_torch`) for 35 steps of torchlight, **Skeleton Key** (`master_key`) to unbar locked doors, and **Angelic Feather** (`angelic_feather`) to teleport the party from any dungeon level back to the surface entrance.
- **UI & Inventory Polish (`index.html`, `js/app.js`, `js/items.js`, `js/dungeon.js`)**:
  - Sorted the Party Pack's **Gear** filter by `ARMOR -> WEAPON -> ACCESSORY` (and alphabetically within each category).
  - Updated equipment restriction buttons in the shop and pack to explicitly list the allowed classes (e.g., `Wizard / Cleric Only`) and hid non-caster magic school labels on party cards.
  - Streamlined the dungeon viewport HUD and kept surprise roll modifiers hidden under the hood.

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
