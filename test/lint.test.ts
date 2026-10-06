import fs from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { loadDesignSystem, type DesignSystem } from '../src/design-system.js';
import { applyFixes } from '../src/lint/index.js';
import type { Diagnostic } from '../src/types.js';
import { ACME_ROOT, DEMO_ROOT, fixture, load, loadOnce, TSCONFIG, withRules } from './helpers.js';

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

  it('flags colors in arbitrary properties and replaces them with the property’s utility', () => {
    const code = `<div className="[color:red] hover:[background-color:#ef4444] [border-top-color:rgb(239_68_68)] [box-shadow:0_0_0_1px_#e5e5e5] [stop-color:#ef4444] [--brand:#ef4444] [mask-type:luminance] [color:var(--x)] [color:currentColor]" />`;
    const diagnostics = check(code, rule);
    expect(diagnostics.map((d) => [d.source, d.suggestion])).toEqual([
      ['[color:red]', 'text-destructive'],
      ['hover:[background-color:#ef4444]', 'bg-destructive'],
      ['[border-top-color:rgb(239_68_68)]', 'border-t-destructive'],
      ['[box-shadow:0_0_0_1px_#e5e5e5]', 'var(--border)'],
      ['[stop-color:#ef4444]', 'var(--destructive)'],
    ]);
    expect(applyFixes(code, diagnostics)).toBe(
      `<div className="text-destructive hover:bg-destructive border-t-destructive [box-shadow:0_0_0_1px_#e5e5e5] [stop-color:#ef4444] [--brand:#ef4444] [mask-type:luminance] [color:var(--x)] [color:currentColor]" />`,
    );
  });

  it('keeps the important modifier where it was written', () => {
    const code = `<div className="bg-red-600! !text-red-600 hover:bg-red-600/50! md:-mt-[13px]! !p-[13px]" />`;
    expect(applyFixes(code, check(code))).toBe(
      `<div className="bg-destructive! !text-destructive hover:bg-destructive/50! md:-mt-3! !p-3" />`,
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

  it('reports and fixes the right span in style strings with escapes', () => {
    const code = `<div style={{ background: "url(\\"x.png\\") #ff0000" }} />`;
    expect(code).toContain('\\"');
    const diagnostics = check(code, rule);
    expect(diagnostics.map((d) => d.source)).toEqual(['#ff0000']);
    expect(applyFixes(code, diagnostics)).toBe(
      `<div style={{ background: "url(\\"x.png\\") var(--destructive)" }} />`,
    );
  });

  it('takes the base theme from whichever stylesheet holds it, never the dark one', async () => {
    const system = await load(
      fixture({
        'design-system-mcp.config.json': '{ "tokens": ["styles/*.css"] }',
        'styles/dark.css': `.dark { --background: oklch(0.145 0 0); --primary: oklch(0.922 0 0); }`,
        'styles/light.css': `@theme inline { --color-background: var(--background); --color-primary: var(--primary); }
:root { --background: oklch(1 0 0); --primary: oklch(0.205 0 0); }`,
      }),
    );
    const code = `<div className="bg-[#ffffff] text-[#0a0a0a]" />`;
    const diagnostics = check(code, rule, system);
    expect(diagnostics.map((d) => d.suggestion)).toEqual(['bg-background', 'text-primary']);
    expect(applyFixes(code, diagnostics)).toBe(`<div className="bg-background text-primary" />`);
  });

  it('declines to auto-fix when no token is close, and points at variants', () => {
    const [d] = check(`<div className="bg-[#2563eb]" />`, rule);
    expect(d?.message).toContain('No close token');
    expect(d?.fix).toBeUndefined();
    const [onButton] = check(`${IMPORTS}<Button className="bg-blue-600">Save</Button>`, rule);
    expect(onButton?.message).toContain(
      '<Button> already sets bg-* through `variant`; prefer a variant over overriding it.',
    );
  });

  it('ignores tokens, keywords, black/white and allowed values', () => {
    expect(
      check(
        `<div className="bg-primary text-white bg-black/50 border-transparent text-[13px] bg-[var(--x)]" />`,
        rule,
      ),
    ).toEqual([]);
    expect(check(`<a href="#add">x</a>`, rule)).toEqual([]);
    expect(check(`<svg><path fill="url(#bad)" stroke="url('#fade')" /></svg>`, rule)).toEqual([]);
    const allowing = withRules(ds, { [rule]: ['error', { allow: ['#ef4444'] }] });
    expect(check(`<div className="bg-[#ef4444]" />`, rule, allowing)).toEqual([]);
  });

  it('checks the classes in cva() and tv() configs, not their keys or conditions', () => {
    const code = `const button = cva("inline-flex bg-red-500", {
  variants: {
    tone: { danger: "bg-red-600", ok: ["px-2", "text-[#ef4444]"] },
    size: { sm: "h-8" },
  },
  compoundVariants: [{ tone: "danger", size: "sm", class: "border-gray-100" }],
  defaultVariants: { tone: "danger" },
})
const card = tv({
  base: "bg-blue-500",
  slots: { title: "text-gray-500" },
  variants: { elevated: { true: { base: "shadow-[0_1px_2px_#ef4444]" } } },
})
const plain = clsx({ "p-4": "bg-red-500" })`;
    expect(check(code, rule).map((d) => d.source)).toEqual([
      'bg-red-500',
      'bg-red-600',
      'text-[#ef4444]',
      'border-gray-100',
      'bg-blue-500',
      'text-gray-500',
      'shadow-[0_1px_2px_#ef4444]',
    ]);
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

  it('keeps the sign of negative values', () => {
    const code = `<div className="mt-[-3px] -mx-[8px] p-[-4px]" style={{ margin: "-8px" }} />`;
    const diagnostics = check(code, 'no-hardcoded-spacing');
    expect(diagnostics.map((d) => [d.source, d.suggestion])).toEqual([
      ['mt-[-3px]', '-mt-0.5'],
      ['-mx-[8px]', '-mx-2'],
      ['"-8px"', '-m-2'],
    ]);
    const numbers = check(
      `<div style={{ marginTop: -8, marginLeft: +6, padding: -4, borderRadius: -2 }} />`,
    );
    expect(numbers.map((d) => [d.source, d.suggestion, d.message])).toEqual([
      [
        '-8',
        '-mt-2',
        'Hardcoded spacing `marginTop: -8` in style. Use `-mt-2` (8px) in className instead of an inline style.',
      ],
      [
        '+6',
        'ml-1.5',
        'Hardcoded spacing `marginLeft: 6` in style. Use `ml-1.5` (6px) in className instead of an inline style.',
      ],
    ]);
    expect(applyFixes(code, diagnostics)).toBe(
      `<div className="-mt-0.5 -mx-2 p-[-4px]" style={{ margin: "-8px" }} />`,
    );
  });

  it("offers every whole and half step of Tailwind's --spacing, and px", () => {
    const code = `<div className="p-[52px] px-[18px] py-[1px] gap-[13px]" />`;
    const diagnostics = check(code, 'no-hardcoded-spacing');
    expect(diagnostics.map((d) => d.suggestion)).toEqual(['p-13', 'px-4.5', 'py-px', 'gap-3']);
    expect(diagnostics[0]?.message).toBe(
      '`p-[52px]` is 52px, which is on the spacing scale: use `p-13`.',
    );
    expect(diagnostics[3]?.message).toContain('off the scale');
  });

  it("knows Tailwind's default radius keys and rounded-full", () => {
    const code = `<div className="rounded-[16px] rounded-t-[2px] rounded-[9999px]" style={{ borderRadius: 9999 }} />`;
    expect(check(code, 'no-hardcoded-radius').map((d) => d.suggestion)).toEqual([
      'rounded-2xl',
      'rounded-t-xs',
      'rounded-full',
      'rounded-full',
    ]);
  });

  it('reads radii far above the scale as fully rounded, and does not fix far-off steps', async () => {
    const code = `<div className="rounded-[999px] rounded-t-[1000px] rounded-[100px] rounded-[80px] rounded-[48px]" style={{ borderRadius: 500 }} />`;
    const diagnostics = check(code, 'no-hardcoded-radius');
    expect(diagnostics.map((d) => [d.source, d.suggestion, d.fix?.[0]?.text])).toEqual([
      ['rounded-[999px]', 'rounded-full', 'rounded-full'],
      ['rounded-t-[1000px]', 'rounded-t-full', 'rounded-t-full'],
      ['rounded-[100px]', 'rounded-full', 'rounded-full'],
      ['rounded-[80px]', 'rounded-4xl', undefined],
      ['rounded-[48px]', 'rounded-4xl', 'rounded-4xl'],
      ['500', 'rounded-full', undefined],
    ]);
    expect(diagnostics[0]?.message).toBe(
      '`rounded-[999px]` (999px) is far above the radius scale, so it reads as fully rounded: use `rounded-full`.',
    );
    expect(diagnostics[3]?.message).toBe(
      'Hardcoded radius `rounded-[80px]` (80px) is off the scale. Nearest: `rounded-4xl` (32px), too far off to replace automatically.',
    );
    expect(diagnostics[5]?.message).toContain('Use `rounded-full` (fully rounded) in className');

    const pill = await load(
      fixture({
        'design-system-mcp.config.json': '{ "tokens": ["a.css"] }',
        'a.css': `@import "tailwindcss";
@theme { --radius-*: initial; --radius-card: 0.75rem; --radius-pill: 9999px; }`,
      }),
    );
    expect(
      pill
        .check(`<div className="rounded-[999px] rounded-[40px] rounded-[10px] rounded-[9999px]" />`)
        .diagnostics.map((d) => d.suggestion),
    ).toEqual(['rounded-pill', 'rounded-pill', 'rounded-card', 'rounded-pill']);
  });

  it('only offers classes that survive a namespace reset, from any stylesheet', async () => {
    const system = await load(
      fixture({
        'design-system-mcp.config.json': '{ "tokens": ["styles/*.css"] }',
        'styles/a.css': '@import "tailwindcss";',
        'styles/b.css': `@theme {
          --spacing-*: initial; --spacing-sm: 0.5rem; --spacing-md: 1rem;
          --radius-*: initial; --radius-card: 0.75rem;
        }`,
      }),
    );
    const code = `<div className="p-[18px] gap-[13px] rounded-[11px]" />`;
    expect(system.check(code).diagnostics.map((d) => [d.ruleId, d.suggestion])).toEqual([
      ['no-hardcoded-spacing', 'p-md'],
      ['no-hardcoded-spacing', 'gap-md'],
      ['no-hardcoded-radius', 'rounded-card'],
    ]);
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
    const negative = `<div style={{ margin: "-8px" }} className="-m-[1rem]" />`;
    const fixes = acme.check(negative).diagnostics;
    expect(fixes.map((d) => d.suggestion)).toEqual([
      'calc(var(--acme-space-2) * -1)',
      '-m-[var(--acme-space-4)]',
    ]);
    expect(applyFixes(negative, fixes)).toBe(
      `<div style={{ margin: "calc(var(--acme-space-2) * -1)" }} className="-m-[var(--acme-space-4)]" />`,
    );
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

  it('maps by element name too, without a fix when the component may not take its attributes', () => {
    // The demo's Dialog wraps the Radix root, not a <dialog>: renaming the tag would break the code.
    const [dialog] = check(`<dialog open><p>Hi</p></dialog>`, rule);
    expect(dialog?.suggestion).toBe('<Dialog>');
    expect(dialog?.message).toContain(
      'it may not take the attributes of a <dialog>, so check its props and parts with get_component.',
    );
    expect(dialog?.fix).toBeUndefined();
    expect(check(`<input type="email" />`, rule)[0]?.fix).toHaveLength(1);
  });

  it('renames to components that take the element’s attributes, whatever they render', async () => {
    const system = await load(
      fixture(
        {
          'tsconfig.json': TSCONFIG,
          'node_modules/label-primitive/package.json':
            '{ "name": "label-primitive", "types": "index.d.ts" }',
          'node_modules/label-primitive/index.d.ts': `import * as React from "react";
export declare const Root: React.ForwardRefExoticComponent<React.LabelHTMLAttributes<HTMLLabelElement> & React.RefAttributes<HTMLLabelElement>>;`,
          'components/ui/label.tsx': `import * as React from "react"
import * as LabelPrimitive from "label-primitive"
export function Label(props: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root data-slot="label" {...props} />
}`,
          'components/ui/table.tsx': `import * as React from "react"
function BaseTable(props: React.ComponentProps<"table">) {
  return <table {...props} />
}
export function Table(props: React.ComponentProps<typeof BaseTable>) {
  return <div className="overflow-x-auto"><BaseTable {...props} /></div>
}`,
          'components/ui/select.tsx': `import * as React from "react"
export function Select(props: React.ComponentProps<"button">) {
  return <button {...props} />
}`,
        },
        { nodeModules: true },
      ),
    );
    expect(system.getComponent('Label')?.element).toBeUndefined();
    expect(system.getComponent('Table')?.element).toBe('div');
    const code = `<form><label htmlFor="email">Email</label><table><tbody /></table></form>`;
    const diagnostics = check(code, rule, system);
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Native <label> where the design system has <Label>. Use <Label> (import { Label } from "@/components/ui/label").',
      'Native <table> where the design system has <Table>. Use <Table> (import { Table } from "@/components/ui/table").',
    ]);
    expect(applyFixes(code, diagnostics)).toBe(
      `<form><Label htmlFor="email">Email</Label><Table><tbody /></Table></form>`,
    );
    const [select] = check(`<select name="x" />`, rule, system);
    expect(select?.message).toContain(
      'it renders a <button>, not a <select>, so check its props and parts with get_component.',
    );
    expect(select?.fix).toBeUndefined();
  });

  it('treats an element the config maps as a drop-in replacement', async () => {
    const system = await load(
      fixture(
        {
          'tsconfig.json': TSCONFIG,
          'design-system-mcp.config.json': '{ "elements": { "a": "TextLink" }, "tokens": [] }',
          'components/ui/link.tsx': `import * as React from "react"
export function TextLink(props: { href: string; children?: React.ReactNode }) {
  return <span data-href={props.href}>{props.children}</span>
}`,
        },
        { nodeModules: true },
      ),
    );
    const code = `<a href="/docs">Docs</a>`;
    const diagnostics = check(code, rule, system);
    expect(diagnostics[0]?.message).toBe(
      'Native <a> where the design system has <TextLink>. Use <TextLink> (import { TextLink } from "@/components/ui/link").',
    );
    expect(applyFixes(code, diagnostics)).toBe(`<TextLink href="/docs">Docs</TextLink>`);
  });

  it('never suggests a part of another component', async () => {
    const system = await load(
      fixture({
        'components/ui/breadcrumb.tsx': `import * as React from "react"
export function Breadcrumb(props: React.ComponentProps<"nav">) {
  return <nav aria-label="breadcrumb" {...props} />
}
export function BreadcrumbLink(props: React.ComponentProps<"a">) {
  return <a {...props} />
}`,
      }),
    );
    expect(system.getComponent('BreadcrumbLink')).toMatchObject({
      element: 'a',
      parent: 'Breadcrumb',
    });
    expect(check(`<a href="/docs">Docs</a>`, rule, system)).toEqual([]);
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

describe('design-system imports', () => {
  const rule = 'no-unknown-component';

  it('resolves relative imports against the checked file', () => {
    const code = `import AcmeLogo from "./ui/acme-logo"
import { LatestInvoices } from "../lib/ui/invoices"
import { Button } from "../components/ui/button"
import { Stack } from "../components/ui/stack"
export default () => <main><AcmeLogo /><LatestInvoices /><Button variant="danger" /><Stack /></main>`;
    const diagnostics = ds.check(code, 'app/page.tsx').diagnostics;
    expect(diagnostics.map((d) => [d.ruleId, d.source])).toEqual([
      ['no-unknown-variant', '"danger"'],
      [rule, 'Stack'],
    ]);
    expect(
      check(`import { Button } from "./components/ui/button"\n<Button size="xl" />`),
    ).toHaveLength(1);
  });

  it('resolves barrel imports of the component directory', () => {
    for (const [code, file] of [
      [`import { Button } from "@/components/ui"\n<Button variant="danger" />`, 'app/page.tsx'],
      [`import * as UI from "@/components/ui"\n<UI.Button variant="danger" />`, 'app/page.tsx'],
      [`import { Button } from "../components/ui"\n<Button variant="danger" />`, 'app/page.tsx'],
      [
        `import { Button } from "../../components/ui/index"\n<Button variant="danger" />`,
        'app/a/page.tsx',
      ],
      [`import { Button } from "."\n<Button variant="danger" />`, 'components/ui/form.tsx'],
    ] as const) {
      expect(ds.check(code, file).diagnostics.map((d) => d.ruleId)).toEqual(['no-unknown-variant']);
    }
    expect(
      ds.check(`import * as UI from "@/components/ui"\n<UI.Buton />`, 'app/page.tsx').diagnostics,
    ).toMatchObject([{ ruleId: rule, suggestion: '<Button>' }]);
    expect(
      ds.check(`import { Thing } from "@/components/uikit"\n<Thing />`, 'app/page.tsx').diagnostics,
    ).toEqual([]);
  });

  it('treats a configured package name as one module, not a scope', async () => {
    const config = await loadConfig({ root: ACME_ROOT });
    const acme = await loadDesignSystem({ ...config, importPath: '@acme/ui' }, { cache: false });
    const code = `import { Button } from "@acme/ui"
import { Card } from "@acme/ui/card"
import { TrashIcon } from "@acme/icons"
import { Buton } from "@acme/ui"
export default () => <Card><Button aria-label="Delete"><TrashIcon /></Button><Buton /></Card>`;
    expect(acme.check(code).diagnostics.map((d) => [d.ruleId, d.suggestion])).toEqual([
      [rule, '<Button>'],
    ]);
  });

  it('resolves a default import under any local name', async () => {
    const acme = await loadOnce(ACME_ROOT);
    const code = `import Field from "@acme/text-field"\n<Field label="Name" />`;
    expect(acme.check(code).diagnostics).toEqual([]);
    expect(
      acme.check(`import Field from "@acme/text-field"\n<Field labl="Name" />`).diagnostics[0],
    ).toMatchObject({ ruleId: 'no-unknown-prop', suggestion: 'label' });
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

  it('does not offer a rename that would duplicate an attribute', () => {
    const code = `import { Dialog } from "@/components/ui/dialog"\n<Dialog isOpen={a} open={b} />`;
    const [d] = check(code, rule);
    expect(d).toMatchObject({ source: 'isOpen', suggestion: 'open' });
    expect(d?.fix).toBeUndefined();
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
      `<Button size="icon"><svg viewBox="0 0 24 24"><title>Close</title><path /></svg></Button>`,
      `<Button><FormattedMessage id="save" /></Button>`,
      `<Button><Trans i18nKey="save" /></Button>`,
    ];
    for (const code of ok) expect(check(`${IMPORTS}${code}`, rule), code).toEqual([]);
  });

  it('still flags an empty aria-label', () => {
    expect(check(`<button aria-label=""><svg /></button>`, rule)).toHaveLength(1);
    expect(check(`<button><svg><title> </title></svg></button>`, rule)).toHaveLength(1);
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

  it('parses .ts files as TypeScript, not TSX', () => {
    expect(
      ds.check('export const id = <T,>(x: T) => x;\nconst y = <T>(x: T) => x;', 'util.ts')
        .diagnostics,
    ).toEqual([]);
  });

  it('stays linear on huge names: typo suggestions skip candidates by length', () => {
    const name = 'v'.repeat(1_000_000);
    const started = performance.now();
    const diagnostics = check(
      `${IMPORTS}<><Button ${name}="x" variant="${name}" /><${name.replace(/^v/, 'B')} /></>`,
    );
    expect(performance.now() - started).toBeLessThan(2000);
    expect(diagnostics.map((d) => [d.ruleId, d.suggestion])).toEqual([
      ['no-unknown-prop', undefined],
      ['no-unknown-variant', undefined],
      ['no-unknown-component', undefined],
    ]);
    expect(
      check(`${IMPORTS}<Button variant="destructiv" sise="sm" />`).map((d) => d.suggestion),
    ).toEqual(['variant="destructive"', 'size']);
  });

  it('reports syntax errors and parses .jsx as JSX', () => {
    const [d] = ds.check('<div className="x"', 'broken.tsx').diagnostics;
    expect(d?.ruleId).toBe('syntax');
    expect(ds.check('const a = <Buton />', 'file.jsx').diagnostics[0]?.ruleId).toBe(
      'no-unknown-component',
    );
  });

  it('does not count a byte-order mark as a column, and keeps fix offsets on the text', () => {
    const code = '\uFEFF<button>x</button>';
    const [d] = ds.check(code).diagnostics;
    expect(d).toMatchObject({ line: 1, column: 2, endColumn: 8, source: 'button' });
    expect(applyFixes(code, d ? [d] : [])).toBe('\uFEFF<Button>x</Button>');
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
