---
component: Badge
---

# Badge

Shows a short status, count or category next to other content: "Active", "Overdue", "3 new".

## Guidelines

- Keep the label to one or two words.
- Map meaning to variants, not to colors: `success` for healthy or completed states, `destructive` for errors and overdue items, `secondary` for neutral metadata, `outline` for filters and tags.
- Badges are not buttons. Wrap them in a link with `asChild` if they navigate.

## Examples

```tsx title="Status"
<Badge variant="success">Active</Badge>
<Badge variant="destructive">Overdue</Badge>
```

```tsx title="Tag"
<Badge variant="outline">Design system</Badge>
```
