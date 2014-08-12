(function (window) {
  var MIN = 1;
  var MAX = 151;
  var PLAY_CRY_TIMEOUT = 0;
  var NEXT_ROUND_TIMEOUT = 1000;

  var totalPokemon = MAX - MIN - + 1;
  var totalGuesses = 0;
  var correctGuesses = 0;
  var pokemons = window.pokemons.slice(MIN - 1, MAX - 1);

  var $options = $('.options').children();
  var $success = $('.success');
  var $failure = $('.failure');
  var $filler = $('.filler');
  var $score = $('.score');
  var $sprite = $('.pokemon-sprite');
  var $play = $('.play');
  $play.click(playCry);
  $play.jrumble();

  function randomPokemon() {
    return pokemons[~~(Math.random() * pokemons.length)];
  }

  function randomPokemonThatIsNot(id) {
    var pokemon;
    do {
      pokemon = randomPokemon();
    } while (pokemon.species_id === id);
    return pokemon;
  }

  var pastPokemon = {};
  function randomNonPastPokemon() {
    var pokemon;
    do {
      pokemon = randomPokemon();
    } while (pastPokemon[pokemon.species_id] === true);
    return pokemon;
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
    pastPokemon[thePokemon.species_id] = true;
    var roundPokemons = [
      thePokemon,
      randomPokemonThatIsNot(thePokemon.species_id),
      randomPokemonThatIsNot(thePokemon.species_id),
      randomPokemonThatIsNot(thePokemon.species_id)
    ];
    roundPokemons = shuffle(roundPokemons);
    for (var i = 0, len = $options.length; i < len; i++) {
      var $child = $($options[i]);
      var pokemon = roundPokemons[i];
      $child.data('species_id', pokemon.species_id);
      $child.text(pokemon.identifier);
      $child.removeClass('disabled right wrong');
      $child.click(guess);
    }

    theCry = new Audio('cries/' + thePokemon.species_id + '.mp3');
    setTimeout(playCry, PLAY_CRY_TIMEOUT);
    $play.removeClass('hidden');
    $sprite.addClass('hidden');
  }

  function playCry() {
    theCry.onplay = function() {
      $play.trigger('startRumble');
    };
    theCry.onended = function() {
      $play.trigger('stopRumble');
    };
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

      // Label the pokemon that was the answer, and those that weren't.
      var label = $child.data('species_id') === thePokemon.species_id ?
        'right' : 'wrong';
      $child.addClass(label);
      $child.unbind('click', guess);
    }

    // Remove the play button and show the pokemon.
    $play.addClass('hidden');
    $sprite.attr('src', 'sprites/red-blue/' + thePokemon.species_id + '.png');
    $sprite.removeClass('hidden');

    if (totalGuesses < totalPokemon) {
      setTimeout(nextRound, NEXT_ROUND_TIMEOUT);
    }
  }
})(window, document);
