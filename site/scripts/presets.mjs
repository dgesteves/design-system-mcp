// Drafts for the playground. Two come from examples/shadcn-demo as they are; these two are
// written here. scripts/generate.mjs checks each against the demo design system and fails
// the build when one stops showing what its description promises.

export const deleteDialog = `import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function DeleteProjectDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog isOpen={open} onOpenChange={onClose}>
      <DialogContent className="rounded-[14px]">
        <DialogHeader>
          <DialogTitle className="text-red-600">Delete project?</DialogTitle>
          <Dialog.Description>Type the project name to confirm.</Dialog.Description>
        </DialogHeader>
        <input className="px-[10px] py-2" placeholder="acme-web" />
        <div className="mt-[18px] flex justify-end gap-2">
          <button onClick={onClose}>
            <X />
          </button>
          <Button variant="error">Delete</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
`;

export const snippet = `<div className="flex items-center gap-[6px]">
  <Badge variant="green">Active</Badge>
  <Button variant="primary" size="small" className="bg-blue-600 px-[18px]">
    Save
  </Button>
</div>
`;
