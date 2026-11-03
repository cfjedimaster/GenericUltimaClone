const cache = {};

export async function loadGameData() {
  if (cache.loaded) {
    return cache;
  }

  const [racesRes, classesRes, mapsRes, monstersRes, encountersRes, itemsRes, spellsRes] = await Promise.all([
    fetch('./data/races.json'),
    fetch('./data/classes.json'),
    fetch('./data/maps.json'),
    fetch('./data/monsters.json'),
    fetch('./data/encounters.json'),
    fetch('./data/items.json'),
    fetch('./data/spells.json')
  ]);

  if (
    !racesRes.ok ||
    !classesRes.ok ||
    !mapsRes.ok ||
    !monstersRes.ok ||
    !encountersRes.ok ||
    !itemsRes.ok ||
    !spellsRes.ok
  ) {
    throw new Error('Failed to load game definition files from ./data/');
  }

  const races = await racesRes.json();
  const classes = await classesRes.json();
  const mapsData = await mapsRes.json();
  const monsters = await monstersRes.json();
  const encounters = await encountersRes.json();
  const items = await itemsRes.json();
  const spells = await spellsRes.json();

  cache.races = races;
  cache.classes = classes;
  cache.racesById = Object.fromEntries(races.map(r => [r.id, r]));
  cache.classesById = Object.fromEntries(classes.map(c => [c.id, c]));
  cache.tiles = mapsData.tiles || {};
  cache.maps = mapsData.maps || {};
  cache.monsters = monsters;
  cache.monstersById = Object.fromEntries(monsters.map(m => [m.id, m]));
  cache.encounters = encounters;
  cache.items = items;
  cache.itemsById = Object.fromEntries(items.map(i => [i.id, i]));
  cache.spells = spells;
  cache.spellsById = Object.fromEntries(spells.map(s => [s.id, s]));
  cache.loaded = true;

  return cache;
}
