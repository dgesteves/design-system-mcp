---
'onsystem': minor
---

Zero config finds design systems it used to miss, and checks each import against the component it leads to.

- **Built packages.** An `exports` target in `dist/` (or `build/`, `lib/`) is read from its source: through the `entry` of a tsup, tsdown or Vite config, read as text and never run, else the same path under `src/`, and `.` from `src/index.*`. Dub's `@dub/ui`, built by tsup, used to give "No design system found"; it now gives 430 components.
- **Barrels.** An export that leads to an `index.ts` stands for the `.tsx` files it re-exports, through `export *`, `export { … } from` and imported bindings exported again, within the package. `@calcom/ui` goes from 4 components to 110.
- **Several design systems.** Workspace design-system packages are added to what `components.json` finds instead of being skipped for it: openstatus's dashboard gets `@openstatus/ui` next to its own `components/ui`, and Cal.com's app `@calcom/ui` next to `@coss/ui`. The one the app's code imports most is the primary: its components win a shared name and are the ones suggested for native elements. `inspect` shows each with its import count.
- **Imports.** A renamed re-export (`export { Table as TableNew }`) is checked against the component declared under its original name, and a module namespace (`export * as RadioAreaGroup`) is no longer taken for a component. A component file a package does not export is left unchecked rather than called invented. A generic component whose props depend on its type argument (Cal.com's `Skeleton<T>`) has open props. Members written as property accesses (`Object.assign(Tooltip, { Root: TooltipPrimitive.Root })`) are extracted.
- **`prefer-design-system-component`** leaves alone the `asChild` child of a component with classes of its own (`<SidebarMenuButton asChild><button>`), a bare `<button />`, `<a />` or `<label />` passed to render into, an element styled by a `cva` or `tv` definition in its own file, and an `<input>` whose every attribute is spread in (react-dropzone's hidden file input).
- `check` leaves out files in `__tests__`, `__stories__` and `__mocks__` folders by default, as it does `*.test.tsx` and `*.stories.tsx`.
