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

const updateData = (dataKey, entries) => {
  const dataPath = join(ROOT, 'src/pokemon.ts');
  let data = readFileSync(dataPath, 'utf8');
  const existing = new Set(
    [...data.matchAll(/"species_id": "(\d+)"/g)].map((match) => Number(match[1])),
  );
  const newEntries = entries.filter((entry) => !existing.has(entry.id));

  if (newEntries.length === 0) {
    return 0;
  }

  const start = data.indexOf(`pokemon.${dataKey} = [`);
  const close = start === -1 ? -1 : data.indexOf('\n];', start);
  if (start === -1 || close === -1) {
    throw new Error(`Could not find pokemon.${dataKey} in src/pokemon.ts`);
  }

  const block = newEntries
    .map(
      ({ id, identifier }) =>
        `  {\n    "species_id": "${id}",\n    "identifier": "${identifier}"\n  },\n`,
    )
    .join('');
  data = data.slice(0, close) + '\n' + block + data.slice(close + 1);
  writeFileSync(dataPath, data);
  return newEntries.length;
};

const importPokemon = async (generation, ids, force) => {
  requireFfmpeg();
  const config = GENERATIONS[generation];
  if (!config) {
    throw new Error(`Unsupported generation: ${generation}`);
  }

  const speciesUrl = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${POKEAPI_SHA}/data/v2/csv/pokemon_species.csv`;
  const speciesPath = join(CACHE, `pokeapi-${POKEAPI_SHA}`, 'pokemon_species.csv');
  await download(speciesUrl, speciesPath, force);

  const rows = parseCsv(readFileSync(speciesPath, 'utf8'));
  const header = rows[0];
  const idIndex = header.indexOf('id');
  const identifierIndex = header.indexOf('identifier');
  const speciesById = new Map(rows.slice(1).map((row) => [Number(row[idIndex]), row]));

  const entries = [];
  for (const id of ids) {
    const species = speciesById.get(id);
    if (!species) {
      throw new Error(`Species ${id} was not found in PokeAPI data`);
    }

    const identifier = species[identifierIndex];
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

    entries.push({ id, identifier });
  }

  const added = updateData(config.dataKey, entries);
  console.log(
    `Imported ${entries.length} Pokemon for generation ${generation}; added ${added} data entries.`,
  );
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
