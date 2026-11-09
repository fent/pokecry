/**
 * Shared importer configuration.
 *
 * Source SHAs are pinned so repeated imports are reproducible. Each generation
 * maps to the runtime sprite/cry folders, the generated data key, and the
 * PokeAPI versioned sprite directory used for older-generation assets.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
// Downloads are cached here between runs; .cache is gitignored.
export const CACHE = join(ROOT, '.cache/pokecry-import');
export const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';

// Pin these intentionally when refreshing source data.
export const POKEAPI_SHA = '6ea97b5641faa12e090866e8144ae8f57764fc64';
export const SPRITES_SHA = '1b3b7c0a538dd2226ae08d0d2f8955125075bbd4';
export const CRIES_SHA = 'b3a9044bb839b5e3152aaa536c7b463a0fcf0140';

export const GENERATIONS = {
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

export const USAGE = `Usage:
  node scripts/import-pokemon.js --gen <1-9> --ids <id|start-end>[, ...] [--force]
  node scripts/import-pokemon.js --normalize-audio

Options:
  --force             Redownload source files and overwrite existing assets.
  --normalize-audio   Convert all WAV cries in media/cries to mono 96 kbps MP3.

Requires ffmpeg on PATH. Set FFMPEG_BIN to use a different binary.
`;
