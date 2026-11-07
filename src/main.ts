const NEXT_ROUND_TIMEOUT = 600;
const PING_TIMEOUT = 600;
const VOLUME = 0.5;

type Generation = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface GenData {
  enabled: boolean;
  spritesDir: string;
  criesDir: string;
  criesExt?: string;
  pokemon: Pokemon[];
  pokemonLeft: Pokemon[];
}

// For every generation, keep a copy of all pokemon and the pokemon
// that are left to be guessed from that generation.
const gens: Record<Generation, GenData> = {
  1: {
    enabled: true,
    spritesDir: 'yellow',
    criesDir: '/old',
    pokemon: pokemon.gen1.slice() as Pokemon[],
    pokemonLeft: [],
  },
  2: {
    enabled: false,
    spritesDir: 'crystal',
    criesDir: '/old',
    pokemon: pokemon.gen2.slice() as Pokemon[],
    pokemonLeft: [],
  },
  3: {
    enabled: false,
    spritesDir: 'emerald',
    criesDir: '/old',
    pokemon: pokemon.gen3.slice() as Pokemon[],
    pokemonLeft: [],
  },
  4: {
    enabled: false,
    spritesDir: 'platinum',
    criesDir: '/old',
    pokemon: pokemon.gen4.slice() as Pokemon[],
    pokemonLeft: [],
  },
  5: {
    enabled: false,
    spritesDir: 'black-white',
    criesDir: '/old',
    pokemon: pokemon.gen5.slice() as Pokemon[],
    pokemonLeft: [],
  },
  6: {
    enabled: false,
    spritesDir: 'x-y',
    criesDir: '',
    pokemon: pokemon.gen6.slice() as Pokemon[],
    pokemonLeft: [],
  },
  7: {
    enabled: false,
    spritesDir: 'sun-moon',
    criesDir: '',
    criesExt: '.wav',
    pokemon: pokemon.gen7.slice() as Pokemon[],
    pokemonLeft: [],
  },
};

// Construct paths for audio and sprites.
for (const gen in gens) {
  const d = gens[gen as unknown as Generation];
  for (let i = 0, len = d.pokemon.length; i < len; i++) {
    const pkm = d.pokemon[i];
    let spritepath: string = pkm.species_id;
    let crypath: string = pkm.species_id;

    const formsAvailable =
      pkm.forms &&
      (pkm.formSprites == null || pkm.formSprites) &&
      pkm.forms.filter((form) => form[0] !== '!');

    // 50/50 to select another form.
    let form: string | undefined;
    if (formsAvailable && formsAvailable.length && Math.random() > 0.5) {
      form = formsAvailable[~~(Math.random() * formsAvailable.length)];
      spritepath += '-' + form.replace(/^@/, '');
      if (pkm.formSounds || (form && form[0] === '@')) crypath += '-' + form.replace(/^@/, '');
    }

    pkm.sprite = 'media/sprites/' + d.spritesDir + '/' + spritepath + '.png';
    pkm.cry = 'media/cries' + d.criesDir + '/' + crypath + (d.criesExt || '.mp3');
  }
  d.pokemonLeft = d.pokemon.slice();
}

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
  const list = lists[~~(Math.random() * lists.length)];
  const index = ~~(Math.random() * list.length);
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
const guessedWrong: Pokemon[] = [];

const query = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error('Missing required element: ' + selector);
  }
  return element;
};

const optionsElement = query<HTMLDivElement>('.options');
const optionElements = document.querySelectorAll<HTMLButtonElement>('.option');
const genElements = document.querySelectorAll<HTMLButtonElement>('.gen');
const successElement = query<HTMLHeadingElement>('.success');
const failureElement = query<HTMLHeadingElement>('.failure');
const fillerElement = query<HTMLHeadingElement>('.filler');
const scoreElement = query<HTMLSpanElement>('.score');
const spriteElement = query<HTMLImageElement>('.pokemon-sprite');
const playElement = query<HTMLButtonElement>('.play');
const statusElement = query<HTMLParagraphElement>('.status');

const setHidden = (element: Element, hidden: boolean): void => {
  element.classList.toggle('hidden', hidden);
};

const setRumble = (element: Element, active: boolean): void => {
  element.classList.toggle('rumble', active);
};

const displayName = (pokemon: Pokemon): string => pokemon.name || pokemon.identifier;

playElement.addEventListener('click', () => {
  theCry.play();
});

for (let i = 0, len = genElements.length; i < len; i++) {
  const genElement = genElements[i];
  const generation = Number(genElement.dataset.gen) as Generation;
  genElement.setAttribute('aria-pressed', String(gens[generation].enabled));
  genElement.addEventListener('click', () => {
    const data = gens[generation];
    data.enabled = !data.enabled;
    genElement.setAttribute('aria-pressed', String(data.enabled));
    updatePokemon();
  });
}

// Returns `n` pokemon that are not the given pokemon.
// Used to have them be shuffled in with the pokemon to be guessed.
const randomPokemonThatAreNot = (theid: string, n: number): Pokemon[] => {
  const pokemons: Pokemon[] = [];
  const pokemonsHash: Record<string, boolean> = {};
  pokemonsHash[theid] = true;

  for (let i = 0; i < n; i++) {
    let pokemon: Pokemon;
    do {
      pokemon = randomFromLists(allPokemon, false);
    } while (pokemonsHash[pokemon.species_id] === true);
    pokemons.push(pokemon);
    pokemonsHash[pokemon.species_id] = true;
  }

  return pokemons;
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
    setTimeout(nextRound, NEXT_ROUND_TIMEOUT);
  } else {
    displayEndScreen();
  }
};

const startRumble = (): void => setRumble(playElement, true);
const stopRumble = (): void => setRumble(playElement, false);

const nextRound = (): void => {
  thePokemon = randomFromLists(pokemonLeft, true);
  let roundPokemons = randomPokemonThatAreNot(thePokemon.species_id, 3);
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
  setHidden(playElement, false);
  if (restorePlayFocus) {
    playElement.focus();
    restorePlayFocus = false;
  }
  spriteElement.alt = 'Mystery Pokemon';
  setHidden(spriteElement, true);
};

// Start the very first round in the beginning.
nextRound();

const displayEndScreen = (): void => {
  const endScreen = query<HTMLDivElement>('.end-screen');
  endScreen.classList.remove('hidden');
  endScreen.tabIndex = -1;
  endScreen.focus();
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
    wrapper.addEventListener('click', () => cry.play());
    wrapper.appendChild(image);
    setTimeout(
      () => {
        ping.play();
        endScreen.appendChild(wrapper);
      },
      (i + 1) * PING_TIMEOUT,
    );
  }
};

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
