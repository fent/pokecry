/**
 * Remote source and CSV helpers.
 *
 * Downloads are cached under .cache/pokecry-import. `downloadOptional` treats a
 * 404 as an expected absence, which is how sprite fallbacks are probed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CACHE, POKEAPI_SHA } from './config.js';

// Download a required source file. Existing caches are reused unless forced.
export const download = async (url, path, force) => {
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

// Like download(), but returns null for a 404 so callers can try a fallback.
export const downloadOptional = async (url, path, force) => {
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

// Small dependency-free CSV parser. PokeAPI's CSVs use quoted fields and
// doubled quotes, but no embedded newlines in the files this importer reads.
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

// Load a PokeAPI CSV at the pinned SHA and return rows keyed by header name.
export const loadCsv = async (name, force) => {
  const url = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${POKEAPI_SHA}/data/v2/csv/${name}`;
  const path = join(CACHE, `pokeapi-${POKEAPI_SHA}`, name);
  await download(url, path, force);

  const rows = parseCsv(readFileSync(path, 'utf8'));
  const [header, ...body] = rows;
  return body.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index]])));
};
