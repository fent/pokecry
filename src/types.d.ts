
interface PokemonDef {
  species_id: string;
  identifier: string;
  name?: string;
  forms?: string[];
  formSounds?: boolean;
  formSprites?: boolean;
}

interface Pokemon extends PokemonDef {
  sprite: string;
  cry: string;
}

interface PokemonData {
  gen1: PokemonDef[];
  gen2: PokemonDef[];
  gen3: PokemonDef[];
  gen4: PokemonDef[];
  gen5: PokemonDef[];
  gen6: PokemonDef[];
  gen7: PokemonDef[];
}

declare const pokemon: PokemonData;

interface JQuery {
  jrumble(options?: any): JQuery;
  trigger(eventName: 'startRumble' | 'stopRumble'): JQuery;
}
