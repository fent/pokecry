import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { FFMPEG, ROOT } from './config.mjs';

export const requireFfmpeg = () => {
  try {
    execFileSync(FFMPEG, ['-version'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      `${FFMPEG} is required but was not found. Install ffmpeg ` +
        '(e.g. "sudo apt-get install ffmpeg" or "brew install ffmpeg").',
    );
  }
};

export const pngSize = (path) => {
  const header = readFileSync(path).subarray(0, 24);
  if (header.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`Not a PNG: ${path}`);
  }

  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
};

export const writeSprite = (source, target, resize) => {
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

export const writeCry = (source, target) => {
  mkdirSync(dirname(target), { recursive: true });
  execFileSync(
    FFMPEG,
    ['-y', '-loglevel', 'error', '-i', source, '-vn', '-ac', '1', '-b:a', '96k', target],
    { stdio: 'inherit' },
  );
};

const findWavs = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return findWavs(path);
    }
    return entry.name.toLowerCase().endsWith('.wav') ? [path] : [];
  });

export const normalizeAudio = () => {
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
