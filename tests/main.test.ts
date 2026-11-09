import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const html = readFileSync('index.html', 'utf8');
const bodyHtml = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? '';

type Listener = () => void;

class FakeAudio {
  src: string;
  volume = 1;
  autoplay = false;
  currentTime = 0;
  private listeners = new Map<string, Listener[]>();

  constructor(src: string) {
    this.src = src;
    audios.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }

  play(): Promise<void> {
    this.emit('play');
    return Promise.resolve();
  }
}

const REVEAL_TIMEOUT = 1200;

let audios: FakeAudio[] = [];

const options = (): HTMLButtonElement[] =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('.option'));

const playButton = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('.play')!;
const sprite = (): HTMLImageElement => document.querySelector<HTMLImageElement>('.pokemon-sprite')!;
const endScreen = (): HTMLDivElement => document.querySelector<HTMLDivElement>('.end-screen')!;
const score = (): HTMLSpanElement => document.querySelector<HTMLSpanElement>('.score')!;
const status = (): HTMLParagraphElement => document.querySelector<HTMLParagraphElement>('.status')!;
const allGens = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('.gen-all')!;
const endGame = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('.end-game')!;
const generationButtons = (): HTMLButtonElement[] =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('.gen[data-gen]'));
const filler = (): HTMLHeadingElement => document.querySelector<HTMLHeadingElement>('.filler')!;

type PokemonWithForms = {
  species_id: string;
  identifier: string;
  forms?: string[];
  formGenerations?: Record<string, number>;
  formSounds?: boolean;
  formSprites?: boolean;
  baseForm?: boolean;
  baseCryDir?: string;
};

const generationAssets: Record<string, [string, string]> = {
  gen1: ['yellow', 'legacy'],
  gen2: ['crystal', 'legacy'],
  gen3: ['emerald', 'legacy'],
  gen4: ['platinum', 'legacy'],
  gen5: ['black-white', 'legacy'],
  gen6: ['x-y', 'latest'],
  gen7: ['sun-moon', 'latest'],
  gen8: ['sword-shield', 'latest'],
  gen9: ['scarlet-violet', 'latest'],
};

const generationData = (key: string): PokemonWithForms[] =>
  (window as unknown as { pokemon: Record<string, PokemonWithForms[]> }).pokemon[key];

const assertGenerationAssets = (
  pokemonList: PokemonWithForms[],
  spriteDir: string,
  cryDir: string,
): void => {
  for (const pokemon of pokemonList) {
    expect(existsSync(`media/sprites/${spriteDir}/${pokemon.species_id}.png`)).toBe(true);
    expect(existsSync(`media/cries/${cryDir}/${pokemon.species_id}.mp3`)).toBe(true);

    for (const form of pokemon.forms ?? []) {
      if (form.startsWith('!')) {
        continue;
      }
      const name = form.replace(/^@/, '');
      const formGeneration = pokemon.formGenerations?.[name];
      const [formSpriteDir, formCryDir] = formGeneration
        ? generationAssets[`gen${formGeneration}`]
        : [spriteDir, cryDir];

      if (pokemon.formSprites !== false) {
        expect(existsSync(`media/sprites/${formSpriteDir}/${pokemon.species_id}-${name}.png`)).toBe(
          true,
        );
      }
      if (pokemon.formSounds) {
        expect(existsSync(`media/cries/${formCryDir}/${pokemon.species_id}-${name}.mp3`)).toBe(
          true,
        );
      }
    }
  }
};

const currentAudio = (): FakeAudio => {
  const cry = [...audios].reverse().find((audio) => audio.src !== 'media/ping.mp3');
  if (!cry) {
    throw new Error('No cry audio was created');
  }
  return cry;
};

const currentSpeciesId = (): string => {
  const file = currentAudio().src.split('/').pop() ?? '';
  return file.replace(/\.(mp3|wav)$/, '').split('-')[0];
};

const pickOption = (correct: boolean): HTMLButtonElement => {
  const id = currentSpeciesId();
  const option = options().find((candidate) =>
    correct ? candidate.dataset.speciesId === id : candidate.dataset.speciesId !== id,
  );
  if (!option) {
    throw new Error(`No ${correct ? 'correct' : 'wrong'} option found for ${id}`);
  }
  return option;
};

const guessCorrect = (): void => pickOption(true).click();
const guessWrong = (): void => pickOption(false).click();

const start = async (): Promise<void> => {
  // These are classic scripts, not modules; load them for their side effects.
  // @ts-expect-error -- classic script
  await import('../src/pokemon');
  vi.stubGlobal('pokemon', (window as unknown as { pokemon: unknown }).pokemon);
  // @ts-expect-error -- classic script
  await import('../src/main');
};

const advanceRound = (): void => {
  vi.advanceTimersByTime(REVEAL_TIMEOUT);
};

const gen1Count = (): number =>
  (window as unknown as { pokemon: { gen1: unknown[] } }).pokemon.gen1.length;

const playRounds = (count: number): void => {
  for (let round = 1; round <= count; round++) {
    guessCorrect();
    if (round < count) {
      advanceRound();
    }
  }
};

const loadStyles = (): void => {
  const style = document.createElement('style');
  style.textContent = readFileSync('style/style.css', 'utf8');
  document.head.appendChild(style);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Audio', FakeAudio);
  document.body.innerHTML = bodyHtml;
  audios = [];
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as unknown as { __POKECRY_TEST__?: boolean }).__POKECRY_TEST__;
  delete (window as unknown as { __pokecryTest?: unknown }).__pokecryTest;
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('pokecry', () => {
  it('starts with four unique options and a visible play button', async () => {
    await start();

    const buttons = options();
    expect(buttons).toHaveLength(4);
    expect(new Set(buttons.map((button) => button.dataset.speciesId)).size).toBe(4);
    expect(buttons.every((button) => button.textContent)).toBe(true);
    expect(playButton().classList.contains('hidden')).toBe(false);
    expect(sprite().classList.contains('hidden')).toBe(true);
    expect(document.querySelector('.gen-1')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('includes generations 8 and 9 with alternate forms', async () => {
    await start();

    const gen8 = generationData('gen8');
    const gen9 = generationData('gen9');
    expect(gen8).toHaveLength(96);
    expect(gen9).toHaveLength(120);
    expect(gen8.some((pokemon) => pokemon.forms?.some((form) => form.startsWith('!')))).toBe(true);
    expect(gen9.some((pokemon) => pokemon.forms?.some((form) => form.startsWith('!')))).toBe(true);
  });

  it('selects base and alternate forms uniformly per call', async () => {
    (window as unknown as { __POKECRY_TEST__: boolean }).__POKECRY_TEST__ = true;
    await start();

    const hooks = (
      window as unknown as {
        __pokecryTest: {
          resolvePokemon: (entry: unknown) => { sprite: string; cry: string };
        };
      }
    ).__pokecryTest;

    const entry = {
      def: {
        species_id: '201',
        identifier: 'unown',
        forms: ['!a', 'b', 'c'],
        formSounds: true,
      },
      paths: { spritesDir: 'crystal', criesDir: 'legacy' },
    };

    const random = vi.spyOn(Math, 'random');
    random.mockReturnValueOnce(0);
    expect(hooks.resolvePokemon(entry).sprite).toContain('/201.png');

    random.mockReturnValueOnce(0.99);
    const resolved = hooks.resolvePokemon(entry);
    expect(resolved.sprite).toContain('/201-c.png');
    expect(resolved.cry).toContain('/201-c.mp3');

    random.mockReturnValueOnce(0.99);
    const noFormSprites = hooks.resolvePokemon({
      def: {
        species_id: '201',
        identifier: 'unown',
        forms: ['b'],
        formSprites: false,
      },
      paths: { spritesDir: 'crystal', criesDir: 'legacy' },
    });
    expect(noFormSprites.sprite).toContain('/201.png');

    random.mockReturnValueOnce(0.99);
    const silentForm = hooks.resolvePokemon({
      def: {
        species_id: '201',
        identifier: 'unown',
        forms: ['b'],
        formSounds: false,
      },
      paths: { spritesDir: 'crystal', criesDir: 'legacy' },
    });
    expect(silentForm.sprite).toContain('/201-b.png');
    expect(silentForm.cry).toContain('/201.mp3');

    random.mockReturnValueOnce(0.99);
    const atForm = hooks.resolvePokemon({
      def: {
        species_id: '201',
        identifier: 'unown',
        forms: ['@eternal'],
        formSounds: false,
      },
      paths: { spritesDir: 'crystal', criesDir: 'legacy' },
    });
    expect(atForm.sprite).toContain('/201-eternal.png');
    expect(atForm.cry).toContain('/201-eternal.mp3');

    random.mockReturnValueOnce(0.99);
    const formOnly = hooks.resolvePokemon({
      def: {
        species_id: '201',
        identifier: 'unown',
        forms: ['exclamation'],
        baseForm: false,
        baseCryDir: 'legacy',
      },
      paths: { spritesDir: 'emerald', criesDir: 'legacy' },
    });
    expect(formOnly.sprite).toContain('/201-exclamation.png');
    expect(formOnly.cry).toContain('/201.mp3');
  });

  it('excludes mega and gmax forms', async () => {
    await start();

    const allPokemon = Object.values(
      (window as unknown as { pokemon: Record<string, { forms?: string[] }[]> }).pokemon,
    ).flat();

    expect(
      allPokemon.some((pokemon) => pokemon.forms?.some((form) => /gmax|mega/.test(form))),
    ).toBe(false);
  });

  it('has assets for every Pokemon and referenced form', async () => {
    await start();

    const allPokemon = (window as unknown as { pokemon: Record<string, PokemonWithForms[]> })
      .pokemon;
    for (const [key, [spriteDir, cryDir]] of Object.entries(generationAssets)) {
      assertGenerationAssets(allPokemon[key], spriteDir, cryDir);
    }
  });

  it('has unique species ids, identifiers, and form names', async () => {
    await start();

    const allPokemon = Object.values(
      (window as unknown as { pokemon: Record<string, PokemonWithForms[]> }).pokemon,
    ).flat();

    expect(new Set(allPokemon.map((pokemon) => pokemon.species_id)).size).toBe(allPokemon.length);
    expect(new Set(allPokemon.map((pokemon) => pokemon.identifier)).size).toBe(allPokemon.length);

    for (const pokemon of allPokemon) {
      const forms = (pokemon.forms ?? []).map((form) => form.replace(/^[!@]/, ''));
      expect(new Set(forms).size).toBe(forms.length);
    }
  });

  it('includes shared-id and cosmetic forms from PokeAPI', async () => {
    await start();

    const allPokemon = Object.values(
      (window as unknown as { pokemon: Record<string, PokemonWithForms[]> }).pokemon,
    ).flat();
    const byId = (id: string): PokemonWithForms => {
      const pokemon = allPokemon.find((candidate) => candidate.species_id === id);
      if (!pokemon) {
        throw new Error(`Missing Pokemon ${id}`);
      }
      return pokemon;
    };

    expect(byId('172').forms).toEqual(['spiky-eared']);
    expect(byId('201').forms).toEqual(expect.arrayContaining(['exclamation', 'question']));
    expect(byId('493').forms).toContain('fairy');
    expect(byId('592').forms).toEqual(['!male', 'female']);
    expect(byId('593').forms).toEqual(['!male', 'female']);
    expect(byId('668').forms).toEqual(['!male', 'female']);
    expect(byId('854').forms).toEqual(['!phony', 'antique']);
    expect(byId('855').forms).toEqual(['!phony', 'antique']);
    expect(byId('869').forms).toHaveLength(63);
    expect(byId('869').forms?.[0]).toBe('!vanilla-cream-strawberry-sweet');
    expect(byId('1007').forms).toEqual([
      '!apex-build',
      'limited-build',
      'sprinting-build',
      'swimming-build',
      'gliding-build',
    ]);
    expect(byId('1007').formSounds).toBe(true);
    expect(byId('1008').forms).toEqual([
      '!ultimate-mode',
      'low-power-mode',
      'drive-mode',
      'aquatic-mode',
      'glide-mode',
    ]);
    expect(byId('1008').formSounds).toBe(true);
    expect(byId('1012').forms).toEqual(['!counterfeit', 'artisan']);
    expect(byId('1013').forms).toEqual(['!unremarkable', 'masterpiece']);
  });

  it('includes same-generation alternate forms', async () => {
    await start();

    const allPokemon = Object.values(
      (window as unknown as { pokemon: Record<string, PokemonWithForms[]> }).pokemon,
    ).flat();
    const byId = (id: string): PokemonWithForms => {
      const pokemon = allPokemon.find((candidate) => candidate.species_id === id);
      if (!pokemon) {
        throw new Error(`Missing Pokemon ${id}`);
      }
      return pokemon;
    };

    expect(byId('386').forms).toEqual(['!normal', 'attack', 'defense', 'speed']);
    expect(byId('386').formSounds).toBe(true);
    expect(byId('720').forms).toEqual(['!confined', 'unbound']);
    expect(byId('738').forms).toEqual(['totem']);
    expect(byId('743').forms).toEqual(['totem']);
    expect(byId('744').forms).toEqual(['own-tempo']);
    expect(byId('745').forms).toEqual(['!midday', 'midnight', 'dusk']);
    expect(byId('752').forms).toEqual(['totem']);
    expect(byId('754').forms).toEqual(['totem']);
    expect(byId('758').forms).toEqual(['totem']);
    expect(byId('777').forms).toEqual(['totem']);
  });

  it('moves later-generation forms into their introduction generation', async () => {
    (window as unknown as { __POKECRY_TEST__: boolean }).__POKECRY_TEST__ = true;
    await start();

    const hooks = (
      window as unknown as {
        __pokecryTest: {
          getGeneration: (generation: number) => PokemonWithForms[];
        };
      }
    ).__pokecryTest;
    const byId = (generation: number, id: string): PokemonWithForms => {
      const pokemon = hooks
        .getGeneration(generation)
        .find((candidate) => candidate.species_id === id);
      if (!pokemon) {
        throw new Error(`Missing Pokemon ${id} in generation ${generation}`);
      }
      return pokemon;
    };

    expect(byId(2, '201').forms).not.toContain('exclamation');
    const unown = byId(3, '201');
    expect(unown.forms).toEqual(['exclamation', 'question']);
    expect(unown.baseForm).toBe(false);

    expect(byId(2, '172').forms).toBeUndefined();
    expect(byId(4, '172').forms).toEqual(['spiky-eared']);

    expect(byId(4, '493').forms).not.toContain('fairy');
    expect(byId(6, '493').forms).toEqual(['fairy']);

    expect(byId(8, '901').forms).toBeUndefined();
    expect(byId(9, '901').forms).toEqual(['bloodmoon']);

    expect(byId(1, '25').forms).toBeUndefined();
    expect(byId(7, '25').forms).toEqual(
      expect.arrayContaining(['original-cap', 'hoenn-cap', 'partner-cap']),
    );
    expect(byId(7, '25').baseForm).toBe(false);
    expect(byId(8, '25').forms).toEqual(['world-cap']);

    expect(byId(1, '19').forms).toBeUndefined();
    expect(byId(7, '19').forms).toEqual(['alola']);

    expect(byId(1, '52').forms).toBeUndefined();
    expect(byId(7, '52').forms).toEqual(['alola']);
    expect(byId(8, '52').forms).toEqual(['galar']);

    expect(byId(1, '128').forms).toBeUndefined();
    expect(byId(9, '128').forms).toEqual([
      'paldea-combat-breed',
      'paldea-blaze-breed',
      'paldea-aqua-breed',
    ]);

    expect(byId(3, '382').forms).toBeUndefined();
    expect(byId(6, '382').forms).toEqual(['primal']);
    expect(byId(6, '382').baseForm).toBe(false);
    expect(byId(3, '383').forms).toBeUndefined();
    expect(byId(6, '383').forms).toEqual(['primal']);
  });

  it('plays the current cry from the play button', async () => {
    await start();
    const audio = currentAudio();
    const play = vi.spyOn(audio, 'play');

    playButton().click();

    expect(play).toHaveBeenCalledOnce();
    expect(playButton().classList.contains('rumble')).toBe(true);
    audio.emit('ended');
    expect(playButton().classList.contains('rumble')).toBe(false);
  });

  it('reveals the answer and updates the score on a correct guess', async () => {
    await start();
    const correctId = currentSpeciesId();
    guessCorrect();

    expect(document.querySelector('.success')?.classList.contains('hidden')).toBe(false);
    expect(document.querySelector('.failure')?.classList.contains('hidden')).toBe(true);
    expect(score().textContent).toBe('1 / 1');
    expect(status().textContent).toBe('Correct. Score 1 / 1.');
    expect(sprite().getAttribute('src')).toContain(correctId);
    expect(sprite().classList.contains('hidden')).toBe(false);
    expect(playButton().classList.contains('hidden')).toBe(true);
    expect(options().every((option) => option.disabled)).toBe(true);
    expect(
      options()
        .find((option) => option.dataset.speciesId === correctId)
        ?.classList.contains('right'),
    ).toBe(true);
  });

  it('records a wrong guess and labels the correct option', async () => {
    await start();
    const correctId = currentSpeciesId();
    const correctName = options().find(
      (option) => option.dataset.speciesId === correctId,
    )?.textContent;
    guessWrong();

    expect(document.querySelector('.success')?.classList.contains('hidden')).toBe(true);
    expect(document.querySelector('.failure')?.classList.contains('hidden')).toBe(false);
    expect(score().textContent).toBe('0 / 1');
    expect(status().textContent).toBe(`Wrong. The answer was ${correctName}. Score 0 / 1.`);
    expect(
      options()
        .find((option) => option.dataset.speciesId === correctId)
        ?.classList.contains('right'),
    ).toBe(true);
  });

  it('ignores clicks on disabled options', async () => {
    await start();
    guessCorrect();
    const currentScore = score().textContent;
    expect(options()[0].disabled).toBe(true);

    options()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(score().textContent).toBe(currentScore);
  });

  it('hides the play button after a guess', async () => {
    loadStyles();
    await start();
    guessCorrect();

    expect(playButton().classList.contains('hidden')).toBe(true);
    expect(getComputedStyle(playButton()).display).toBe('none');
  });

  it('uses a larger desktop sprite', () => {
    loadStyles();

    expect(getComputedStyle(sprite()).width).toBe('120px');
    expect(getComputedStyle(sprite()).height).toBe('110px');
  });

  it('keeps the media area height stable when revealing the sprite', async () => {
    loadStyles();
    await start();

    const media = document.querySelector<HTMLDivElement>('.media')!;
    expect(getComputedStyle(media).height).toBe('110px');
    expect(getComputedStyle(sprite()).display).toBe('none');

    guessCorrect();
    expect(getComputedStyle(media).height).toBe('110px');
    expect(getComputedStyle(sprite()).display).not.toBe('none');
  });

  it('ignores clicks that are not on an option', async () => {
    await start();
    const optionsElement = document.querySelector<HTMLDivElement>('.options')!;
    const initialScore = score().textContent;
    const text = document.createTextNode('not an option');
    optionsElement.appendChild(text);

    text.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(score().textContent).toBe(initialScore);
  });

  it('fails fast when required markup is missing', async () => {
    document.querySelector('.play')?.remove();

    await expect(start()).rejects.toThrow('Missing required element: .play');
  });

  it('keeps the answer visible longer before the next round', async () => {
    await start();
    guessCorrect();

    vi.advanceTimersByTime(600);
    expect(playButton().classList.contains('hidden')).toBe(true);

    vi.advanceTimersByTime(REVEAL_TIMEOUT - 600);
    expect(playButton().classList.contains('hidden')).toBe(false);
  });

  it('starts the next round after the timeout', async () => {
    await start();
    const firstCry = currentAudio().src;
    const option = pickOption(true);
    option.focus();
    option.click();
    advanceRound();

    expect(playButton().classList.contains('hidden')).toBe(false);
    expect(document.activeElement).toBe(playButton());
    expect(sprite().classList.contains('hidden')).toBe(true);
    expect(options().every((option) => !option.disabled)).toBe(true);
    expect(status().textContent).toBe('Correct. Score 1 / 1.');
    expect(currentAudio().src).not.toBe(firstCry);
  });

  it('toggles generations', async () => {
    await start();
    const gen2 = document.querySelector<HTMLButtonElement>('.gen-2');
    expect(gen2).not.toBeNull();

    gen2!.click();
    expect(gen2!.getAttribute('aria-pressed')).toBe('true');

    gen2!.click();
    expect(gen2!.getAttribute('aria-pressed')).toBe('false');
  });

  it('selects and unselects all generations', async () => {
    await start();
    expect(allGens().getAttribute('aria-pressed')).toBe('mixed');

    allGens().click();
    expect(allGens().getAttribute('aria-pressed')).toBe('true');
    expect(
      generationButtons().every((button) => button.getAttribute('aria-pressed') === 'true'),
    ).toBe(true);

    allGens().click();
    expect(allGens().getAttribute('aria-pressed')).toBe('false');
    expect(
      generationButtons().every((button) => button.getAttribute('aria-pressed') === 'false'),
    ).toBe(true);
    expect(playButton().disabled).toBe(true);
    expect(playButton().classList.contains('hidden')).toBe(false);
    expect(document.querySelector('.options')?.classList.contains('hidden')).toBe(false);
    expect(options().every((option) => option.disabled)).toBe(true);
    expect(options().every((option) => option.textContent)).toBe(true);
    expect(filler().textContent).toBe('Select at least one generation');
    expect(status().textContent).toBe('Select at least one generation to play.');

    allGens().click();
    expect(allGens().getAttribute('aria-pressed')).toBe('true');
    expect(playButton().disabled).toBe(false);
    expect(playButton().classList.contains('hidden')).toBe(false);
    expect(options().every((option) => !option.disabled)).toBe(true);
    expect(document.querySelector('.options')?.classList.contains('hidden')).toBe(false);
    expect(status().textContent).toBe('');
  });

  it('does not cut the reveal short when generations change', async () => {
    await start();
    guessCorrect();
    const gen2 = document.querySelector<HTMLButtonElement>('.gen-2')!;
    gen2.click();

    expect(playButton().classList.contains('hidden')).toBe(true);

    vi.advanceTimersByTime(REVEAL_TIMEOUT - 600);
    expect(playButton().classList.contains('hidden')).toBe(true);

    vi.advanceTimersByTime(600);
    expect(playButton().classList.contains('hidden')).toBe(false);
  });

  it('pauses when all generations are turned off during a reveal', async () => {
    await start();
    guessCorrect();

    allGens().click();
    allGens().click();
    expect(filler().textContent).toBe('Select at least one generation');

    vi.advanceTimersByTime(REVEAL_TIMEOUT);
    expect(playButton().disabled).toBe(true);

    allGens().click();
    expect(playButton().disabled).toBe(false);
  });

  it('shows the end screen after every generation-1 Pokemon', async () => {
    await start();
    const total = gen1Count();

    playRounds(total);

    expect(score().textContent).toBe(`${total} / ${total}`);
    expect(endScreen().classList.contains('hidden')).toBe(false);
    expect(document.activeElement).toBe(endScreen());
    expect(endScreen().children).toHaveLength(0);
  });

  it('keeps the end screen when the selected generation is exhausted', async () => {
    await start();
    playRounds(gen1Count());
    expect(endScreen().classList.contains('hidden')).toBe(false);

    const gen1 = document.querySelector<HTMLButtonElement>('.gen-1')!;
    gen1.click();
    expect(endScreen().classList.contains('hidden')).toBe(true);

    gen1.click();
    expect(endScreen().classList.contains('hidden')).toBe(false);
    expect(status().textContent).toBe('');
  });

  it('does not crash when the last playable generation is disabled during a reveal', async () => {
    await start();
    playRounds(gen1Count());

    const gen2 = document.querySelector<HTMLButtonElement>('.gen-2')!;
    gen2.click();
    guessCorrect();
    gen2.click();

    vi.advanceTimersByTime(REVEAL_TIMEOUT);

    expect(endScreen().classList.contains('hidden')).toBe(false);
  });

  it('clears pending end-screen timers when a new round starts', async () => {
    await start();
    guessWrong();
    advanceRound();
    playRounds(gen1Count() - 1);

    const gen2 = document.querySelector<HTMLButtonElement>('.gen-2')!;
    gen2.click();
    vi.advanceTimersByTime(REVEAL_TIMEOUT);

    expect(endScreen().querySelectorAll('.end-pokemon')).toHaveLength(0);

    currentAudio().emit('ended');
    expect(endGame().classList.contains('hidden')).toBe(false);
  });

  it('shows end game only after the next cry finishes', async () => {
    await start();
    currentAudio().emit('ended');
    expect(endGame().classList.contains('hidden')).toBe(true);

    guessCorrect();
    expect(endGame().classList.contains('hidden')).toBe(true);

    advanceRound();
    expect(endGame().classList.contains('hidden')).toBe(true);

    currentAudio().emit('ended');
    expect(endGame().classList.contains('hidden')).toBe(false);
  });

  it('keeps end game visible once it has appeared', async () => {
    await start();
    guessCorrect();
    advanceRound();
    currentAudio().emit('ended');
    expect(endGame().classList.contains('hidden')).toBe(false);

    guessCorrect();
    expect(endGame().classList.contains('hidden')).toBe(false);

    advanceRound();
    expect(endGame().classList.contains('hidden')).toBe(false);
  });

  it('ends the game on demand with the wrong answers', async () => {
    await start();
    guessWrong();
    advanceRound();
    currentAudio().emit('ended');
    const focus = vi.spyOn(endScreen(), 'focus');
    endGame().click();

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(endScreen().classList.contains('hidden')).toBe(false);
    expect(endGame().classList.contains('hidden')).toBe(true);

    vi.advanceTimersByTime(REVEAL_TIMEOUT);

    expect(endScreen().classList.contains('hidden')).toBe(false);
    expect(endScreen().querySelectorAll('.end-pokemon')).toHaveLength(1);
    expect(status().textContent).toContain('Wrong');
  });

  it('continues with a new generation after one is exhausted', async () => {
    await start();
    playRounds(gen1Count());

    const gen2 = document.querySelector<HTMLButtonElement>('.gen-2')!;
    gen2.click();

    expect(playButton().classList.contains('hidden')).toBe(false);
    expect(options().every((option) => !option.disabled)).toBe(true);
    expect(options().every((option) => option.textContent)).toBe(true);
  });

  it('shows wrong answers on the end screen and plays their cry', async () => {
    await start();
    const total = gen1Count();
    const wrongCry = currentAudio().src;
    guessWrong();
    advanceRound();

    playRounds(total - 1);
    advanceRound();

    expect(score().textContent).toBe(`${total - 1} / ${total}`);
    const sprites = Array.from(endScreen().querySelectorAll<HTMLButtonElement>('.end-pokemon'));
    expect(sprites).toHaveLength(1);
    expect(sprites[0].getAttribute('data-tooltip')).toBeTruthy();
    expect(sprites[0].querySelector('img')?.getAttribute('src')).toBeTruthy();

    const endAudio = [...audios].reverse().find((audio) => audio.src === wrongCry);
    expect(endAudio).toBeDefined();
    endAudio!.currentTime = 5;
    const play = vi.spyOn(endAudio!, 'play');
    sprites[0].click();
    expect(endAudio!.currentTime).toBe(0);
    expect(play).toHaveBeenCalledOnce();

    const image = sprites[0].querySelector('img')!;
    expect(image.classList.contains('rumble')).toBe(true);
    endAudio!.emit('ended');
    expect(image.classList.contains('rumble')).toBe(false);

    play.mockRejectedValueOnce(new Error('blocked'));
    sprites[0].click();
    await Promise.resolve();
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('falls back to the end screen when a round has no Pokemon left', async () => {
    (window as unknown as { __POKECRY_TEST__: boolean }).__POKECRY_TEST__ = true;
    await start();

    const hooks = (
      window as unknown as {
        __pokecryTest: {
          nextRound: () => void;
          setPokemonLeft: (lists: unknown[]) => void;
        };
      }
    ).__pokecryTest;

    hooks.setPokemonLeft([]);
    hooks.nextRound();

    expect(endScreen().classList.contains('hidden')).toBe(false);
  });
});
