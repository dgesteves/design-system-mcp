"use client";

import { RefreshCwIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback } from "react";
import { toast } from "sonner";
import { useCopyToClipboard } from "usehooks-ts";
import { cn } from "@/lib/utils";
import {
  MessageAction as Action,
  MessageActions as Actions,
  MessageToolbar as Toolbar,
} from "../ai-elements/message";
import { CopyIcon, ThumbDownIcon, ThumbUpIcon } from "./icons";

export type MessageToolbarProps = ComponentProps<typeof Toolbar> & {
  /** Text copied by the copy action. */
  content?: string;
  /** Disables every action, e.g. while the response is still streaming. */
  disabled?: boolean;
  onRegenerate?: () => void;
  onUpvote?: () => void;
  onDownvote?: () => void;
  /** Current feedback for the message, used to mark the active thumb. */
  vote?: "up" | "down" | null;
};

const actionClassName = "text-muted-foreground/50 hover:text-foreground";
const activeActionClassName = "text-foreground";

export function MessageToolbar({
  className,
  content,
  disabled,
  onRegenerate,
  onUpvote,
  onDownvote,
  vote,
  ...props
}: MessageToolbarProps) {
  const [_, copyToClipboard] = useCopyToClipboard();

  const handleCopy = useCallback(async () => {
    const text = content?.trim();

    if (!text) {
      toast.error("There's no text to copy!");
      return;
    }

    await copyToClipboard(text);
    toast.success("Copied to clipboard!");
  }, [content, copyToClipboard]);

  return (
    <Toolbar
      className={cn("mt-2 justify-start", className)}
      data-testid="message-toolbar"
      {...props}
    >
      <Actions className="-ml-0.5">
        <Action
          className={actionClassName}
          data-testid="message-toolbar-copy"
          disabled={disabled}
          onClick={handleCopy}
          tooltip="Copy"
        >
          <CopyIcon />
        </Action>

        {onRegenerate ? (
          <Action
            className={actionClassName}
            data-testid="message-toolbar-regenerate"
            disabled={disabled}
            onClick={onRegenerate}
            tooltip="Regenerate"
          >
            <RefreshCwIcon />
          </Action>
        ) : null}

        <Action
          aria-pressed={vote === "up"}
          className={cn(actionClassName, vote === "up" && activeActionClassName)}
          data-testid="message-toolbar-upvote"
          disabled={disabled || vote === "up"}
          onClick={onUpvote}
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
          data-testid="message-toolbar-downvote"
          disabled={disabled || vote === "down"}
          onClick={onDownvote}
          tooltip="Bad response"
        >
          <ThumbDownIcon />
        </Action>
      </Actions>
    </Toolbar>
  );
}
