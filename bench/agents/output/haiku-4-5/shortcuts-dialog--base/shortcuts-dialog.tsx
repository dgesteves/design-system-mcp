"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const SHORTCUTS = [
  { action: "New chat", keys: ["⌘", "K"] },
  { action: "Toggle sidebar", keys: ["⌘", "B"] },
  { action: "Copy last answer", keys: ["⌘", "⇧", "C"] },
]

function KeyLabel({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium border border-border rounded-md bg-muted text-muted-foreground">
      {children}
    </span>
  )
}

export function ShortcutsDialog() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-6">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.action} className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{shortcut.action}</p>
              <div className="flex gap-1">
                {shortcut.keys.map((key) => (
                  <KeyLabel key={key}>{key}</KeyLabel>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
