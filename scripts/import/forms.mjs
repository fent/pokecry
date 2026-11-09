import { join } from 'node:path';
import { CACHE, SPRITES_SHA } from './config.mjs';

export const formSuffix = (speciesIdentifier, pokemon, form) => {
  const suffix = form?.form_identifier || pokemon.identifier.slice(speciesIdentifier.length + 1);
  return suffix || '';
};

export const isExcludedForm = (pokemon, form) =>
  form?.is_mega === '1' || form?.form_identifier === 'gmax' || pokemon.identifier.endsWith('-gmax');

export const planForms = ({ speciesId, identifier, variants, formsByPokemon }) => {
  const defaultVariant = variants.find((variant) => variant.is_default === '1') ?? variants[0];
  if (!defaultVariant) {
    throw new Error(`No Pokemon data found for species ${speciesId}`);
  }

  const defaultForms = formsByPokemon.get(defaultVariant.id) ?? [];
  const defaultForm =
    defaultForms.find((form) => form.is_default === '1') ?? defaultForms[0] ?? null;
  const defaultSuffix = formSuffix(identifier, defaultVariant, defaultForm);

  const forms = [];
  const skipped = [];
  const seen = new Set();

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

      const name = formSuffix(identifier, variant, form);
      if (!name) {
        skipped.push(`${speciesId} ${variant.identifier}: no form name`);
        continue;
      }
      if (seen.has(name)) {
        continue;
      }

      seen.add(name);
      forms.push({ variant, name });
    }
  }

  return { defaultVariant, defaultSuffix, forms, skipped };
};

export const spriteCandidates = (config, variant, defaultVariant, name) => {
  const candidates = [];
  if (variant.id !== defaultVariant.id) {
    candidates.push({
      kind: 'standard',
      url: `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_SHA}/sprites/pokemon/${variant.id}.png`,
      cache: join(CACHE, `sprites-${SPRITES_SHA}`, `${variant.id}.png`),
    });
  }

  candidates.push({
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
  candidates.push({
    kind: 'standard',
    url: `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_SHA}/sprites/pokemon/${variant.id}-${name}.png`,
    cache: join(CACHE, `sprites-${SPRITES_SHA}`, `form-${variant.id}-${name}.png`),
  });
  candidates.push({
    kind: 'artwork',
    url:
      `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_SHA}/sprites/pokemon/` +
      `other/official-artwork/${variant.id}-${name}.png`,
    cache: join(CACHE, `sprites-${SPRITES_SHA}`, `artwork-${variant.id}-${name}.png`),
  });

  return candidates;
};

export const formEntry = (forms, defaultSuffix) => {
  const formSounds = forms.length > 0 && forms.every((form) => form.hasCry);
  const alternateNames = forms.map((form) =>
    !formSounds && form.hasCry ? `@${form.name}` : form.name,
  );
  const hasDefault = Boolean(defaultSuffix);
  const names = hasDefault ? [`!${defaultSuffix}`, ...alternateNames] : alternateNames;

  return {
    alternateNames,
    formSounds,
    forms: names,
    count: alternateNames.length + (hasDefault ? 1 : 0),
  };
};
