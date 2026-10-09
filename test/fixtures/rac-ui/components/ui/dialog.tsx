import {
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Modal,
  type DialogProps,
} from "react-aria-components"

/** Opens a dialog from the button inside it. */
export const DialogTrigger = AriaDialogTrigger

/** A modal dialog for decisions that need the user's attention. */
export function Dialog(props: DialogProps) {
  return (
    <Modal className="rounded-lg bg-background p-6">
      <AriaDialog {...props} />
    </Modal>
  )
}
