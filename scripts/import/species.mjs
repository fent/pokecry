import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE, CRIES_SHA, ROOT, SPRITES_SHA } from './config.mjs';
import { download, downloadOptional } from './files.mjs';
import { formEntry, planForms, spriteCandidates } from './forms.mjs';
import { pngSize, writeCry, writeSprite } from './media.mjs';

const ensureBaseAssets = async (id, config, force) => {
  const spriteTarget = join(ROOT, 'media/sprites', config.spritesDir, `${id}.png`);
  if (force || !existsSync(spriteTarget)) {
    const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_SHA}/sprites/pokemon/${id}.png`;
    const spriteSource = join(CACHE, `sprites-${SPRITES_SHA}`, `${id}.png`);
    await download(spriteUrl, spriteSource, force);
    writeSprite(spriteSource, spriteTarget, null);
  }

  const cryTarget = join(ROOT, 'media/cries', config.criesDir, `${id}.mp3`);
  if (force || !existsSync(cryTarget)) {
    const cryUrl = `https://raw.githubusercontent.com/PokeAPI/cries/${CRIES_SHA}/cries/pokemon/latest/${id}.ogg`;
    const crySource = join(CACHE, `cries-${CRIES_SHA}`, `${id}.ogg`);
    await download(cryUrl, crySource, force);
    writeCry(crySource, cryTarget);
  }

  return spriteTarget;
};

const findFormSprite = async (candidates, force) => {
  for (const candidate of candidates) {
    const source = await downloadOptional(candidate.url, candidate.cache, force);
    if (source) {
      return { kind: candidate.kind, source };
    }
  }
  return null;
};

const importFormCry = async ({ id, name, variant, defaultVariant, config, force }) => {
  if (variant.id === defaultVariant.id) {
    return false;
  }

  const target = join(ROOT, 'media/cries', config.criesDir, `${id}-${name}.mp3`);
  if (!force && existsSync(target)) {
    return true;
  }

  const source = await downloadOptional(
    `https://raw.githubusercontent.com/PokeAPI/cries/${CRIES_SHA}/cries/pokemon/latest/${variant.id}.ogg`,
    join(CACHE, `cries-${CRIES_SHA}`, `${variant.id}.ogg`),
    force,
  );
  if (!source) {
    return false;
  }

  writeCry(source, target);
  return true;
};

export const importSpecies = async ({
  id,
  species,
  config,
  generation,
  force,
  variants,
  formsByPokemon,
}) => {
  const planned = planForms({
    speciesId: id,
    identifier: species.identifier,
    variants,
    formsByPokemon,
  });
  const spriteTarget = await ensureBaseAssets(id, config, force);
  const baseSize = pngSize(spriteTarget);
  const forms = [];

  for (const { variant, name } of planned.forms) {
    const formSpriteTarget = join(ROOT, 'media/sprites', config.spritesDir, `${id}-${name}.png`);

    let sprite = null;
    if (force || !existsSync(formSpriteTarget)) {
      sprite = await findFormSprite(
        spriteCandidates(config, variant, planned.defaultVariant, name),
        force,
      );
    }
    if (!sprite && !existsSync(formSpriteTarget)) {
      planned.skipped.push(`${id} ${variant.identifier}: missing sprite`);
      continue;
    }

    if (sprite) {
      const resize =
        sprite.kind === 'artwork' || (sprite.kind === 'standard' && generation <= 4)
          ? {
              width: baseSize.width,
              height: baseSize.height,
              filter: sprite.kind === 'artwork' ? 'lanczos' : 'neighbor',
            }
          : null;
      writeSprite(sprite.source, formSpriteTarget, resize);
    }

    const hasCry = await importFormCry({
      id,
      name,
      variant,
      defaultVariant: planned.defaultVariant,
      config,
      force,
    });
    forms.push({ name, hasCry });
  }

  const formData = formEntry(forms, planned.defaultSuffix);
  const entry = { species_id: String(id), identifier: species.identifier };
  if (formData.alternateNames.length > 0) {
    entry.forms = formData.forms;
    entry.formSounds = formData.formSounds;
  }

  return {
    entry,
    skipped: planned.skipped,
    formCount: formData.alternateNames.length > 0 ? formData.count : 0,
  };
};
