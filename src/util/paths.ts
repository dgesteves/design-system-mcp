import path from 'node:path';

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/**
 * A config glob written Windows-style (`components\ui\**\*.tsx`) as globs
 * expect it, with forward slashes. In a glob `\` escapes the next character,
 * so a pattern that already uses `/` keeps the backslashes in front of glob
 * syntax (`app/\(marketing\)/**`); every other backslash is a separator.
 */
export function slashGlob(pattern: string): string {
  if (!pattern.includes('\\')) return pattern;
  if (!pattern.includes('/')) return pattern.replaceAll('\\', '/');
  return pattern.replace(/\\(?![()[\]{}*?!+@])/g, '/');
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

/**
 * Whether a root-relative path matches a glob, without touching the disk:
 * `**` spans folders (`**\/` also none), `*` and `?` stay within one, and
 * `{a,b}`, `[abc]` and `\` escapes work as in other globs. For config
 * `overrides`, which also apply to code that is not saved yet.
 */
export function matchesGlob(file: string, pattern: string): boolean {
  const normalized = pattern.replace(/^\.\//, '');
  let regex = globRegExps.get(normalized);
  if (!regex) {
    regex = new RegExp(`^${globSource(normalized)}$`);
    globRegExps.set(normalized, regex);
  }
  return regex.test(file.replace(/^\.\//, ''));
}

const globRegExps = new Map<string, RegExp>();

function globSource(pattern: string): string {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern.charAt(i);
    if (c === '\\') {
      out += escapeRegExp(pattern.charAt(++i));
    } else if (c === '*') {
      if (pattern[i + 1] === '*') {
        const folder = pattern[i + 2] === '/';
        out += folder ? '(?:[^/]*/)*' : '.*';
        i += folder ? 2 : 1;
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if (c === '[') {
      const end = pattern.indexOf(']', i + 2);
      if (end === -1) {
        out += '\\[';
        continue;
      }
      const body = pattern
        .slice(i + 1, end)
        .replace(/^!/, '^')
        .replace(/\\/g, '\\\\');
      out += `[${body}]`;
      i = end;
    } else if (c === '{') {
      const end = closingBrace(pattern, i);
      if (end === -1) {
        out += '\\{';
        continue;
      }
      const options = splitTopLevel(pattern.slice(i + 1, end));
      out += `(?:${options.map(globSource).join('|')})`;
      i = end;
    } else {
      out += escapeRegExp(c);
    }
  }
  return out;
}

function closingBrace(pattern: string, open: number): number {
  let depth = 0;
  for (let i = open; i < pattern.length; i++) {
    if (pattern[i] === '\\') i++;
    else if (pattern[i] === '{') depth++;
    else if (pattern[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (c === '\\') {
      current += c + text.charAt(++i);
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (c === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += c;
  }
  parts.push(current);
  return parts;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}
