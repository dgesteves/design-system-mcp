/**
 * Okapi BM25 over weighted fields (BM25F-style: field weights scale term
 * frequency and document length). Small, dependency-free and deterministic,
 * which is what a local tool index of a few hundred documents needs.
 */
export interface Bm25Options {
  k1?: number;
  b?: number;
}

export interface Bm25Hit<T> {
  item: T;
  score: number;
  /** Matched query terms, best first. */
  terms: string[];
}

interface Doc<T> {
  item: T;
  tf: Map<string, number>;
  length: number;
}

export class Bm25Index<T> {
  private readonly docs: Doc<T>[] = [];
  private readonly df = new Map<string, number>();
  private totalLength = 0;
  private readonly k1: number;
  private readonly b: number;

  constructor(options: Bm25Options = {}) {
    this.k1 = options.k1 ?? 1.2;
    this.b = options.b ?? 0.75;
  }

  /** Adds a document as `[terms, weight]` fields. */
  add(item: T, fields: [terms: string[], weight: number][]): void {
    const tf = new Map<string, number>();
    let length = 0;
    for (const [terms, weight] of fields) {
      for (const term of terms) tf.set(term, (tf.get(term) ?? 0) + weight);
      length += terms.length * weight;
    }
    for (const term of tf.keys()) this.df.set(term, (this.df.get(term) ?? 0) + 1);
    this.docs.push({ item, tf, length });
    this.totalLength += length;
  }

  get size(): number {
    return this.docs.length;
  }

  search(query: Map<string, number>, limit = 10): Bm25Hit<T>[] {
    const n = this.docs.length;
    if (!n || !query.size) return [];
    const avgLength = this.totalLength / n || 1;
    const hits: Bm25Hit<T>[] = [];
    for (const doc of this.docs) {
      let score = 0;
      const matched: [string, number][] = [];
      for (const [term, queryWeight] of query) {
        const tf = doc.tf.get(term);
        if (!tf) continue;
        const df = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        const norm = tf + this.k1 * (1 - this.b + (this.b * doc.length) / avgLength);
        const contribution = queryWeight * idf * ((tf * (this.k1 + 1)) / norm);
        score += contribution;
        matched.push([term, contribution]);
      }
      if (score > 0) {
        hits.push({
          item: doc.item,
          score,
          terms: matched.sort((a, b) => b[1] - a[1]).map(([t]) => t),
        });
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
