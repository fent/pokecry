const REVEAL_TIMEOUT = 1200;
const PING_TIMEOUT = 600;
const VOLUME = 0.5;

type Generation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

interface GenerationPaths {
  spritesDir: string;
  criesDir: string;
}

interface GenerationConfig extends GenerationPaths {
  enabled: boolean;
}

interface GenData extends GenerationConfig {
  pokemon: Pokemon[];
  pokemonLeft: Pokemon[];
}

const enrichPokemon = (def: PokemonDef, paths: GenerationPaths): Pokemon => {
  let spriteId = def.species_id;
  let cryId = def.species_id;

  const formsAvailable =
    def.formSprites === false ? [] : (def.forms ?? []).filter((form) => form[0] !== '!');

  // 50/50 to select another form.
  if (formsAvailable.length > 0 && Math.random() > 0.5) {
    const form = formsAvailable[Math.floor(Math.random() * formsAvailable.length)];
    const formName = form.replace(/^@/, '');
    spriteId += `-${formName}`;
    if (def.formSounds || form.startsWith('@')) {
      cryId += `-${formName}`;
    }
  }

  return {
    ...def,
    sprite: `media/sprites/${paths.spritesDir}/${spriteId}.png`,
    cry: `media/cries/${paths.criesDir}/${cryId}.mp3`,
  };
};

const createGeneration = (defs: PokemonDef[], config: GenerationConfig): GenData => {
  const list = defs.map((def) => enrichPokemon(def, config));
  return { ...config, pokemon: list, pokemonLeft: list.slice() };
};

// For every generation, keep a copy of all pokemon and the pokemon
// that are left to be guessed from that generation.
const gens: Record<Generation, GenData> = {
  1: createGeneration(pokemon.gen1, { enabled: true, spritesDir: 'yellow', criesDir: 'legacy' }),
  2: createGeneration(pokemon.gen2, { enabled: false, spritesDir: 'crystal', criesDir: 'legacy' }),
  3: createGeneration(pokemon.gen3, { enabled: false, spritesDir: 'emerald', criesDir: 'legacy' }),
  4: createGeneration(pokemon.gen4, {
    enabled: false,
    spritesDir: 'platinum',
    criesDir: 'legacy',
  }),
  5: createGeneration(pokemon.gen5, {
    enabled: false,
    spritesDir: 'black-white',
    criesDir: 'legacy',
  }),
  6: createGeneration(pokemon.gen6, { enabled: false, spritesDir: 'x-y', criesDir: 'latest' }),
  7: createGeneration(pokemon.gen7, {
    enabled: false,
    spritesDir: 'sun-moon',
    criesDir: 'latest',
  }),
  8: createGeneration(pokemon.gen8, {
    enabled: false,
    spritesDir: 'sword-shield',
    criesDir: 'latest',
  }),
};

// Gets a list of lists of pokemon from all enabled generations.
const getPokemon = (key: 'pokemon' | 'pokemonLeft'): Pokemon[][] => {
  const all: Pokemon[][] = [];
  for (const gen in gens) {
    const d = gens[gen as unknown as Generation];
    if (d.enabled) {
      all.push(d[key]);
    }
  }
  return all;
};

const getAllPokemon = (): Pokemon[][] => getPokemon('pokemon');
const getPokemonLeft = (): Pokemon[][] => getPokemon('pokemonLeft');

let allPokemon: Pokemon[][], pokemonLeft: Pokemon[][];

// This is called when the game first begins, and whenever
// the generations enabled is updated.
const updatePokemon = (): void => {
  allPokemon = getAllPokemon();
  pokemonLeft = getPokemonLeft();
};
updatePokemon();

// Gets a random pokemon from a list of lists, which will be either
// all pokemon from enabled generations, or all pokemon that are left.
const randomFromLists = (lists: Pokemon[][], remove: boolean): Pokemon => {
  const available = lists.filter((list) => list.length > 0);
  const list = available[Math.floor(Math.random() * available.length)];
  const index = Math.floor(Math.random() * list.length);
  const pkm = list[index];
  if (remove) {
    list.splice(index, 1);
  }
  return pkm;
};

// Returns true if there are any pokemon left to play.
const arePokemonLeft = (): boolean => {
  for (let i = 0, len = pokemonLeft.length; i < len; i++) {
    if (pokemonLeft[i].length) {
      return true;
    }
  }
  return false;
};

// Keep track of player stats.
let totalGuesses = 0;
let correctGuesses = 0;
let restorePlayFocus = false;
let roundActive = false;
let revealTimer: number | undefined;
let showingEmptyState = false;
const endScreenTimers: number[] = [];
const guessedWrong: Pokemon[] = [];

const requireElement = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error('Missing required element: ' + selector);
  }
  return element;
};

const optionsElement = requireElement<HTMLDivElement>('.options');
const optionElements = document.querySelectorAll<HTMLButtonElement>('.option');
const genElements = document.querySelectorAll<HTMLButtonElement>('.gen[data-gen]');
const allGensElement = requireElement<HTMLButtonElement>('.gen-all');
const successElement = requireElement<HTMLHeadingElement>('.success');
const failureElement = requireElement<HTMLHeadingElement>('.failure');
const fillerElement = requireElement<HTMLHeadingElement>('.filler');
const scoreElement = requireElement<HTMLSpanElement>('.score');
const spriteElement = requireElement<HTMLImageElement>('.pokemon-sprite');
const playElement = requireElement<HTMLButtonElement>('.play');
const endGameElement = requireElement<HTMLButtonElement>('.end-game');
const statusElement = requireElement<HTMLParagraphElement>('.status');
const endScreenElement = requireElement<HTMLDivElement>('.end-screen');

const setHidden = (element: Element, hidden: boolean): void => {
  element.classList.toggle('hidden', hidden);
};

const setRumble = (element: Element, active: boolean): void => {
  element.classList.toggle('rumble', active);
};

const clearEndScreenTimers = (): void => {
  for (const timer of endScreenTimers) {
    window.clearTimeout(timer);
  }
  endScreenTimers.length = 0;
};

const cancelReveal = (): void => {
  if (revealTimer !== undefined) {
    window.clearTimeout(revealTimer);
    revealTimer = undefined;
  }
};

const displayName = (pokemon: Pokemon): string => pokemon.name || pokemon.identifier;

playElement.addEventListener('click', () => {
  theCry.play();
});

endGameElement.addEventListener('click', () => {
  displayEndScreen();
});

// Pick decoys that are not the answer, for the player to choose between.
const pickDecoyPokemon = (speciesId: string, count: number): Pokemon[] => {
  const seenIds = new Set([speciesId]);
  const decoys: Pokemon[] = [];

  while (decoys.length < count) {
    const candidate = randomFromLists(allPokemon, false);
    if (!seenIds.has(candidate.species_id)) {
      seenIds.add(candidate.species_id);
      decoys.push(candidate);
    }
  }

  return decoys;
};

const shuffle = <T>(array: T[]): T[] => {
  let currentIndex = array.length;
  let tmp: T, randomIndex: number;

  while (0 !== currentIndex) {
    randomIndex = ~~(Math.random() * currentIndex);
    currentIndex--;
    tmp = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = tmp;
  }

  return array;
};

let thePokemon: Pokemon;
let theCry: HTMLAudioElement;

// Called whenever the user guesses on a pokemon.
const guess = (option: HTMLButtonElement): void => {
  totalGuesses++;
  roundActive = false;
  const isCorrect = option.dataset.speciesId === thePokemon.species_id;
  restorePlayFocus = document.activeElement === option;
  if (isCorrect) {
    correctGuesses++;
  } else {
    guessedWrong.push(thePokemon);
  }

  const scoreText = `${correctGuesses} / ${totalGuesses}`;
  const resultElement = isCorrect ? successElement : failureElement;
  setHidden(successElement, !isCorrect);
  setHidden(failureElement, isCorrect);
  scoreElement.textContent = scoreText;
  resultElement.appendChild(scoreElement);
  statusElement.textContent = isCorrect
    ? `Correct. Score ${scoreText}.`
    : `Wrong. The answer was ${displayName(thePokemon)}. Score ${scoreText}.`;
  setHidden(fillerElement, true);

  // Disable all buttons.
  for (let i = 0, len = optionElements.length; i < len; i++) {
    const optionElement = optionElements[i];
    optionElement.disabled = true;

    // Label the pokemon that was the answer.
    if (optionElement.dataset.speciesId === thePokemon.species_id) {
      optionElement.classList.add('right');
    }
  }

  // Remove the play button and show the pokemon.
  setHidden(playElement, true);
  spriteElement.setAttribute('src', thePokemon.sprite);
  spriteElement.alt = displayName(thePokemon);
  setHidden(spriteElement, false);

  if (arePokemonLeft()) {
    revealTimer = window.setTimeout(nextRound, REVEAL_TIMEOUT);
  } else {
    displayEndScreen();
  }
};

const startRumble = (): void => setRumble(playElement, true);
const stopRumble = (): void => setRumble(playElement, false);

const nextRound = (): void => {
  cancelReveal();
  if (!arePokemonLeft()) {
    displayEndScreen();
    return;
  }
  roundActive = true;
  if (showingEmptyState) {
    statusElement.textContent = '';
    showingEmptyState = false;
  }
  setHidden(fillerElement, true);
  setHidden(optionsElement, false);
  setHidden(endScreenElement, true);
  clearEndScreenTimers();
  endScreenElement.replaceChildren();

  thePokemon = randomFromLists(pokemonLeft, true);
  let roundPokemons = pickDecoyPokemon(thePokemon.species_id, 3);
  roundPokemons.push(thePokemon);
  roundPokemons = shuffle(roundPokemons);
  for (let i = 0, len = optionElements.length; i < len; i++) {
    const optionElement = optionElements[i];
    const pokemon = roundPokemons[i];
    optionElement.dataset.speciesId = pokemon.species_id;
    optionElement.textContent = displayName(pokemon);
    optionElement.disabled = false;
    optionElement.classList.remove('right');
  }

  theCry = new Audio(thePokemon.cry);
  theCry.volume = VOLUME;
  theCry.autoplay = true;
  theCry.addEventListener('play', startRumble);
  theCry.addEventListener('ended', stopRumble);
  theCry.addEventListener('ended', () => {
    if (roundActive && totalGuesses > 0) {
      setHidden(endGameElement, false);
    }
  });
  setHidden(playElement, false);
  playElement.disabled = false;
  if (restorePlayFocus) {
    playElement.focus();
    restorePlayFocus = false;
  }
  spriteElement.alt = 'Mystery Pokemon';
  setHidden(spriteElement, true);
};

const displayEndScreen = (): void => {
  cancelReveal();
  if (showingEmptyState) {
    statusElement.textContent = '';
    showingEmptyState = false;
  }
  roundActive = false;
  setHidden(endGameElement, true);
  clearEndScreenTimers();
  endScreenElement.replaceChildren();
  setHidden(endScreenElement, false);
  endScreenElement.tabIndex = -1;
  endScreenElement.focus({ preventScroll: true });
  const ping = new Audio('media/ping.mp3');
  ping.volume = VOLUME;

  for (let i = 0, len = guessedWrong.length; i < len; i++) {
    const pokemon = guessedWrong[i];
    const cry = new Audio(pokemon.cry);
    cry.volume = VOLUME;
    const wrapper = document.createElement('button');
    wrapper.type = 'button';
    wrapper.className = 'end-pokemon';
    wrapper.dataset.tooltip = displayName(pokemon);
    wrapper.setAttribute('aria-label', `Play ${displayName(pokemon)}'s cry`);
    const image = document.createElement('img');
    image.className = 'pokemon-sprite';
    image.setAttribute('src', pokemon.sprite);
    image.alt = '';
    cry.addEventListener('play', () => setRumble(image, true));
    cry.addEventListener('ended', () => setRumble(image, false));
    wrapper.addEventListener('click', () => {
      cry.currentTime = 0;
      void cry.play().catch(() => undefined);
    });
    wrapper.appendChild(image);
    const timer = window.setTimeout(
      () => {
        ping.play();
        endScreenElement.appendChild(wrapper);
      },
      (i + 1) * PING_TIMEOUT,
    );
    endScreenTimers.push(timer);
  }
};

const showEmptyState = (): void => {
  cancelReveal();
  clearEndScreenTimers();
  roundActive = false;
  showingEmptyState = true;
  setHidden(playElement, false);
  playElement.disabled = true;
  setHidden(optionsElement, false);
  setHidden(successElement, true);
  setHidden(failureElement, true);
  fillerElement.textContent = 'Select at least one generation';
  setHidden(fillerElement, false);
  setHidden(endScreenElement, true);

  for (let i = 0, len = optionElements.length; i < len; i++) {
    optionElements[i].disabled = true;
  }

  statusElement.textContent = 'Select at least one generation to play.';
};

const allGenerationsEnabled = (): boolean => Object.values(gens).every((gen) => gen.enabled);

const updateGenerationButtons = (): void => {
  for (let i = 0, len = genElements.length; i < len; i++) {
    const genElement = genElements[i];
    const generation = Number(genElement.dataset.gen) as Generation;
    genElement.setAttribute('aria-pressed', String(gens[generation].enabled));
  }

  const enabledCount = Object.values(gens).filter((gen) => gen.enabled).length;
  const allState =
    enabledCount === Object.keys(gens).length ? 'true' : enabledCount === 0 ? 'false' : 'mixed';
  allGensElement.setAttribute('aria-pressed', allState);
};

const refreshGame = (): void => {
  updatePokemon();
  if (allPokemon.length === 0) {
    showEmptyState();
    return;
  }

  if (revealTimer !== undefined) {
    if (!arePokemonLeft()) {
      cancelReveal();
      displayEndScreen();
    }
    return;
  }

  if (!roundActive) {
    if (arePokemonLeft()) {
      nextRound();
    } else {
      displayEndScreen();
    }
  }
};

for (let i = 0, len = genElements.length; i < len; i++) {
  const genElement = genElements[i];
  const generation = Number(genElement.dataset.gen) as Generation;
  genElement.addEventListener('click', () => {
    gens[generation].enabled = !gens[generation].enabled;
    updateGenerationButtons();
    refreshGame();
  });
}

allGensElement.addEventListener('click', () => {
  const enableAll = !allGenerationsEnabled();
  for (const gen of Object.values(gens)) {
    gen.enabled = enableAll;
  }
  updateGenerationButtons();
  refreshGame();
});

updateGenerationButtons();

// Called when the user clicks on one of the guesses.
optionsElement.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const option = target.closest<HTMLButtonElement>('.option');
  if (!option || option.disabled) {
    return;
  }

  guess(option);
});

// Test-only hook for defensive branches that the UI cannot reach.
const testWindow = window as unknown as {
  __POKECRY_TEST__?: boolean;
  __pokecryTest?: {
    nextRound: () => void;
    setPokemonLeft: (lists: Pokemon[][]) => void;
  };
};

if (testWindow.__POKECRY_TEST__) {
  testWindow.__pokecryTest = {
    nextRound,
    setPokemonLeft: (lists) => {
      pokemonLeft = lists;
    },
  };
}

// Start the very first round.
nextRound();
