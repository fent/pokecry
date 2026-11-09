/**
 * PokeAPI import CLI.
 *
 * This module only parses arguments and coordinates the import. PokeAPI CSV
 * loading, form planning, media conversion, and src/pokemon.ts rewriting live
 * in scripts/import/.
 *
 *   node scripts/import-pokemon.js --gen <1-9> --ids <id|range> [--force]
 *   node scripts/import-pokemon.js --normalize-audio
 */
import { GENERATIONS, USAGE } from './import/config.js';
import { loadCsv } from './import/files.js';
import { normalizeAudio, requireFfmpeg } from './import/media.js';
import { updateData } from './import/pokemon-data.js';
import { importSpecies } from './import/species.js';

const args = process.argv.slice(2);

const getArg = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

// Accepts "6", "1-9", and comma-separated combinations of both.
const parseIds = (value) => {
  if (!value) {
    throw new Error('Missing --ids');
  }

  return value.split(',').flatMap((part) => {
    const match = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!match) {
      throw new Error(`Invalid ID range: ${part}`);
    }

    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (end < start) {
      throw new Error(`Invalid ID range: ${part}`);
    }

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });
};

const importPokemon = async (generation, ids, force) => {
  requireFfmpeg();
  const config = GENERATIONS[generation];
  if (!config) {
    throw new Error(`Unsupported generation: ${generation}`);
  }

  // Load the three PokeAPI tables once, then index them by species and form.
  const speciesRows = await loadCsv('pokemon_species.csv', force);
  const pokemonRows = await loadCsv('pokemon.csv', force);
  const formRows = await loadCsv('pokemon_forms.csv', force);

  const speciesById = new Map(speciesRows.map((row) => [Number(row.id), row]));
  const pokemonBySpecies = new Map();
  for (const row of pokemonRows) {
    const list = pokemonBySpecies.get(row.species_id) ?? [];
    list.push(row);
    pokemonBySpecies.set(row.species_id, list);
  }
  const formsByPokemon = new Map();
  for (const row of formRows) {
    const list = formsByPokemon.get(row.pokemon_id) ?? [];
    list.push(row);
    formsByPokemon.set(row.pokemon_id, list);
  }

  const entries = [];
  const skipped = [];
  let formCount = 0;

  // importSpecies handles one species at a time; this loop only collects the
  // resulting data entries and diagnostics.
  for (const id of ids) {
    const species = speciesById.get(id);
    if (!species) {
      throw new Error(`Species ${id} was not found in PokeAPI data`);
    }

    const result = await importSpecies({
      id,
      species,
      config,
      generation,
      force,
      variants: pokemonBySpecies.get(String(id)) ?? [],
      formsByPokemon,
    });
    entries.push(result.entry);
    skipped.push(...result.skipped);
    formCount += result.formCount;
  }

  const added = updateData(config.dataKey, entries);
  console.log(
    `Imported ${entries.length} Pokemon for generation ${generation}; ` +
      `added ${added} data entries; ${formCount} forms.`,
  );
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} forms:\n${skipped.join('\n')}`);
  }
};

const main = async () => {
  if (args.includes('--help') || args.length === 0) {
    console.log(USAGE);
    return;
  }

  if (args.includes('--normalize-audio')) {
    normalizeAudio();
    return;
  }

  const generation = Number(getArg('--gen'));
  if (!GENERATIONS[generation]) {
    throw new Error('Missing or invalid --gen (expected 1-9)');
  }

  await importPokemon(generation, parseIds(getArg('--ids')), args.includes('--force'));
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
