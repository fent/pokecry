import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.mjs';

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

export const updateData = (dataKey, entries) => {
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
