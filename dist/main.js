"use strict";
var NEXT_ROUND_TIMEOUT = 600;
var PING_TIMEOUT = 600;
var VOLUME = 0.5;
// For every generation, keep a copy of all pokemon and the pokemon
// that are left to be guessed from that generation.
var gens = {
    1: {
        enabled: true,
        spritesDir: 'yellow',
        criesDir: '/old',
        pokemon: pokemon.gen1.slice(),
        pokemonLeft: [],
    },
    2: {
        enabled: false,
        spritesDir: 'crystal',
        criesDir: '/old',
        pokemon: pokemon.gen2.slice(),
        pokemonLeft: [],
    },
    3: {
        enabled: false,
        spritesDir: 'emerald',
        criesDir: '/old',
        pokemon: pokemon.gen3.slice(),
        pokemonLeft: [],
    },
    4: {
        enabled: false,
        spritesDir: 'platinum',
        criesDir: '/old',
        pokemon: pokemon.gen4.slice(),
        pokemonLeft: [],
    },
    5: {
        enabled: false,
        spritesDir: 'black-white',
        criesDir: '/old',
        pokemon: pokemon.gen5.slice(),
        pokemonLeft: [],
    },
    6: {
        enabled: false,
        spritesDir: 'x-y',
        criesDir: '',
        pokemon: pokemon.gen6.slice(),
        pokemonLeft: [],
    },
    7: {
        enabled: false,
        spritesDir: 'sun-moon',
        criesDir: '',
        criesExt: '.wav',
        pokemon: pokemon.gen7.slice(),
        pokemonLeft: [],
    },
};
// Construct paths for audio and sprites.
for (var gen in gens) {
    var d = gens[gen];
    for (var i = 0, len = d.pokemon.length; i < len; i++) {
        var pkm = d.pokemon[i];
        var spritepath = pkm.species_id;
        var crypath = pkm.species_id;
        var formsAvailable = pkm.forms && (pkm.formSprites == null || pkm.formSprites) &&
            pkm.forms.filter(function (form) { return form[0] !== '!'; });
        // 50/50 to select another form.
        var form = void 0;
        if (formsAvailable && formsAvailable.length && Math.random() > 0.5) {
            form = formsAvailable[~~(Math.random() * formsAvailable.length)];
            spritepath += '-' + form.replace(/^@/, '');
            if (pkm.formSounds || (form && form[0] === '@'))
                crypath += '-' + form.replace(/^@/, '');
        }
        pkm.sprite = 'media/sprites/' + d.spritesDir + '/' + spritepath + '.png';
        pkm.cry = 'media/cries' + d.criesDir + '/' + crypath + (d.criesExt || '.mp3');
    }
    d.pokemonLeft = d.pokemon.slice();
}
// Gets a list of lists of pokemon from all enabled generations.
var getPokemon = function (key) {
    var all = [];
    for (var gen in gens) {
        var d = gens[gen];
        if (d.enabled) {
            all.push(d[key]);
        }
    }
    return all;
};
var getAllPokemon = function () { return getPokemon('pokemon'); };
var getPokemonLeft = function () { return getPokemon('pokemonLeft'); };
var allPokemon, pokemonLeft;
// This is called when the game first begins, and whenever
// the generations enabled is updated.
var updatePokemon = function () {
    allPokemon = getAllPokemon();
    pokemonLeft = getPokemonLeft();
};
updatePokemon();
// Gets a random pokemon from a list of lists, which will be either
// all pokemon from enabled generations, or all pokemon that are left.
var randomFromLists = function (lists, remove) {
    var list = lists[~~(Math.random() * lists.length)];
    var index = ~~(Math.random() * list.length);
    var pkm = list[index];
    if (remove) {
        list.splice(index, 1);
    }
    return pkm;
};
// Returns true if there are any pokemon left to play.
var arePokemonLeft = function () {
    for (var i = 0, len = pokemonLeft.length; i < len; i++) {
        if (pokemonLeft[i].length) {
            return true;
        }
    }
    return false;
};
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
$play.on('click', function () { return theCry.play(); });
$play.jrumble();
$('.gen').on('click', function () {
    var $gen = $(this);
    $gen.toggleClass('enabled');
    var gen = $gen.attr('data-gen');
    gens[parseInt(gen, 10)].enabled = $gen.hasClass('enabled');
    updatePokemon();
});
$('.gen-1').addClass('enabled');
// Returns `n` pokemon that are not the given pokemon.
// Used to have them be shuffled in with the pokemon to be guessed.
var randomPokemonThatAreNot = function (theid, n) {
    var pokemons = [];
    var pokemonsHash = {};
    pokemonsHash[theid] = true;
    for (var i = 0; i < n; i++) {
        var pokemon_1 = void 0;
        do {
            pokemon_1 = randomFromLists(allPokemon, false);
        } while (pokemonsHash[pokemon_1.species_id] === true);
        pokemons.push(pokemon_1);
        pokemonsHash[pokemon_1.species_id] = true;
    }
    return pokemons;
};
var shuffle = function (array) {
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
};
var thePokemon;
var theCry;
// Called whenever the user guesses on a pokemon.
var guess = function () {
    var $child = $(this);
    totalGuesses++;
    if ($child.data('species_id') === thePokemon.species_id) {
        correctGuesses++;
        $success.removeClass('hidden');
        $failure.addClass('hidden');
        $score.text(correctGuesses + ' / ' + totalGuesses);
        $score.appendTo($success);
    }
    else {
        guessedWrong.push(thePokemon);
        $success.addClass('hidden');
        $failure.removeClass('hidden');
        $score.text(correctGuesses + ' / ' + totalGuesses);
        $score.appendTo($failure);
    }
    $filler.addClass('hidden');
    // Disable all buttons.
    for (var i = 0, len = $options.length; i < len; i++) {
        var $option = $($options[i]);
        $option.addClass('disabled');
        // Label the pokemon that was the answer.
        if ($option.data('species_id') === thePokemon.species_id) {
            $option.addClass('right');
        }
        $option.off('click', guess);
    }
    // Remove the play button and show the pokemon.
    $play.addClass('hidden');
    var src = thePokemon.sprite;
    $sprite.attr('src', src);
    $sprite.removeClass('hidden');
    if (arePokemonLeft()) {
        setTimeout(nextRound, NEXT_ROUND_TIMEOUT);
    }
    else {
        displayEndScreen();
    }
};
var nextRound = function () {
    thePokemon = randomFromLists(pokemonLeft, true);
    var roundPokemons = randomPokemonThatAreNot(thePokemon.species_id, 3);
    roundPokemons.push(thePokemon);
    roundPokemons = shuffle(roundPokemons);
    for (var i = 0, len = $options.length; i < len; i++) {
        var $child = $($options[i]);
        var pokemon_2 = roundPokemons[i];
        $child.data('species_id', pokemon_2.species_id);
        $child.text(pokemon_2.name || pokemon_2.identifier);
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
var startRumble = function () { return $play.trigger('startRumble'); };
var stopRumble = function () { return $play.trigger('stopRumble'); };
// Start the very first round in the beginning.
nextRound();
var displayEndScreen = function () {
    var $endScreen = $('.end-screen');
    $endScreen.removeClass('hidden');
    var ping = new Audio('media/ping.mp3');
    ping.volume = VOLUME;
    var _loop_1 = function (i, len) {
        var pokemon_3 = guessedWrong[i];
        var cry = new Audio(pokemon_3.cry);
        cry.volume = VOLUME;
        var src = pokemon_3.sprite;
        var $imgWrapper = $('<div><img class="pokemon-sprite" src="' + src + '" /></div>');
        var $img = $imgWrapper.find('img');
        $imgWrapper.attr('data-tooltip', pokemon_3.name || pokemon_3.identifier);
        $img.jrumble();
        cry.addEventListener('play', function () { return $img.trigger('startRumble'); });
        cry.addEventListener('ended', function () { return $img.trigger('stopRumble'); });
        $imgWrapper.on('click', function () { return cry.play(); });
        setTimeout(function () {
            ping.play();
            $endScreen.append($imgWrapper);
        }, (i + 1) * PING_TIMEOUT);
    };
    for (var i = 0, len = guessedWrong.length; i < len; i++) {
        _loop_1(i, len);
    }
};
