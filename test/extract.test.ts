import { beforeAll, describe, expect, it } from 'vitest';

import type { DesignSystem } from '../src/design-system.js';
import type { ComponentInfo } from '../src/types.js';
import { ACME_ROOT, DEMO_ROOT, fixture, load, loadOnce, TSCONFIG } from './helpers.js';

function component(ds: DesignSystem, name: string): ComponentInfo {
  const found = ds.getComponent(name);
  if (!found) throw new Error(`missing component ${name}`);
  return found;
}

function prop(c: ComponentInfo, name: string) {
  const found = c.props.find((p) => p.name === name);
  if (!found) throw new Error(`missing prop ${c.name}.${name}`);
  return found;
}

describe('extraction from a shadcn/ui-style system (types resolved)', () => {
  let ds: DesignSystem;
  beforeAll(async () => {
    ds = await loadOnce(DEMO_ROOT);
  });

  it('finds every exported component and groups flat parts under their root', () => {
    expect(ds.roots().map((c) => c.name)).toEqual(['Badge', 'Button', 'Card', 'Dialog', 'Input']);
    expect(component(ds, 'Card').subcomponents).toEqual([
      'CardHeader',
      'CardFooter',
      'CardTitle',
      'CardAction',
      'CardDescription',
      'CardContent',
    ]);
    expect(component(ds, 'DialogContent').parent).toBe('Dialog');
    expect(ds.model.warnings).toEqual([]);
  });

  it('reads cva variants with values, defaults and classes', () => {
    const button = component(ds, 'Button');
    expect(button.variants.map((v) => [v.name, v.values, v.default])).toEqual([
      ['variant', ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'], 'default'],
      ['size', ['default', 'sm', 'lg', 'icon'], 'default'],
    ]);
    expect(button.variants[0]?.classes.destructive).toContain('bg-destructive');
    expect(prop(button, 'variant')).toMatchObject({
      kind: 'variant',
      required: false,
      default: '"default"',
    });
  });

  it('documents own props with JSDoc and destructuring defaults', () => {
    expect(prop(component(ds, 'Button'), 'asChild')).toMatchObject({
      type: 'boolean',
      default: 'false',
      required: false,
      description: expect.stringContaining('Render the child element') as string,
    });
    expect(prop(component(ds, 'DialogContent'), 'showCloseButton').default).toBe('true');
  });

  it('summarises inherited DOM props and keeps their names for linting', () => {
    const button = component(ds, 'Button');
    expect(button.openProps).toBe(false);
    expect(button.inherits).toHaveLength(1);
    const inherited = button.inherits[0];
    expect(inherited?.from).toBe('React.ComponentProps<"button">');
    expect(inherited?.count).toBeGreaterThan(200);
    const names = ds.model.propSets[inherited?.set ?? ''] ?? [];
    expect(names).toEqual(expect.arrayContaining(['onClick', 'disabled', 'type', 'aria-label']));
  });

  it('lists props contributed by other packages individually', () => {
    const dialog = component(ds, 'Dialog');
    expect(prop(dialog, 'onOpenChange')).toMatchObject({ type: '(open: boolean) => void' });
    expect(prop(dialog, 'open').description).toContain('@radix-ui/react-dialog');
  });

  it('infers the native element and import path', () => {
    expect(component(ds, 'Button')).toMatchObject({
      element: 'button',
      importPath: '@/components/ui/button',
    });
    expect(component(ds, 'Input').element).toBe('input');
    expect(component(ds, 'Badge').element).toBe('span');
    expect(component(ds, 'Dialog').element).toBeUndefined();
  });

  it('collects class names and attaches docs and examples', () => {
    const button = component(ds, 'Button');
    expect(button.classNames).toContain('bg-primary');
    expect(button.docs?.file).toBe('docs/button.md');
    expect(button.examples.map((e) => e.title)).toContain('Destructive action');
    expect(ds.relatedTokens(button).map((t) => t.name)).toEqual(
      expect.arrayContaining(['primary', 'destructive', 'ring', 'radius-md']),
    );
  });
});

describe('props that extend an imported interface', () => {
  const files = {
    'tsconfig.json': TSCONFIG,
    'components/ui/button.tsx': `import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
const buttonVariants = cva("", { variants: { variant: { default: "", outline: "" } } })
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => <button ref={ref} {...props} />)
`,
    'components/ui/submit-button.tsx': `import { Button, type ButtonProps } from "./button"
export function SubmitButton({ isSubmitting, ...props }: { isSubmitting: boolean } & ButtonProps) {
  return <Button disabled={isSubmitting} {...props} />
}
`,
  };
  const code = `import { SubmitButton } from "@/components/ui/submit-button"
export const A = () => <SubmitButton isSubmitting variant="outline" className="w-full" onClick={() => {}} />`;

  it('marks the props open when that interface extends types that do not resolve', async () => {
    const ds = await load(fixture(files));
    expect(component(ds, 'SubmitButton').openProps).toBe(true);
    expect(ds.check(code, 'app/a.tsx').diagnostics).toEqual([]);
  });

  it('sees through type arguments, aliases in other files and long interface chains', async () => {
    const chain = Array.from(
      { length: 8 },
      (_, i) => `export interface P${i} extends ${i === 7 ? 'ButtonProps' : `P${i + 1}`} {}`,
    ).join('\n');
    const ds = await load(
      fixture({
        ...files,
        'components/ui/types.ts': `import type { ButtonProps } from "./button"\nexport type Props = ButtonProps\n${chain}\n`,
        'components/ui/omit.tsx': `import { Button, type ButtonProps } from "./button"
export function OmitButton(props: { label: string } & Omit<ButtonProps, "type">) { return <Button {...props} /> }
`,
        'components/ui/aliased.tsx': `import type { Props } from "./types"
export function AliasedButton(props: { label: string } & Props) { return <button {...props} /> }
`,
        'components/ui/chained.tsx': `import type { P0 } from "./types"
export function ChainedButton(props: { label: string } & P0) { return <button {...props} /> }
`,
        'components/ui/closed.tsx': `export interface Base { tone?: "a" | "b" }
export interface Closed extends Base { size?: "sm" }
export function ClosedBadge(props: { label: string } & Closed) { return <span /> }
`,
      }),
    );
    for (const name of ['OmitButton', 'AliasedButton', 'ChainedButton']) {
      expect([name, component(ds, name).openProps]).toEqual([name, true]);
    }
    // A chain that resolves stays closed, so unknown props are still caught.
    expect(component(ds, 'ClosedBadge').openProps).toBe(false);
    expect(
      ds
        .check(
          `import { ClosedBadge } from "@/components/ui/closed"\n<ClosedBadge label="x" tone="a" bogus />`,
          'app/a.tsx',
        )
        .diagnostics.map((d) => d.message),
    ).toEqual(['<ClosedBadge> has no prop "bogus".']);
  });

  it('resolves them fully when the types are installed', async () => {
    const ds = await load(fixture(files, { nodeModules: true }));
    const submit = component(ds, 'SubmitButton');
    expect(submit.openProps).toBe(false);
    expect(submit.props.map((p) => p.name)).toEqual(
      expect.arrayContaining(['isSubmitting', 'variant']),
    );
    expect(ds.check(code, 'app/a.tsx').diagnostics).toEqual([]);
    expect(
      ds
        .check(code.replace('variant="outline"', 'variant="danger"'), 'app/a.tsx')
        .diagnostics.map((d) => d.ruleId),
    ).toEqual(['no-unknown-variant']);
  });
});

describe('extraction without node_modules (fixture)', () => {
  let ds: DesignSystem;
  beforeAll(async () => {
    ds = await loadOnce(ACME_ROOT);
  });

  it('handles forwardRef, interfaces and cva even when React types are missing', () => {
    const button = component(ds, 'Button');
    expect(button.element).toBe('button');
    expect(button.openProps).toBe(true);
    expect(button.props.map((p) => p.name)).toEqual([
      'intent',
      'size',
      'fullWidth',
      'loading',
      'danger',
    ]);
    expect(prop(button, 'intent')).toMatchObject({
      values: ['primary', 'secondary', 'danger'],
      default: '"primary"',
    });
    expect(prop(button, 'fullWidth')).toMatchObject({ type: 'boolean', kind: 'variant' });
    expect(prop(button, 'loading')).toMatchObject({
      default: 'false',
      description: 'Shows a spinner and disables the button.',
    });
    expect(prop(button, 'danger').deprecated).toBe('Use `intent="danger"`.');
    expect(button.compoundVariants).toEqual([
      { when: { intent: ['primary', 'danger'], size: 'sm' }, classes: 'font-semibold' },
    ]);
  });

  it('reads literal unions, required props and @default tags', () => {
    const alert = component(ds, 'Alert');
    expect(alert.openProps).toBe(false);
    expect(prop(alert, 'tone')).toMatchObject({
      type: 'AlertTone',
      required: true,
      values: ['info', 'warning', 'danger'],
    });
    expect(prop(alert, 'title').required).toBe(true);
    expect(prop(alert, 'dismissible').default).toBe('false');
    expect(prop(alert, 'onDismiss').type).toBe('() => void');
  });

  it('understands Object.assign and static-member compounds', () => {
    expect(component(ds, 'Tabs').subcomponents).toEqual(['Tabs.List', 'Tabs.Trigger']);
    expect(component(ds, 'Tabs.Trigger')).toMatchObject({ parent: 'Tabs', element: 'button' });
    expect(prop(component(ds, 'Tabs.List'), 'label').required).toBe(false);
    expect(component(ds, 'Card').subcomponents).toEqual(['CardFooter', 'Card.Header']);
    expect(prop(component(ds, 'Card.Header'), 'title').required).toBe(true);
    expect(ds.getComponent('CardHeader')?.name).toBe('Card.Header');
  });

  it('takes variants from the definitions on the component, not those of what it renders inside', async () => {
    // documenso's Button: loaderVariants sizes the spinner inside, and its size must not leak.
    const button = await load(
      fixture({
        'tsconfig.json': TSCONFIG,
        'components/ui/button.tsx': `import { cva, type VariantProps } from "class-variance-authority"
const buttonVariants = cva("inline-flex", {
  variants: { size: { default: "h-10 px-4", sm: "h-9 px-3" } },
  defaultVariants: { size: "default" },
})
const loaderVariants = cva("animate-spin", {
  variants: { size: { default: "h-5 w-5", sm: "h-4 w-4", lg: "h-6 w-6" } },
})
export interface ButtonProps extends VariantProps<typeof buttonVariants> {
  loading?: boolean
  className?: string
  children?: string
}
export function Button({ size, loading, className, children }: ButtonProps) {
  return (
    <button className={buttonVariants({ size, className })}>
      {loading && <span className={loaderVariants({ size })} />}
      {children}
    </button>
  )
}`,
      }),
    );
    expect(component(button, 'Button').variants).toEqual([
      {
        name: 'size',
        values: ['default', 'sm'],
        classes: { default: 'h-10 px-4', sm: 'h-9 px-3' },
        default: 'default',
      },
    ]);
  });

  it('links Object.assign members written as shorthand, exported or not', async () => {
    // dub's Sheet = Object.assign(SheetRoot, { Title, Description, Close }).
    const sheet = await load(
      fixture({
        'tsconfig.json': TSCONFIG,
        'components/ui/sheet.tsx': `function SheetRoot(props: { open?: boolean; children?: string }) { return <div>{props.children}</div> }
function Title(props: { className?: string; children?: string }) { return <h2 {...props} /> }
function Close(props: { children?: string }) { return <button {...props} /> }
export const Sheet = Object.assign(SheetRoot, { Title, Close })`,
      }),
    );
    expect(component(sheet, 'Sheet').subcomponents).toEqual(['Sheet.Title', 'Sheet.Close']);
    expect(component(sheet, 'Sheet.Close')).toMatchObject({ parent: 'Sheet', element: 'button' });
    const used = sheet.check(
      `import { Sheet } from "@/components/ui/sheet"\n<Sheet><Sheet.Title>Edit</Sheet.Title><Sheet.Close /></Sheet>`,
    );
    expect(used.diagnostics.filter((d) => d.ruleId === 'no-unknown-component')).toEqual([]);
  });

  it('handles memo, default exports and class components, and skips non-components', () => {
    expect(component(ds, 'TextField').props.map((p) => p.name)).toEqual(['label', 'error']);
    expect(prop(component(ds, 'Legacy'), 'legacyProp').type).toBe('number');
    expect(ds.getComponent('NotAComponent')).toBeUndefined();
    expect(ds.getComponent('helper')).toBeUndefined();
  });

  it('uses tsconfig paths for import paths and JSDoc @example for examples', () => {
    const button = component(ds, 'Button');
    expect(button.importPath).toBe('@acme/button');
    expect(button.examples.find((e) => e.source === 'jsdoc')?.code).toBe(
      '<Button intent="danger">Delete</Button>',
    );
  });
});

describe('components defined as aliases of library components', () => {
  // shadcn/ui's Radix-era dialog.tsx and its form.tsx.
  const files = {
    'tsconfig.json': TSCONFIG,
    'components/ui/dialog.tsx': `"use client"
import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
/** Not a component: the namespace itself. */
const DialogParts = DialogPrimitive

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Content ref={ref} className={className} {...props} />
))

export { Dialog, DialogTrigger, DialogContent, DialogParts }
`,
    'components/ui/form.tsx': `import * as React from "react"
import { FormProvider } from "react-hook-form"

const Form = FormProvider

function FormItem(props: React.ComponentProps<"div">) {
  return <div {...props} />
}

export { Form, FormItem }
`,
  };
  // react-hook-form is not installed in the demo; a minimal package stands in for it.
  const typed = {
    ...files,
    'node_modules/react-hook-form/package.json':
      '{ "name": "react-hook-form", "types": "index.d.ts" }',
    'node_modules/react-hook-form/index.d.ts': `import type * as React from "react"
export interface FormProviderProps<T> { children: React.ReactNode; control: T }
export declare const FormProvider: <T>(props: FormProviderProps<T>) => React.JSX.Element
`,
  };
  const usage = `import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { Form, FormItem } from "@/components/ui/form"

export function X({ form }: { form: object }) {
  return (
    <Form {...form}>
      <FormItem />
      <Dialog modal><DialogTrigger asChild>Open</DialogTrigger><DialogContent>Hi</DialogContent></Dialog>
    </Form>
  )
}`;

  it('reads props from the call signature when the types resolve', async () => {
    const ds = await load(fixture(typed, { nodeModules: true }));
    expect(ds.components.map((c) => c.name).sort()).toEqual([
      'Dialog',
      'DialogContent',
      'DialogTrigger',
      'Form',
      'FormItem',
    ]);
    const dialog = component(ds, 'Dialog');
    expect(dialog).toMatchObject({
      openProps: false,
      subcomponents: ['DialogTrigger', 'DialogContent'],
    });
    expect(prop(dialog, 'onOpenChange').description).toContain('@radix-ui/react-dialog');
    const trigger = component(ds, 'DialogTrigger');
    expect(trigger.parent).toBe('Dialog');
    expect(trigger.inherits[0]?.count).toBeGreaterThan(200);
    expect(
      component(ds, 'Form')
        .props.map((p) => p.name)
        .sort(),
    ).toEqual(['children', 'control']);

    expect(ds.check(usage, 'app/x.tsx').diagnostics).toEqual([]);
    const [d] = ds.check(`${usage}\n<Dialog isOpen />`, 'app/x.tsx').diagnostics;
    expect(d).toMatchObject({ ruleId: 'no-unknown-prop', suggestion: 'open' });
  });

  it('keeps them, with open props, when the library types are not installed', async () => {
    const ds = await load(fixture(files));
    expect(component(ds, 'Dialog').openProps).toBe(true);
    expect(component(ds, 'Form').openProps).toBe(true);
    expect(ds.check(`${usage}\n<Dialog isOpen />`, 'app/x.tsx').diagnostics).toEqual([]);
  });
});
