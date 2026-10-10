---
'onsystem': minor
---

Fewer false positives from the component rules, measured on the real-world corpus:

- `prefer-design-system-component` suggests a component for a native element only when the component is named for it (`Button`, `Link`, `Input`, `TextField`, `Label`, `Select`, `Textarea`, `Image`, `Separator`…), or when it renders the element and needs nothing the element does not (no required props of its own, and the element's attributes). `<button>` no longer becomes `<DataTableColumnHeader>`, `<label>` no longer becomes `<FileUpload>`, and `<img>` no longer becomes `<Avatar>`. Inside a component of the same name (a design system's own `Table` around a `<table>`), the element is left alone. `<hr>` now suggests a `Separator`.
- `icon-button-accessible-name` counts a child as an icon only when it looks like one: imported from an icon library or an icons module, or named like an icon (`XIcon`, `Trash2`). A child with text in its props (`<IconMenu text="Export">`) or an unknown component makes it skip. A conditional `render={cond ? undefined : <button />}` is followed, a rendered button's own children count, and a story's `args.render` is skipped.
- `no-unknown-component` no longer calls a component invented when it comes from a module the model left out (an excluded folder, a barrel that re-exports one, a package built to `dist/`). `check` and `check_ui` say once which components were not checked, and `--format json` lists them under `unchecked`. Members of `Object.assign(Root, { Title, Close })` are linked even when they are not exported, a same-named component from another file is no longer taken for the model's, and a tag a local declaration shadows is left alone.
- cva/tv variants come from the definitions on the component (`VariantProps<typeof x>`, or the className of the element it returns). A definition used further in no longer adds classes to its variants: documenso's Button `size` no longer includes its spinner's `h-5 w-5`.
