"use client";

import { useCallback, useState } from "react";
import { CopyIcon, LockIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ShareChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareLink: string;
  onMakePrivate: () => void;
}

export function ShareChatDialog({
  open,
  onOpenChange,
  shareLink,
  onMakePrivate,
}: ShareChatDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [shareLink]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share Chat</DialogTitle>
          <DialogDescription>
            Share this chat with others using the link below
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Share Link</label>
            <InputGroup>
              <InputGroupInput
                value={shareLink}
                readOnly
                data-testid="share-link-input"
              />
              <InputGroupAddon align="inline-end">
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InputGroupButton
                        onClick={handleCopy}
                        data-testid="copy-share-link-button"
                        aria-label="Copy share link"
                      >
                        <CopyIcon className="size-4" />
                      </InputGroupButton>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {copied ? "Copied!" : "Copy link"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </InputGroupAddon>
            </InputGroup>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onMakePrivate}
            data-testid="make-private-button"
          >
            <LockIcon className="size-4" />
            Make Private
          </Button>
          <Button variant="default" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
