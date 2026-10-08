/**
 * A small syntax highlighter for the snippets on this site: TSX/JSX, JSON, shell and
 * TOML/YAML. It has no dependencies and runs on the server at build time and in the
 * browser (the playground), so code looks the same everywhere. It colours what helps
 * reading (strings, JSX tags, attributes, keywords, comments) and leaves the rest plain.
 */

export type Lang = 'tsx' | 'json' | 'sh' | 'toml' | 'yaml' | 'text';

export type TokenKind =
  | 'plain'
  | 'comment'
  | 'string'
  | 'keyword'
  | 'number'
  | 'tag'
  | 'component'
  | 'attr'
  | 'punct'
  | 'prompt'
  | 'key';

export interface Token {
  text: string;
  kind: TokenKind;
}

/** A range of the source to mark, such as a finding or a changed span. */
export interface Mark {
  start: number;
  end: number;
  kind: string;
  id?: number;
}

export interface Segment {
  text: string;
  kind: TokenKind;
  mark?: { kind: string; id?: number | undefined; first: boolean } | undefined;
}

const KEYWORDS = new Set([
  'import',
  'export',
  'from',
  'function',
  'return',
  'const',
  'let',
  'var',
  'if',
  'else',
  'type',
  'interface',
  'extends',
  'default',
  'as',
  'new',
  'true',
  'false',
  'null',
  'undefined',
  'async',
  'await',
]);

function tokenizeTsx(code: string): Token[] {
  const tokens: Token[] = [];
  const push = (text: string, kind: TokenKind) => {
    if (text) tokens.push({ text, kind });
  };
  // Inside a JSX opening tag, between `<Name` and `>`: identifiers are attributes.
  let inTag = false;
  let braces = 0;
  const pattern =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(<\/?)([A-Za-z][\w.]*)|([A-Za-z_$][\w$-]*)|(\d+(?:\.\d+)?)|(\s+)|([\s\S])/g;
  for (const match of code.matchAll(pattern)) {
    const [text, comment, string, open, tagName, word, number, space, other] = match;
    if (comment) push(comment, 'comment');
    else if (string) push(string, 'string');
    else if (open && tagName) {
      push(open, 'punct');
      push(tagName, /^[A-Z]/.test(tagName) ? 'component' : 'tag');
      inTag = open === '<';
      braces = 0;
    } else if (word) {
      if (inTag && braces === 0) {
        push(word, 'attr');
      } else {
        // `tone-warning` is never an identifier outside a tag; split on the dash.
        const [head = word, ...rest] = word.split(/(?=-)/);
        push(head, KEYWORDS.has(head) ? 'keyword' : 'plain');
        for (const part of rest) push(part, 'plain');
      }
    } else if (number) push(number, 'number');
    else if (space) push(space, 'plain');
    else if (other) {
      if (inTag) {
        if (other === '{') braces++;
        else if (other === '}') braces = Math.max(0, braces - 1);
        else if (other === '>' && braces === 0) inTag = false;
      }
      push(other, 'punct');
    } else push(text, 'plain');
  }
  return tokens;
}

function tokenizeJson(code: string): Token[] {
  const tokens: Token[] = [];
  const pattern =
    /("(?:[^"\\\n]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?)|\b(true|false|null)\b|(\s+)|([\s\S])/g;
  for (const match of code.matchAll(pattern)) {
    const [, string, colon, number, literal, space, other] = match;
    if (string) {
      tokens.push({ text: string, kind: colon ? 'key' : 'string' });
      if (colon) tokens.push({ text: colon, kind: 'punct' });
    } else if (number) tokens.push({ text: number, kind: 'number' });
    else if (literal) tokens.push({ text: literal, kind: 'keyword' });
    else if (space) tokens.push({ text: space, kind: 'plain' });
    else if (other) tokens.push({ text: other, kind: 'punct' });
  }
  return tokens;
}

function tokenizeSh(code: string): Token[] {
  const tokens: Token[] = [];
  for (const line of code.split(/(?<=\n)/)) {
    // `$ cmd` and `> output` prompts are not part of the command.
    const prompt = /^(\$ |❯ )/.exec(line)?.[0];
    let rest = line;
    if (prompt) {
      tokens.push({ text: prompt, kind: 'prompt' });
      rest = line.slice(prompt.length);
    }
    const pattern = /(#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'[^'\n]*')|(\s--?[\w-]+)|([\s\S])/g;
    for (const match of rest.matchAll(pattern)) {
      const [, comment, string, flag, other] = match;
      if (comment) tokens.push({ text: comment, kind: 'comment' });
      else if (string) tokens.push({ text: string, kind: 'string' });
      else if (flag) tokens.push({ text: flag, kind: 'attr' });
      else if (other) tokens.push({ text: other, kind: 'plain' });
    }
  }
  return tokens;
}

function tokenizeConfig(code: string): Token[] {
  const tokens: Token[] = [];
  const pattern =
    /(#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'[^'\n]*')|^(\s*-?\s*)([\w.$-]+)(\s*[:=])|(\[[\w.-]+\])|(\s+)|([\s\S])/gm;
  for (const match of code.matchAll(pattern)) {
    const [, comment, string, indent, key, sep, section, space, other] = match;
    if (comment) tokens.push({ text: comment, kind: 'comment' });
    else if (string) tokens.push({ text: string, kind: 'string' });
    else if (key && sep !== undefined) {
      if (indent) tokens.push({ text: indent, kind: 'plain' });
      tokens.push({ text: key, kind: 'key' });
      tokens.push({ text: sep, kind: 'punct' });
    } else if (section) tokens.push({ text: section, kind: 'key' });
    else if (space) tokens.push({ text: space, kind: 'plain' });
    else if (other) tokens.push({ text: other, kind: 'plain' });
  }
  return tokens;
}

export function tokenize(code: string, lang: Lang): Token[] {
  switch (lang) {
    case 'tsx':
      return tokenizeTsx(code);
    case 'json':
      return tokenizeJson(code);
    case 'sh':
      return tokenizeSh(code);
    case 'toml':
    case 'yaml':
      return tokenizeConfig(code);
    default:
      return [{ text: code, kind: 'plain' }];
  }
}

/**
 * Splits highlighted code into lines of segments, cutting tokens where marks start and
 * end, so a finding can be underlined exactly over the text it covers.
 */
export function highlightLines(code: string, lang: Lang, marks: Mark[] = []): Segment[][] {
  const lines: Segment[][] = [[]];
  const cuts = new Set<number>();
  for (const mark of marks) {
    cuts.add(mark.start);
    cuts.add(mark.end);
  }
  const markAt = (offset: number) =>
    marks.find((m) => offset >= m.start && offset < m.end && m.end > m.start);
  let offset = 0;
  for (const token of tokenize(code, lang)) {
    let start = 0;
    const end = token.text.length;
    // Cut at line breaks and at mark boundaries.
    const boundaries = new Set<number>();
    for (let i = 0; i < end; i++) {
      if (token.text[i] === '\n') {
        boundaries.add(i);
        boundaries.add(i + 1);
      }
      if (cuts.has(offset + i)) boundaries.add(i);
    }
    boundaries.add(end);
    for (const boundary of [...boundaries].sort((a, b) => a - b)) {
      if (boundary <= start) continue;
      const text = token.text.slice(start, boundary);
      if (text === '\n') {
        lines.push([]);
      } else {
        const mark = markAt(offset + start);
        lines[lines.length - 1]?.push({
          text,
          kind: token.kind,
          mark: mark && { kind: mark.kind, id: mark.id, first: offset + start === mark.start },
        });
      }
      start = boundary;
    }
    offset += end;
  }
  return lines;
}
