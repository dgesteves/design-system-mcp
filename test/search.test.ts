import { beforeAll, describe, expect, it } from 'vitest';

import type { DesignSystem } from '../src/design-system.js';
import { Bm25Index, expandQuery, tokenize } from '../src/search/index.js';
import { DEMO_ROOT, loadOnce } from './helpers.js';

describe('tokenize', () => {
  it('splits identifiers, drops stop words and stems', () => {
    expect(tokenize('I want to confirm deleting the AlertDialog')).toEqual([
      'confirm',
      'delet',
      'alert',
      'dialog',
    ]);
    expect(tokenize('buttons button')).toEqual(['button', 'button']);
  });

  it('expands everyday UI words with lower-weight synonyms', () => {
    const query = expandQuery('modal to delete');
    expect(query.get('modal')).toBe(1);
    expect(query.get('dialog')).toBe(0.5);
    expect(query.get('destruct')).toBe(0.5);
  });
});

describe('BM25', () => {
  it('ranks rarer and denser matches higher, with field weights', () => {
    const index = new Bm25Index<string>();
    index.add('a', [[['dialog', 'confirm'], 1]]);
    index.add('b', [
      [['dialog'], 1],
      [['button', 'button', 'button'], 1],
    ]);
    index.add('c', [[['dialog'], 3]]);
    const hits = index.search(
      new Map([
        ['dialog', 1],
        ['confirm', 1],
      ]),
    );
    expect(hits.map((h) => h.item)).toEqual(['a', 'c', 'b']);
    expect(hits[0]?.terms).toEqual(['confirm', 'dialog']);
    expect(index.search(new Map([['nothing', 1]]))).toEqual([]);
  });
});

describe('intent search over the demo design system', () => {
  let ds: DesignSystem;
  beforeAll(async () => {
    ds = await loadOnce(DEMO_ROOT);
  });

  const top = (query: string) => ds.search(query, 3).map((h) => h.component.name);

  it.each([
    ['confirm a destructive action', 'Dialog'],
    ['modal window', 'Dialog'],
    ['status label', 'Badge'],
    ['show that an item is overdue', 'Badge'],
    ['email text field', 'Input'],
    ['group settings in a panel', 'Card'],
    ['delete button', 'Button'],
  ])('"%s" → %s', (query, expected) => {
    expect(top(query)[0]).toBe(expected);
  });

  it('returns nothing for unrelated queries', () => {
    expect(ds.search('quantum chromodynamics')).toEqual([]);
  });
});
