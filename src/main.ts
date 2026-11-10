const REVEAL_TIMEOUT = 1200;
const END_REVEAL_TIMEOUT = 50;
const MIN_FUZZY_SCORE = 240;
const FUZZY_SCORE_WINDOW = 100;
const VOLUME = 0.5;

type Generation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

interface GenerationPaths {
  spritesDir: string;
  criesDir: string;
}

interface GenerationConfig extends GenerationPaths {
  enabled: boolean;
}

interface PokemonEntry {
  def: PokemonDef;
  paths: GenerationPaths;
}

interface ExpertPokemon {
  speciesId: string;
  name: string;
  search: string;
}

interface GenData extends GenerationConfig {
  pokemon: PokemonEntry[];
  pokemonLeft: PokemonEntry[];
}

// Pick a form for this round. The base form is one of the candidates, so
// every form is equally likely instead of giving the base a flat 50%.
const resolvePokemon = (entry: PokemonEntry, forcedForm?: string): Pokemon => {
  const def = entry.def;
  const formsAvailable =
    def.formSprites === false ? [] : (def.forms ?? []).filter((form) => form[0] !== '!');
  const forms = def.baseForm === false ? [] : [''];
  forms.push(...formsAvailable);
  const form =
    forcedForm === undefined ? forms[Math.floor(Math.random() * forms.length)] : forcedForm;

  let spriteId = def.species_id;
  let cryId = def.species_id;
  let cryDir = def.baseCryDir ?? entry.paths.criesDir;
  let formName: string | undefined;
  if (form) {
    formName = form.replace(/^@/, '');
    spriteId += `-${formName}`;
    if (def.formSounds || form.startsWith('@')) {
      cryId += `-${formName}`;
      cryDir = entry.paths.criesDir;
    }
  }

  return {
    ...def,
    form: formName,
    sprite: `media/sprites/${entry.paths.spritesDir}/${spriteId}.png`,
    cry: `media/cries/${cryDir}/${cryId}.mp3`,
  };
};

const createGeneration = (defs: PokemonDef[], config: GenerationConfig): GenData => {
  const list = defs.map((def) => ({ def, paths: config }));
  return { ...config, pokemon: list, pokemonLeft: list.slice() };
};

const generations: Generation[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const generationKeys: Record<Generation, keyof PokemonData> = {
  1: 'gen1',
  2: 'gen2',
  3: 'gen3',
  4: 'gen4',
  5: 'gen5',
  6: 'gen6',
  7: 'gen7',
  8: 'gen8',
  9: 'gen9',
};

const generationConfigs: Record<Generation, GenerationConfig> = {
  1: { enabled: true, spritesDir: 'yellow', criesDir: 'legacy' },
  2: { enabled: false, spritesDir: 'crystal', criesDir: 'legacy' },
  3: { enabled: false, spritesDir: 'emerald', criesDir: 'legacy' },
  4: { enabled: false, spritesDir: 'platinum', criesDir: 'legacy' },
  5: { enabled: false, spritesDir: 'black-white', criesDir: 'legacy' },
  6: { enabled: false, spritesDir: 'x-y', criesDir: 'latest' },
  7: { enabled: false, spritesDir: 'sun-moon', criesDir: 'latest' },
  8: { enabled: false, spritesDir: 'sword-shield', criesDir: 'latest' },
  9: { enabled: false, spritesDir: 'scarlet-violet', criesDir: 'latest' },
};

const baseDefs = generations.flatMap((generation) =>
  pokemon[generationKeys[generation]].map((def) => ({ def, generation })),
);

// Build form-only pools: a later-generation form is shown only when its
// introduction generation is enabled. Its base cry still comes from the
// species generation, while its sprite comes from the form generation.
const formOnlyPools = new Map<Generation, Map<string, PokemonDef>>();
for (const { def, generation } of baseDefs) {
  const formsByGeneration = new Map<Generation, string[]>();
  for (const rawForm of def.forms ?? []) {
    if (rawForm.startsWith('!')) {
      continue;
    }

    const name = rawForm.replace(/^@/, '');
    const formGeneration = def.formGenerations?.[name] as Generation | undefined;
    if (!formGeneration || formGeneration === generation) {
      continue;
    }

    const list = formsByGeneration.get(formGeneration) ?? [];
    list.push(rawForm);
    formsByGeneration.set(formGeneration, list);
  }

  for (const [formGeneration, forms] of formsByGeneration) {
    let pool = formOnlyPools.get(formGeneration);
    if (!pool) {
      pool = new Map();
      formOnlyPools.set(formGeneration, pool);
    }

    pool.set(def.species_id, {
      ...def,
      forms,
      baseForm: false,
      baseCryDir: generationConfigs[generation].criesDir,
    });
  }
}

const nativeDefForGeneration = (def: PokemonDef, generation: Generation): PokemonDef => {
  const originalForms = def.forms ?? [];
  const forms = originalForms.filter((rawForm) => {
    if (rawForm.startsWith('!')) {
      return true;
    }
    const name = rawForm.replace(/^@/, '');
    const formGeneration = def.formGenerations?.[name];
    return !formGeneration || formGeneration === generation;
  });

  if (forms.length === originalForms.length) {
    return def;
  }
  if (forms.length > 0) {
    return { ...def, forms };
  }

  const rest = { ...def };
  delete rest.forms;
  delete rest.formGenerations;
  delete rest.formSounds;
  delete rest.formSprites;
  return rest;
};

// For every generation, keep a copy of all pokemon and the pokemon
// that are left to be guessed from that generation.
const gens = Object.fromEntries(
  generations.map((generation) => [
    generation,
    createGeneration(
      [
        ...pokemon[generationKeys[generation]].map((def) =>
          nativeDefForGeneration(def, generation),
        ),
        ...(formOnlyPools.get(generation)?.values() ?? []),
      ],
      generationConfigs[generation],
    ),
  ]),
) as Record<Generation, GenData>;

// Gets a list of lists of pokemon from all enabled generations.
const getPokemon = (key: 'pokemon' | 'pokemonLeft'): PokemonEntry[][] => {
  const all: PokemonEntry[][] = [];
  for (const gen in gens) {
    const d = gens[gen as unknown as Generation];
    if (d.enabled) {
      all.push(d[key]);
    }
  }
  return all;
};

const getAllPokemon = (): PokemonEntry[][] => getPokemon('pokemon');
const getPokemonLeft = (): PokemonEntry[][] => getPokemon('pokemonLeft');

let allPokemon: PokemonEntry[][], pokemonLeft: PokemonEntry[][];

// This is called when the game first begins, and whenever
// the generations enabled is updated.
const updatePokemon = (): void => {
  allPokemon = getAllPokemon();
  pokemonLeft = getPokemonLeft();
};
updatePokemon();

// Gets a random pokemon from a list of lists, which will be either
// all pokemon from enabled generations, or all pokemon that are left.
const randomFromLists = (lists: PokemonEntry[][], remove: boolean): PokemonEntry => {
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
let difficulty: Difficulty = 'normal';
let totalGuesses = 0;
let correctGuesses = 0;
let showRemaining = false;
let restorePlayFocus = false;
let restoreExpertFocus = false;
let roundActive = false;
let revealTimer: number | undefined;
let showingEmptyState = false;
let expertChoices: ExpertPokemon[] = [];
let expertActiveIndex = -1;
let suppressExpertOpen = false;
const endScreenTimers: number[] = [];
const guessedPokemon: { pokemon: Pokemon; correct: boolean }[] = [];

const requireElement = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error('Missing required element: ' + selector);
  }
  return element;
};

const optionsElement = requireElement<HTMLDivElement>('.options');
const expertElement = requireElement<HTMLDivElement>('.expert');
const expertInput = requireElement<HTMLInputElement>('.expert-input');
const expertList = requireElement<HTMLUListElement>('.expert-list');
const optionElements = document.querySelectorAll<HTMLButtonElement>('.option');
const genElements = document.querySelectorAll<HTMLButtonElement>('.gen[data-gen]');
const allGensElement = requireElement<HTMLButtonElement>('.gen-all');
const difficultyElements = document.querySelectorAll<HTMLButtonElement>('.difficulty');
const resultsElement = requireElement<HTMLDivElement>('.results');
const successElement = requireElement<HTMLHeadingElement>('.success');
const failureElement = requireElement<HTMLHeadingElement>('.failure');
const fillerElement = requireElement<HTMLHeadingElement>('.filler');
const scoreElement = requireElement<HTMLSpanElement>('.score');
const remainingElement = requireElement<HTMLSpanElement>('.remaining');
const spriteElement = requireElement<HTMLImageElement>('.pokemon-sprite');
const answerNameElement = requireElement<HTMLParagraphElement>('.answer-name');
const playElement = requireElement<HTMLButtonElement>('.play');
const endGameElement = requireElement<HTMLButtonElement>('.end-game');
const statusElement = requireElement<HTMLParagraphElement>('.status');
const endScreenElement = requireElement<HTMLDivElement>('.end-screen');

const updateRemaining = (): void => {
  let count = 0;
  for (let i = 0, len = pokemonLeft.length; i < len; i++) {
    count += pokemonLeft[i].length;
  }
  if (roundActive) {
    count += 1;
  }

  remainingElement.textContent = `${count} left`;
  remainingElement.setAttribute('aria-label', `${count} Pokemon left to guess`);
  remainingElement.classList.toggle('hidden', !showRemaining || count === 0);
};

const setHidden = (element: Element, hidden: boolean): void => {
  element.classList.toggle('hidden', hidden);
};

const setInvisible = (element: Element, invisible: boolean): void => {
  element.classList.toggle('invisible', invisible);
};

const setRumble = (element: Element, active: boolean): void => {
  element.classList.toggle('rumble', active);
};

const ignorePlayError = (): void => undefined;

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

const regionFormNames: Record<string, string> = {
  alola: 'alolan',
  galar: 'galarian',
  hisui: 'hisuian',
  paldea: 'paldean',
};

const formLabel = (form: string): string =>
  form
    .split('-')
    .map((word) => regionFormNames[word] ?? word)
    .join(' ');

const speciesName = (pokemon: PokemonDef): string => pokemon.name || pokemon.identifier;

const displayName = (pokemon: PokemonDef): string => {
  const name = speciesName(pokemon);
  return pokemon.form ? `${name} (${formLabel(pokemon.form)})` : name;
};

const normalizeSearch = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/♀/g, 'female')
    .replace(/♂/g, 'male')
    .replace(/[^a-z0-9]/g, '');

const editDistance = (left: string, right: string): number => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = previous[0];
    previous[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }

  return previous[right.length];
};

// Rank exact, prefix, substring, and subsequence matches above edit-distance
// matches. This keeps common typos visible without hiding close names.
const fuzzyScore = (query: string, target: string): number => {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) {
    return 0;
  }

  const normalizedTarget = normalizeSearch(target);
  if (normalizedQuery === normalizedTarget) {
    return 1000;
  }
  if (normalizedTarget.startsWith(normalizedQuery)) {
    return 800 - Math.min(normalizedTarget.length - normalizedQuery.length, 100);
  }

  const substringIndex = normalizedTarget.indexOf(normalizedQuery);
  if (substringIndex >= 0) {
    return 600 - substringIndex;
  }

  let queryIndex = 0;
  const matchedIndexes: number[] = [];
  for (
    let targetIndex = 0;
    targetIndex < normalizedTarget.length && queryIndex < normalizedQuery.length;
    targetIndex++
  ) {
    if (normalizedTarget[targetIndex] === normalizedQuery[queryIndex]) {
      matchedIndexes.push(targetIndex);
      queryIndex++;
    }
  }
  if (queryIndex === normalizedQuery.length) {
    const span = matchedIndexes[matchedIndexes.length - 1] - matchedIndexes[0];
    return 400 - (span - (normalizedQuery.length - 1));
  }

  return 300 - editDistance(normalizedQuery, normalizedTarget) * 20;
};

const getAvailableSpecies = (): ExpertPokemon[] => {
  const species = new Map<string, ExpertPokemon>();

  for (const list of allPokemon) {
    for (const entry of list) {
      const def = entry.def;
      let option = species.get(def.species_id);
      if (!option) {
        const name = speciesName(def);
        option = { speciesId: def.species_id, name, search: name };
        species.set(def.species_id, option);
      }

      for (const rawForm of def.forms ?? []) {
        if (rawForm.startsWith('!')) {
          continue;
        }
        const form = formLabel(rawForm.replace(/^@/, ''));
        // Include both "vulpix alolan" and "alolan vulpix" search orders.
        option.search += ` ${form} ${option.name}`;
      }
    }
  }

  return [...species.values()].sort((left, right) => left.name.localeCompare(right.name));
};

const getExpertOptions = (): NodeListOf<HTMLButtonElement> =>
  expertList.querySelectorAll<HTMLButtonElement>('.expert-option');

const clearExpertSelection = (): void => {
  expertActiveIndex = -1;
  expertInput.removeAttribute('aria-activedescendant');
};

const closeExpertList = (): void => {
  clearExpertSelection();
  setHidden(expertList, true);
  expertList.replaceChildren();
  expertInput.setAttribute('aria-expanded', 'false');
};

const setExpertMode = (active: boolean): void => {
  setHidden(optionsElement, active);
  setHidden(expertElement, !active);
  closeExpertList();
  expertInput.disabled = !active;
  if (active) {
    expertChoices = getAvailableSpecies();
    expertInput.value = '';
  }
};

const chooseExpertOption = (option: HTMLButtonElement): void => {
  restoreExpertFocus = true;
  expertInput.value = option.textContent!;
  closeExpertList();
  submitGuess(option.dataset.speciesId!);
};

const setActiveExpertOption = (index: number): void => {
  const options = getExpertOptions();
  expertActiveIndex = (index + options.length) % options.length;
  for (let i = 0; i < options.length; i++) {
    const active = i === expertActiveIndex;
    options[i].classList.toggle('active', active);
    options[i].setAttribute('aria-selected', String(active));
  }
  expertInput.setAttribute('aria-activedescendant', options[expertActiveIndex].id);
  options[expertActiveIndex].scrollIntoView({ block: 'nearest' });
};

const moveExpertSelection = (step: number): void => {
  const options = getExpertOptions();
  if (options.length === 0) {
    return;
  }

  const baseIndex = expertActiveIndex < 0 ? (step > 0 ? -1 : 0) : expertActiveIndex;
  setActiveExpertOption(baseIndex + step);
};

const renderExpertOptions = (): void => {
  const query = expertInput.value;
  const hasQuery = normalizeSearch(query).length > 0;
  const scored = expertChoices
    .map((pokemon) => ({
      pokemon,
      score: Math.max(fuzzyScore(query, pokemon.name), fuzzyScore(query, pokemon.search)),
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.pokemon.name.localeCompare(right.pokemon.name),
    );
  const topScore = scored[0].score;
  const minimumScore = Math.max(MIN_FUZZY_SCORE, topScore - FUZZY_SCORE_WINDOW);
  const ranked = scored
    .filter(({ score }) => !hasQuery || score >= minimumScore)
    .map(({ pokemon }) => pokemon);

  clearExpertSelection();
  expertList.replaceChildren();
  for (let index = 0; index < ranked.length; index++) {
    const pokemon = ranked[index];
    const item = document.createElement('li');
    item.setAttribute('role', 'presentation');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'expert-option';
    button.id = `expert-option-${index}`;
    button.tabIndex = -1;
    button.dataset.speciesId = pokemon.speciesId;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.textContent = pokemon.name;
    button.addEventListener('click', () => chooseExpertOption(button));
    item.appendChild(button);
    expertList.appendChild(item);
  }

  setHidden(expertList, ranked.length === 0);
  expertInput.setAttribute('aria-expanded', String(ranked.length > 0));
};

const focusExpertInput = (): void => {
  suppressExpertOpen = true;
  expertInput.focus();
  suppressExpertOpen = false;
};

expertInput.addEventListener('focus', () => {
  if (!suppressExpertOpen) {
    renderExpertOptions();
  }
});
expertInput.addEventListener('click', renderExpertOptions);
expertInput.addEventListener('input', renderExpertOptions);
expertInput.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    closeExpertList();
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeExpertList();
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (expertList.children.length === 0) {
      renderExpertOptions();
    }
    moveExpertSelection(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }

  if (event.key !== 'Enter') {
    return;
  }

  const options = getExpertOptions();
  const selected = expertActiveIndex >= 0 ? options[expertActiveIndex] : options[0];
  if (!selected) {
    return;
  }

  event.preventDefault();
  selected.click();
});

document.addEventListener('click', (event) => {
  if (!expertElement.contains(event.target as Node)) {
    closeExpertList();
  }
});

playElement.addEventListener('click', () => {
  theCry.play();
});

endGameElement.addEventListener('click', () => {
  displayEndScreen();
});

const optionCount = (): number => {
  if (difficulty === 'expert') {
    return 0;
  }
  return difficulty === 'easy' ? 2 : 4;
};

const setOptionVisibility = (count: number): void => {
  for (let i = 0, len = optionElements.length; i < len; i++) {
    setHidden(optionElements[i], i >= count);
  }
};

const cryKeyIndex = new Map(cryKeys.map((key, index) => [key, index]));

const cryKeyForPokemon = (pokemon: Pokemon): string =>
  pokemon.cry.replace(/^media\/cries\//, '').replace(/\.mp3$/, '');

const similarSpeciesIds = (answer: Pokemon): Set<string> => {
  const answerIndex = cryKeyIndex.get(cryKeyForPokemon(answer))!;
  const speciesIds = new Set<string>();
  for (const neighborIndex of crySimilarity[answerIndex]) {
    speciesIds.add(cryKeys[neighborIndex].split('/')[1].split('-')[0]);
  }
  return speciesIds;
};

const buildCryEntryIndex = (): Map<string, { entry: PokemonEntry; form: string }> => {
  const index = new Map<string, { entry: PokemonEntry; form: string }>();

  for (const list of allPokemon) {
    for (const entry of list) {
      const def = entry.def;
      if (def.baseForm !== false) {
        index.set(`${entry.paths.criesDir}/${def.species_id}`, { entry, form: '' });
      }

      for (const rawForm of def.forms ?? []) {
        if (rawForm.startsWith('!')) {
          continue;
        }
        const name = rawForm.replace(/^@/, '');
        const formKey = `${entry.paths.criesDir}/${def.species_id}-${name}`;
        index.set(formKey, { entry, form: rawForm });
        if (!def.formSounds && !rawForm.startsWith('@')) {
          index.set(`${entry.paths.criesDir}/${def.species_id}`, { entry, form: rawForm });
        }
      }
    }
  }

  return index;
};

// Pick decoys that are not the answer. Easy and normal avoid the answer's known
// similar cries. Hard mode follows that table directly, including alternate
// forms, then falls back to random entries when needed.
const pickDecoyPokemon = (answer: Pokemon, count: number, mode: Difficulty): Pokemon[] => {
  const seenIds = new Set([answer.species_id]);
  const decoys: Pokemon[] = [];

  if (mode !== 'hard') {
    for (const speciesId of similarSpeciesIds(answer)) {
      seenIds.add(speciesId);
    }
  }

  if (mode === 'hard') {
    const answerIndex = cryKeyIndex.get(cryKeyForPokemon(answer))!;
    const cryEntries = buildCryEntryIndex();

    for (const neighborIndex of crySimilarity[answerIndex]) {
      const neighbor = cryEntries.get(cryKeys[neighborIndex])!;
      if (seenIds.has(neighbor.entry.def.species_id)) {
        continue;
      }
      seenIds.add(neighbor.entry.def.species_id);
      decoys.push(resolvePokemon(neighbor.entry, neighbor.form));
      if (decoys.length === count) {
        break;
      }
    }
  }

  while (decoys.length < count) {
    const candidate = resolvePokemon(randomFromLists(allPokemon, false));
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
const submitGuess = (speciesId: string, option?: HTMLButtonElement): void => {
  totalGuesses++;
  showRemaining = true;
  roundActive = false;
  updateRemaining();
  const isCorrect = speciesId === thePokemon.species_id;
  restorePlayFocus = option !== undefined && document.activeElement === option;
  if (isCorrect) {
    correctGuesses++;
  }
  guessedPokemon.push({ pokemon: thePokemon, correct: isCorrect });

  const scoreText = `${correctGuesses} / ${totalGuesses}`;
  const resultElement = isCorrect ? successElement : failureElement;
  setHidden(successElement, !isCorrect);
  setHidden(failureElement, isCorrect);
  failureElement.textContent = 'wrong';
  const revealAnswer = !isCorrect && difficulty === 'expert';
  setHidden(answerNameElement, !revealAnswer);
  if (revealAnswer) {
    answerNameElement.textContent = displayName(thePokemon);
  }
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
  expertInput.disabled = true;
  closeExpertList();

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
  setHidden(answerNameElement, true);
  const expert = difficulty === 'expert';
  setExpertMode(expert);
  setInvisible(resultsElement, false);
  setHidden(endScreenElement, true);
  clearEndScreenTimers();
  endScreenElement.replaceChildren();

  const count = optionCount();
  setOptionVisibility(count);
  thePokemon = resolvePokemon(randomFromLists(pokemonLeft, true));
  let roundPokemons: Pokemon[] = [];
  if (count > 0) {
    roundPokemons = pickDecoyPokemon(thePokemon, count - 1, difficulty);
    roundPokemons.push(thePokemon);
    roundPokemons = shuffle(roundPokemons);
  }
  for (let i = 0, len = optionElements.length; i < len; i++) {
    const optionElement = optionElements[i];
    if (i >= count) {
      optionElement.dataset.speciesId = '';
      // Keep the label so the empty state never reveals blank buttons.
      optionElement.disabled = true;
      optionElement.classList.remove('right');
      continue;
    }

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
  if (restoreExpertFocus) {
    restoreExpertFocus = false;
    focusExpertInput();
  } else if (restorePlayFocus) {
    playElement.focus();
    restorePlayFocus = false;
  }
  spriteElement.alt = 'Mystery Pokemon';
  setHidden(spriteElement, true);
  updateRemaining();
};

const resetGame = (): void => {
  totalGuesses = 0;
  correctGuesses = 0;
  showRemaining = false;
  restoreExpertFocus = false;
  guessedPokemon.length = 0;
  for (const gen of Object.values(gens)) {
    gen.pokemonLeft = gen.pokemon.slice();
  }
  updatePokemon();
  updateRemaining();
  setInvisible(resultsElement, false);
  setHidden(successElement, true);
  setHidden(failureElement, true);
  scoreElement.textContent = '\u00a0';
  statusElement.textContent = '';
  clearEndScreenTimers();
  endScreenElement.replaceChildren();
  setHidden(endScreenElement, true);

  if (allPokemon.length === 0) {
    showEmptyState();
    return;
  }

  nextRound();
  playElement.focus();
};

const displayEndScreen = (): void => {
  cancelReveal();
  if (showingEmptyState) {
    statusElement.textContent = '';
    showingEmptyState = false;
  }
  roundActive = false;
  updateRemaining();
  setInvisible(resultsElement, true);
  setHidden(endGameElement, true);
  clearEndScreenTimers();
  endScreenElement.replaceChildren();
  setHidden(endScreenElement, false);
  endScreenElement.tabIndex = -1;
  endScreenElement.focus({ preventScroll: true });

  const header = document.createElement('div');
  header.className = 'end-header';

  const title = document.createElement('h2');
  title.className = 'end-title';
  title.textContent = "Who's that Pokemon?";

  const summary = document.createElement('p');
  summary.className = 'end-summary';
  summary.textContent = `${correctGuesses} correct / ${totalGuesses - correctGuesses} wrong`;

  const playAgain = document.createElement('button');
  playAgain.type = 'button';
  playAgain.className = 'play-again';
  playAgain.textContent = 'play again';
  playAgain.addEventListener('click', resetGame);

  header.append(title, summary, playAgain);
  endScreenElement.appendChild(header);

  for (let i = 0, len = guessedPokemon.length; i < len; i++) {
    const { pokemon, correct } = guessedPokemon[i];
    const result = correct ? 'correct' : 'wrong';
    const cry = new Audio(pokemon.cry);
    cry.volume = VOLUME;
    const wrapper = document.createElement('button');
    wrapper.type = 'button';
    wrapper.className = `end-pokemon ${result}`;
    wrapper.dataset.tooltip = `${displayName(pokemon)} (${result})`;
    wrapper.setAttribute('aria-label', `Play ${displayName(pokemon)}'s cry, ${result}`);
    const image = document.createElement('img');
    image.className = 'pokemon-sprite';
    image.setAttribute('src', pokemon.sprite);
    image.alt = '';
    cry.addEventListener('play', () => setRumble(image, true));
    cry.addEventListener('ended', () => setRumble(image, false));
    wrapper.addEventListener('click', () => {
      cry.currentTime = 0;
      void cry.play().catch(ignorePlayError);
    });
    wrapper.appendChild(image);
    const timer = window.setTimeout(
      () => endScreenElement.appendChild(wrapper),
      (i + 1) * END_REVEAL_TIMEOUT,
    );
    endScreenTimers.push(timer);
  }
};

const showEmptyState = (): void => {
  cancelReveal();
  clearEndScreenTimers();
  roundActive = false;
  updateRemaining();
  showingEmptyState = true;
  setInvisible(resultsElement, false);
  setHidden(playElement, false);
  playElement.disabled = true;
  setExpertMode(false);
  setHidden(answerNameElement, true);
  setOptionVisibility(optionCount());
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

const updateDifficultyButtons = (): void => {
  for (let i = 0, len = difficultyElements.length; i < len; i++) {
    const element = difficultyElements[i];
    element.setAttribute('aria-pressed', String(element.dataset.difficulty === difficulty));
  }
};

const refreshGame = (): void => {
  updatePokemon();
  updateRemaining();
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
    showRemaining = true;
    updateGenerationButtons();
    refreshGame();
  });
}

allGensElement.addEventListener('click', () => {
  const enableAll = !allGenerationsEnabled();
  for (const gen of Object.values(gens)) {
    gen.enabled = enableAll;
  }
  showRemaining = true;
  updateGenerationButtons();
  refreshGame();
});

for (let i = 0, len = difficultyElements.length; i < len; i++) {
  const element = difficultyElements[i];
  element.addEventListener('click', () => {
    const next = element.dataset.difficulty as Difficulty | undefined;
    if (!next || next === difficulty) {
      return;
    }
    difficulty = next;
    updateDifficultyButtons();
    resetGame();
  });
}

updateGenerationButtons();
updateDifficultyButtons();

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

  submitGuess(option.dataset.speciesId!, option);
});

// Test-only hook for defensive branches that the UI cannot reach.
const testWindow = window as unknown as {
  __POKECRY_TEST__?: boolean;
  __pokecryTest?: {
    nextRound: () => void;
    resolvePokemon: (entry: PokemonEntry) => Pokemon;
    displayName: (pokemon: PokemonDef) => string;
    pickDecoyPokemon: (answer: Pokemon, count: number, mode: Difficulty) => Pokemon[];
    setPokemonLeft: (lists: PokemonEntry[][]) => void;
    getGeneration: (generation: Generation) => PokemonDef[];
  };
};

if (testWindow.__POKECRY_TEST__) {
  testWindow.__pokecryTest = {
    nextRound,
    resolvePokemon,
    displayName,
    pickDecoyPokemon,
    setPokemonLeft: (lists) => {
      pokemonLeft = lists;
    },
    getGeneration: (generation) => gens[generation].pokemon.map((entry) => entry.def),
  };
}

// Start the very first round.
nextRound();
