import type { ComponentInfo } from '../types.js';
import { Bm25Index, type Bm25Hit } from './bm25.js';
import { expandQuery, tokenize } from './tokenize.js';

export { Bm25Index } from './bm25.js';
export { expandQuery, tokenize } from './tokenize.js';

export interface SearchHit {
  component: ComponentInfo;
  score: number;
  matched: string[];
}

/** Field weights: names matter most, then descriptions and variant values. */
const WEIGHTS = { name: 4, description: 2.5, variants: 2, docs: 1, props: 1, examples: 0.5 };

export function buildSearchIndex(components: ComponentInfo[]): Bm25Index<ComponentInfo> {
  const index = new Bm25Index<ComponentInfo>();
  for (const component of components) {
    index.add(component, [
      [
        tokenize([component.name, ...component.aliases, component.parent ?? ''].join(' ')),
        WEIGHTS.name,
      ],
      [tokenize(component.description ?? ''), WEIGHTS.description],
      [
        tokenize(component.variants.flatMap((v) => [v.name, ...v.values]).join(' ')),
        WEIGHTS.variants,
      ],
      [
        tokenize((component.docs?.sections ?? []).map((s) => `${s.heading} ${s.body}`).join(' ')),
        WEIGHTS.docs,
      ],
      [
        tokenize(component.props.map((p) => `${p.name} ${p.description ?? ''}`).join(' ')),
        WEIGHTS.props,
      ],
      [tokenize(component.examples.map((e) => e.title ?? '').join(' ')), WEIGHTS.examples],
    ]);
  }
  return index;
}

export function searchComponents(
  index: Bm25Index<ComponentInfo>,
  query: string,
  limit = 5,
): SearchHit[] {
  return index.search(expandQuery(query), limit).map((hit: Bm25Hit<ComponentInfo>) => ({
    component: hit.item,
    score: Math.round(hit.score * 100) / 100,
    matched: hit.terms,
  }));
}
