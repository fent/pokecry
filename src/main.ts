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
      if (pkm.formSounds || (form && form[0] === '@'))
        crypath += '-' + form.replace(/^@/, '');
    }

    pkm.sprite = 'media/sprites/' + d.spritesDir + '/' + spritepath + '.png';
    pkm.cry =
      'media/cries' + d.criesDir + '/' + crypath + (d.criesExt || '.mp3');
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
const guessedWrong: Pokemon[] = [];

const $options = $('.options').children();
const $success = $('.success');
const $failure = $('.failure');
const $filler = $('.filler');
const $score = $('.score');
const $sprite = $('.pokemon-sprite');
const $play = $('.play');
$play.on('click', () => theCry.play());
$play.jrumble();

$('.gen').on('click', function () {
  const $gen = $(this);
  $gen.toggleClass('enabled');
  const gen = $gen.attr('data-gen') as string;
  gens[parseInt(gen, 10) as Generation].enabled = $gen.hasClass('enabled');
  updatePokemon();
});

$('.gen-1').addClass('enabled');

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
  let tmp, randomIndex;

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
const guess = function (this: HTMLElement): void {
  const $child = $(this);
  totalGuesses++;
  if ($child.data('species_id') === thePokemon.species_id) {
    correctGuesses++;
    $success.removeClass('hidden');
    $failure.addClass('hidden');
    $score.text(correctGuesses + ' / ' + totalGuesses);
    $score.appendTo($success);
  } else {
    guessedWrong.push(thePokemon);
    $success.addClass('hidden');
    $failure.removeClass('hidden');
    $score.text(correctGuesses + ' / ' + totalGuesses);
    $score.appendTo($failure);
  }
  $filler.addClass('hidden');

  // Disable all buttons.
  for (let i = 0, len = $options.length; i < len; i++) {
    const $option = $($options[i]);
    $option.addClass('disabled');

    // Label the pokemon that was the answer.
    if ($option.data('species_id') === thePokemon.species_id) {
      $option.addClass('right');
    }
    $option.off('click', guess);
  }

  // Remove the play button and show the pokemon.
  $play.addClass('hidden');
  const src = thePokemon.sprite;
  $sprite.attr('src', src);
  $sprite.removeClass('hidden');

  if (arePokemonLeft()) {
    setTimeout(nextRound, NEXT_ROUND_TIMEOUT);
  } else {
    displayEndScreen();
  }
};

const nextRound = (): void => {
  thePokemon = randomFromLists(pokemonLeft, true);
  let roundPokemons = randomPokemonThatAreNot(thePokemon.species_id, 3);
  roundPokemons.push(thePokemon);
  roundPokemons = shuffle(roundPokemons);
  for (let i = 0, len = $options.length; i < len; i++) {
    const $child = $($options[i]);
    const pokemon = roundPokemons[i];
    $child.data('species_id', pokemon.species_id);
    $child.text(pokemon.name || pokemon.identifier);
    $child.removeClass('disabled right');
    $child.on('click', guess);
  }

  theCry = new Audio(thePokemon.cry);
  theCry.volume = VOLUME;
  theCry.autoplay = true;
  theCry.addEventListener('play', startRumble);
  theCry.addEventListener('ended', stopRumble);
  $play.removeClass('hidden');
  $sprite.addClass('hidden');
};

const startRumble = (): JQuery<HTMLElement> => $play.trigger('startRumble');
const stopRumble = (): JQuery<HTMLElement> => $play.trigger('stopRumble');

// Start the very first round in the beginning.
nextRound();

const displayEndScreen = (): void => {
  const $endScreen = $('.end-screen');
  $endScreen.removeClass('hidden');
  const ping = new Audio('media/ping.mp3');
  ping.volume = VOLUME;

  for (let i = 0, len = guessedWrong.length; i < len; i++) {
    const pokemon = guessedWrong[i];
    const cry = new Audio(pokemon.cry);
    cry.volume = VOLUME;
    const src = pokemon.sprite;
    const $imgWrapper = $(
      '<div><img class="pokemon-sprite" src="' + src + '" /></div>'
    );
    const $img = $imgWrapper.find('img');
    $imgWrapper.attr('data-tooltip', pokemon.name || pokemon.identifier);
    $img.jrumble();
    cry.addEventListener('play', () => $img.trigger('startRumble'));
    cry.addEventListener('ended', () => $img.trigger('stopRumble'));
    $imgWrapper.on('click', () => cry.play());
    setTimeout(
      () => {
        ping.play();
        $endScreen.append($imgWrapper);
      },
      (i + 1) * PING_TIMEOUT
    );
  }
};
