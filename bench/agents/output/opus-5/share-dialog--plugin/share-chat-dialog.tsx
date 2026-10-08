"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { useCopyToClipboard } from "usehooks-ts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { CheckCircleFillIcon, CopyIcon, LockIcon } from "./icons";

const COPIED_RESET_MS = 2000;

export function ShareChatDialog({
  onMakePrivate,
  onOpenChange,
  open,
  shareUrl,
}: {
  onMakePrivate: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  shareUrl: string;
}) {
  const linkId = useId();
  const [_, copyToClipboard] = useCopyToClipboard();
  const [copied, setCopied] = useState(false);
  const [isMakingPrivate, setIsMakingPrivate] = useState(false);
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimeout.current) {
        clearTimeout(copiedTimeout.current);
      }
    },
    []
  );

  const handleCopy = useCallback(async () => {
    const didCopy = await copyToClipboard(shareUrl);

    if (!didCopy) {
      toast.error("Failed to copy the link.");
      return;
    }

    toast.success("Link copied to clipboard!");
    setCopied(true);

    if (copiedTimeout.current) {
      clearTimeout(copiedTimeout.current);
    }
    copiedTimeout.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }, [copyToClipboard, shareUrl]);

  const handleMakePrivate = useCallback(async () => {
    setIsMakingPrivate(true);

    try {
      await onMakePrivate();
      onOpenChange(false);
    } finally {
      setIsMakingPrivate(false);
    }
  }, [onMakePrivate, onOpenChange]);

  const handleSelectAll = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      event.currentTarget.select();
    },
    []
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent data-testid="share-chat-dialog">
        <DialogHeader>
          <DialogTitle>Share this chat</DialogTitle>
          <DialogDescription>
            Anyone with the link can view this chat, including any messages you
            add later.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor={linkId}>Share link</Label>
          <InputGroup>
            <InputGroupInput
              data-testid="share-chat-link"
              id={linkId}
              onFocus={handleSelectAll}
              readOnly
              value={shareUrl}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label={copied ? "Link copied" : "Copy link"}
                data-testid="share-chat-copy"
                onClick={handleCopy}
                size="icon-sm"
                variant="ghost"
              >
                {copied ? <CheckCircleFillIcon /> : <CopyIcon />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            data-testid="share-chat-make-private"
            disabled={isMakingPrivate}
            onClick={handleMakePrivate}
            variant="secondary"
          >
            {isMakingPrivate ? <Spinner /> : <LockIcon />}
            Make private
          </Button>
          <DialogClose asChild>
            <Button variant="outline">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
