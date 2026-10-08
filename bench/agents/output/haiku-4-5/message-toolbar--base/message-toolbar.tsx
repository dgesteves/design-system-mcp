"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CopyIcon, RedoIcon, ThumbDownIcon, ThumbUpIcon } from "./icons";

export type MessageToolbarProps = {
  onCopy?: () => void;
  onRegenerate?: () => void;
  onUpvote?: () => void;
  onDownvote?: () => void;
  className?: string;
};

export function MessageToolbar({
  onCopy,
  onRegenerate,
  onUpvote,
  onDownvote,
  className,
}: MessageToolbarProps) {
  return (
    <TooltipProvider>
      <div className={`flex items-center gap-1 ${className ?? ""}`}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onCopy}
              aria-label="Copy"
            >
              <CopyIcon size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onRegenerate}
              aria-label="Regenerate"
            >
              <RedoIcon size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Regenerate</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onUpvote}
              aria-label="Thumbs up"
            >
              <ThumbUpIcon size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Thumbs up</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onDownvote}
              aria-label="Thumbs down"
            >
              <ThumbDownIcon size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Thumbs down</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
