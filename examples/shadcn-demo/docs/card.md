---
component: Card
---

# Card

A bordered surface that groups related content and actions, such as a settings section, a summary panel or an item in a grid.

## Anatomy

`Card` is composed from flat parts, not dot-notation members: use `CardHeader`, not `Card.Header`.

- `CardHeader` contains `CardTitle`, `CardDescription` and an optional `CardAction`.
- `CardContent` holds the body.
- `CardFooter` holds actions, aligned to the end.

Cards already have padding and a gap between sections. Do not add `p-*` to the `Card` itself.

## Examples

```tsx title="Settings section"
<Card>
  <CardHeader>
    <CardTitle>Notifications</CardTitle>
    <CardDescription>Choose what we email you about.</CardDescription>
  </CardHeader>
  <CardContent>…</CardContent>
  <CardFooter className="justify-end">
    <Button>Save</Button>
  </CardFooter>
</Card>
```
