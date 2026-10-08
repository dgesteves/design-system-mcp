"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ShortcutsDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const shortcuts = [
  { label: "New chat", keys: ["⌘", "K"] },
  { label: "Toggle sidebar", keys: ["⌘", "B"] },
  { label: "Copy last answer", keys: ["⌘", "⇧", "C"] },
];

export function ShortcutsDialog({ open = false, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Use these shortcuts to navigate faster
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6">
          {shortcuts.map((shortcut, index) => (
            <div key={index} className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                {shortcut.label}
              </p>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, keyIndex) => (
                  <div key={keyIndex} className="flex items-center gap-1">
                    <kbd className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                      {key}
                    </kbd>
                    {keyIndex < shortcut.keys.length - 1 && (
                      <span className="text-xs text-muted-foreground">+</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
