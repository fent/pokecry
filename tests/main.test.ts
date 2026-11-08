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

  it('includes generation 8 with alternate forms', async () => {
    await start();

    const gen8 = (window as unknown as { pokemon: { gen8: { forms?: string[] }[] } }).pokemon.gen8;
    expect(gen8).toHaveLength(96);
    expect(gen8.some((pokemon) => pokemon.forms?.some((form) => form.startsWith('!')))).toBe(true);
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

  it('has assets for every generation 8 Pokemon and form', async () => {
    await start();

    const gen8 = (
      window as unknown as {
        pokemon: { gen8: { species_id: string; forms?: string[] }[] };
      }
    ).pokemon.gen8;

    for (const pokemon of gen8) {
      expect(existsSync(`media/sprites/sword-shield/${pokemon.species_id}.png`)).toBe(true);
      expect(existsSync(`media/cries/latest/${pokemon.species_id}.mp3`)).toBe(true);

      for (const form of pokemon.forms ?? []) {
        if (form.startsWith('!')) {
          continue;
        }
        const name = form.replace(/^@/, '');
        expect(existsSync(`media/sprites/sword-shield/${pokemon.species_id}-${name}.png`)).toBe(
          true,
        );
        expect(existsSync(`media/cries/latest/${pokemon.species_id}-${name}.mp3`)).toBe(true);
      }
    }
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
