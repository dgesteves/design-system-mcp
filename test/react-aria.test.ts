import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import type { DesignSystem } from '../src/design-system.js';
import { renderComponent } from '../src/server/render.js';
import { fixture, load, loadOnce, DEMO_ROOT, TSCONFIG } from './helpers.js';

/** A React Aria Components design system in the style of Jolly UI and React Aria's starter. */
const RAC_ROOT = path.resolve(import.meta.dirname, 'fixtures/rac-ui');

let rac: DesignSystem;
beforeAll(async () => {
  rac = await loadOnce(RAC_ROOT);
});

function component(name: string, system = rac) {
  const found = system.getComponent(name);
  if (!found) throw new Error(`no ${name}`);
  return found;
}

describe('React Aria Components contracts', () => {
  it('lists the variants callers choose, not the render states tv() styles, once each', () => {
    expect(component('Button').variants.map((v) => [v.name, v.values])).toEqual([
      ['variant', ['primary', 'secondary', 'destructive', 'quiet']],
    ]);
    // Two definitions style the checkbox; isDisabled, isSelected and isInvalid are states.
    expect(component('Checkbox').variants.map((v) => [v.name, v.values])).toEqual([
      ['size', ['sm', 'md']],
    ]);
  });

  it('keeps the props a state key styles as documented props', () => {
    const props = component('Checkbox').props;
    for (const name of ['isSelected', 'isInvalid', 'isDisabled']) {
      const prop = props.find((p) => p.name === name);
      if (prop) {
        expect(prop.kind).toBe('prop');
        expect(prop.description).toBeTruthy();
      }
    }
    expect(props.every((p) => p.description)).toBe(true);
    expect(component('Button').props.find((p) => p.name === 'isDisabled')).toMatchObject({
      kind: 'prop',
      type: 'boolean',
    });
  });

  it('summarises inherited props by the ones React Aria callers need', () => {
    const button = renderComponent(rac, component('Button'));
    expect(button).toMatch(/plus \d+ props from @react-types\/shared \(onPress, /);
    expect(button).not.toMatch(/\(onClick/);
    const field = renderComponent(rac, component('TextField'));
    expect(field).toMatch(/\(onChange, value, defaultValue, isDisabled, isRequired, isReadOnly/);
  });

  it('keeps a container defined next to its item as a component of its own', () => {
    expect(component('Checkbox').subcomponents).toEqual([]);
    expect(component('CheckboxGroup').parent).toBeUndefined();
    expect(renderComponent(rac, component('CheckboxGroup'))).not.toContain('Part of');
  });

  it('accepts idiomatic React Aria usage', () => {
    const code = `import { Button } from "@/components/ui/button"
import { Checkbox, CheckboxGroup } from "@/components/ui/checkbox"
import { DialogTrigger } from "@/components/ui/dialog"
export function Settings({ save }: { save: () => void }) {
  return (
    <DialogTrigger isOpen onOpenChange={() => {}}>
      <Button variant="destructive" isPending={false} isDisabled onPress={save}>
        {({ isPending }) => (isPending ? "Saving" : "Save")}
      </Button>
      <CheckboxGroup aria-label="Notify">
        <Checkbox value="email" size="sm" isSelected isInvalid={false}>Email</Checkbox>
      </CheckboxGroup>
    </DialogTrigger>
  )
}`;
    expect(rac.check(code, 'app/settings.tsx').diagnostics).toEqual([]);
  });
});

describe('composition', () => {
  it('still links families with containers among other parts', async () => {
    const demo = await loadOnce(DEMO_ROOT);
    expect(component('Dialog', demo).subcomponents).toContain('DialogTrigger');
    const system = await load(
      fixture({
        'tsconfig.json': TSCONFIG,
        'components/ui/select.tsx': `export function Select(props: { children?: unknown }) { return <div>{props.children as string}</div> }
export function SelectGroup(props: { children?: unknown }) { return <div>{props.children as string}</div> }
export function SelectItem(props: { children?: unknown }) { return <div>{props.children as string}</div> }`,
        'components/ui/radio-group.tsx': `export function RadioGroup(props: { children?: unknown }) { return <div>{props.children as string}</div> }
export function Radio(props: { children?: unknown }) { return <label>{props.children as string}</label> }`,
      }),
    );
    expect(component('Select', system).subcomponents).toEqual(['SelectGroup', 'SelectItem']);
    expect(component('Radio', system).subcomponents).toEqual([]);
    expect(component('RadioGroup', system).parent).toBeUndefined();
  });
});

describe('deprecated inherited props', () => {
  it('are recorded and left out of the summary', async () => {
    const many = Array.from({ length: 45 }, (_, i) => `  prop${String(i)}?: string`).join('\n');
    const system = await load(
      fixture({
        'tsconfig.json': TSCONFIG,
        'node_modules/acme-primitives/package.json': JSON.stringify({
          name: 'acme-primitives',
          types: 'index.d.ts',
        }),
        'node_modules/acme-primitives/index.d.ts': `export interface PressableProps {
  /** @deprecated Use onPress. */
  onClick?: () => void
  onPress?: () => void
  id?: string
${many}
}`,
        'components/ui/pressable.tsx': `import type { PressableProps } from "acme-primitives"
export function Pressable(props: PressableProps) { return <div id={props.id} /> }`,
      }),
    );
    const pressable = component('Pressable', system);
    expect(pressable.inherits[0]).toMatchObject({
      from: 'acme-primitives',
      deprecated: ['onClick'],
    });
    const text = renderComponent(system, pressable);
    expect(text).toMatch(/plus \d+ props from acme-primitives \(onPress, /);
    expect(text).not.toContain('onClick');
  });
});
