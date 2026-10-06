import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { colorDistance, findColorLiterals, parseColor } from '../src/tokens/color.js';
import { mergeTokens, parseCssTokens, parseDtcgTokens, TokenIndex } from '../src/tokens/index.js';
import { evaluateLength, lengthToPx } from '../src/tokens/units.js';
import type { Token } from '../src/types.js';
import { ACME_ROOT, DEMO_ROOT } from './helpers.js';

const byName = (tokens: Token[], name: string): Token => {
  const token = tokens.find((t) => t.name === name);
  if (!token) throw new Error(`missing token ${name}`);
  return token;
};

describe('W3C DTCG tokens', () => {
  const text = fs.readFileSync(path.join(ACME_ROOT, 'tokens/acme.tokens.json'), 'utf8');
  const { tokens, warnings } = parseDtcgTokens(text, 'acme.tokens.json', { prefix: 'acme' });

  it('inherits $type from groups and categorises tokens', () => {
    expect(byName(tokens, 'color.brand.500')).toMatchObject({
      category: 'color',
      value: '#3b5bdb',
      cssVar: '--acme-color-brand-500',
      description: 'Primary brand color.',
      usage: ['var(--acme-color-brand-500)'],
    });
    expect(byName(tokens, 'space.2').category).toBe('spacing');
    expect(byName(tokens, 'radius.md').category).toBe('radius');
    expect(byName(tokens, 'font.body')).toMatchObject({
      category: 'typography',
      value: 'Inter, system-ui, sans-serif',
    });
    expect(byName(tokens, 'shadow.card').category).toBe('shadow');
  });

  it('formats object values from the stable spec', () => {
    expect(byName(tokens, 'color.brand.600').value).toBe('#334dbf');
    expect(byName(tokens, 'color.danger').value).toBe('oklch(0.577 0.245 27.325)');
    expect(byName(tokens, 'space.1').value).toBe('4px');
    expect(byName(tokens, 'space.4').value).toBe('1rem');
    expect(byName(tokens, 'shadow.card').value).toBe('0px 1px 2px 0px #334dbf');
  });

  it('resolves aliases, modes and deprecations', () => {
    expect(byName(tokens, 'color.ink')).toMatchObject({
      value: '#334dbf',
      aliasOf: 'color.brand.600',
    });
    expect(byName(tokens, 'color.danger').modes).toEqual({ dark: '#3b5bdb' });
    expect(byName(tokens, 'color.legacy-red').deprecated).toBe('Use color.danger.');
  });

  it('reports broken aliases and invalid files without throwing', () => {
    expect(warnings).toEqual(['acme.tokens.json: unresolved alias {color.missing}']);
    const cyclic = parseDtcgTokens(
      '{"a":{"$type":"color","$value":"{b}"},"b":{"$type":"color","$value":"{a}"}}',
      'c.json',
    );
    expect(cyclic.warnings.some((w) => w.includes('circular alias'))).toBe(true);
    expect(parseDtcgTokens('{nope', 'bad.json').warnings[0]).toMatch(/invalid JSON/);
  });

  it('records source lines', () => {
    expect(byName(tokens, 'radius.md').source).toEqual({ file: 'acme.tokens.json', line: 26 });
  });
});

describe('CSS custom-property tokens', () => {
  const css = fs.readFileSync(path.join(DEMO_ROOT, 'app/globals.css'), 'utf8');
  const { tokens } = parseCssTokens(css, 'app/globals.css');

  it('merges @theme inline aliases with :root values and .dark modes', () => {
    expect(byName(tokens, 'primary')).toMatchObject({
      category: 'color',
      value: 'oklch(0.205 0 0)',
      modes: { dark: 'oklch(0.922 0 0)' },
      cssVar: '--primary',
      tailwind: 'primary',
      usage: ['bg-primary', 'text-primary', 'border-primary', 'var(--primary)'],
    });
    expect(byName(tokens, 'muted-foreground').usage[0]).toBe('text-muted-foreground');
    expect(byName(tokens, 'destructive').description).toBe('Errors and irreversible actions.');
  });

  it('keeps inline theme values that are not aliases, without a runtime custom property', () => {
    const md = byName(tokens, 'radius-md');
    expect(md).toMatchObject({
      category: 'radius',
      value: 'calc(var(--radius) - 2px)',
      tailwind: 'md',
      usage: ['rounded-md'],
    });
    expect(md.cssVar).toBeUndefined();
  });

  it("adds Tailwind's spacing unit when the file imports tailwindcss", () => {
    expect(byName(tokens, 'spacing')).toMatchObject({
      value: '0.25rem',
      origin: 'tailwind-default',
      tailwind: '',
    });
  });

  it('understands media-query and data-attribute modes', () => {
    const { tokens: themed } = parseCssTokens(
      `:root { --brand: #3b82f6; --gap: 12px; }
       @media (prefers-color-scheme: dark) { :root { --brand: #60a5fa; } }
       [data-theme="contrast"] { --brand: #1d4ed8; }
       .card { --local: red; }`,
      'theme.css',
    );
    expect(byName(themed, 'brand')).toMatchObject({
      category: 'color',
      modes: { dark: '#60a5fa', contrast: '#1d4ed8' },
      usage: ['var(--brand)'],
    });
    expect(byName(themed, 'gap').category).toBe('spacing');
    expect(themed.find((t) => t.name === 'local')).toBeUndefined();
  });

  it('merges a DTCG token and the CSS generated from it', () => {
    const fromJson = parseDtcgTokens(
      '{"color":{"primary":{"$type":"color","$value":"#000","$description":"Ink."}}}',
      't.json',
    ).tokens;
    const fromCss = parseCssTokens('@theme { --color-primary: #000; }', 't.css').tokens;
    const merged = mergeTokens([...fromJson, ...fromCss]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      name: 'color.primary',
      description: 'Ink.',
      tailwind: 'primary',
    });
    expect(merged[0]?.usage).toEqual([
      'bg-primary',
      'text-primary',
      'border-primary',
      'var(--color-primary)',
    ]);
  });
});

describe('units and colors', () => {
  it('converts lengths and evaluates calc() with var()', () => {
    expect(lengthToPx('0.5rem')).toBe(8);
    expect(lengthToPx('12px')).toBe(12);
    expect(lengthToPx(6)).toBe(6);
    expect(lengthToPx('50%')).toBeUndefined();
    const vars: Record<string, string> = {
      '--radius': '0.625rem',
      '--double': 'calc(var(--radius) * 2)',
    };
    const resolve = (name: string) => vars[name];
    expect(evaluateLength('calc(var(--radius) - 4px)', resolve)).toBe(6);
    expect(evaluateLength('calc(var(--radius) + (2px * 3))', resolve)).toBe(16);
    expect(evaluateLength('var(--double)', resolve)).toBe(20);
    expect(evaluateLength('var(--missing)', resolve)).toBeUndefined();
  });

  it('parses CSS colors into OKLCH and measures perceptual distance', () => {
    const red600 = parseColor('oklch(57.7% 0.245 27.325)');
    const destructive = parseColor('oklch(0.577 0.245 27.325)');
    expect(red600 && destructive && colorDistance(red600, destructive)).toBeCloseTo(0, 6);
    const black = parseColor('#000');
    const white = parseColor('rgb(255 255 255)');
    expect(black && white && colorDistance(black, white)).toBeCloseTo(1, 2);
    expect(parseColor('transparent')).toBeUndefined();
    expect(parseColor('var(--x)')).toBeUndefined();
  });

  it('finds color literals inside CSS values', () => {
    expect(
      findColorLiterals('1px solid #ccc, 0 0 0 2px rgb(0 0 0 / 0.5)').map((m) => m.text),
    ).toEqual(['#ccc', 'rgb(0 0 0 / 0.5)']);
    expect(findColorLiterals('#section and #add-item').map((m) => m.text)).toEqual([]);
  });
});

describe('nearest-token search', () => {
  const css = fs.readFileSync(path.join(DEMO_ROOT, 'app/globals.css'), 'utf8');
  const index = new TokenIndex(parseCssTokens(css, 'app/globals.css').tokens);

  it('finds the perceptually nearest color in OKLCH', () => {
    const red500 = parseColor('#ef4444');
    if (!red500) throw new Error('parse');
    const [best] = index.nearestColor(red500);
    expect(best?.candidate.token.name).toBe('destructive');
    expect(best?.distance).toBeGreaterThan(0.02);
    expect(best?.distance).toBeLessThan(0.1);

    const neutral500 = parseColor('#737373');
    if (!neutral500) throw new Error('parse');
    expect(index.nearestColor(neutral500)[0]).toMatchObject({
      candidate: { token: { name: 'muted-foreground' } },
    });
  });

  it('snaps lengths to the Tailwind spacing scale and to radius tokens', () => {
    expect(index.spacingUnitPx).toBe(4);
    expect(index.nearestLength('spacing', 13)?.candidate).toMatchObject({ key: '3', px: 12 });
    expect(index.nearestLength('spacing', 6)?.candidate).toMatchObject({ key: '1.5', px: 6 });
    expect(index.nearestLength('radius', 9)?.candidate.key).toBe('md');
    expect(index.nearestLength('radius', 10)?.candidate.key).toBe('lg');
  });
});
