// Fixture: string-literal union props without cva, required props, JSDoc defaults.
export type AlertTone = "info" | "warning" | "danger";

export interface AlertProps {
  /** Visual tone. */
  tone: AlertTone;
  /** Short summary shown in bold. */
  title: string;
  /**
   * Show a close button.
   * @default false
   */
  dismissible?: boolean;
  onDismiss?: () => void;
}

/** Displays a short, important message. */
export function Alert({ tone, title, dismissible = false }: AlertProps) {
  return (
    <div role="alert" data-tone={tone}>
      <strong>{title}</strong>
      {dismissible ? <button aria-label="Dismiss">×</button> : null}
    </div>
  );
}
