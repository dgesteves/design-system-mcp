"use client";

import { RotateCcwIcon } from "lucide-react";
import { type FC } from "react";
import {
  MessageAction,
  MessageActions,
} from "@/components/ai-elements/message";
import {
  CopyIcon,
  ThumbDownIcon,
  ThumbUpIcon,
} from "@/components/chat/icons";

export type MessageToolbarProps = {
  onCopy?: () => void;
  onRegenerate?: () => void;
  onThumbsUp?: () => void;
  onThumbsDown?: () => void;
  isUpvoted?: boolean;
  isDownvoted?: boolean;
  isLoading?: boolean;
};

export const MessageToolbar: FC<MessageToolbarProps> = ({
  onCopy,
  onRegenerate,
  onThumbsUp,
  onThumbsDown,
  isUpvoted = false,
  isDownvoted = false,
  isLoading = false,
}) => {
  return (
    <MessageActions className="justify-start gap-2">
      <MessageAction
        aria-label="Copy message"
        disabled={isLoading}
        onClick={onCopy}
        tooltip="Copy"
      >
        <CopyIcon size={16} />
      </MessageAction>

      <MessageAction
        aria-label="Regenerate message"
        disabled={isLoading}
        onClick={onRegenerate}
        tooltip="Regenerate"
      >
        <RotateCcwIcon size={16} />
      </MessageAction>

      <MessageAction
        aria-label="Thumbs up"
        disabled={isLoading || isDownvoted}
        onClick={onThumbsUp}
        tooltip="Thumbs up"
      >
        <ThumbUpIcon size={16} />
      </MessageAction>

      <MessageAction
        aria-label="Thumbs down"
        disabled={isLoading || isUpvoted}
        onClick={onThumbsDown}
        tooltip="Thumbs down"
      >
        <ThumbDownIcon size={16} />
      </MessageAction>
    </MessageActions>
  );
};
