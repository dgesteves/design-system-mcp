---
'@dgesteves/design-system-mcp': patch
---

Accurate `get_component` contracts for React Aria Components design systems. Boolean `tv()` keys that style a render state (`isDisabled`, `isPending`, `isSelected`) are no longer listed as variants, so those props keep their own type and JSDoc, and a variant declared by two linked definitions is listed once. The inherited-props summary of a React Aria component names `onPress`, `onChange`, `isDisabled`, `isRequired` and the like instead of `onClick`, and leaves out props marked `@deprecated`. A container defined next to its item (`CheckboxGroup` beside `Checkbox`) is no longer listed as one of its parts.
