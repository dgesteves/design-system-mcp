import { beforeAll, describe, expect, it } from 'vitest';

import type { DesignSystem } from '../src/design-system.js';
import type { ComponentInfo } from '../src/types.js';
import { ACME_ROOT, DEMO_ROOT, loadOnce } from './helpers.js';

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
