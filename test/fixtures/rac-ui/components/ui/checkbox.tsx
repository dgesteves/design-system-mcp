// A checkbox and a group of them in one file, as Jolly UI ships them. The styles follow React
// Aria's starter: tv() keys for render states, in two definitions.
import type { ReactNode } from "react"
import {
  Checkbox as AriaCheckbox,
  CheckboxGroup as AriaCheckboxGroup,
  composeRenderProps,
  type CheckboxGroupProps,
  type CheckboxProps as AriaCheckboxProps,
} from "react-aria-components"
import { tv } from "tailwind-variants"

const checkboxStyles = tv({
  base: "flex items-center gap-2 text-sm",
  variants: {
    isDisabled: {
      false: "text-foreground",
      true: "text-muted-foreground",
    },
  },
})

const boxStyles = tv({
  base: "size-4 rounded-sm border",
  variants: {
    size: {
      sm: "size-3.5",
      md: "size-4",
    },
    isSelected: {
      false: "border-border bg-background",
      true: "border-primary bg-primary",
    },
    isInvalid: {
      true: "border-destructive",
    },
    isDisabled: {
      true: "border-muted",
    },
  },
  defaultVariants: { size: "md" },
})

export interface CheckboxProps extends AriaCheckboxProps {
  /** The size of the box. */
  size?: "sm" | "md"
}

/** A checkbox with a label, for a single on/off choice. */
export function Checkbox({ size, children, ...props }: CheckboxProps) {
  return (
    <AriaCheckbox
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        checkboxStyles({ ...renderProps, className })
      )}
    >
      {composeRenderProps(children, (children, renderProps) => (
        <>
          <div className={boxStyles({ ...renderProps, size })} />
          {children as ReactNode}
        </>
      ))}
    </AriaCheckbox>
  )
}

/** A set of related checkboxes with a shared label. */
export function CheckboxGroup(props: CheckboxGroupProps) {
  return <AriaCheckboxGroup {...props} className="flex flex-col gap-2" />
}
