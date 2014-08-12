(function (window) {
  var MIN = 1;
  var MAX = 151;
  var PLAY_CRY_TIMEOUT = 0;
  var NEXT_ROUND_TIMEOUT = 1000;

  var totalGuesses = 0;
  var correctGuesses = 0;
  var allPokemons = window.pokemons.slice(MIN - 1, MAX);
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

    theCry = new Audio('cries/' + thePokemon.species_id + '.mp3');
    setTimeout(playCry, PLAY_CRY_TIMEOUT);
    $play.removeClass('hidden');
    $sprite.addClass('hidden');
  }

  function playCry() {
    theCry.onplay = function() { $play.trigger('startRumble'); };
    theCry.onended = function() { $play.trigger('stopRumble'); };
    theCry.play();
  }

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
    $sprite.attr('src', 'sprites/red-blue/' + thePokemon.species_id + '.png');
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
    for (var i = 0, len = guessedWrong.length; i < len; i++) {
      (function(pokemon, i) {
        var cry = new Audio('cries/' + pokemon.species_id + '.mp3');
        var src = 'sprites/red-blue/' + pokemon.species_id + '.png';
        var $img = $('<img class="pokemon-sprite" src="' + src + '" />');
        $img.jrumble();
        cry.onplay = function() { $img.trigger('startRumble'); };
        cry.onended = function() { $img.trigger('stopRumble'); };
        $img.click(function() { cry.play(); });
        setTimeout(function() {
          $endScreen.append($img);
        }, i * 1000);
      })(guessedWrong[i], i);
      
    }
  }
})(window, document);
