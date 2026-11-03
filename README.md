# GenericUltimaClone (Chronicles of the Triad)

A classic, retro-styled party-based RPG inspired by *Ultima III*, *The Bard's Tale*, and *Wasteland*. Built with HTML, CSS, ES modules, and Alpine.js, featuring a data-driven design.

## Overview

Assemble a roster of heroes at Gilgamesh's Tavern, form an active party of 4 to 6 adventurers arranged across front and back rows, and explore the Realm of Avalon. Travel the overworld, visit towns for supplies and healing, cast Arcane and Divine spells, and engage in menu-driven, round-based tactical combat against monster groups.

## Key Features

- **Roster & Party Management**: Create up to 20 characters across 4 races (Human, Elf, Dwarf, Halfling) and 6 classes (Fighter, Paladin, Thief, Ranger, Cleric, Wizard) with point-buy stat allocation (`STR`, `DEX`, `INT`, `WIS`) or spin up a ready-made default party.
- **Tile-Based Overworld & Town Exploration**: Navigate an 11×11 viewport over the Realm of Avalon and the town of Oakhaven, complete with terrain passability, NPC conversations, and location triggers.
- **Town Services**:
  - **The Royal Armory & Provisions**: Buy and sell weapons, armor, shields, accessories, and consumables with class/stat eligibility checks.
  - **The Wayfarer's Inn**: Rest to restore party HP and MP and save your progress.
  - **Temple of the Triad**: Cure status ailments (Poison, Sleep, Paralysis, Silence) and resurrect fallen (`Dead` or `Ashes`) heroes.
- **Menu-Driven Group Combat**: *Bard's Tale*-style round-based encounters with surprise checks, front/back row positioning rules, initiative order resolution, status effects, XP/leveling, gold, and item drops.
- **Arcane & Divine Magic**: Single-pool MP casting system supporting both combat spells (single-target, group AoE, healing, buffs, status) and field spells (*Light*, *Heal*, *Detect*, *Open*, *Recall*).
- **Save & Export System**: Automatic persistence via `localStorage` plus full JSON save export and import.

## Running Locally

Because the game loads its definitions from JSON files via `fetch()` and uses ES modules, serve the directory over a local HTTP server:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open `http://localhost:8000` (or the port shown) in your browser.

## Project Structure

- `index.html` — Main application shell, views, and native `<dialog>` modals
- `css/style.css` — Retro CRT/fantasy interface styling
- `js/`
  - `app.js` — Main Alpine.js application controller, UI state, and keyboard shortcuts
  - `overworld.js` — Viewport rendering, movement, collision, and town/overworld transitions
  - `combat.js` — Encounter generation, enemy AI, initiative sorting, and round resolution
  - `magic.js` — Spellbook unlocking, field spell casting, and status effect helpers
  - `items.js` — Inventory pack management, equipment rules, and consumables
  - `state.js` — Save state normalization and `localStorage` persistence
  - `dice.js` — Dice notation parser and RNG helpers (`XdY+Z`)
  - `data-loader.js` — JSON data loader and lookup indexing
  - `models/character.js` — Character creation, stat modifiers, derived stats, and leveling
- `data/` — Data-driven JSON definitions (`races.json`, `classes.json`, `items.json`, `spells.json`, `monsters.json`, `encounters.json`, `maps.json`)
