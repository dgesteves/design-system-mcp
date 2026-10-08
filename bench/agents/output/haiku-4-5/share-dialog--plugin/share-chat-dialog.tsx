"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
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
import { CopyIcon } from "./icons";

type ShareChatDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareLink: string;
  onMakePrivate: () => Promise<void> | void;
};

export function ShareChatDialog({
  open,
  onOpenChange,
  shareLink,
  onMakePrivate,
}: ShareChatDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(shareLink).then(() => {
      toast.success("Link copied to clipboard");
    });
  }, [shareLink]);

  const handleMakePrivate = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.resolve(onMakePrivate());
      onOpenChange(false);
      toast.success("Chat is now private");
    } catch {
      toast.error("Failed to make chat private");
    } finally {
      setIsLoading(false);
    }
  }, [onMakePrivate, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share chat</DialogTitle>
          <DialogDescription>
            Anyone with this link can view your chat
          </DialogDescription>
        </DialogHeader>

        <InputGroup>
          <InputGroupInput
            type="text"
            value={shareLink}
            readOnly
            aria-label="Share link"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-sm"
              onClick={handleCopyLink}
              aria-label="Copy link"
            >
              <CopyIcon size={16} />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={handleMakePrivate}
            disabled={isLoading}
          >
            Make private
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
