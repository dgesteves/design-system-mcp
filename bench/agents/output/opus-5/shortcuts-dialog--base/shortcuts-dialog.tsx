"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Shortcut = {
  keys: string[];
  label: string;
};

const shortcuts: Shortcut[] = [
  { keys: ["⌘", "K"], label: "New chat" },
  { keys: ["⌘", "B"], label: "Toggle sidebar" },
  { keys: ["⌘", "⇧", "C"], label: "Copy last answer" },
];

function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {keys.map((key) => (
        <kbd
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-4xl bg-muted-foreground/10 px-1.5 font-sans font-medium text-muted-foreground text-xs leading-none"
          data-slot="kbd"
          key={key}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

export function ShortcutsDialog({
  trigger,
  ...props
}: ComponentProps<typeof Dialog> & { trigger?: ReactNode }) {
  return (
    <Dialog {...props}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent data-testid="shortcuts-dialog">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Move around faster with these shortcuts.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[1fr_auto] items-center gap-x-6 rounded-2xl bg-muted/40 p-2">
          {shortcuts.map((shortcut) => (
            <div className="contents" key={shortcut.label}>
              <dt className="px-2 py-1.5 text-foreground text-sm">
                {shortcut.label}
              </dt>
              <dd className="flex justify-end px-2 py-1.5">
                <ShortcutKeys keys={shortcut.keys} />
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
