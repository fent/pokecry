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
  1: {
    spritesDir: 'yellow',
    criesDir: 'legacy',
    dataKey: 'gen1',
    versionDir: 'generation-i/yellow',
  },
  2: {
    spritesDir: 'crystal',
    criesDir: 'legacy',
    dataKey: 'gen2',
    versionDir: 'generation-ii/crystal',
  },
  3: {
    spritesDir: 'emerald',
    criesDir: 'legacy',
    dataKey: 'gen3',
    versionDir: 'generation-iii/emerald',
  },
  4: {
    spritesDir: 'platinum',
    criesDir: 'legacy',
    dataKey: 'gen4',
    versionDir: 'generation-iv/platinum',
  },
  5: {
    spritesDir: 'black-white',
    criesDir: 'legacy',
    dataKey: 'gen5',
    versionDir: 'generation-v/black-white',
  },
  6: { spritesDir: 'x-y', criesDir: 'latest', dataKey: 'gen6', versionDir: 'generation-vi/x-y' },
  7: {
    spritesDir: 'sun-moon',
    criesDir: 'latest',
    dataKey: 'gen7',
    versionDir: 'generation-vii/sun-moon',
  },
  8: {
    spritesDir: 'sword-shield',
    criesDir: 'latest',
    dataKey: 'gen8',
    versionDir: 'generation-viii/sword-shield',
  },
  9: {
    spritesDir: 'scarlet-violet',
    criesDir: 'latest',
    dataKey: 'gen9',
    versionDir: 'generation-ix/scarlet-violet',
  },
};

const USAGE = `Usage:
  node scripts/import-pokemon.mjs --gen <1-9> --ids <id|start-end>[, ...] [--force]
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

const pngSize = (path) => {
  const header = readFileSync(path).subarray(0, 24);
  if (header.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`Not a PNG: ${path}`);
  }

  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
};

const writeSprite = (source, target, resize) => {
  mkdirSync(dirname(target), { recursive: true });

  if (!resize) {
    cpSync(source, target);
    return;
  }

  const { width, height, filter } = resize;
  execFileSync(
    FFMPEG,
    [
      '-y',
      '-loglevel',
      'error',
      '-i',
      source,
      '-vf',
      `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=${filter},` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=#00000000`,
      '-pix_fmt',
      'rgba',
      target,
    ],
    { stdio: 'inherit' },
  );
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
    execFileSync(
      FFMPEG,
      ['-y', '-loglevel', 'error', '-i', wav, '-vn', '-ac', '1', '-b:a', '96k', mp3],
      { stdio: 'inherit' },
    );
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

const entryText = (entry) => JSON.stringify(entry, null, 2).replace(/\n/g, '\n  ');

const topLevelObjectRanges = (arrayText) => {
  const ranges = [];
  let depth = 0;
  let start = -1;
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < arrayText.length; index += 1) {
    const character = arrayText[index];

    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        quoted = false;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        ranges.push({ start, end: index + 1 });
        start = -1;
      }
    }
  }

  return ranges;
};

const rewriteArray = (entries) => {
  const body = entries.map((entry) => '  ' + entryText(entry)).join(',\n');
  return '[\n' + body + (body ? ',\n' : '') + ']';
};

const updateData = (dataKey, entries) => {
  const dataPath = join(ROOT, 'src/pokemon.ts');
  const data = readFileSync(dataPath, 'utf8');

  const start = data.indexOf(`pokemon.${dataKey} = [`);
  const arrayStart = start === -1 ? -1 : data.indexOf('[', start);
  const close = start === -1 ? -1 : data.indexOf('\n];', start);
  if (start === -1 || arrayStart === -1 || close === -1) {
    throw new Error(`Could not find pokemon.${dataKey} in src/pokemon.ts`);
  }

  const arrayText = data.slice(arrayStart, close + 2);
  let existing;
  try {
    existing = JSON.parse(arrayText.replace(/,\s*]$/, ']'));
  } catch (error) {
    throw new Error(`Could not parse pokemon.${dataKey}: ${error.message}`, { cause: error });
  }

  const ranges = topLevelObjectRanges(arrayText);
  const rangeById = new Map();
  for (const range of ranges) {
    const entry = JSON.parse(arrayText.slice(range.start, range.end));
    rangeById.set(entry.species_id, range);
  }

  const existingById = new Map(existing.map((entry) => [entry.species_id, entry]));
  let added = 0;
  const replacements = [];
  for (const entry of entries) {
    const range = rangeById.get(entry.species_id);
    existingById.set(entry.species_id, entry);
    if (range) {
      replacements.push({ ...range, text: entryText(entry) });
    } else {
      added += 1;
    }
  }

  let newArrayText;
  if (added > 0) {
    // New species need the array rebuilt; existing entries keep the same formatting
    // when only existing species are updated.
    const merged = [...existingById.values()].sort(
      (left, right) => Number(left.species_id) - Number(right.species_id),
    );
    newArrayText = rewriteArray(merged);
  } else {
    newArrayText = arrayText;
    for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
      newArrayText =
        newArrayText.slice(0, replacement.start) +
        replacement.text +
        newArrayText.slice(replacement.end);
    }
  }

  writeFileSync(dataPath, data.slice(0, arrayStart) + newArrayText + data.slice(close + 2));
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
  const formsByPokemon = new Map();
  for (const row of formRows) {
    const list = formsByPokemon.get(row.pokemon_id) ?? [];
    list.push(row);
    formsByPokemon.set(row.pokemon_id, list);
  }

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

    const defaultForms = formsByPokemon.get(defaultVariant.id) ?? [];
    const defaultForm =
      defaultForms.find((form) => form.is_default === '1') ?? defaultForms[0] ?? null;
    const defaultSuffix = formSuffix(identifier, defaultVariant, defaultForm);

    // Keep existing generation-specific base assets; only download a base
    // sprite/cry when the target is missing.
    const spriteTarget = join(ROOT, 'media/sprites', config.spritesDir, `${id}.png`);
    const cryTarget = join(ROOT, 'media/cries', config.criesDir, `${id}.mp3`);
    if (force || !existsSync(spriteTarget)) {
      const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_SHA}/sprites/pokemon/${id}.png`;
      const spriteSource = join(CACHE, `sprites-${SPRITES_SHA}`, `${id}.png`);
      await download(spriteUrl, spriteSource, force);
      writeSprite(spriteSource, spriteTarget, null);
    }
    if (force || !existsSync(cryTarget)) {
      const cryUrl = `https://raw.githubusercontent.com/PokeAPI/cries/${CRIES_SHA}/cries/pokemon/latest/${id}.ogg`;
      const crySource = join(CACHE, `cries-${CRIES_SHA}`, `${id}.ogg`);
      await download(cryUrl, crySource, force);
      mkdirSync(dirname(cryTarget), { recursive: true });
      execFileSync(
        FFMPEG,
        ['-y', '-loglevel', 'error', '-i', crySource, '-vn', '-ac', '1', '-b:a', '96k', cryTarget],
        { stdio: 'inherit' },
      );
    }

    const baseSize = pngSize(spriteTarget);
    const forms = [];
    const seenForms = new Set();

    for (const variant of variants) {
      const variantForms = formsByPokemon.get(variant.id) ?? [];
      const candidates =
        variantForms.length > 0
          ? variantForms
          : [
              {
                form_identifier: formSuffix(identifier, variant, null),
                is_default: variant.id === defaultVariant.id ? '1' : '0',
              },
            ];

      for (const form of candidates) {
        if (variant.id === defaultVariant.id && form.is_default === '1') {
          continue;
        }
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

        const formSpriteTarget = join(
          ROOT,
          'media/sprites',
          config.spritesDir,
          `${id}-${name}.png`,
        );

        let spriteKind = null;
        let spriteSource = null;
        if (force || !existsSync(formSpriteTarget)) {
          const spriteCandidates = [];
          if (variant.id !== defaultVariant.id) {
            spriteCandidates.push({
              kind: 'standard',
              url: `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_SHA}/sprites/pokemon/${variant.id}.png`,
              cache: join(CACHE, `sprites-${SPRITES_SHA}`, `${variant.id}.png`),
            });
          }
          spriteCandidates.push({
            kind: 'versioned',
            url:
              `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_SHA}/sprites/pokemon/` +
              `versions/${config.versionDir}/${variant.id}-${name}.png`,
            cache: join(
              CACHE,
              `sprites-${SPRITES_SHA}`,
              `versioned-${config.versionDir.replace(/\//g, '-')}-${variant.id}-${name}.png`,
            ),
          });
          spriteCandidates.push({
            kind: 'standard',
            url: `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_SHA}/sprites/pokemon/${variant.id}-${name}.png`,
            cache: join(CACHE, `sprites-${SPRITES_SHA}`, `form-${variant.id}-${name}.png`),
          });
          spriteCandidates.push({
            kind: 'artwork',
            url:
              `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_SHA}/sprites/pokemon/` +
              `other/official-artwork/${variant.id}-${name}.png`,
            cache: join(CACHE, `sprites-${SPRITES_SHA}`, `artwork-${variant.id}-${name}.png`),
          });

          for (const candidate of spriteCandidates) {
            const downloaded = await downloadOptional(candidate.url, candidate.cache, force);
            if (downloaded) {
              spriteKind = candidate.kind;
              spriteSource = downloaded;
              break;
            }
          }
        }

        if (!spriteSource && !existsSync(formSpriteTarget)) {
          skipped.push(`${id} ${variant.identifier}: missing sprite`);
          continue;
        }

        if (spriteSource) {
          const resize =
            spriteKind === 'artwork' || (spriteKind === 'standard' && generation <= 4)
              ? {
                  width: baseSize.width,
                  height: baseSize.height,
                  filter: spriteKind === 'artwork' ? 'lanczos' : 'neighbor',
                }
              : null;
          writeSprite(spriteSource, formSpriteTarget, resize);
        }

        let hasFormCry = false;
        const formCryTarget = join(ROOT, 'media/cries', config.criesDir, `${id}-${name}.mp3`);
        if (force || !existsSync(formCryTarget)) {
          if (variant.id !== defaultVariant.id) {
            const formCryUrl = `https://raw.githubusercontent.com/PokeAPI/cries/${CRIES_SHA}/cries/pokemon/latest/${variant.id}.ogg`;
            const formCrySource = join(CACHE, `cries-${CRIES_SHA}`, `${variant.id}.ogg`);
            const formCry = await downloadOptional(formCryUrl, formCrySource, force);
            if (formCry) {
              mkdirSync(dirname(formCryTarget), { recursive: true });
              execFileSync(
                FFMPEG,
                [
                  '-y',
                  '-loglevel',
                  'error',
                  '-i',
                  formCry,
                  '-vn',
                  '-ac',
                  '1',
                  '-b:a',
                  '96k',
                  formCryTarget,
                ],
                { stdio: 'inherit' },
              );
              hasFormCry = true;
            }
          }
        } else {
          hasFormCry = variant.id !== defaultVariant.id;
        }

        seenForms.add(name);
        forms.push({ name, hasCry: hasFormCry });
      }
    }

    const formSounds = forms.length > 0 && forms.every((form) => form.hasCry);
    const formNames = forms.map((form) =>
      !formSounds && form.hasCry ? `@${form.name}` : form.name,
    );

    const entry = { species_id: String(id), identifier };
    if (formNames.length > 0) {
      entry.forms = defaultSuffix ? [`!${defaultSuffix}`, ...formNames] : formNames;
      entry.formSounds = formSounds;
      formCount += formNames.length + (defaultSuffix ? 1 : 0);
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
    throw new Error('Missing or invalid --gen (expected 1-9)');
  }

  await importPokemon(generation, parseIds(getArg('--ids')), args.includes('--force'));
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
