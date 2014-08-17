(function (window) {
  var NEXT_ROUND_TIMEOUT = 600;
  var PING_TIMEOUT = 600;

  // For every generation, keep a copy of all pokemon and the pokemon
  // that are left to be guessed from that generation.
  var gens = {
    1: {
      enabled: true,
      spritesDir: 'yellow',
      criesDir: '/old',
      allPokemon: window.pokemon.gen1.slice(),
      pokemonLeft: window.pokemon.gen1.slice()
    },
    2: {
      enabled: false,
      spritesDir: 'crystal',
      criesDir: '/old',
      allPokemon: window.pokemon.gen2.slice(),
      pokemonLeft: window.pokemon.gen2.slice()
    },
    3: {
      enabled: false,
      spritesDir: 'emerald',
      criesDir: '/old',
      allPokemon: window.pokemon.gen3.slice(),
      pokemonLeft: window.pokemon.gen3.slice()
    },
    4: {
      enabled: false,
      spritesDir: 'platinum',
      criesDir: '/old',
      allPokemon: window.pokemon.gen4.slice(),
      pokemonLeft: window.pokemon.gen4.slice()
    },
    5: {
      enabled: false,
      spritesDir: 'black-white',
      criesDir: '/old',
      allPokemon: window.pokemon.gen5.slice(),
      pokemonLeft: window.pokemon.gen5.slice()
    },
    6: {
      enabled: false,
      spritesDir: 'x-y',
      criesDir: '',
      allPokemon: window.pokemon.gen6.slice(),
      pokemonLeft: window.pokemon.gen6.slice()
    }
  };

  // Construct paths for audio and sprites.
  for (var gen in gens) {
    var d = gens[gen];
    for (var i = 0, len = d.allPokemon.length; i < len; i++) {
      var pkm = d.allPokemon[i];
      pkm.sprite =
        'media/sprites/' + d.spritesDir + '/' + pkm.species_id + '.png';
      pkm.cry =
        'media/cries' + d.criesDir + '/' + pkm.species_id + '.mp3';
    }
  }

  // Gets a list of lists of pokemon from all enabled generations.
  function getPokemon(key) {
    var all = [];
    for (var gen in gens) {
      var d = gens[gen];
      if (d.enabled) {
        all.push(d[key]);
      }
    }
    return all;
  }

  function getAllPokemon() {
    return getPokemon('allPokemon');
  }

  function getPokemonLeft() {
    return getPokemon('pokemonLeft');
  }

  var allPokemon, pokemonLeft;

  // This is called when the game first begins, and whenever
  // the generations enabled is updated.
  function updatePokemon() {
    allPokemon = getAllPokemon();
    pokemonLeft = getPokemonLeft();
  }
  updatePokemon();

  // Gets a random pokemon from a list of lists, which will be either
  // all pokemon from enabled generations, or all pokemon that are left.
  function randomFromLists(lists, remove) {
    var list = lists[~~(Math.random() * lists.length)];
    var index = ~~(Math.random() * list.length);
    var pkm = list[index];
    if (remove) {
      list.splice(index, 1);
    }
    return pkm;
  }

  // Returns true if there are any pokemon left to play.
  function arePokemonLeft() {
    if (!pokemonLeft.length) { return false; }
    for (var i = 0, len = pokemonLeft.length; i < len; i++) {
      if (pokemonLeft[i].length) { return true; }
    }
    return false;
  }

  // Keep track of player stats.
  var totalGuesses = 0;
  var correctGuesses = 0;
  var guessedWrong = [];

  var $options = $('.options').children();
  var $success = $('.success');
  var $failure = $('.failure');
  var $filler = $('.filler');
  var $score = $('.score');
  var $sprite = $('.pokemon-sprite');
  var $play = $('.play');
  $play.click(playCry);
  $play.jrumble();

  $('.gen').click(function() {
    var $gen = $(this);
    $gen.toggleClass('enabled');
    var gen = $gen.attr('data-gen');
    gens[gen].enabled = $gen.hasClass('enabled');
    updatePokemon();
  });

  $('.gen-1').addClass('enabled');

  // Returns `n` pokemon that are not the given pokemon.
  // Used to have them be shuffled in with the pokemon to be guessed.
  function randomPokemonThatAreNot(theid, n) {
    var pokemons = [];
    var pokemonsHash = {};
    pokemonsHash[theid] = true;

    for (var i = 0; i < n; i++) {
      var pokemon;
      do {
        pokemon = randomFromLists(allPokemon, false);
      } while (pokemonsHash[pokemon.species_id] === true);
      pokemons.push(pokemon);
      pokemonsHash[pokemon.species_id] = true;
    }

    return pokemons;
  }

  function shuffle(array) {
    var currentIndex = array.length;
    var tmp, randomIndex;

    while (0 !== currentIndex) {
      randomIndex = ~~(Math.random() * currentIndex);
      currentIndex--;
      tmp = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = tmp;
    }

    return array;
  }

  var thePokemon;
  var theCry;

  function nextRound() {
    thePokemon = randomFromLists(pokemonLeft, true);
    var roundPokemons = randomPokemonThatAreNot(thePokemon.species_id, 3);
    roundPokemons.push(thePokemon);
    roundPokemons = shuffle(roundPokemons);
    for (var i = 0, len = $options.length; i < len; i++) {
      var $child = $($options[i]);
      var pokemon = roundPokemons[i];
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
  }

  function startRumble() { $play.trigger('startRumble'); }
  function stopRumble() { $play.trigger('stopRumble'); }
  function playCry() { theCry.play(); }

  // Start the very first round in the beginning.
  nextRound();

  // Called whenever the user guesses on a pokemon.
  function guess() {
    var $child = $(this);
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
    for (var i = 0, len = $options.length; i < len; i++) {
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
    var src = thePokemon.sprite;
    $sprite.attr('src', src);
    $sprite.removeClass('hidden');

    if (arePokemonLeft()) {
      setTimeout(nextRound, NEXT_ROUND_TIMEOUT);
    } else {
      displayEndScreen();
    }
  }

  function displayEndScreen() {
    var $endScreen = $('.end-screen');
    $endScreen.removeClass('hidden');
    var ping = new Audio('media/ping.mp3');

    for (var i = 0, len = guessedWrong.length; i < len; i++) {
      (function(pokemon, i) {
        var cry = new Audio(pokemon.cry);
        var src = pokemon.sprite;
        var $img = $('<img class="pokemon-sprite" src="' + src + '" />');
        $img.jrumble();
        cry.addEventListener('play', function() {
          $img.trigger('startRumble');
        });
        cry.addEventListener('ended', function() {
          $img.trigger('stopRumble');
        });
        $img.click(function() { cry.play(); });
        setTimeout(function() {
          ping.play();
          $endScreen.append($img);
        }, (i + 1) * PING_TIMEOUT);
      })(guessedWrong[i], i);
      
    }
  }
})(window, document);
