"use client";

import { RefreshCwIcon } from "lucide-react";
import { type ComponentProps, useCallback } from "react";
import { toast } from "sonner";
import { useCopyToClipboard } from "usehooks-ts";
import { cn } from "@/lib/utils";
import {
  MessageAction as Action,
  MessageActions as Actions,
} from "../ai-elements/message";
import { CopyIcon, ThumbDownIcon, ThumbUpIcon } from "./icons";

export type MessageToolbarVote = "up" | "down";

export type MessageToolbarProps = Omit<
  ComponentProps<typeof Actions>,
  "children"
> & {
  /** Text copied by the copy button. */
  content: string;
  /** Called after the content has been copied. */
  onCopy?: () => void;
  onRegenerate: () => void;
  onVote: (vote: MessageToolbarVote) => void;
  /** The vote already cast on this message, if any. */
  vote?: MessageToolbarVote | null;
  /** Disables every action, e.g. while the response is streaming. */
  disabled?: boolean;
};

const actionClassName = "text-muted-foreground/50 hover:text-foreground";
const activeActionClassName = "text-foreground";

export function MessageToolbar({
  className,
  content,
  disabled = false,
  onCopy,
  onRegenerate,
  onVote,
  vote,
  ...props
}: MessageToolbarProps) {
  const [, copyToClipboard] = useCopyToClipboard();

  const handleCopy = useCallback(async () => {
    const text = content.trim();

    if (!text) {
      toast.error("There's no text to copy!");
      return;
    }

    await copyToClipboard(text);
    toast.success("Copied to clipboard!");
    onCopy?.();
  }, [content, copyToClipboard, onCopy]);

  const handleUpvote = useCallback(() => {
    onVote("up");
  }, [onVote]);

  const handleDownvote = useCallback(() => {
    onVote("down");
  }, [onVote]);

  return (
    <Actions className={cn("-ml-0.5", className)} {...props}>
      <Action
        className={actionClassName}
        data-testid="message-copy"
        disabled={disabled}
        onClick={handleCopy}
        tooltip="Copy"
      >
        <CopyIcon />
      </Action>

      <Action
        className={actionClassName}
        data-testid="message-regenerate"
        disabled={disabled}
        onClick={onRegenerate}
        tooltip="Regenerate response"
      >
        <RefreshCwIcon />
      </Action>

      <Action
        aria-pressed={vote === "up"}
        className={cn(
          actionClassName,
          vote === "up" && activeActionClassName
        )}
        data-testid="message-upvote"
        disabled={disabled || vote === "up"}
        onClick={handleUpvote}
        tooltip="Good response"
      >
        <ThumbUpIcon />
      </Action>

      <Action
        aria-pressed={vote === "down"}
        className={cn(
          actionClassName,
          vote === "down" && activeActionClassName
        )}
        data-testid="message-downvote"
        disabled={disabled || vote === "down"}
        onClick={handleDownvote}
        tooltip="Bad response"
      >
        <ThumbDownIcon />
      </Action>
    </Actions>
  );
}
