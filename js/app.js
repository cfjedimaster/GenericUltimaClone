import { loadGameData } from './data-loader.js';
import {
  STAT_KEYS,
  EQUIPMENT_SLOTS,
  BONUS_POINT_POOL,
  getStatMod,
  getXpForNextLevel,
  getStarterEquipmentForClass,
  getEffectiveStats,
  computeDerivedStats,
  syncCharacterDerivedStats,
  applyXpAndLevelUp,
  isComboValid,
  validateCharacterDraft,
  createCharacter,
  randomFantasyName,
  generateDefaultParty
} from './models/character.js';
import {
  MAX_ROSTER_SIZE,
  MIN_PARTY_SIZE,
  MAX_PARTY_SIZE,
  MAX_FRONT_ROW,
  loadStateFromStorage,
  saveStateToStorage,
  resetStorageState,
  normalizeSaveState
} from './state.js';
import {
  getSellPrice,
  getInventoryQty,
  canHeroEquipItem,
  formatItemSummary,
  equipFromPack,
  unequipSlotToPack,
  useConsumableOnHero,
  addItemToPack,
  removeItemFromPack
} from './items.js';
import {
  getMapById,
  getTileDefAt,
  getTriggerAt,
  getAdjacentTriggers,
  buildViewportRows,
  attemptMove,
  attemptEnterLocation,
  attemptTalkNearby,
  exitTownToOverworld
} from './overworld.js';
import {
  shouldTriggerRandomEncounter,
  createEncounter,
  isHeroAlive,
  canHeroActInCombat,
  getEffectiveHeroRow,
  getHeroAttackProfile,
  getLivingUnitsInGroup,
  getLivingEnemyGroups,
  executeEnemyAmbushRound,
  resolveCombatRound
} from './combat.js';
import {
  isHeroDead,
  isHeroIncapacitated,
  isHeroSilenced,
  getMaxUnlockedSpellTier,
  getHeroSpellbook,
  formatSpellSummary,
  castFieldSpell,
  tickOverworldStepEffects
} from './magic.js';
import {
  FACING_META,
  normalizeFacing,
  turnFacing,
  markDungeonTileExplored,
  isDoorUnlocked,
  isFeatureConsumed,
  isChestTrapDisarmed,
  buildDungeonMinimapRows,
  getTriggerAhead,
  stepDungeon,
  attemptUnlockDungeonDoor,
  attemptSearchAndDisarm,
  attemptDungeonInteract,
  renderDungeonViewport
} from './dungeon.js';

function initLightDismissFallbacks() {
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent = (
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        );
        if (isDialogContent) return;
        dialog.close();
      });
    }
  }
}

function initUserInvalidAriaSync() {
  const syncAria = (el) => {
    if (el && typeof el.matches === 'function' && el.tagName === 'INPUT') {
      el.setAttribute('aria-invalid', el.matches(':user-invalid') ? 'true' : 'false');
    }
  };
  document.addEventListener('blur', (e) => syncAria(e.target), true);
  document.addEventListener('input', (e) => {
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('aria-invalid')) {
      syncAria(e.target);
    }
  });
}

function registerApp() {
  window.Alpine.data('rpgFoundationApp', () => ({
    loading: true,
    loadError: null,
    screen: 'title', // 'title' | 'tavern' | 'create' | 'overworld' | 'combat'
    statusBanner: 'Welcome to the Realm of Avalon.',
    races: [],
    classes: [],
    racesById: {},
    classesById: {},
    tiles: {},
    maps: {},
    monsters: [],
    monstersById: {},
    encounters: {},
    items: [],
    itemsById: {},
    spells: [],
    spellsById: {},
    statKeys: STAT_KEYS,
    equipmentSlots: EQUIPMENT_SLOTS,
    bonusPoolTotal: BONUS_POINT_POOL,
    maxRosterSize: MAX_ROSTER_SIZE,
    minPartySize: MIN_PARTY_SIZE,
    maxPartySize: MAX_PARTY_SIZE,
    maxFrontRow: MAX_FRONT_ROW,

    state: loadStateFromStorage(),

    // Active combat encounter state
    combat: null,

    // Exploration message log
    messageLog: [
      { id: 1, text: 'Chronicles of the Triad initialized. Form your party and embark onto the Overworld.' }
    ],
    nextLogId: 2,

    // Character creation draft
    draft: {
      name: '',
      raceId: 'human',
      classId: 'fighter',
      allocated: { str: 2, dex: 0, int: 0, wis: 0 }
    },

    // Modal & Town Service state
    inspectTarget: null,
    renameTarget: null,
    renameInput: '',
    deleteTarget: null,
    importJsonText: '',
    importError: '',

    activeGearHeroId: null,
    packFilter: 'all', // 'all' | 'equipment' | 'consumable'

    activeSpellHeroId: null,
    selectedFieldSpellId: null,

    shopName: 'The Royal Armory & Provisions',
    shopTab: 'buy', // 'buy' | 'sell'
    shopCategory: 'all', // 'all' | 'weapon' | 'armor' | 'accessory' | 'consumable'
    shopTargetHeroId: null,

    innName: "The Wayfarer's Inn",
    templeName: 'Temple of the Triad',

    async init() {
      try {
        const data = await loadGameData();
        this.races = data.races;
        this.classes = data.classes;
        this.racesById = data.racesById;
        this.classesById = data.classesById;
        this.tiles = data.tiles || {};
        this.maps = data.maps || {};
        this.monsters = data.monsters || [];
        this.monstersById = data.monstersById || {};
        this.encounters = data.encounters || {};
        this.items = data.items || [];
        this.itemsById = data.itemsById || {};
        this.spells = data.spells || [];
        this.spellsById = data.spellsById || {};

        this.syncAllRosterDerived();
        this.ensureValidLocation();
        this.resetDraft();
        this.loading = false;
        this.syncDocumentTitle();
        initLightDismissFallbacks();
        initUserInvalidAriaSync();
        this.initExplorationKeybindings();
        this.initCheatConsole();
      } catch (err) {
        console.error(err);
        this.loadError = err.message || 'Failed to load game data.';
        this.loading = false;
      }
    },

    get gameDataBundle() {
      return {
        racesById: this.racesById,
        classesById: this.classesById,
        itemsById: this.itemsById,
        spellsById: this.spellsById
      };
    },

    syncAllRosterDerived() {
      if (!Array.isArray(this.state.roster)) return;
      for (const char of this.state.roster) {
        syncCharacterDerivedStats(char, this.racesById, this.classesById, this.itemsById);
      }
      this.persist();
    },

    syncDocumentTitle() {
      const titles = {
        title: 'Title Screen | Chronicles of the Triad',
        tavern: "Gilgamesh's Tavern & Roster | Chronicles of the Triad",
        create: 'Create Hero | Chronicles of the Triad',
        overworld: `${this.currentMap?.name || 'Overworld'} | Chronicles of the Triad`,
        combat: 'Combat Encounter | Chronicles of the Triad'
      };
      document.title = titles[this.screen] || 'Chronicles of the Triad';
    },

    ensureValidLocation() {
      if (!this.state.location || !this.state.location.mapId) {
        this.state.location = {
          mode: 'overworld',
          mapId: 'avalon',
          x: 16,
          y: 14,
          facing: 'N',
          steps: 0,
          returnOverworld: { mapId: 'avalon', x: 16, y: 13 }
        };
      }
      const map = getMapById(this.maps, this.state.location.mapId);
      if (map) {
        this.state.location.mapId = map.id;
        this.state.location.mode = map.mode || 'overworld';
        this.state.location.facing = normalizeFacing(
          this.state.location.facing || map.defaultSpawn?.facing || 'N'
        );
        const tile = getTileDefAt(map, this.tiles, this.state.location.x, this.state.location.y);
        if (!tile.passable && tile.code !== 'L') {
          this.state.location.x = map.defaultSpawn?.x ?? 16;
          this.state.location.y = map.defaultSpawn?.y ?? 14;
        }
        if (map.mode === 'dungeon') {
          markDungeonTileExplored(this.state, map.id, this.state.location.x, this.state.location.y);
          this.refreshDungeonCanvas();
        }
      }
    },

    initExplorationKeybindings() {
      window.addEventListener('keydown', (e) => {
        const activeTag = document.activeElement?.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
        if (document.querySelector('dialog[open]')) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;

        const key = e.key;

        // Combat Screen Keybindings
        if (this.screen === 'combat' && this.combat) {
          if (this.combat.phase === 'input') {
            if ((key === 'a' || key === 'A') && !this.allCombatActionsQueued) {
              e.preventDefault();
              this.chooseCombatAttack();
            } else if ((key === 'c' || key === 'C') && !this.allCombatActionsQueued) {
              e.preventDefault();
              this.chooseCombatCast();
            } else if ((key === 'd' || key === 'D') && !this.allCombatActionsQueued) {
              e.preventDefault();
              this.chooseCombatDefend();
            } else if ((key === 'u' || key === 'U') && !this.allCombatActionsQueued) {
              e.preventDefault();
              this.chooseCombatUseItem();
            } else if ((key === 'r' || key === 'R') && !this.allCombatActionsQueued) {
              e.preventDefault();
              this.chooseCombatRun();
            } else if (key === '1' || key === '2' || key === '3') {
              const idx = Number(key) - 1;
              const grp = this.combat.groups[idx];
              if (grp && this.getGroupLivingCount(grp) > 0 && !this.allCombatActionsQueued) {
                e.preventDefault();
                this.selectCombatTargetGroup(grp.id);
              }
            } else if (key === 'Backspace') {
              e.preventDefault();
              this.prevCombatHero();
            } else if ((key === 'Enter' || key === ' ') && this.allCombatActionsQueued) {
              if (activeTag === 'BUTTON') return;
              e.preventDefault();
              this.executeCombatRound();
            }
          } else {
            if (key === 'Enter' || key === ' ' || key === 'e' || key === 'E') {
              if (activeTag === 'BUTTON') return;
              e.preventDefault();
              if (this.combat.phase === 'defeat') {
                this.revivePartyAfterDefeat();
              } else {
                this.finishCombat();
              }
            }
          }
          return;
        }

        if (key === 'i' || key === 'I') {
          if (this.state.roster.length > 0) {
            e.preventDefault();
            this.openInventoryModal();
          }
          return;
        }

        if (key === 'c' || key === 'C') {
          if (this.state.roster.length > 0) {
            e.preventDefault();
            this.openSpellModal();
          }
          return;
        }

        if (this.screen !== 'overworld') return;

        // First-Person Dungeon Mode Controls
        if (this.isDungeonMode) {
          if (key === 'ArrowUp' || key === 'w' || key === 'W') {
            e.preventDefault();
            this.stepPartyDungeon('forward');
          } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
            e.preventDefault();
            this.stepPartyDungeon('back');
          } else if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
            e.preventDefault();
            this.turnParty('left');
          } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
            e.preventDefault();
            this.turnParty('right');
          } else if (key === 'e' || key === 'E' || key === 'Enter') {
            if (key === 'Enter' && activeTag === 'BUTTON') return;
            e.preventDefault();
            this.enterOrInteract();
          } else if (key === 'o' || key === 'O') {
            e.preventDefault();
            this.unlockDoorAhead();
          } else if (key === 'f' || key === 'F') {
            e.preventDefault();
            this.searchAndDisarmDungeon();
          } else if (key === ' ' || key === 'p' || key === 'P') {
            if (key === ' ' && activeTag === 'BUTTON') return;
            e.preventDefault();
            this.waitTurn();
          }
          return;
        }

        if (key === 'ArrowUp' || key === 'w' || key === 'W') {
          e.preventDefault();
          this.moveParty('N');
        } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
          e.preventDefault();
          this.moveParty('S');
        } else if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
          e.preventDefault();
          this.moveParty('W');
        } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
          e.preventDefault();
          this.moveParty('E');
        } else if (key === 'e' || key === 'E' || key === 'Enter') {
          if (key === 'Enter' && activeTag === 'BUTTON') return;
          e.preventDefault();
          this.enterOrInteract();
        } else if (key === 't' || key === 'T') {
          e.preventDefault();
          this.talkNearby();
        } else if (key === 'x' || key === 'X') {
          e.preventDefault();
          this.leaveCurrentTown();
        } else if (key === ' ' || key === 'p' || key === 'P') {
          if (key === ' ' && activeTag === 'BUTTON') return;
          e.preventDefault();
          this.waitTurn();
        }
      });
    },

    initCheatConsole() {
      window.cheat = {
        pickFight: (terrainId = null) => {
          if (!this.canEmbark) {
            console.warn('cheat.pickFight(): Assemble a valid party of 4-6 heroes first.');
            return;
          }
          const defaultKey = this.isDungeonMode
            ? (this.currentMap?.encounterTable || 'despise_b1')
            : (this.currentMap?.mode === 'overworld' ? this.currentTile?.id : 'grass');
          const key = terrainId || defaultKey || 'grass';
          const tile = { id: key, name: key.toUpperCase() };
          this.startCombatEncounter(tile);
          return `Encounter started in ${tile.name}!`;
        },
        teleport: (mapId = 'dungeon_despise_b1', x = null, y = null, facing = null) => {
          const dest = getMapById(this.maps, mapId);
          if (!dest) {
            console.warn(`Unknown mapId "${mapId}". Valid maps:`, Object.keys(this.maps));
            return null;
          }
          this.state.location.mode = dest.mode || 'overworld';
          this.state.location.mapId = dest.id;
          this.state.location.x = typeof x === 'number' ? x : dest.defaultSpawn.x;
          this.state.location.y = typeof y === 'number' ? y : dest.defaultSpawn.y;
          if (dest.mode === 'dungeon') {
            this.state.location.facing = normalizeFacing(facing || dest.defaultSpawn?.facing || 'N');
            markDungeonTileExplored(this.state, dest.id, this.state.location.x, this.state.location.y);
          }
          this.screen = 'overworld';
          this.persist(`Cheat: Teleported party to ${dest.name} (${this.state.location.x}, ${this.state.location.y}).`);
          this.refreshDungeonCanvas();
          return `${dest.name} (${this.state.location.x}, ${this.state.location.y})`;
        },
        gold: (amount = 500) => {
          this.state.gold = Math.max(0, (this.state.gold || 0) + Number(amount || 0));
          this.persist(`Cheat: Party gold is now ${this.state.gold} GP.`);
          return this.state.gold;
        },
        xp: (amount = 200) => {
          const results = [];
          for (const entry of this.state.party) {
            const hero = this.state.roster.find(c => c.id === entry.charId);
            if (hero && hero.status !== 'Dead') {
              const ups = applyXpAndLevelUp(hero, Number(amount || 0), this.racesById, this.classesById, this.itemsById);
              results.push(`${hero.name}: +${amount} XP (Lv ${hero.level}${ups.length ? ' LEVEL UP!' : ''})`);
            }
          }
          this.persist(`Cheat: Granted ${amount} XP to active party.`);
          return results;
        },
        give: (itemId = 'healing_draught', qty = 1) => {
          const itemDef = this.itemsById[itemId];
          if (!itemDef) {
            console.warn(`Unknown itemId "${itemId}". Valid IDs:`, Object.keys(this.itemsById));
            return null;
          }
          addItemToPack(this.state, itemId, Number(qty || 1));
          this.persist(`Cheat: Added ${itemDef.name} x${qty} to Party Pack.`);
          return `${itemDef.name} x${qty}`;
        },
        heal: () => {
          for (const char of this.state.roster) {
            char.status = 'OK';
            delete char.statusDuration;
            char.derived.hp = char.derived.maxHp;
            char.derived.mp = char.derived.maxMp;
          }
          this.persist('Cheat: All roster heroes restored to full HP & MP.');
          return 'Party healed!';
        },
        status: (status = 'Poison', partyIndex = 0) => {
          const entry = this.state.party[partyIndex] || this.state.party[0];
          const hero = entry ? this.state.roster.find(c => c.id === entry.charId) : this.state.roster[0];
          if (!hero) return null;
          hero.status = status;
          if (status === 'Dead' || status === 'Ashes') {
            hero.derived.hp = 0;
          } else if (status === 'Sleep' || status === 'Paralysis' || status === 'Silence') {
            hero.statusDuration = 2;
          }
          this.persist(`Cheat: Set ${hero.name}'s status to ${status}.`);
          return `${hero.name} -> ${status}`;
        },
        help: () => {
          console.table({
            'cheat.pickFight(terrainId?)': 'Start a combat encounter (e.g., "grass", "despise_b1", "doom_b3")',
            'cheat.teleport(mapId, x?, y?, facing?)': 'Teleport to any map (e.g., "dungeon_despise_b1", "dungeon_doom_b1", "avalon")',
            'cheat.gold(amount = 500)': 'Add gold to the party',
            'cheat.xp(amount = 200)': 'Grant XP to active party members',
            'cheat.give(itemId, qty = 1)': 'Add an item to the shared Party Pack',
            'cheat.status(status, partyIndex)': 'Afflict a hero with Poison, Sleep, Paralysis, Silence, Dead, or Ashes',
            'cheat.heal()': 'Restore all heroes to full HP/MP and cure all ailments'
          });
        }
      };
    },

    // --- Navigation ---
    goToScreen(target) {
      if (this.screen === 'combat' && this.combat?.phase === 'input') {
        this.notify('You cannot leave in the middle of combat! Fight or Run.');
        return;
      }
      const normalizedTarget = target === 'overworld_stub' ? 'overworld' : target;
      if (normalizedTarget === 'create') {
        if (this.state.roster.length >= this.maxRosterSize) {
          this.notify(`Roster is full (${this.maxRosterSize} max). Dismiss someone first.`);
          return;
        }
        this.resetDraft();
      }
      if (normalizedTarget === 'overworld' && !this.canEmbark) {
        this.notify(`Assemble between ${this.minPartySize} and ${this.maxPartySize} living heroes (with at least 1 in the front row) before embarking!`);
        return;
      }
      this.screen = normalizedTarget;
      this.syncDocumentTitle();
      if (normalizedTarget === 'overworld') {
        this.ensureValidLocation();
        const mapName = this.currentMap?.name || 'Realm of Avalon';
        this.appendLog(`Party embarked into ${mapName}.`);
      }
    },

    notify(msg) {
      this.statusBanner = msg;
    },

    appendLog(text) {
      if (!text) return;
      this.messageLog.push({
        id: this.nextLogId++,
        text
      });
      if (this.messageLog.length > 60) {
        this.messageLog.splice(0, this.messageLog.length - 60);
      }
      this.notify(text);
      queueMicrotask(() => {
        const logEl = document.querySelector('#exploration-log');
        if (logEl) {
          logEl.scrollTop = logEl.scrollHeight;
        }
      });
    },

    scrollCombatLogToBottom() {
      queueMicrotask(() => {
        const el = document.querySelector('#combat-log');
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      });
    },

    persist(msg) {
      this.state = saveStateToStorage(this.state);
      if (msg) this.notify(msg);
    },

    xpForNextLevel(level) {
      return getXpForNextLevel(level);
    },

    // --- Item & Equipment Helpers ---
    getItemDef(itemId) {
      if (!itemId) return null;
      return typeof itemId === 'object' ? itemId : (this.itemsById[itemId] || null);
    },

    getItemName(itemId, fallback = 'None') {
      const def = this.getItemDef(itemId);
      return def ? def.name : fallback;
    },

    getItemSummary(itemOrId) {
      const def = this.getItemDef(itemOrId);
      return formatItemSummary(def);
    },

    getHeroSlotItem(char, slot) {
      if (!char || !char.equipment) return null;
      return this.getItemDef(char.equipment[slot]);
    },

    getEffectiveHeroStats(char) {
      return getEffectiveStats(char, this.itemsById);
    },

    get totalPackItemCount() {
      if (!Array.isArray(this.state.inventory)) return 0;
      return this.state.inventory.reduce((sum, entry) => sum + (entry.qty || 0), 0);
    },

    get packEntriesDetailed() {
      if (!Array.isArray(this.state.inventory)) return [];
      return this.state.inventory
        .map(entry => {
          const item = this.itemsById[entry.itemId];
          if (!item || entry.qty <= 0) return null;
          return {
            itemId: entry.itemId,
            qty: entry.qty,
            item,
            summary: formatItemSummary(item),
            sellPrice: getSellPrice(item)
          };
        })
        .filter(Boolean);
    },

    get filteredPackEntries() {
      const all = this.packEntriesDetailed;
      if (this.packFilter === 'equipment') {
        const slotOrder = { armor: 0, weapon: 1, accessory: 2 };
        return all
          .filter(e => e.item.slot !== 'consumable')
          .sort((a, b) => {
            const rankA = slotOrder[a.item.slot] ?? 99;
            const rankB = slotOrder[b.item.slot] ?? 99;
            if (rankA !== rankB) return rankA - rankB;
            return a.item.name.localeCompare(b.item.name);
          });
      }
      if (this.packFilter === 'consumable') {
        return all.filter(e => e.item.slot === 'consumable');
      }
      return all;
    },

    get gearControllableHeroes() {
      return this.partyMembersDetailed.length > 0 ? this.partyMembersDetailed : this.state.roster;
    },

    get activeGearHero() {
      const list = this.gearControllableHeroes;
      if (list.length === 0) return null;
      const found = this.state.roster.find(c => c.id === this.activeGearHeroId);
      return found || this.state.roster.find(c => c.id === list[0].id) || null;
    },

    openInventoryModal(char = null) {
      if (char && char.id) {
        this.activeGearHeroId = char.id;
      } else if (!this.activeGearHeroId || !this.state.roster.some(c => c.id === this.activeGearHeroId)) {
        const first = this.partyMembersDetailed[0] || this.state.roster[0];
        this.activeGearHeroId = first ? first.id : null;
      }
      const dlg = document.querySelector('#inventory-dialog');
      if (dlg) dlg.showModal();
    },

    canHeroEquip(hero, itemDef) {
      return canHeroEquipItem(hero, itemDef);
    },

    equipPackItemOnHero(itemId, hero = this.activeGearHero) {
      if (!hero) return;
      const res = equipFromPack(this.state, hero, itemId, this.gameDataBundle);
      this.persist(res.log);
      if (res.ok && this.screen === 'overworld') {
        this.appendLog(res.log);
      }
    },

    unequipHeroSlot(slot, hero = this.activeGearHero) {
      if (!hero) return;
      const res = unequipSlotToPack(this.state, hero, slot, this.gameDataBundle);
      this.persist(res.log);
      if (res.ok && this.screen === 'overworld') {
        this.appendLog(res.log);
      }
    },

    usePackConsumable(itemId, targetHero = this.activeGearHero) {
      if (!targetHero) return;
      const res = useConsumableOnHero(this.state, itemId, targetHero, this.itemsById);
      this.persist(res.log);
      if (res.ok && this.screen === 'overworld') {
        this.appendLog(res.log);
        if (res.exitedDungeon) {
          this.syncDocumentTitle();
          const dlg = document.querySelector('#inventory-dialog');
          if (dlg) dlg.close();
        } else {
          this.refreshDungeonCanvas();
        }
      }
    },

    // --- Magic, Grimoire & Field Spellcasting ---
    doesHeroHaveMagic(char) {
      if (!char) return false;
      const cls = this.classesById[char.class];
      return Boolean(cls && cls.magicSchool);
    },

    getHeroMagicSchoolLabel(char) {
      if (!char) return 'None';
      const cls = this.classesById[char.class];
      if (!cls || !cls.magicSchool) return 'None';
      return cls.magicSchool === 'arcane' ? 'Arcane' : 'Divine';
    },

    getHeroSpellList(char, context = null) {
      return getHeroSpellbook(char, this.spells, this.classesById, context);
    },

    get activeSpellHero() {
      const list = this.gearControllableHeroes;
      if (list.length === 0) return null;
      const found = this.state.roster.find(c => c.id === this.activeSpellHeroId);
      if (found && this.doesHeroHaveMagic(found)) return found;
      const firstCaster = list.find(c => this.doesHeroHaveMagic(c));
      return firstCaster ? this.state.roster.find(c => c.id === firstCaster.id) : null;
    },

    get activeHeroSpellbook() {
      return getHeroSpellbook(this.activeSpellHero, this.spells, this.classesById, 'field');
    },

    get selectedFieldSpellEntry() {
      const book = this.activeHeroSpellbook;
      if (book.length === 0) return null;
      const found = book.find(e => e.spell.id === this.selectedFieldSpellId);
      if (found) return found;
      const firstCastable = book.find(e => e.canCast) || book.find(e => e.unlocked) || book[0];
      return firstCastable || null;
    },

    selectSpellModalHero(heroId) {
      const hero = this.state.roster.find(c => c.id === heroId);
      if (!hero || !this.doesHeroHaveMagic(hero)) return;
      this.activeSpellHeroId = heroId;
      const book = this.activeHeroSpellbook;
      const preferred = book.find(e => e.canCast) || book.find(e => e.unlocked) || book[0];
      this.selectedFieldSpellId = preferred ? preferred.spell.id : null;
    },

    openSpellModal(char = null) {
      if (char && char.id && this.doesHeroHaveMagic(char)) {
        this.selectSpellModalHero(char.id);
      } else {
        const list = this.gearControllableHeroes;
        const firstLivingCaster = list.find(h => this.doesHeroHaveMagic(h) && !isHeroDead(h));
        const anyCaster = firstLivingCaster || list.find(h => this.doesHeroHaveMagic(h));
        if (anyCaster) {
          this.selectSpellModalHero(anyCaster.id);
        }
      }
      const dlg = document.querySelector('#spell-dialog');
      if (dlg) dlg.showModal();
    },

    castSelectedFieldSpell(targetHero = null) {
      const caster = this.activeSpellHero;
      const entry = this.selectedFieldSpellEntry;
      if (!caster || !entry) return;

      const res = castFieldSpell({
        state: this.state,
        caster,
        spell: entry.spell,
        targetHero,
        itemsById: this.itemsById,
        maps: this.maps
      });

      this.persist(res.log);
      if (res.ok) {
        this.appendLog(res.log);
        this.refreshDungeonCanvas();
        if (res.recalled || res.unlocked) {
          const dlg = document.querySelector('#spell-dialog');
          if (dlg) dlg.close();
        }
      }
    },

    getStatusBadgeClass(status) {
      if (!status || status === 'OK') return 'status-ok';
      if (status === 'Poison') return 'status-poison';
      if (status === 'Sleep' || status === 'Paralysis') return 'status-disable';
      if (status === 'Silence') return 'status-silence';
      if (status === 'Dead' || status === 'Ashes') return 'status-dead';
      return 'status-ok';
    },

    // --- Town Services: Shop, Inn, Temple ---
    get shopTargetHero() {
      const found = this.state.roster.find(c => c.id === this.shopTargetHeroId);
      if (found) return found;
      const firstParty = this.partyMembersDetailed[0];
      return firstParty ? this.state.roster.find(c => c.id === firstParty.id) : (this.state.roster[0] || null);
    },

    get filteredShopCatalog() {
      if (this.shopCategory === 'all') return this.items;
      return this.items.filter(item => item.slot === this.shopCategory);
    },

    getOwnedAndEquippedCount(itemId) {
      const inPack = getInventoryQty(this.state, itemId);
      let equipped = 0;
      for (const c of this.state.roster) {
        if (!c.equipment) continue;
        for (const s of EQUIPMENT_SLOTS) {
          if (c.equipment[s] === itemId) equipped += 1;
        }
      }
      return { inPack, equipped, total: inPack + equipped };
    },

    openShopModal(trigger = null) {
      this.shopName = trigger?.name || 'Armory & Outfitter';
      this.shopTab = 'buy';
      if (!this.shopTargetHeroId || !this.state.roster.some(c => c.id === this.shopTargetHeroId)) {
        const first = this.partyMembersDetailed[0] || this.state.roster[0];
        this.shopTargetHeroId = first ? first.id : null;
      }
      const dlg = document.querySelector('#shop-dialog');
      if (dlg) dlg.showModal();
    },

    buyItemToPack(itemId) {
      const itemDef = this.itemsById[itemId];
      if (!itemDef) return;
      if ((this.state.gold || 0) < itemDef.price) {
        this.notify(`Not enough gold! ${itemDef.name} costs ${itemDef.price} GP.`);
        return;
      }
      this.state.gold -= itemDef.price;
      addItemToPack(this.state, itemId, 1);
      const msg = `Purchased ${itemDef.name} for ${itemDef.price} GP (added to Party Pack).`;
      this.persist(msg);
      this.appendLog(msg);
    },

    buyAndEquipItem(itemId) {
      const itemDef = this.itemsById[itemId];
      const hero = this.shopTargetHero;
      if (!itemDef || !hero) return;

      const check = canHeroEquipItem(hero, itemDef);
      if (!check.ok) {
        this.notify(`${hero.name}: ${check.reason}`);
        return;
      }
      if ((this.state.gold || 0) < itemDef.price) {
        this.notify(`Not enough gold! ${itemDef.name} costs ${itemDef.price} GP.`);
        return;
      }

      this.state.gold -= itemDef.price;
      addItemToPack(this.state, itemId, 1);
      equipFromPack(this.state, hero, itemId, this.gameDataBundle);
      const msg = `Purchased ${itemDef.name} (${itemDef.price} GP) and equipped on ${hero.name}!`;
      this.persist(msg);
      this.appendLog(msg);
    },

    sellPackItem(itemId) {
      const itemDef = this.itemsById[itemId];
      if (!itemDef) return;
      if (getInventoryQty(this.state, itemId) <= 0) return;

      const sellValue = getSellPrice(itemDef);
      removeItemFromPack(this.state, itemId, 1);
      this.state.gold = (this.state.gold || 0) + sellValue;
      const msg = `Sold ${itemDef.name} for ${sellValue} GP.`;
      this.persist(msg);
      this.appendLog(msg);
    },

    openInnModal(trigger = null) {
      this.innName = trigger?.name || "The Wayfarer's Inn";
      const dlg = document.querySelector('#inn-dialog');
      if (dlg) dlg.showModal();
    },

    restAtInn(tier = 'suite') {
      const cost = tier === 'bunk' ? 10 : 25;
      if ((this.state.gold || 0) < cost) {
        this.notify(`You need ${cost} GP to rent the ${tier === 'bunk' ? 'Common Bunkroom' : 'Royal Suite'}.`);
        return;
      }
      this.state.gold -= cost;

      for (const entry of this.state.party) {
        const hero = this.state.roster.find(c => c.id === entry.charId);
        if (hero && hero.status !== 'Dead' && hero.derived.hp > 0) {
          if (tier === 'bunk') {
            const hpRec = Math.max(5, Math.ceil(hero.derived.maxHp * 0.5));
            const mpRec = Math.max(5, Math.ceil(hero.derived.maxMp * 0.5));
            hero.derived.hp = Math.min(hero.derived.maxHp, hero.derived.hp + hpRec);
            hero.derived.mp = Math.min(hero.derived.maxMp, hero.derived.mp + mpRec);
          } else {
            hero.derived.hp = hero.derived.maxHp;
            hero.derived.mp = hero.derived.maxMp;
          }
        }
      }

      const msg =
        tier === 'bunk'
          ? `Your party rests in the Common Bunkroom (-${cost} GP), recovering 50% HP/MP (min 5). Journey saved!`
          : `Your party rests in the Royal Suite (-${cost} GP), restoring full HP & MP to all living heroes. Journey saved!`;
      this.persist(msg);
      this.appendLog(msg);
      const dlg = document.querySelector('#inn-dialog');
      if (dlg) dlg.close();
    },

    openTempleModal(trigger = null) {
      this.templeName = trigger?.name || 'Temple of the Triad';
      const dlg = document.querySelector('#temple-dialog');
      if (dlg) dlg.showModal();
    },

    getResurrectCost(hero) {
      const mult = hero?.status === 'Ashes' ? 80 : 40;
      return mult * Math.max(1, hero?.level || 1);
    },

    purifyHeroAtTemple(heroId) {
      const hero = this.state.roster.find(c => c.id === heroId);
      if (!hero) return;
      if (isHeroDead(hero)) {
        this.notify(`${hero.name} requires resurrection first.`);
        return;
      }
      if (hero.status === 'OK') {
        this.notify(`${hero.name} has no status ailments to purify.`);
        return;
      }
      const cost = 10;
      if ((this.state.gold || 0) < cost) {
        this.notify(`Purifying ${hero.name} requires a 10 GP temple offering.`);
        return;
      }
      const oldStatus = hero.status;
      this.state.gold -= cost;
      hero.status = 'OK';
      delete hero.statusDuration;
      const msg = `Temple acolytes anoint ${hero.name} (-${cost} GP), cleansing ${oldStatus}!`;
      this.persist(msg);
      this.appendLog(msg);
    },

    resurrectHeroAtTemple(heroId) {
      const hero = this.state.roster.find(c => c.id === heroId);
      if (!hero) return;
      const isDead = isHeroDead(hero);
      if (!isDead) {
        this.notify(`${hero.name} does not need resurrection.`);
        return;
      }
      const cost = this.getResurrectCost(hero);
      if ((this.state.gold || 0) < cost) {
        this.notify(`Insufficient gold! Resurrecting ${hero.name} requires a tithe of ${cost} GP.`);
        return;
      }

      const wasAshes = hero.status === 'Ashes';
      this.state.gold -= cost;
      hero.status = 'OK';
      delete hero.statusDuration;
      hero.derived.hp = Math.max(1, Math.ceil(hero.derived.maxHp * (wasAshes ? 1.0 : 0.5)));
      const riteName = wasAshes ? 'Grand Rite of Reconstitution' : 'Rite of Returning';
      const msg = `High Priests chant the ${riteName} (-${cost} GP). ${hero.name} rises with ${hero.derived.hp}/${hero.derived.maxHp} HP!`;
      this.persist(msg);
      this.appendLog(msg);
    },

    blessPartyAtTemple() {
      const cost = 20;
      if ((this.state.gold || 0) < cost) {
        this.notify(`Insufficient gold! The Hymn of Restoration requires a 20 GP offering.`);
        return;
      }
      this.state.gold -= cost;
      for (const entry of this.state.party) {
        const hero = this.state.roster.find(c => c.id === entry.charId);
        if (hero && !isHeroDead(hero)) {
          hero.status = 'OK';
          delete hero.statusDuration;
          hero.derived.hp = hero.derived.maxHp;
        }
      }
      const msg = `The priests chant a Hymn of the Triad (-${cost} GP). All living party members are healed to full HP and purified of ailments!`;
      this.persist(msg);
      this.appendLog(msg);
    },

    // --- Overworld, Town & Dungeon Exploration Computed & Actions ---
    get currentMap() {
      return getMapById(this.maps, this.state.location?.mapId);
    },

    get isDungeonMode() {
      return this.currentMap?.mode === 'dungeon';
    },

    get partyFacing() {
      return normalizeFacing(this.state.location?.facing);
    },

    get partyFacingLabel() {
      return FACING_META[this.partyFacing].label;
    },

    get partyFacingArrow() {
      return FACING_META[this.partyFacing].arrow;
    },

    get dungeonMinimapRows() {
      return buildDungeonMinimapRows(this.currentMap, this.tiles, this.state);
    },

    get triggerAhead() {
      return getTriggerAhead(this.state, this.maps);
    },

    get canUnlockAhead() {
      return Boolean(
        this.triggerAhead &&
          this.triggerAhead.type === 'locked_door' &&
          !isDoorUnlocked(this.state, this.triggerAhead)
      );
    },

    isTriggerConsumed(trigger) {
      return isFeatureConsumed(this.state, trigger);
    },

    isChestTrapSafe(trigger) {
      return isChestTrapDisarmed(this.state, trigger);
    },

    refreshDungeonCanvas() {
      if (!this.isDungeonMode) return;
      queueMicrotask(() => {
        const canvas = document.querySelector('#dungeon-canvas');
        if (canvas) {
          renderDungeonViewport(canvas, {
            map: this.currentMap,
            tiles: this.tiles,
            state: this.state
          });
        }
      });
    },

    get currentTile() {
      return getTileDefAt(
        this.currentMap,
        this.tiles,
        this.state.location?.x ?? 16,
        this.state.location?.y ?? 14
      );
    },

    get currentTrigger() {
      return getTriggerAt(
        this.currentMap,
        this.state.location?.x ?? 16,
        this.state.location?.y ?? 14
      );
    },

    get adjacentTriggers() {
      return getAdjacentTriggers(
        this.currentMap,
        this.state.location?.x ?? 16,
        this.state.location?.y ?? 14
      );
    },

    get viewportRows() {
      return buildViewportRows(
        this.currentMap,
        this.tiles,
        this.state.location?.x ?? 16,
        this.state.location?.y ?? 14
      );
    },

    describeCell(cell) {
      if (!cell || !cell.tile) return '';
      const terrainLabel = cell.tile.passable ? cell.tile.name : `${cell.tile.name} (Impassable)`;
      if (cell.isParty) {
        return cell.trigger
          ? `Your Party — ${cell.trigger.name} (${cell.tile.name})`
          : `Your Party — ${cell.tile.name}`;
      }
      if (cell.trigger) {
        return `${cell.trigger.name} (${cell.tile.name})`;
      }
      return terrainLabel;
    },

    turnParty(turnDir = 'right') {
      if (!this.isDungeonMode) return;
      this.state.location.facing = turnFacing(this.partyFacing, turnDir);
      this.persist(`Turned to face ${this.partyFacingLabel} (${this.partyFacingArrow}).`);
      this.refreshDungeonCanvas();
    },

    stepPartyDungeon(stepDir = 'forward') {
      if (!this.canEmbark || !this.isDungeonMode) return;
      const result = stepDungeon(
        this.state,
        this.maps,
        this.tiles,
        stepDir,
        this.partyMembersDetailed,
        this.itemsById
      );

      let stepNotes = [];
      if (result.moved) {
        const tick = tickOverworldStepEffects(this.state);
        stepNotes = tick.notes || [];
      }

      this.persist();
      this.refreshDungeonCanvas();

      if (result.log) {
        this.appendLog(result.log);
      }
      for (const note of stepNotes) {
        this.appendLog(note);
      }

      // Check if a lethal floor trap wiped out the entire party
      if (result.trapSprung && !this.partyMembersDetailed.some(isHeroAlive)) {
        this.revivePartyAfterDefeat();
        return;
      }

      // Trigger Fixed / Boss Encounter immediately if stepped onto
      if (result.fixedEncounter) {
        this.startFixedCombatEncounter(result.fixedEncounter);
        return;
      }

      // Roll random dungeon encounter on normal floor movement
      if (result.moved && !result.trigger) {
        const floorRate = typeof this.currentMap?.encounterRate === 'number'
          ? this.currentMap.encounterRate
          : 0.10;
        if (Math.random() < floorRate) {
          this.startCombatEncounter({
            id: this.currentMap?.encounterTable || 'despise_b1',
            name: this.currentMap?.name || 'Dungeon Corridor'
          });
        }
      }
    },

    unlockDoorAhead() {
      if (!this.isDungeonMode) return;
      const res = attemptUnlockDungeonDoor({
        state: this.state,
        maps: this.maps,
        partyMembers: this.partyMembersDetailed,
        itemsById: this.itemsById
      });
      this.persist(res.log);
      this.appendLog(res.log);
      this.refreshDungeonCanvas();
    },

    searchAndDisarmDungeon() {
      if (!this.isDungeonMode) return;
      const res = attemptSearchAndDisarm({
        state: this.state,
        maps: this.maps,
        partyMembers: this.partyMembersDetailed,
        itemsById: this.itemsById
      });
      this.persist(res.log);
      this.appendLog(res.log);
      this.refreshDungeonCanvas();
      if (res.trapSprung && !this.partyMembersDetailed.some(isHeroAlive)) {
        this.revivePartyAfterDefeat();
      }
    },

    moveParty(dirKey) {
      if (!this.canEmbark) return;
      if (this.isDungeonMode) {
        if (dirKey === 'N') this.stepPartyDungeon('forward');
        else if (dirKey === 'S') this.stepPartyDungeon('back');
        else if (dirKey === 'W') this.turnParty('left');
        else if (dirKey === 'E') this.turnParty('right');
        return;
      }
      const result = attemptMove(this.state, this.maps, this.tiles, dirKey);
      let stepNotes = [];
      if (result.moved) {
        const tick = tickOverworldStepEffects(this.state);
        stepNotes = tick.notes || [];
      }
      this.persist();
      if (result.log) {
        this.appendLog(result.log);
      }
      for (const note of stepNotes) {
        this.appendLog(note);
      }

      if (
        result.moved &&
        !result.transitioned &&
        !result.trigger &&
        this.currentMap?.mode === 'overworld' &&
        shouldTriggerRandomEncounter(result.tile)
      ) {
        this.startCombatEncounter(result.tile);
      }
    },

    startCombatEncounter(tileDef) {
      const terrainId = tileDef?.id || (this.isDungeonMode ? (this.currentMap?.encounterTable || 'despise_b1') : 'grass');
      const terrainName = tileDef?.name || (this.isDungeonMode ? this.currentMap?.name : 'Wilderness');
      const lightActive = (this.state.location?.lightSteps || 0) > 0;
      const dungeonDepth = this.isDungeonMode ? (this.currentMap?.dungeonDepth || 1) : 0;

      this.combat = createEncounter({
        terrainId,
        terrainName,
        monstersById: this.monstersById,
        encounters: this.encounters,
        partyMembers: this.partyMembersDetailed,
        itemsById: this.itemsById,
        lightActive,
        dungeonDepth,
        isDarkness: this.isDungeonMode && !lightActive
      });

      this.screen = 'combat';
      this.syncDocumentTitle();

      const groupNames = this.combat.groups
        .map(g => `${g.units.length} ${g.units.length === 1 ? g.name : g.pluralName}`)
        .join(', ');
      this.appendLog(`Battle joined in ${terrainName}: ${groupNames}!`);

      if (this.combat.surprise === 'enemy') {
        executeEnemyAmbushRound(this.combat, this.state);
        this.persist();
      }
      this.scrollCombatLogToBottom();
    },

    startFixedCombatEncounter(trigger) {
      if (!trigger) return;
      const lightActive = (this.state.location?.lightSteps || 0) > 0;
      const dungeonDepth = this.isDungeonMode ? (this.currentMap?.dungeonDepth || 1) : 0;

      this.combat = createEncounter({
        terrainId: this.currentMap?.encounterTable || 'despise_b1',
        terrainName: trigger.name || this.currentMap?.name || 'Dungeon Chamber',
        monstersById: this.monstersById,
        encounters: this.encounters,
        partyMembers: this.partyMembersDetailed,
        itemsById: this.itemsById,
        lightActive,
        dungeonDepth,
        fixedGroups: trigger.groups || [],
        isDarkness: this.isDungeonMode && !lightActive,
        onVictoryFlag: trigger.flag || null,
        victoryTitle: trigger.victoryTitle || null,
        bonusLoot: trigger.bonusLoot || []
      });

      this.screen = 'combat';
      this.syncDocumentTitle();

      const groupNames = this.combat.groups
        .map(g => `${g.units.length} ${g.units.length === 1 ? g.name : g.pluralName}`)
        .join(', ');
      this.appendLog(`Guardian Battle — ${trigger.name}: ${groupNames}!`);

      if (this.combat.surprise === 'enemy') {
        executeEnemyAmbushRound(this.combat, this.state);
        this.persist();
      }
      this.scrollCombatLogToBottom();
    },

    // --- Combat Computed & Actions ---
    get livingCombatHeroes() {
      return this.partyMembersDetailed.filter(canHeroActInCombat);
    },

    get frontLineCollapsed() {
      const anyFrontAlive = this.partyMembersDetailed.some(m => m.row === 'front' && isHeroAlive(m));
      return !anyFrontAlive && this.partyMembersDetailed.some(isHeroAlive);
    },

    get activeCombatHero() {
      if (!this.combat || this.combat.phase !== 'input') return null;
      return this.livingCombatHeroes[this.combat.activeHeroIndex] || null;
    },

    get activeHeroEffectiveRow() {
      const hero = this.activeCombatHero;
      if (!hero) return 'back';
      return getEffectiveHeroRow(hero, this.partyMembersDetailed);
    },

    get activeHeroAttackProfile() {
      const hero = this.activeCombatHero;
      if (!hero) return { canAttack: false, weaponName: 'Unarmed', reason: '' };
      return getHeroAttackProfile(hero, this.activeHeroEffectiveRow, this.itemsById);
    },

    get activeHeroCombatSpells() {
      const hero = this.activeCombatHero;
      if (!hero) return [];
      return getHeroSpellbook(hero, this.spells, this.classesById, 'combat');
    },

    get activeHeroCastableCombatSpells() {
      return this.activeHeroCombatSpells.filter(e => e.canCast);
    },

    get selectedCombatSpellEntry() {
      const list = this.activeHeroCombatSpells;
      if (!this.combat || list.length === 0) return null;
      return (
        list.find(e => e.spell.id === this.combat.selectedCombatSpellId) ||
        list.find(e => e.canCast) ||
        list[0]
      );
    },

    get allCombatActionsQueued() {
      if (!this.combat || this.combat.phase !== 'input') return false;
      const anyAlive = this.partyMembersDetailed.some(isHeroAlive);
      if (!anyAlive) return false;
      const actable = this.livingCombatHeroes;
      if (actable.length === 0) return true; // All living heroes are asleep/paralyzed -> allow resolving round
      return this.combat.activeHeroIndex >= actable.length;
    },

    getCombatAvailableQty(itemId) {
      const totalInPack = getInventoryQty(this.state, itemId);
      if (!this.combat || !this.combat.queuedActions) return totalInPack;
      let queuedCount = 0;
      for (const act of Object.values(this.combat.queuedActions)) {
        if (act && act.type === 'use_item' && act.itemId === itemId) {
          queuedCount += 1;
        }
      }
      return Math.max(0, totalInPack - queuedCount);
    },

    get combatAvailableConsumables() {
      return this.packEntriesDetailed
        .filter(e => e.item.slot === 'consumable' && e.item.category !== 'utility')
        .map(e => ({
          ...e,
          availableQty: this.getCombatAvailableQty(e.itemId)
        }))
        .filter(e => e.availableQty > 0);
    },

    getGroupLivingCount(group) {
      return getLivingUnitsInGroup(group).length;
    },

    getHeroCombatRowLabel(member) {
      const effective = getEffectiveHeroRow(member, this.partyMembersDetailed);
      if (member.row === 'back' && effective === 'front') {
        return 'EXPOSED FRONT';
      }
      return member.row.toUpperCase();
    },

    getHeroQueuedActionLabel(charId) {
      const hero = this.state.roster.find(c => c.id === charId);
      if (hero && (hero.status === 'Sleep' || hero.status === 'Paralysis')) {
        return `Incapacitated (${hero.status})`;
      }
      if (!this.combat || !this.combat.queuedActions[charId]) return 'Awaiting order...';
      return this.combat.queuedActions[charId].label;
    },

    chooseCombatAttack() {
      if (!this.combat || this.combat.phase !== 'input') return;
      const hero = this.activeCombatHero;
      if (!hero) return;

      const profile = this.activeHeroAttackProfile;
      if (!profile.canAttack) {
        this.notify(`${hero.name} is in the Back Row with no ranged/reach weapon and cannot Attack!`);
        return;
      }

      this.combat.selectingItem = false;
      this.combat.selectingSpell = false;
      const livingGroups = getLivingEnemyGroups(this.combat);
      if (livingGroups.length === 0) return;

      if (livingGroups.length === 1) {
        this.selectCombatTargetGroup(livingGroups[0].id);
      } else {
        this.combat.selectingTarget = true;
        this.notify(`Select an enemy group (1–${this.combat.groups.length}) for ${hero.name} to attack.`);
      }
    },

    selectCombatTargetGroup(groupId) {
      if (!this.combat || this.combat.phase !== 'input') return;
      const hero = this.activeCombatHero;
      if (!hero) return;

      const group = this.combat.groups.find(g => g.id === groupId);
      if (!group || this.getGroupLivingCount(group) === 0) return;

      // If currently choosing an enemy-targeted spell, queue the spell on this group
      if (this.combat.selectingSpell) {
        const entry = this.selectedCombatSpellEntry;
        if (
          entry &&
          entry.canCast &&
          (entry.spell.targetType === 'enemy_single' || entry.spell.targetType === 'enemy_group')
        ) {
          this.combat.queuedActions[hero.id] = {
            type: 'cast',
            spellId: entry.spell.id,
            targetGroupId: group.id,
            label: `Cast ${entry.spell.name} -> ${group.label}`
          };
          this.combat.selectingSpell = false;
          this.combat.selectingTarget = false;
          this.combat.selectingItem = false;
          this.combat.activeHeroIndex += 1;
          return;
        }
      }

      const profile = this.activeHeroAttackProfile;
      if (!profile.canAttack) {
        this.notify(`${hero.name} is in the Back Row and cannot attack in melee!`);
        return;
      }

      this.combat.queuedActions[hero.id] = {
        type: 'attack',
        targetGroupId: group.id,
        label: `Attack ${group.label} (${group.name})`
      };
      this.combat.selectingTarget = false;
      this.combat.selectingItem = false;
      this.combat.selectingSpell = false;
      this.combat.activeHeroIndex += 1;
    },

    chooseCombatCast() {
      if (!this.combat || this.combat.phase !== 'input') return;
      const hero = this.activeCombatHero;
      if (!hero) return;

      if (hero.status === 'Silence') {
        this.notify(`${hero.name} is Silenced and cannot cast spells!`);
        return;
      }

      const allSpells = this.activeHeroCombatSpells;
      if (allSpells.length === 0) {
        this.notify(`${hero.name} (${hero.className}) does not practice magic.`);
        return;
      }

      const castable = this.activeHeroCastableCombatSpells;
      if (castable.length === 0) {
        this.notify(`${hero.name} does not have enough MP for any unlocked combat spell!`);
        return;
      }

      this.combat.selectingTarget = false;
      this.combat.selectingItem = false;
      this.combat.selectingSpell = !this.combat.selectingSpell;
      if (this.combat.selectingSpell) {
        this.combat.selectedCombatSpellId = castable[0].spell.id;
      }
    },

    selectCombatSpellPill(spellId) {
      if (!this.combat || this.combat.phase !== 'input') return;
      this.combat.selectedCombatSpellId = spellId;
    },

    queueCombatSpellTargetAlly(targetHeroId) {
      if (!this.combat || this.combat.phase !== 'input') return;
      const hero = this.activeCombatHero;
      const entry = this.selectedCombatSpellEntry;
      const targetHero = this.state.roster.find(c => c.id === targetHeroId);
      if (!hero || !entry || !entry.canCast || !targetHero) return;

      this.combat.queuedActions[hero.id] = {
        type: 'cast',
        spellId: entry.spell.id,
        targetHeroId,
        label: `Cast ${entry.spell.name} -> ${targetHero.name}`
      };
      this.combat.selectingSpell = false;
      this.combat.selectingTarget = false;
      this.combat.selectingItem = false;
      this.combat.activeHeroIndex += 1;
    },

    queueCombatSpellOnPartyOrAll() {
      if (!this.combat || this.combat.phase !== 'input') return;
      const hero = this.activeCombatHero;
      const entry = this.selectedCombatSpellEntry;
      if (!hero || !entry || !entry.canCast) return;

      const targetLabel =
        entry.spell.targetType === 'enemy_all' ? 'All Enemies' : 'Party';
      this.combat.queuedActions[hero.id] = {
        type: 'cast',
        spellId: entry.spell.id,
        label: `Cast ${entry.spell.name} (${targetLabel})`
      };
      this.combat.selectingSpell = false;
      this.combat.selectingTarget = false;
      this.combat.selectingItem = false;
      this.combat.activeHeroIndex += 1;
    },

    chooseCombatUseItem() {
      if (!this.combat || this.combat.phase !== 'input') return;
      const available = this.combatAvailableConsumables;
      if (available.length === 0) {
        this.notify('No usable consumables remaining in the Party Pack!');
        return;
      }
      this.combat.selectingTarget = false;
      this.combat.selectingSpell = false;
      this.combat.selectingItem = !this.combat.selectingItem;
      if (this.combat.selectingItem) {
        this.combat.selectedCombatItemId = available[0].itemId;
      }
    },

    queueCombatItemTarget(targetHeroId) {
      if (!this.combat || this.combat.phase !== 'input') return;
      const hero = this.activeCombatHero;
      const itemId = this.combat.selectedCombatItemId;
      const itemDef = this.itemsById[itemId];
      const targetHero = this.state.roster.find(c => c.id === targetHeroId);
      if (!hero || !itemDef || !targetHero) return;

      if (this.getCombatAvailableQty(itemId) <= 0) {
        this.notify(`No ${itemDef.name} left to queue this round!`);
        return;
      }

      this.combat.queuedActions[hero.id] = {
        type: 'use_item',
        itemId,
        targetHeroId,
        label: `Use ${itemDef.name} -> ${targetHero.name}`
      };
      this.combat.selectingItem = false;
      this.combat.selectingTarget = false;
      this.combat.selectingSpell = false;
      this.combat.activeHeroIndex += 1;
    },

    chooseCombatDefend() {
      if (!this.combat || this.combat.phase !== 'input') return;
      const hero = this.activeCombatHero;
      if (!hero) return;

      this.combat.queuedActions[hero.id] = {
        type: 'defend',
        label: 'Defend (+2 AC, ½ Dmg)'
      };
      this.combat.selectingTarget = false;
      this.combat.selectingItem = false;
      this.combat.selectingSpell = false;
      this.combat.activeHeroIndex += 1;
    },

    chooseCombatRun() {
      if (!this.combat || this.combat.phase !== 'input') return;
      const hero = this.activeCombatHero;
      if (!hero) return;

      this.combat.queuedActions[hero.id] = {
        type: 'run',
        label: 'Run (Attempt Retreat)'
      };
      this.combat.selectingTarget = false;
      this.combat.selectingItem = false;
      this.combat.selectingSpell = false;
      this.combat.activeHeroIndex += 1;
    },

    prevCombatHero() {
      if (!this.combat || this.combat.phase !== 'input') return;
      if (this.combat.selectingTarget || this.combat.selectingItem || this.combat.selectingSpell) {
        this.combat.selectingTarget = false;
        this.combat.selectingItem = false;
        this.combat.selectingSpell = false;
        return;
      }
      if (this.combat.activeHeroIndex > 0) {
        this.combat.activeHeroIndex -= 1;
        const hero = this.activeCombatHero;
        if (hero) {
          delete this.combat.queuedActions[hero.id];
        }
      }
    },

    executeCombatRound() {
      if (!this.combat || this.combat.phase !== 'input') return;
      resolveCombatRound(this.combat, this.state, this.gameDataBundle);
      this.persist();
      this.scrollCombatLogToBottom();
    },

    finishCombat() {
      if (!this.combat) return;
      const phase = this.combat.phase;
      const rewards = this.combat.rewards;
      const recalledToTown = this.combat.recalledToTown;
      const victoryTitle = this.combat.victoryTitle;
      this.combat = null;
      this.screen = 'overworld';
      this.syncDocumentTitle();

      if (phase === 'victory' && rewards) {
        const titlePrefix = victoryTitle ? `[${victoryTitle}] ` : '';
        const lvlMsg = rewards.levelUps.length > 0
          ? ` Level Up: ${rewards.levelUps.map(u => `${u.charName} -> Lv ${u.newLevel}`).join(', ')}!`
          : '';
        const dropMsg = rewards.lootDrops?.length > 0
          ? ` Looted: ${rewards.lootDrops.map(d => `${d.name}${d.qty > 1 ? ` x${d.qty}` : ''}`).join(', ')}!`
          : '';
        this.appendLog(
          `${titlePrefix}Victory! Gained ${rewards.xpEach} XP each and ${rewards.goldTotal} GP.${dropMsg}${lvlMsg}`
        );
      } else if (phase === 'fled') {
        if (recalledToTown) {
          this.state.location.mode = 'overworld';
          this.state.location.mapId = 'avalon';
          this.state.location.x = 16;
          this.state.location.y = 13;
          this.appendLog('Ethereal Recall warps the party safely to the gates of Oakhaven!');
        } else {
          this.appendLog('Your party escaped from battle and regrouped.');
        }
      }
      this.persist();
      this.refreshDungeonCanvas();
    },

    revivePartyAfterDefeat() {
      const tithe = Math.floor((this.state.gold || 0) / 2);
      this.state.gold = Math.max(0, (this.state.gold || 0) - tithe);

      for (const entry of this.state.party) {
        const hero = this.state.roster.find(c => c.id === entry.charId);
        if (hero) {
          hero.status = 'OK';
          hero.derived.hp = Math.max(1, Math.floor(hero.derived.maxHp / 2));
        }
      }

      this.state.location.mode = 'town';
      this.state.location.mapId = 'town_oakhaven';
      this.state.location.x = 12;
      this.state.location.y = 12;

      this.combat = null;
      this.screen = 'overworld';
      this.syncDocumentTitle();
      this.persist();
      this.appendLog(
        `Acolytes of the Triad carried your fallen party to Oakhaven Temple and revived you (Tithe: ${tithe} GP).`
      );
    },

    enterOrInteract() {
      if (this.isDungeonMode) {
        const dRes = attemptDungeonInteract({
          state: this.state,
          maps: this.maps,
          partyMembers: this.partyMembersDetailed,
          itemsById: this.itemsById
        });
        this.persist();
        if (dRes.log) {
          this.appendLog(dRes.log);
        }
        this.refreshDungeonCanvas();
        if (dRes.fixedEncounter) {
          this.startFixedCombatEncounter(dRes.fixedEncounter);
          return;
        }
        if (!this.partyMembersDetailed.some(isHeroAlive)) {
          this.revivePartyAfterDefeat();
        }
        return;
      }

      const result = attemptEnterLocation(this.state, this.maps);
      if (result.service === 'guild') {
        this.appendLog("Entering the Adventurers' Guild Roster...");
        this.persist();
        this.screen = 'tavern';
        this.syncDocumentTitle();
        return;
      }
      if (result.service === 'shop') {
        this.openShopModal(result.trigger);
        return;
      }
      if (result.service === 'inn') {
        this.openInnModal(result.trigger);
        return;
      }
      if (result.service === 'temple') {
        this.openTempleModal(result.trigger);
        return;
      }
      if (result.enteredDungeon && this.currentMap) {
        markDungeonTileExplored(this.state, this.currentMap.id, this.state.location.x, this.state.location.y);
      }
      this.persist();
      if (result.log) {
        this.appendLog(result.log);
      }
      this.refreshDungeonCanvas();
    },

    talkNearby() {
      const result = attemptTalkNearby(this.state, this.maps);
      if (result.log) {
        this.appendLog(result.log);
      }
    },

    leaveCurrentTown() {
      if (this.currentMap?.mode !== 'town') {
        this.appendLog('You are already on the Overworld.');
        return;
      }
      const result = exitTownToOverworld(this.state, this.maps);
      this.persist();
      if (result.log) {
        this.appendLog(result.log);
      }
    },

    waitTurn() {
      this.state.location.steps = (this.state.location.steps || 0) + 1;
      const tick = tickOverworldStepEffects(this.state);
      this.persist();
      this.appendLog('Pass — The party holds position.');
      for (const note of tick.notes || []) {
        this.appendLog(note);
      }
      this.refreshDungeonCanvas();
    },

    // --- Party & Roster Computed Helpers ---
    get partyMembersDetailed() {
      return this.state.party
        .map(entry => {
          const char = this.state.roster.find(c => c.id === entry.charId);
          return char ? { ...char, row: entry.row } : null;
        })
        .filter(Boolean);
    },

    get frontRowMembers() {
      return this.partyMembersDetailed.filter(m => m.row === 'front');
    },

    get backRowMembers() {
      return this.partyMembersDetailed.filter(m => m.row === 'back');
    },

    get canEmbark() {
      const count = this.state.party.length;
      return count >= this.minPartySize && count <= this.maxPartySize && this.frontRowMembers.length >= 1;
    },

    isInParty(charId) {
      return this.state.party.some(p => p.charId === charId);
    },

    getPartyRow(charId) {
      const found = this.state.party.find(p => p.charId === charId);
      return found ? found.row : null;
    },

    // --- Party Management Actions ---
    addToParty(charId) {
      if (this.isInParty(charId)) return;
      if (this.state.party.length >= this.maxPartySize) {
        this.notify(`Party is already at maximum capacity (${this.maxPartySize} heroes).`);
        return;
      }
      const char = this.state.roster.find(c => c.id === charId);
      if (!char) return;

      let targetRow = char.preferredRow || 'front';
      if (targetRow === 'front' && this.frontRowMembers.length >= this.maxFrontRow) {
        targetRow = 'back';
      }

      this.state.party.push({ charId, row: targetRow });
      this.persist(`${char.name} joined the active party (${targetRow.toUpperCase()} row).`);
    },

    removeFromParty(charId) {
      const char = this.state.roster.find(c => c.id === charId);
      this.state.party = this.state.party.filter(p => p.charId !== charId);
      this.persist(char ? `${char.name} returned to the tavern benches.` : 'Hero removed from party.');
    },

    togglePartyRow(charId) {
      const entry = this.state.party.find(p => p.charId === charId);
      if (!entry) return;
      const char = this.state.roster.find(c => c.id === charId);

      if (entry.row === 'back') {
        if (this.frontRowMembers.length >= this.maxFrontRow) {
          this.notify(`Front row only holds ${this.maxFrontRow} melee slots! Move someone back first.`);
          return;
        }
        entry.row = 'front';
      } else {
        entry.row = 'back';
      }
      this.persist(`${char?.name || 'Hero'} moved to ${entry.row.toUpperCase()} row.`);
    },

    movePartyOrder(index, direction) {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= this.state.party.length) return;
      const copy = [...this.state.party];
      const [moved] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, moved);
      this.state.party = copy;
      this.persist('Party marching order updated.');
    },

    disbandParty() {
      this.state.party = [];
      this.persist('Active party disbanded back to the roster.');
    },

    quickRollParty() {
      const existingNames = this.state.roster.map(c => c.name);
      const availableSlots = this.maxRosterSize - this.state.roster.length;
      if (availableSlots < 4) {
        this.notify('Not enough free space in the roster to quick-roll a party.');
        return;
      }

      const generated = generateDefaultParty(
        this.gameDataBundle,
        existingNames
      ).slice(0, Math.min(4, availableSlots));

      this.state.roster.push(...generated);
      this.state.party = generated.map((char, idx) => ({
        charId: char.id,
        row: idx < 2 ? 'front' : 'back'
      }));
      this.persist(`Recruited a balanced 4-hero party (${generated.map(c => c.name).join(', ')}) with starter gear!`);
    },

    // --- Character Creation Wizard ---
    get selectedRace() {
      return this.racesById[this.draft.raceId] || this.races[0] || null;
    },

    get selectedClass() {
      return this.classesById[this.draft.classId] || this.classes[0] || null;
    },

    isClassValidForSelectedRace(classDef) {
      return isComboValid(this.selectedRace, classDef);
    },

    selectRace(raceId) {
      this.draft.raceId = raceId;
      if (!isComboValid(this.selectedRace, this.selectedClass)) {
        const firstValid = this.classes.find(c => isComboValid(this.selectedRace, c));
        if (firstValid) this.draft.classId = firstValid.id;
      }
      this.autoMeetClassMinimums();
    },

    selectClass(classId) {
      const candidate = this.classesById[classId];
      if (!isComboValid(this.selectedRace, candidate)) return;
      this.draft.classId = classId;
      this.autoMeetClassMinimums();
    },

    autoMeetClassMinimums() {
      const race = this.selectedRace;
      const cls = this.selectedClass;
      if (!race || !cls) return;

      const nextAlloc = { str: 0, dex: 0, int: 0, wis: 0 };
      for (const key of STAT_KEYS) {
        const diff = (cls.minStats[key] || 0) - race.baseStats[key];
        nextAlloc[key] = diff > 0 ? diff : 0;
      }
      this.draft.allocated = nextAlloc;
    },

    resetDraft() {
      this.draft.raceId = 'human';
      this.draft.classId = 'fighter';
      this.autoMeetClassMinimums();
      const existingNames = this.state.roster.map(c => c.name);
      this.draft.name = randomFantasyName(existingNames);
    },

    rollRandomName() {
      const existingNames = this.state.roster.map(c => c.name);
      this.draft.name = randomFantasyName([...existingNames, this.draft.name]);
    },

    get pointsSpent() {
      return STAT_KEYS.reduce((sum, k) => sum + (this.draft.allocated[k] || 0), 0);
    },

    get pointsRemaining() {
      return this.bonusPoolTotal - this.pointsSpent;
    },

    get draftFinalStats() {
      const race = this.selectedRace;
      if (!race) return { str: 10, dex: 10, int: 10, wis: 10 };
      return {
        str: race.baseStats.str + (this.draft.allocated.str || 0),
        dex: race.baseStats.dex + (this.draft.allocated.dex || 0),
        int: race.baseStats.int + (this.draft.allocated.int || 0),
        wis: race.baseStats.wis + (this.draft.allocated.wis || 0)
      };
    },

    get draftStarterKit() {
      const cls = this.selectedClass;
      if (!cls) return { weapon: null, armor: null, accessory: null };
      return getStarterEquipmentForClass(cls.id);
    },

    get draftDerived() {
      const race = this.selectedRace;
      const cls = this.selectedClass;
      if (!race || !cls) return { hp: 0, maxHp: 0, mp: 0, maxMp: 0, ac: 10, initiativeMod: 0 };
      return computeDerivedStats(
        this.draftFinalStats,
        race,
        cls,
        1,
        this.draftStarterKit,
        this.itemsById
      );
    },

    get draftMpFormulaNote() {
      const cls = this.selectedClass;
      if (!cls || !cls.magicSchool) return 'No Magic (Non-caster)';
      if (cls.magicSchool === 'arcane') return 'Arcane (Based on INT)';
      if (cls.mpRate < 1) return 'Divine Hybrid (WIS ÷ 2)';
      return 'Divine (Based on WIS)';
    },

    formatMod(val) {
      const mod = getStatMod(val);
      return mod >= 0 ? `+${mod}` : `${mod}`;
    },

    getStatFloor(key) {
      const race = this.selectedRace;
      const cls = this.selectedClass;
      if (!race || !cls) return 0;
      return Math.max(race.baseStats[key], cls.minStats[key] || 0);
    },

    canIncrementStat(key) {
      const race = this.selectedRace;
      if (!race || this.pointsRemaining <= 0) return false;
      return this.draftFinalStats[key] < race.maxStats[key];
    },

    canDecrementStat(key) {
      const race = this.selectedRace;
      if (!race) return false;
      return this.draftFinalStats[key] > this.getStatFloor(key);
    },

    adjustStat(key, delta) {
      if (delta > 0 && this.canIncrementStat(key)) {
        this.draft.allocated[key] += 1;
      } else if (delta < 0 && this.canDecrementStat(key)) {
        this.draft.allocated[key] -= 1;
      }
    },

    autoSpendRemainingPoints() {
      const cls = this.selectedClass;
      if (!cls) return;
      const priorities = {
        fighter: ['str', 'dex', 'wis', 'int'],
        paladin: ['str', 'wis', 'dex', 'int'],
        thief: ['dex', 'str', 'int', 'wis'],
        ranger: ['dex', 'wis', 'str', 'int'],
        cleric: ['wis', 'str', 'dex', 'int'],
        wizard: ['int', 'dex', 'wis', 'str']
      }[cls.id] || STAT_KEYS;

      let safety = 0;
      while (this.pointsRemaining > 0 && safety < 40) {
        safety++;
        for (const key of priorities) {
          if (this.pointsRemaining <= 0) break;
          if (this.canIncrementStat(key)) {
            this.draft.allocated[key] += 1;
          }
        }
      }
    },

    get draftValidation() {
      return validateCharacterDraft({
        name: this.draft.name,
        raceDef: this.selectedRace,
        classDef: this.selectedClass,
        allocatedPoints: this.draft.allocated
      });
    },

    submitNewCharacter() {
      if (!this.draftValidation.valid) {
        this.notify(this.draftValidation.errors[0]);
        return;
      }
      const newChar = createCharacter({
        name: this.draft.name,
        raceDef: this.selectedRace,
        classDef: this.selectedClass,
        stats: this.draftFinalStats,
        itemsById: this.itemsById
      });

      this.state.roster.push(newChar);

      // Auto-add to party if party has room
      if (this.state.party.length < this.maxPartySize) {
        let row = newChar.preferredRow || 'front';
        if (row === 'front' && this.frontRowMembers.length >= this.maxFrontRow) {
          row = 'back';
        }
        this.state.party.push({ charId: newChar.id, row });
      }

      this.persist(`${newChar.name} the ${newChar.raceName} ${newChar.className} inscribed into the Roster!`);
      this.screen = 'tavern';
      this.syncDocumentTitle();
    },

    // --- Modals (via native <dialog> + document.querySelector) ---
    openInspectModal(char) {
      this.inspectTarget = char;
      const dlg = document.querySelector('#inspect-dialog');
      if (dlg) dlg.showModal();
    },

    openRenameModal(char) {
      this.renameTarget = char;
      this.renameInput = char.name;
      const dlg = document.querySelector('#rename-dialog');
      if (dlg) dlg.showModal();
    },

    confirmRename() {
      if (!this.renameTarget || !this.renameInput.trim()) return;
      const target = this.state.roster.find(c => c.id === this.renameTarget.id);
      if (target) {
        const oldName = target.name;
        target.name = this.renameInput.trim().slice(0, 16);
        this.persist(`Renamed ${oldName} to ${target.name}.`);
      }
      const dlg = document.querySelector('#rename-dialog');
      if (dlg) dlg.close();
    },

    openDeleteModal(char) {
      this.deleteTarget = char;
      const dlg = document.querySelector('#delete-dialog');
      if (dlg) dlg.showModal();
    },

    confirmDeleteCharacter() {
      if (!this.deleteTarget) return;
      const id = this.deleteTarget.id;
      const name = this.deleteTarget.name;
      this.state.party = this.state.party.filter(p => p.charId !== id);
      this.state.roster = this.state.roster.filter(c => c.id !== id);
      this.deleteTarget = null;
      this.persist(`${name} was dismissed from the roster.`);
      const dlg = document.querySelector('#delete-dialog');
      if (dlg) dlg.close();
    },

    openSaveModal() {
      this.importError = '';
      this.importJsonText = JSON.stringify(this.state, null, 2);
      const dlg = document.querySelector('#save-dialog');
      if (dlg) dlg.showModal();
    },

    importSaveFromModal() {
      this.importError = '';
      try {
        const parsed = JSON.parse(this.importJsonText);
        this.state = normalizeSaveState(parsed);
        this.syncAllRosterDerived();
        this.persist('Save data imported and restored!');
        const dlg = document.querySelector('#save-dialog');
        if (dlg) dlg.close();
      } catch (err) {
        this.importError = 'Invalid JSON payload. Check syntax and try again.';
      }
    },

    downloadSaveFile() {
      const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `avalon-roster-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.notify('Save file exported.');
    },

    confirmWipeSave() {
      this.state = resetStorageState();
      this.notify('All save data wiped clean.');
      const dlg = document.querySelector('#wipe-dialog');
      if (dlg) dlg.close();
    }
  }));
}

if (window.Alpine) {
  registerApp();
} else {
  document.addEventListener('alpine:init', registerApp);
}
