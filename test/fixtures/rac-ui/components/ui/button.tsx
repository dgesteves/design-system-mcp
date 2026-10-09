// The Button of React Aria's Tailwind starter: tv() styles that react to render state.
import {
  Button as RACButton,
  composeRenderProps,
  type ButtonProps as RACButtonProps,
} from "react-aria-components"
import { tv } from "tailwind-variants"

const focusRing = tv({
  base: "outline outline-offset-2 outline-ring",
  variants: {
    isFocusVisible: {
      false: "outline-0",
      true: "outline-2",
    },
  },
})

const button = tv({
  extend: focusRing,
  base: "rounded-md px-4 py-2 text-sm text-center",
  variants: {
    variant: {
      primary: "bg-primary text-primary-foreground",
      secondary: "bg-muted text-foreground",
      destructive: "bg-destructive text-primary-foreground",
      quiet: "bg-transparent text-foreground",
    },
    isDisabled: {
      true: "bg-muted text-muted-foreground",
    },
    isPending: {
      true: "text-transparent",
    },
  },
  defaultVariants: {
    variant: "primary",
  },
  compoundVariants: [{ variant: "quiet", isDisabled: true, class: "bg-transparent" }],
})

export interface ButtonProps extends RACButtonProps {
  /** How prominent the button is. Use `destructive` for actions that delete data. */
  variant?: "primary" | "secondary" | "destructive" | "quiet"
}

/** A button that triggers an action, built on React Aria's Button. */
export function Button(props: ButtonProps) {
  return (
    <RACButton
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        button({ ...renderProps, variant: props.variant, className })
      )}
    />
  )
}
