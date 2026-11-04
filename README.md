# GenericUltimaClone (Chronicles of the Triad)

A classic, retro-styled party-based RPG inspired by *Ultima III*, *The Bard's Tale*, and *Wasteland*. Built with HTML, CSS, ES modules, and Alpine.js, featuring a data-driven design.

## Overview

Assemble a roster of heroes at Gilgamesh's Tavern, form an active party of 4 to 6 adventurers arranged across front and back rows, and explore the Realm of Avalon. Travel the overworld, visit towns for supplies and healing, cast Arcane and Divine spells, and engage in menu-driven, round-based tactical combat against monster groups.

## Key Features

- **Roster & Party Management**: Create up to 20 characters across 4 races (Human, Elf, Dwarf, Halfling) and 6 classes (Fighter, Paladin, Thief, Ranger, Cleric, Wizard) with point-buy stat allocation (`STR`, `DEX`, `INT`, `WIS`) or spin up a ready-made default party.
- **Tile-Based Overworld, Skiff Sailing & World Atlas**: Navigate an 11×11 viewport over the 32×32 Realm of Avalon and three towns (Oakhaven, Yew, Moon), chart your discoveries in the **Overworld Atlas (`[M]`)**, and charter a **Shallow-Draft Skiff** at Port of Moon to sail across shallow waters to three offshore **Island Shrines of the Triad**.
- **First-Person 3D Dungeon Exploration**: Descend into 20 deep dungeon floors across **Cavern of Despise** (Floors 1–8) and **Abyss of Doom** (Floors 1–12) rendered in a classic first-person perspective `<canvas>` with a 7×7 local automap sensor, torch/mage-light visibility, locked doors, trapped treasure chests, mystic fountains, stairs, elemental Wyrms, chromatic Dragons, and bottom-floor dungeon bosses dropping exclusive legendary relics.
- **Town Services**:
  - **The Royal Armory & Provisions**: Buy and sell regional weapons, armor, accessories, and consumables (including dungeon utility items like **Pitch Torches**, **Skeleton Keys**, and **Angelic Feathers**) with live equipped-gear comparisons.
  - **The Wayfarer's Inn**: Rest to restore party HP and MP and save your progress.
  - **Temple of the Triad**: Cure status ailments (Poison, Sleep, Paralysis, Silence) and resurrect fallen (`Dead` or `Ashes`) heroes.
  - **Moon Harbor Dock**: Charter a Skiff in the Coastal Port of Moon to sail shallow coastal waters and track your Island Shrine blessings.
- **Menu-Driven Group Combat**: *Bard's Tale*-style round-based encounters with surprise checks, darkness ambush penalties, per-depth stat scaling, front/back row positioning rules, initiative order resolution, status effects, XP/leveling, gold, and item drops.
- **Arcane & Divine Magic (Tiers 1–5)**: Single-pool MP casting system supporting 26 combat and field spells across Tiers 1–5—including *Glacial Lance*, *Chronos Veil*, *All-Seeing Eye*, *Void Singularity*, *Solar Pillar*, *Bulwark of the Triad*, *Miracle of Rebirth* (restoring `Ashes`), and *Celestial Miracle*.
- **Retro Chiptune Background Music**: Procedural Web Audio API background music across four distinct themes (*Overworld*, *Town/Tavern*, spooky *Dungeon*, and thrilling *Combat*) with a persistent header toggle.
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
  - `overworld.js` — Viewport rendering, movement, collision, and town/overworld/dungeon entry transitions
  - `dungeon.js` — First-person 3D dungeon `<canvas>` renderer, 7×7 automap sensor, directional turning/stepping, lockpicking, trap disarming, and chests/stairs
  - `combat.js` — Encounter generation, depth scaling, enemy AI, initiative sorting, and round resolution
  - `magic.js` — Spellbook unlocking, field spell casting, and status effect helpers
  - `items.js` — Inventory pack management, equipment rules, and consumables
  - `state.js` — Save state normalization and `localStorage` persistence
  - `dice.js` — Dice notation parser and RNG helpers (`XdY+Z`)
  - `data-loader.js` — JSON data loader and lookup indexing
  - `models/character.js` — Character creation, stat modifiers, derived stats, and leveling
- `data/` — Data-driven JSON definitions (`races.json`, `classes.json`, `items.json`, `spells.json`, `monsters.json`, `encounters.json`, `maps.json`)
