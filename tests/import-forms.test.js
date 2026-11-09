import { describe, expect, it } from 'vitest';
import { formEntry, formSuffix, planForms, spriteCandidates } from '../scripts/import/forms.js';

describe('import form planning', () => {
  it('derives form suffixes from PokeAPI identifiers', () => {
    expect(formSuffix('unown', { identifier: 'unown' }, null)).toBe('');
    expect(formSuffix('unown', { identifier: 'unown-b' }, null)).toBe('b');
    expect(formSuffix('unown', { identifier: 'unown' }, { form_identifier: 'exclamation' })).toBe(
      'exclamation',
    );
  });

  it('plans every form sharing one PokeAPI ID', () => {
    const variant = { id: '869', identifier: 'alcremie', is_default: '1' };
    const formsByPokemon = new Map([
      [
        '869',
        [
          { form_identifier: 'vanilla-cream-strawberry-sweet', is_default: '1' },
          { form_identifier: 'ruby-cream-strawberry-sweet', is_default: '0' },
        ],
      ],
    ]);

    const result = planForms({
      speciesId: 869,
      identifier: 'alcremie',
      variants: [variant],
      formsByPokemon,
    });

    expect(result.defaultVariant).toBe(variant);
    expect(result.defaultSuffix).toBe('vanilla-cream-strawberry-sweet');
    expect(result.forms).toEqual([
      {
        variant,
        name: 'ruby-cream-strawberry-sweet',
        form: { form_identifier: 'ruby-cream-strawberry-sweet', is_default: '0' },
      },
    ]);
    expect(result.skipped).toEqual([]);
  });

  it('skips mega and gmax forms', () => {
    const variants = [
      { id: '6', identifier: 'charizard', is_default: '1' },
      { id: '10034', identifier: 'charizard-mega-x' },
      { id: '10196', identifier: 'charizard-gmax' },
    ];
    const formsByPokemon = new Map([
      ['6', [{ form_identifier: '', is_default: '1' }]],
      ['10034', [{ form_identifier: 'mega-x', is_mega: '1', is_default: '0' }]],
      ['10196', [{ form_identifier: 'gmax', is_default: '0' }]],
    ]);

    const result = planForms({
      speciesId: 6,
      identifier: 'charizard',
      variants,
      formsByPokemon,
    });

    expect(result.forms).toEqual([]);
  });

  it('skips forms without a usable name', () => {
    const variants = [
      { id: '1', identifier: 'foo', is_default: '1' },
      { id: '2', identifier: 'foo' },
    ];
    const formsByPokemon = new Map([
      ['1', [{ form_identifier: '', is_default: '1' }]],
      ['2', [{ form_identifier: '', is_default: '0' }]],
    ]);

    const result = planForms({
      speciesId: 1,
      identifier: 'foo',
      variants,
      formsByPokemon,
    });

    expect(result.forms).toEqual([]);
    expect(result.skipped).toEqual(['1 foo: no form name']);
  });

  it('orders sprite candidates from most specific to fallback', () => {
    const config = { versionDir: 'generation-v/black-white' };
    const shared = spriteCandidates(config, { id: '592' }, { id: '592' }, 'female');
    expect(shared.map((candidate) => candidate.kind)).toEqual(['versioned', 'standard', 'artwork']);

    const distinct = spriteCandidates(config, { id: '10265' }, { id: '1007' }, 'sprinting-build');
    expect(distinct.map((candidate) => candidate.kind)).toEqual([
      'standard',
      'versioned',
      'standard',
      'artwork',
    ]);
    expect(distinct[3].url).toContain('other/official-artwork/10265-sprinting-build.png');
  });

  it('marks only unusual form sounds with @ when not all forms have cries', () => {
    expect(formEntry([{ name: 'female', hasCry: false }], 'male')).toEqual({
      alternateNames: ['female'],
      formSounds: false,
      forms: ['!male', 'female'],
      count: 2,
    });

    expect(
      formEntry(
        [
          { name: 'sprinting-build', hasCry: true },
          { name: 'gliding-build', hasCry: true },
        ],
        'apex-build',
      ),
    ).toEqual({
      alternateNames: ['sprinting-build', 'gliding-build'],
      formSounds: true,
      forms: ['!apex-build', 'sprinting-build', 'gliding-build'],
      count: 3,
    });

    expect(
      formEntry(
        [
          { name: 'first', hasCry: true },
          { name: 'second', hasCry: false },
        ],
        '',
      ),
    ).toEqual({
      alternateNames: ['@first', 'second'],
      formSounds: false,
      forms: ['@first', 'second'],
      count: 2,
    });
  });
});
