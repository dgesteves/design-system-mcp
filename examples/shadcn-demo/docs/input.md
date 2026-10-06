---
component: Input
---

# Input

A single-line text field for names, emails, search terms and other short values.

## Guidelines

- Always give the input a visible label (`<label htmlFor>`) or an `aria-label`.
- Use the native `type` (`email`, `password`, `search`, `number`) so mobile keyboards and autofill work.
- Show validation errors with `aria-invalid` and a message linked through `aria-describedby`; the error styles come from the component.

## Examples

```tsx title="Labelled field"
<div className="grid gap-2">
  <label htmlFor="email" className="text-sm font-medium">
    Email
  </label>
  <Input id="email" type="email" placeholder="you@example.com" />
</div>
```

```tsx title="Invalid state"
<Input
  aria-invalid
  aria-describedby="email-error"
  defaultValue="not-an-email"
/>
```
