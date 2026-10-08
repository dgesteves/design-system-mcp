"use client";

import { type FocusEvent, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCopyToClipboard } from "usehooks-ts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircleFillIcon, CopyIcon, LockIcon } from "./icons";

const COPIED_FEEDBACK_MS = 2000;

export function ShareChatDialog({
  onMakePrivate,
  onOpenChange,
  open,
  shareUrl,
}: {
  onMakePrivate?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  shareUrl: string;
}) {
  const [, copyToClipboard] = useCopyToClipboard();
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<number>(0);

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current);
    },
    []
  );

  const handleCopy = useCallback(async () => {
    const copied = await copyToClipboard(shareUrl);

    if (!copied) {
      toast.error("Failed to copy the link!");
      return;
    }

    toast.success("Copied to clipboard!");
    setIsCopied(true);
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(
      () => setIsCopied(false),
      COPIED_FEEDBACK_MS
    );
  }, [copyToClipboard, shareUrl]);

  const handleSelectAll = useCallback(
    (event: FocusEvent<HTMLInputElement>) => event.currentTarget.select(),
    []
  );

  const handleMakePrivate = useCallback(() => {
    onMakePrivate?.();
    onOpenChange(false);
  }, [onMakePrivate, onOpenChange]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent data-testid="share-chat-dialog">
        <DialogHeader>
          <DialogTitle>Share chat</DialogTitle>
          <DialogDescription>
            Anyone with this link can view this chat.
          </DialogDescription>
        </DialogHeader>

        <InputGroup>
          <InputGroupInput
            aria-label="Share link"
            data-testid="share-chat-link"
            onFocus={handleSelectAll}
            readOnly
            value={shareUrl}
          />
          <InputGroupAddon align="inline-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <InputGroupButton
                  aria-label="Copy link"
                  data-testid="share-chat-copy-button"
                  onClick={handleCopy}
                  size="icon-sm"
                >
                  {isCopied ? <CheckCircleFillIcon /> : <CopyIcon />}
                </InputGroupButton>
              </TooltipTrigger>
              <TooltipContent>
                {isCopied ? "Copied!" : "Copy link"}
              </TooltipContent>
            </Tooltip>
          </InputGroupAddon>
        </InputGroup>

        <DialogFooter className="sm:justify-start">
          <Button
            data-testid="share-chat-make-private"
            onClick={handleMakePrivate}
            variant="outline"
          >
            <LockIcon />
            Make private
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
