import {
  FieldError,
  Input as AriaInput,
  Label as AriaLabel,
  TextField as AriaTextField,
  type InputProps,
  type LabelProps,
  type TextFieldProps,
} from "react-aria-components"

/** A labelled text input with validation. */
export function TextField(props: TextFieldProps) {
  return <AriaTextField {...props} className="flex flex-col gap-1" />
}

/** The label of a field. */
export function Label(props: LabelProps) {
  return <AriaLabel {...props} className="text-sm font-medium" />
}

/** The input of a TextField. */
export function Input(props: InputProps) {
  return <AriaInput {...props} className="rounded-md border border-border px-3 py-2" />
}

export { FieldError }
