import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache/pokecry-import');
const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';

// Pin these intentionally when refreshing source data.
const POKEAPI_SHA = '6ea97b5641faa12e090866e8144ae8f57764fc64';
const SPRITES_SHA = '1b3b7c0a538dd2226ae08d0d2f8955125075bbd4';
const CRIES_SHA = 'b3a9044bb839b5e3152aaa536c7b463a0fcf0140';

const GENERATIONS = {
  7: { spritesDir: 'sun-moon', dataKey: 'gen7' },
  8: { spritesDir: 'sword-shield', dataKey: 'gen8' },
  9: { spritesDir: 'scarlet-violet', dataKey: 'gen9' },
};

const USAGE = `Usage:
  node scripts/import-pokemon.mjs --gen <7|8|9> --ids <id|start-end>[, ...] [--force]
  node scripts/import-pokemon.mjs --normalize-audio

Options:
  --force             Redownload source files and overwrite existing assets.
  --normalize-audio   Convert all WAV cries in media/cries to mono 96 kbps MP3.

Requires ffmpeg on PATH. Set FFMPEG_BIN to use a different binary.
`;

const args = process.argv.slice(2);

const getArg = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

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

const download = async (url, path, force) => {
  if (!force && existsSync(path)) {
    return path;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  return path;
};

const downloadOptional = async (url, path, force) => {
  if (!force && existsSync(path)) {
    return path;
  }

  const response = await fetch(url);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  return path;
};

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') {
      field += character;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
};

const loadCsv = async (name, force) => {
  const url = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${POKEAPI_SHA}/data/v2/csv/${name}`;
  const path = join(CACHE, `pokeapi-${POKEAPI_SHA}`, name);
  await download(url, path, force);

  const rows = parseCsv(readFileSync(path, 'utf8'));
  const [header, ...body] = rows;
  return body.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index]])));
};

const requireFfmpeg = () => {
  try {
    execFileSync(FFMPEG, ['-version'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      `${FFMPEG} is required but was not found. Install ffmpeg ` +
        '(e.g. "sudo apt-get install ffmpeg" or "brew install ffmpeg").',
    );
  }
};

const findWavs = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return findWavs(path);
    }
    return entry.name.toLowerCase().endsWith('.wav') ? [path] : [];
  });

const normalizeAudio = () => {
  requireFfmpeg();
  const wavs = findWavs(join(ROOT, 'media/cries'));

  for (const wav of wavs) {
    const mp3 = wav.replace(/\.wav$/i, '.mp3');
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-b:a', '96k', mp3], {
      stdio: 'inherit',
    });
    rmSync(wav);
  }

  console.log(`Converted ${wavs.length} WAV cries to MP3.`);
};

const formSuffix = (speciesIdentifier, pokemon, form) => {
  const suffix = form?.form_identifier || pokemon.identifier.slice(speciesIdentifier.length + 1);
  return suffix || '';
};

const isExcludedForm = (pokemon, form) =>
  form?.is_mega === '1' || form?.form_identifier === 'gmax' || pokemon.identifier.endsWith('-gmax');

const updateData = (dataKey, entries) => {
  const dataPath = join(ROOT, 'src/pokemon.ts');
  let data = readFileSync(dataPath, 'utf8');

  const start = data.indexOf(`pokemon.${dataKey} = [`);
  const arrayStart = start === -1 ? -1 : data.indexOf('[', start);
  const close = start === -1 ? -1 : data.indexOf('\n];', start);
  if (start === -1 || arrayStart === -1 || close === -1) {
    throw new Error(`Could not find pokemon.${dataKey} in src/pokemon.ts`);
  }

  const arrayText = data.slice(arrayStart, close + 2).replace(/,\s*]$/, ']');
  let existing;
  try {
    existing = JSON.parse(arrayText);
  } catch (error) {
    throw new Error(`Could not parse pokemon.${dataKey}: ${error.message}`, { cause: error });
  }

  const byId = new Map(existing.map((entry) => [entry.species_id, entry]));
  let added = 0;
  for (const entry of entries) {
    if (!byId.has(entry.species_id)) {
      added += 1;
    }
    byId.set(entry.species_id, entry);
  }

  const merged = [...byId.values()].sort(
    (left, right) => Number(left.species_id) - Number(right.species_id),
  );
  const body = merged
    .map((entry) => '  ' + JSON.stringify(entry, null, 2).replace(/\n/g, '\n  '))
    .join(',\n');

  data = data.slice(0, arrayStart + 1) + '\n' + body + (body ? ',\n' : '') + data.slice(close + 1);
  writeFileSync(dataPath, data);
  return added;
};

const importPokemon = async (generation, ids, force) => {
  requireFfmpeg();
  const config = GENERATIONS[generation];
  if (!config) {
    throw new Error(`Unsupported generation: ${generation}`);
  }

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
  const formByPokemon = new Map(formRows.map((row) => [row.pokemon_id, row]));

  const entries = [];
  const skipped = [];
  let formCount = 0;

  for (const id of ids) {
    const species = speciesById.get(id);
    if (!species) {
      throw new Error(`Species ${id} was not found in PokeAPI data`);
    }

    const identifier = species.identifier;
    const variants = pokemonBySpecies.get(String(id)) ?? [];
    const defaultVariant = variants.find((variant) => variant.is_default === '1') ?? variants[0];
    if (!defaultVariant) {
      throw new Error(`No Pokemon data found for species ${id}`);
    }

    const defaultSuffix = formSuffix(
      identifier,
      defaultVariant,
      formByPokemon.get(defaultVariant.id),
    );

    const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_SHA}/sprites/pokemon/${id}.png`;
    const cryUrl = `https://raw.githubusercontent.com/PokeAPI/cries/${CRIES_SHA}/cries/pokemon/latest/${id}.ogg`;
    const spriteSource = join(CACHE, `sprites-${SPRITES_SHA}`, `${id}.png`);
    const crySource = join(CACHE, `cries-${CRIES_SHA}`, `${id}.ogg`);

    await download(spriteUrl, spriteSource, force);
    await download(cryUrl, crySource, force);

    const spriteTarget = join(ROOT, 'media/sprites', config.spritesDir, `${id}.png`);
    const cryTarget = join(ROOT, 'media/cries', 'latest', `${id}.mp3`);
    mkdirSync(dirname(spriteTarget), { recursive: true });
    mkdirSync(dirname(cryTarget), { recursive: true });

    cpSync(spriteSource, spriteTarget);
    execFileSync(
      FFMPEG,
      ['-y', '-loglevel', 'error', '-i', crySource, '-ac', '1', '-b:a', '96k', cryTarget],
      { stdio: 'inherit' },
    );

    const forms = [];
    const seenForms = new Set();
    let formSounds = false;

    for (const variant of variants) {
      if (variant.id === defaultVariant.id) {
        continue;
      }

      const form = formByPokemon.get(variant.id);
      if (isExcludedForm(variant, form)) {
        continue;
      }

      const suffix = formSuffix(identifier, variant, form);
      if (!suffix) {
        skipped.push(`${id} ${variant.identifier}: no form name`);
        continue;
      }

      const name = suffix;
      if (seenForms.has(name)) {
        continue;
      }

      const formSpriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_SHA}/sprites/pokemon/${variant.id}.png`;
      const formCryUrl = `https://raw.githubusercontent.com/PokeAPI/cries/${CRIES_SHA}/cries/pokemon/latest/${variant.id}.ogg`;
      const formSpriteSource = join(CACHE, `sprites-${SPRITES_SHA}`, `${variant.id}.png`);
      const formCrySource = join(CACHE, `cries-${CRIES_SHA}`, `${variant.id}.ogg`);

      const [formSprite, formCry] = await Promise.all([
        downloadOptional(formSpriteUrl, formSpriteSource, force),
        downloadOptional(formCryUrl, formCrySource, force),
      ]);
      if (!formSprite || !formCry) {
        skipped.push(`${id} ${variant.identifier}: missing sprite or cry`);
        continue;
      }

      const formSpriteTarget = join(ROOT, 'media/sprites', config.spritesDir, `${id}-${name}.png`);
      const formCryTarget = join(ROOT, 'media/cries', 'latest', `${id}-${name}.mp3`);
      mkdirSync(dirname(formSpriteTarget), { recursive: true });
      mkdirSync(dirname(formCryTarget), { recursive: true });

      cpSync(formSprite, formSpriteTarget);
      execFileSync(
        FFMPEG,
        ['-y', '-loglevel', 'error', '-i', formCry, '-ac', '1', '-b:a', '96k', formCryTarget],
        { stdio: 'inherit' },
      );

      seenForms.add(name);
      forms.push(name);
      formSounds = true;
    }

    const entry = { species_id: String(id), identifier };
    if (forms.length > 0) {
      entry.forms = defaultSuffix ? [`!${defaultSuffix}`, ...forms] : forms;
      entry.formSounds = formSounds;
      formCount += forms.length + (defaultSuffix ? 1 : 0);
    }
    entries.push(entry);
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
    throw new Error('Missing or invalid --gen (expected 7, 8, or 9)');
  }

  await importPokemon(generation, parseIds(getArg('--ids')), args.includes('--force'));
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
