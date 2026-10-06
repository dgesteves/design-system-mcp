import path from 'node:path';

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/** Path relative to `root`, always with forward slashes. */
export function relativePath(root: string, file: string): string {
  return toPosix(path.relative(root, file));
}

/** True when `file` is `root` or inside it. */
export function isInside(root: string, file: string): boolean {
  const rel = path.relative(root, file);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** The static directory part of a glob (`components/ui/**\/*.tsx` → `components/ui`). */
export function globBase(glob: string): string {
  const parts = toPosix(glob).split('/');
  const base: string[] = [];
  for (const part of parts) {
    if (/[*?[\]{}()!]/.test(part)) break;
    base.push(part);
  }
  // A glob without magic is a file path: its base is the parent directory.
  if (base.length === parts.length) base.pop();
  return base.join('/') || '.';
}
