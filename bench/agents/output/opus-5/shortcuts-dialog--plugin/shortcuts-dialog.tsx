"use client";

import type { ComponentProps } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Shortcut = {
  label: string;
  keys: string[];
};

const SHORTCUTS: Shortcut[] = [
  { label: "New chat", keys: ["⌘", "K"] },
  { label: "Toggle sidebar", keys: ["⌘", "B"] },
  { label: "Copy last answer", keys: ["⌘", "⇧", "C"] },
];

// Symbols screen readers would otherwise announce by their Unicode name.
const KEY_NAMES: Record<string, string> = {
  "⌘": "Command",
  "⇧": "Shift",
};

function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <div className="flex items-center justify-end gap-1">
      {keys.map((key) => (
        <kbd
          aria-label={KEY_NAMES[key]}
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-4xl bg-muted-foreground/10 px-1.5 font-medium font-sans text-foreground text-xs"
          data-slot="kbd"
          key={key}
        >
          {key}
        </kbd>
      ))}
    </div>
  );
}

export function ShortcutsDialog({
  children,
  ...props
}: ComponentProps<typeof Dialog>) {
  return (
    <Dialog {...props}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent data-testid="shortcuts-dialog">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Move around the chat without leaving the keyboard.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-3">
          {SHORTCUTS.map((shortcut) => (
            <div className="contents" key={shortcut.label}>
              <dt className="text-foreground text-sm">{shortcut.label}</dt>
              <dd>
                <ShortcutKeys keys={shortcut.keys} />
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
