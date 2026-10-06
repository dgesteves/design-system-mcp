import fs from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import type { DesignSystem } from '../src/design-system.js';
import { applyFixes } from '../src/lint/index.js';
import type { Diagnostic } from '../src/types.js';
import { ACME_ROOT, DEMO_ROOT, loadOnce, withRules } from './helpers.js';

let ds: DesignSystem;
beforeAll(async () => {
  ds = await loadOnce(DEMO_ROOT);
});

const IMPORTS = `import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
`;

function check(code: string, rule?: string, system = ds): Diagnostic[] {
  const { diagnostics } = system.check(code, 'snippet.tsx');
  return rule ? diagnostics.filter((d) => d.ruleId === rule) : diagnostics;
}

describe('no-hardcoded-color', () => {
  const rule = 'no-hardcoded-color';

  it('flags arbitrary Tailwind colors with the nearest token and a fix', () => {
    const code = `<div className="p-4 border-[#ef4444]" />`;
    const [d] = check(code, rule);
    expect(d).toMatchObject({
      severity: 'error',
      line: 1,
      column: 21,
      endColumn: 37,
      source: 'border-[#ef4444]',
      suggestion: 'border-destructive',
    });
    expect(d?.message).toMatch(/Nearest token destructive \(ΔE 0\.0\d\d\)/);
    expect(applyFixes(code, d ? [d] : [])).toBe(`<div className="p-4 border-destructive" />`);
  });

  it("flags Tailwind's default palette and keeps variants and modifiers in the fix", () => {
    const code = `<div className="hover:bg-red-600/90 text-gray-100" />`;
    const diagnostics = check(code, rule);
    expect(diagnostics.map((d) => d.suggestion)).toEqual(['bg-destructive', 'text-secondary']);
    expect(diagnostics[0]?.message).toContain('Matches token destructive (exact match)');
    expect(diagnostics[1]?.message).toContain('same value as muted, accent');
    expect(applyFixes(code, diagnostics)).toBe(
      `<div className="hover:bg-destructive/90 text-secondary" />`,
    );
  });

  it('suggests a variant when the component already has one for the token', () => {
    const [d] = check(`${IMPORTS}<Button className="bg-red-600">Delete</Button>`, rule);
    expect(d?.suggestion).toBe('variant="destructive"');
    expect(d?.message).toContain('or use variant="destructive"');
  });

  it('flags style values and color attributes, replacing CSS literals with var()', () => {
    const code = `<p style={{ color: "#737373", border: "1px solid #e5e5e5" }}><svg fill="#171717" /></p>`;
    const diagnostics = check(code, rule);
    expect(diagnostics.map((d) => d.source)).toEqual(['#737373', '#e5e5e5', '#171717']);
    expect(diagnostics[0]?.message).toContain(
      '→ `text-muted-foreground` or `var(--muted-foreground)`',
    );
    expect(applyFixes(code, diagnostics.slice(0, 2))).toContain(
      'color: "var(--muted-foreground)", border: "1px solid var(--border)"',
    );
    expect(diagnostics[2]?.suggestion).toBe('className="fill-primary"');
    expect(diagnostics[2]?.fix).toBeUndefined();
  });

  it('declines to auto-fix when no token is close', () => {
    const [d] = check(`<div className="bg-[#2563eb]" />`, rule);
    expect(d?.message).toContain('No close token');
    expect(d?.fix).toBeUndefined();
  });

  it('ignores tokens, keywords, black/white and allowed values', () => {
    expect(
      check(
        `<div className="bg-primary text-white bg-black/50 border-transparent text-[13px] bg-[var(--x)]" />`,
        rule,
      ),
    ).toEqual([]);
    expect(check(`<a href="#add">x</a>`, rule)).toEqual([]);
    const allowing = withRules(ds, { [rule]: ['error', { allow: ['#ef4444'] }] });
    expect(check(`<div className="bg-[#ef4444]" />`, rule, allowing)).toEqual([]);
  });

  it('checks class strings in cn(), clsx() and template literals', () => {
    const code =
      'const c = cn("bg-[#ef4444]", active && `text-gray-500 ${x}`, { "bg-blue-500": on })';
    expect(check(code, rule).map((d) => d.source)).toEqual([
      'bg-[#ef4444]',
      'text-gray-500',
      'bg-blue-500',
    ]);
  });
});

describe('no-hardcoded-spacing and no-hardcoded-radius', () => {
  it('snaps arbitrary spacing to the scale', () => {
    const [d] = check(`<div className="md:-mt-[13px]" />`, 'no-hardcoded-spacing');
    expect(d).toMatchObject({ severity: 'warning', suggestion: 'md:-mt-3' });
    expect(d?.message).toContain('off the scale. Nearest: `md:-mt-3` (12px)');
  });

  it('points out arbitrary values that are already on the scale', () => {
    const [d] = check(`<div className="gap-x-[16px]" />`, 'no-hardcoded-spacing');
    expect(d?.message).toBe(
      '`gap-x-[16px]` is 16px, which is on the spacing scale: use `gap-x-4`.',
    );
  });

  it('flags spacing in inline styles', () => {
    const [d] = check(
      `<p style={{ marginTop: 6, padding: "0.5rem 1rem", gap: 0 }} />`,
      'no-hardcoded-spacing',
    );
    expect(d).toMatchObject({ source: '6', suggestion: 'mt-1.5' });
    const all = check(
      `<p style={{ marginTop: 6, padding: "0.5rem 1rem", gap: 0 }} />`,
      'no-hardcoded-spacing',
    );
    expect(all).toHaveLength(2);
    expect(all[1]?.message).toContain('padding: "0.5rem 1rem"');
  });

  it('snaps radius to radius tokens', () => {
    const [d] = check(
      `<div className="rounded-t-[9px]" style={{ borderRadius: 14 }} />`,
      'no-hardcoded-radius',
    );
    expect(d?.suggestion).toBe('rounded-t-md');
    const style = check(`<div style={{ borderRadius: 14 }} />`, 'no-hardcoded-radius')[0];
    expect(style?.suggestion).toBe('rounded-xl');
  });

  it('uses var() fixes for systems without Tailwind', async () => {
    const acme = await loadOnce(ACME_ROOT);
    const diagnostics = acme.check(
      `<div style={{ padding: "8px" }} className="m-[1rem]" />`,
    ).diagnostics;
    expect(diagnostics.map((d) => [d.ruleId, d.severity, d.suggestion])).toEqual([
      ['no-hardcoded-spacing', 'error', 'var(--acme-space-2)'],
      ['no-hardcoded-spacing', 'error', 'm-[var(--acme-space-4)]'],
    ]);
    expect(
      applyFixes(
        `<div style={{ padding: "8px" }} />`,
        acme.check(`<div style={{ padding: "8px" }} />`).diagnostics,
      ),
    ).toBe(`<div style={{ padding: "var(--acme-space-2)" }} />`);
    expect(acme.check(`<div className="rounded-[9999px]" />`).diagnostics).toEqual([]);
  });
});

describe('prefer-design-system-component', () => {
  const rule = 'prefer-design-system-component';

  it('suggests the component that wraps the native element, with import and fix', () => {
    const code = `<button className="px-3" onClick={go}>Cancel</button>`;
    const [d] = check(code, rule);
    expect(d).toMatchObject({ line: 1, column: 2, source: 'button', suggestion: '<Button>' });
    expect(d?.message).toContain('import { Button } from "@/components/ui/button"');
    expect(applyFixes(code, d ? [d] : [])).toBe(
      `<Button className="px-3" onClick={go}>Cancel</Button>`,
    );
  });

  it('maps by element name too (Dialog wraps Radix, not <dialog>)', () => {
    expect(check(`<dialog open />`, rule)[0]?.suggestion).toBe('<Dialog>');
    expect(check(`<input type="email" />`, rule)[0]?.suggestion).toBe('<Input>');
  });

  it('leaves containers, non-text inputs and allowed elements alone', () => {
    expect(
      check(`<div><span /><input type="checkbox" /><label htmlFor="x">X</label></div>`, rule),
    ).toEqual([]);
    const allowing = withRules(ds, { [rule]: ['error', { allow: ['button'] }] });
    expect(check(`<button>x</button>`, rule, allowing)).toEqual([]);
  });

  it("does not flag the design system's own sources", () => {
    const source = fs.readFileSync(path.join(DEMO_ROOT, 'components/ui/button.tsx'), 'utf8');
    expect(
      ds.check(source, 'components/ui/button.tsx').diagnostics.filter((d) => d.ruleId === rule),
    ).toEqual([]);
  });
});

describe('no-unknown-component', () => {
  const rule = 'no-unknown-component';

  it('rewrites dot-notation members to flat parts', () => {
    const code = `${IMPORTS}<Card><Card.Header>x</Card.Header></Card>`;
    const [d] = check(code, rule);
    expect(d?.message).toContain(
      '<Card.Header> does not exist: Card is composed from flat parts. Use <CardHeader>',
    );
    expect(applyFixes(code, d ? [d] : [])).toContain('<CardHeader>x</CardHeader>');
  });

  it('flags names imported from the design system that it does not export', () => {
    const [d] = check(
      `import { Stack, Buton } from "@/components/ui/stack"\n<Stack /><Buton />`,
      rule,
    );
    expect(d?.message).toBe(
      '"Stack" is not a design-system component (imported from "@/components/ui/stack"). Use search_components to find an existing one.',
    );
    expect(
      check(`import { Buton } from "@/components/ui/button"\n<Buton />`, rule)[0]?.suggestion,
    ).toBe('<Button>');
  });

  it('catches typos in fragments, and warns about unknown names in full modules', () => {
    const fragment = check(`<><Buton>x</Buton><Stack /><Trash2 /></>`, rule);
    expect(fragment).toHaveLength(1);
    expect(fragment[0]).toMatchObject({ severity: 'error', suggestion: '<Button>' });
    const [unknown] = check(`${IMPORTS}<Stack />`, rule);
    expect(unknown).toMatchObject({ severity: 'warning', source: 'Stack' });
  });

  it('ignores components from other packages and local declarations', () => {
    const code = `import { Trash2 } from "lucide-react"
import Link from "next/link"
function Row() { return null }
const Local = () => <Row />
export default () => <Link href="/"><Trash2 /><Local /></Link>`;
    expect(check(code, rule)).toEqual([]);
  });

  it('resolves aliased and namespace imports', () => {
    expect(
      check(
        `import { Button as Btn } from "@/components/ui/button"\n<Btn variant="nope" />`,
        'no-unknown-variant',
      ),
    ).toHaveLength(1);
    expect(
      check(`import * as UI from "@/components/ui/card"\n<UI.Card><UI.Cardd /></UI.Card>`, rule)[0]
        ?.message,
    ).toContain('"Cardd" is not a design-system component');
  });
});

describe('no-unknown-prop', () => {
  const rule = 'no-unknown-prop';

  it('flags invented props and maps other libraries’ names to this system’s', () => {
    const [d] = check(`${IMPORTS}<Badge tone="success">Live</Badge>`, rule);
    expect(d?.message).toBe(
      '<Badge> has no prop "tone". Did you mean "variant" ("default" | "secondary" | "destructive" | "success" | "outline")?',
    );
    expect(d?.fix?.[0]?.text).toBe('variant');
  });

  it('does not offer a rename when the value would still be invalid', () => {
    const [d] = check(`${IMPORTS}<Badge tone="warning">x</Badge>`, rule);
    expect(d?.suggestion).toBe('variant');
    expect(d?.fix).toBeUndefined();
  });

  it('accepts own props, inherited DOM props, data-/aria- attributes, key and ref', () => {
    const code = `${IMPORTS}<Button key="a" ref={r} type="submit" onClick={f} disabled aria-label="x" data-test="y" asChild variant="ghost" />`;
    expect(check(code, rule)).toEqual([]);
  });

  it('suggests close matches for typos', () => {
    expect(check(`${IMPORTS}<Button varient="ghost" />`, rule)[0]?.suggestion).toBe('variant');
    expect(check(`${IMPORTS}<Button isDisabled />`, rule)[0]?.suggestion).toBe('disabled');
  });

  it('skips components whose props could not be fully resolved', async () => {
    const acme = await loadOnce(ACME_ROOT);
    expect(
      acme.check(`import { Button } from "@acme/button"\n<Button whatever />`).diagnostics,
    ).toEqual([]);
    expect(
      acme.check(`import { Alert } from "@acme/alert"\n<Alert tone="info" title="t" whatever />`)
        .diagnostics[0]?.ruleId,
    ).toBe(rule);
  });
});

describe('no-unknown-variant', () => {
  const rule = 'no-unknown-variant';

  it('lists allowed values and maps common synonyms', () => {
    const code = `${IMPORTS}<Button variant="danger" size="small">x</Button>`;
    const diagnostics = check(code, rule);
    expect(diagnostics.map((d) => d.suggestion)).toEqual(['variant="destructive"', 'size="sm"']);
    expect(diagnostics[0]?.message).toBe(
      '"danger" is not a valid variant for <Button>. Allowed: default, destructive, outline, secondary, ghost, link. Did you mean "destructive"?',
    );
    expect(applyFixes(code, diagnostics)).toContain('<Button variant="destructive" size="sm">');
  });

  it('checks every branch of a conditional value', () => {
    const diagnostics = check(`${IMPORTS}<Button variant={on ? "primary" : "ghost"} />`, rule);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.suggestion).toBe('variant="default"');
  });

  it('validates literal-union props that are not cva variants', async () => {
    const acme = await loadOnce(ACME_ROOT);
    const [d] = acme.check(
      `import { Alert } from "@acme/alert"\n<Alert tone="error" title="x" />`,
    ).diagnostics;
    expect(d).toMatchObject({ ruleId: rule, suggestion: 'tone="danger"' });
  });

  it('accepts valid and dynamic values', () => {
    expect(check(`${IMPORTS}<Button variant="outline" size={size} />`, rule)).toEqual([]);
  });
});

describe('icon-button-accessible-name', () => {
  const rule = 'icon-button-accessible-name';

  it('flags icon-only buttons and guesses a label from the icon', () => {
    const code = `${IMPORTS}<Button size="icon" variant="ghost"><Trash2 /></Button>`;
    const [d] = check(code, rule);
    expect(d?.message).toBe(
      'Icon-only <Button> has no accessible name. Add aria-label="Delete" describing the action, or visually hidden text.',
    );
    expect(applyFixes(code, d ? [d] : [])).toContain('<Button aria-label="Delete" size="icon"');
  });

  it('flags native icon buttons and empty icon-size buttons', () => {
    expect(check(`<button><svg /></button>`, rule)).toHaveLength(1);
    expect(check(`${IMPORTS}<Button size="icon" />`, rule)).toHaveLength(1);
  });

  it('accepts labels, visible or visually hidden text, asChild and spreads', () => {
    const ok = [
      `<Button size="icon" aria-label="Delete"><Trash2 /></Button>`,
      `<Button size="icon"><Trash2 /><span className="sr-only">Delete</span></Button>`,
      `<Button><Trash2 /> Delete</Button>`,
      `<Button>{label}</Button>`,
      `<Button asChild><a href="/x"><Trash2 /></a></Button>`,
      `<Button {...props}><Trash2 /></Button>`,
      `<button title="Close"><svg /></button>`,
    ];
    for (const code of ok) expect(check(`${IMPORTS}${code}`, rule), code).toEqual([]);
  });

  it('still flags an empty aria-label', () => {
    expect(check(`<button aria-label=""><svg /></button>`, rule)).toHaveLength(1);
  });
});

describe('the engine', () => {
  it('reports the demo draft with one finding per rule and leaves clean code alone', () => {
    const draft = fs.readFileSync(path.join(DEMO_ROOT, 'app/settings/danger-zone.tsx'), 'utf8');
    const result = ds.check(draft, 'app/settings/danger-zone.tsx');
    expect(new Set(result.diagnostics.map((d) => d.ruleId))).toEqual(
      new Set([
        'no-hardcoded-color',
        'no-hardcoded-spacing',
        'no-hardcoded-radius',
        'prefer-design-system-component',
        'no-unknown-component',
        'no-unknown-prop',
        'no-unknown-variant',
        'icon-button-accessible-name',
      ]),
    );
    expect(result.errorCount).toBe(8);
    expect(result.warningCount).toBe(3);

    const clean = fs.readFileSync(path.join(DEMO_ROOT, 'app/settings/members.tsx'), 'utf8');
    expect(ds.check(clean, 'app/settings/members.tsx').diagnostics).toEqual([]);
  });

  it('applies fixes without breaking the file', () => {
    const draft = fs.readFileSync(path.join(DEMO_ROOT, 'app/settings/danger-zone.tsx'), 'utf8');
    const fixed = applyFixes(draft, ds.check(draft).diagnostics);
    const after = ds.check(fixed).diagnostics;
    expect(after.filter((d) => d.ruleId === 'syntax')).toEqual([]);
    // Left: `tone="warning"` (no valid rename), the style spacing (needs a className) and the style color fix is applied.
    expect(after.map((d) => d.ruleId).sort()).toEqual(['no-hardcoded-spacing', 'no-unknown-prop']);
  });

  it('respects severities from the config', () => {
    const relaxed = withRules(ds, { 'no-hardcoded-color': 'warn', 'no-unknown-variant': 'off' });
    const result = relaxed.check(`${IMPORTS}<Button variant="danger" className="bg-[#ef4444]" />`);
    expect(result.diagnostics.map((d) => [d.ruleId, d.severity])).toEqual([
      ['no-hardcoded-color', 'warning'],
    ]);
    expect(result).toMatchObject({ errorCount: 0, warningCount: 1 });
  });

  it('reports syntax errors and parses .jsx as JSX', () => {
    const [d] = ds.check('<div className="x"', 'broken.tsx').diagnostics;
    expect(d?.ruleId).toBe('syntax');
    expect(ds.check('const a = <Buton />', 'file.jsx').diagnostics[0]?.ruleId).toBe(
      'no-unknown-component',
    );
  });

  it('sorts diagnostics by position and reports 1-based ranges', () => {
    const result = ds.check(`<div>\n  <button className="bg-[#fff]"><svg /></button>\n</div>`);
    expect(result.diagnostics.map((d) => [d.line, d.column, d.ruleId])).toEqual([
      [2, 4, 'icon-button-accessible-name'],
      [2, 4, 'prefer-design-system-component'],
      [2, 22, 'no-hardcoded-color'],
    ]);
    // End columns are exclusive, as in ESLint: `bg-[#fff]` spans columns 22-30.
    expect(result.diagnostics[2]).toMatchObject({ endLine: 2, endColumn: 31 });
  });
});
