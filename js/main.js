(function (window) {
  var NEXT_ROUND_TIMEOUT = 600;
  var PING_TIMEOUT = 600;

  // Construct paths for audio and sprites.
  var gens = {
    gen1: ['yellow', '/old'],
    gen2: ['crystal', '/old'],
    gen3: ['emerald', '/old'],
    gen4: ['platinum', '/old'],
    gen5: ['black-white', '/old'],
    gen6: ['x-y', '']
  };

  for (var gen in gens) {
    var d = gens[gen];
    var pokemonGen = window.pokemon[gen];
    for (var i = 0, len = pokemonGen.length; i < len; i++) {
      var pkm = pokemonGen[i];
      pkm.sprite = 'media/sprites/' + d[0] + '/' + pkm.species_id + '.png';
      pkm.cry = 'media/cries' + d[1] + '/' + pkm.species_id + '.mp3';
    }
  }

  var totalGuesses = 0;
  var correctGuesses = 0;
  var allPokemons = window.pokemon.gen1;
  var pokemonsLeft = allPokemons.slice();
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

  function randomPokemonThatAreNot(theid, n) {
    var pokemons = [];
    var pokemonsHash = {};
    pokemonsHash[theid] = true;

    for (var i = 0; i < n; i++) {
      var pokemon;
      do {
        pokemon = allPokemons[~~(Math.random() * allPokemons.length)];
      } while (pokemonsHash[pokemon.species_id] === true);
      pokemons.push(pokemon);
      pokemonsHash[pokemon.species_id] = true;
    }

    return pokemons;
  }

  function randomNonPastPokemon() {
    var index = ~~(Math.random() * pokemonsLeft.length);
    return pokemonsLeft.splice(index, 1)[0];
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
    thePokemon = randomNonPastPokemon();
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

    if (pokemonsLeft.length) {
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
        }, i * PING_TIMEOUT);
      })(guessedWrong[i], i);
      
    }
  }
})(window, document);
