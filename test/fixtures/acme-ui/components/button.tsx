// Fixture: forwardRef + props interface + cva with compound and boolean variants.
// React and cva are deliberately not installed here, so their types do not resolve.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva("inline-flex items-center rounded-md font-medium", {
  variants: {
    intent: {
      primary: "bg-brand-500 text-white hover:bg-brand-600",
      secondary: "bg-surface text-ink",
      danger: "bg-danger text-white",
    },
    size: {
      sm: "h-8 px-3 text-sm",
      md: "h-10 px-4",
    },
    fullWidth: {
      true: "w-full",
    },
  },
  compoundVariants: [{ intent: ["primary", "danger"], size: "sm", class: "font-semibold" }],
  defaultVariants: { intent: "primary", size: "md" },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  /**
   * Legacy red style.
   * @deprecated Use `intent="danger"`.
   */
  danger?: boolean;
}

/**
 * The primary action trigger.
 *
 * @example
 * <Button intent="danger">Delete</Button>
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ intent, size, fullWidth, loading = false, ...props }, ref) => (
    <button ref={ref} className={buttonVariants({ intent, size, fullWidth })} disabled={loading} {...props} />
  ),
);
