/* global pokemon */

const NEXT_ROUND_TIMEOUT = 600;
const PING_TIMEOUT = 600;

// For every generation, keep a copy of all pokemon and the pokemon
// that are left to be guessed from that generation.
const gens = {
  1: {
    enabled: true,
    spritesDir: 'yellow',
    criesDir: '/old',
    pokemon: pokemon.gen1.slice(),
  },
  2: {
    enabled: false,
    spritesDir: 'crystal',
    criesDir: '/old',
    pokemon: pokemon.gen2.slice(),
  },
  3: {
    enabled: false,
    spritesDir: 'emerald',
    criesDir: '/old',
    pokemon: pokemon.gen3.slice(),
  },
  4: {
    enabled: false,
    spritesDir: 'platinum',
    criesDir: '/old',
    pokemon: pokemon.gen4.slice(),
  },
  5: {
    enabled: false,
    spritesDir: 'black-white',
    criesDir: '/old',
    pokemon: pokemon.gen5.slice(),
  },
  6: {
    enabled: false,
    spritesDir: 'x-y',
    criesDir: '',
    pokemon: pokemon.gen6.slice(),
  },
  7: {
    enabled: false,
    spritesDir: 'sun-moon',
    criesDir: '',
    criesExt: '.wav',
    pokemon: pokemon.gen7.slice(),
  },
};

// Construct paths for audio and sprites.
for (let gen in gens) {
  let d = gens[gen];
  for (let i = 0, len = d.pokemon.length; i < len; i++) {
    let pkm = d.pokemon[i];
    let spritepath = pkm.species_id;
    let crypath = pkm.species_id;

    let formsAvailable = pkm.forms && pkm.forms.length;
    if (formsAvailable && pkm.forms[0][0] === '!') formsAvailable--;

    // 50/50 to select another form.
    let form;
    if (formsAvailable && Math.random() > 0.5) {
      form = pkm.forms[pkm.forms.length - Math.ceil(Math.random() * formsAvailable)];
      spritepath += '-' + form;
      if (pkm.formSounds) crypath += '-' + form;
    }

    pkm.sprite = 'media/sprites/' + d.spritesDir + '/' + spritepath + '.png';
    pkm.cry = 'media/cries' + d.criesDir + '/' + crypath + (d.criesExt || '.ogg');
  }
  d.pokemonLeft = d.pokemon.slice();
}


// Gets a list of lists of pokemon from all enabled generations.
const getPokemon = (key) => {
  let all = [];
  for (let gen in gens) {
    let d = gens[gen];
    if (d.enabled) {
      all.push(d[key]);
    }
  }
  return all;
};

const getAllPokemon = () => getPokemon('pokemon');
const getPokemonLeft = () => getPokemon('pokemonLeft');

let allPokemon, pokemonLeft;

// This is called when the game first begins, and whenever
// the generations enabled is updated.
const updatePokemon = () => {
  allPokemon = getAllPokemon();
  pokemonLeft = getPokemonLeft();
};
updatePokemon();

// Gets a random pokemon from a list of lists, which will be either
// all pokemon from enabled generations, or all pokemon that are left.
const randomFromLists = (lists, remove) => {
  let list = lists[~~(Math.random() * lists.length)];
  let index = ~~(Math.random() * list.length);
  let pkm = list[index];
  if (remove) {
    list.splice(index, 1);
  }
  return pkm;
};

// Returns true if there are any pokemon left to play.
const arePokemonLeft = () => {
  for (let i = 0, len = pokemonLeft.length; i < len; i++) {
    if (pokemonLeft[i].length) { return true; }
  }
  return false;
};

// Keep track of player stats.
let totalGuesses = 0;
let correctGuesses = 0;
let guessedWrong = [];

let $options = $('.options').children();
let $success = $('.success');
let $failure = $('.failure');
let $filler = $('.filler');
let $score = $('.score');
let $sprite = $('.pokemon-sprite');
let $play = $('.play');
$play.click(() => theCry.play());
$play.jrumble();

$('.gen').click(function() {
  let $gen = $(this)
  $gen.toggleClass('enabled');
  let gen = $gen.attr('data-gen');
  gens[gen].enabled = $gen.hasClass('enabled');
  updatePokemon();
});

$('.gen-1').addClass('enabled');

// Returns `n` pokemon that are not the given pokemon.
// Used to have them be shuffled in with the pokemon to be guessed.
const randomPokemonThatAreNot = (theid, n) => {
  let pokemons = [];
  let pokemonsHash = {};
  pokemonsHash[theid] = true;

  for (let i = 0; i < n; i++) {
    let pokemon;
    do {
      pokemon = randomFromLists(allPokemon, false);
    } while (pokemonsHash[pokemon.species_id] === true);
    pokemons.push(pokemon);
    pokemonsHash[pokemon.species_id] = true;
  }

  return pokemons;
};

const shuffle = (array) => {
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

let thePokemon;
let theCry;

// Called whenever the user guesses on a pokemon.
const guess = function() {
  let $child = $(this);
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
    $child = $($options[i]);
    $child.addClass('disabled');

    // Label the pokemon that was the answer.
    if ($child.data('species_id') === thePokemon.species_id) {
      $child.addClass('right');
    }
    $child.unbind('click', guess);
  }

  // Remove the play button and show the pokemon.
  $play.addClass('hidden');
  let src = thePokemon.sprite;
  $sprite.attr('src', src);
  $sprite.removeClass('hidden');

  if (arePokemonLeft()) {
    setTimeout(nextRound, NEXT_ROUND_TIMEOUT);
  } else {
    displayEndScreen();
  }
};

const nextRound = () => {
  thePokemon = randomFromLists(pokemonLeft, true);
  let roundPokemons = randomPokemonThatAreNot(thePokemon.species_id, 3);
  roundPokemons.push(thePokemon);
  roundPokemons = shuffle(roundPokemons);
  for (let i = 0, len = $options.length; i < len; i++) {
    let $child = $($options[i]);
    let pokemon = roundPokemons[i];
    $child.data('species_id', pokemon.species_id);
    $child.text(pokemon.identifier);
    $child.removeClass('disabled right');
    $child.click(guess);
  }

  theCry = new Audio(thePokemon.cry);
  theCry.autoplay = true;
  theCry.addEventListener('play', startRumble);
  theCry.addEventListener('ended', stopRumble);
  $play.removeClass('hidden');
  $sprite.addClass('hidden');
};

const startRumble = () => $play.trigger('startRumble');
const stopRumble = () => $play.trigger('stopRumble');

// Start the very first round in the beginning.
nextRound();

const displayEndScreen = () => {
  let $endScreen = $('.end-screen');
  $endScreen.removeClass('hidden');
  let ping = new Audio('media/ping.mp3');

  for (let i = 0, len = guessedWrong.length; i < len; i++) {
    let pokemon = guessedWrong[i];
    let cry = new Audio(pokemon.cry);
    let src = pokemon.sprite;
    let $img = $('<img class="pokemon-sprite" src="' + src + '" />');
    $img.jrumble();
    cry.addEventListener('play', () => $img.trigger('startRumble'));
    cry.addEventListener('ended', () => $img.trigger('stopRumble'));
    $img.click(() => cry.play());
    setTimeout(() => {
      ping.play();
      $endScreen.append($img);
    }, (i + 1) * PING_TIMEOUT);
  }
};
