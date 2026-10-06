// Fixture: memo + default export + class component.
import { memo, Component } from "react";

interface TextFieldProps {
  label: string;
  /** Validation message. */
  error?: string;
}

const TextField = memo(function TextField({ label, error }: TextFieldProps) {
  return (
    <label>
      {label}
      <input aria-invalid={Boolean(error)} />
    </label>
  );
});

export default TextField;

export class Legacy extends Component<{ legacyProp: number }> {
  render() {
    return <span />;
  }
}

export const helper = () => 42;
export const NotAComponent = { value: 1 };
