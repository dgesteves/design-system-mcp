---
component: Button
status: stable
---

# Button

Triggers an action: submitting a form, opening a dialog, saving or deleting a record.

## When to use

- Use **one** `default` (primary) button per view for the main action.
- Use `secondary` or `outline` for the alternatives next to it.
- Use `destructive` for irreversible actions such as deleting a project or revoking access. Confirm them with a `Dialog` first.
- Use `ghost` inside toolbars and dense tables, and `link` for low-emphasis navigation.
- Do not use a `<div>` or a native `<button>` with custom classes: the variants already cover hover, focus and disabled states.

## Accessibility

Icon-only buttons (`size="icon"`) have no visible text, so they **must** have an `aria-label`. Prefer a text button when there is room.

## Examples

```tsx title="Primary and secondary actions"
<div className="flex gap-2">
  <Button>Save changes</Button>
  <Button variant="outline">Cancel</Button>
</div>
```

```tsx title="Destructive action"
<Button variant="destructive">Delete project</Button>
```

```tsx title="Icon button"
<Button variant="ghost" size="icon" aria-label="Delete row">
  <Trash2 />
</Button>
```

```tsx title="As a link"
<Button asChild variant="link">
  <a href="/docs">Read the docs</a>
</Button>
```
