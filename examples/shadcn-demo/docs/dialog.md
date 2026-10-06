---
component: Dialog
---

# Dialog

A modal window that interrupts the user to confirm a decision or collect a small amount of input. Focus is trapped inside until it closes.

## When to use

- Confirm a destructive or irreversible action ("Delete workspace?") before running it.
- Collect two or three fields without leaving the page.
- Do not use it for long forms or for content the user needs to compare with the page behind it.

## Anatomy

`Dialog` > `DialogTrigger` + `DialogContent` > `DialogHeader` (`DialogTitle`, `DialogDescription`) + `DialogFooter`.
`DialogTitle` is required: it is the dialog's accessible name.

## Examples

```tsx title="Confirm a destructive action"
<Dialog>
  <DialogTrigger asChild>
    <Button variant="destructive">Delete workspace</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Delete this workspace?</DialogTitle>
      <DialogDescription>
        This permanently deletes all projects and members. It cannot be undone.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <DialogClose asChild>
        <Button variant="outline">Cancel</Button>
      </DialogClose>
      <Button variant="destructive">Delete workspace</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```
