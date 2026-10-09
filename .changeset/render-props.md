---
'@dgesteves/design-system-mcp': patch
---

Render props and style functions are checked. `icon-button-accessible-name` judges a function child (`<Button>{({ isPending }) => <Trash2 />}</Button>`, as in React Aria Components) by what it returns, across every `return` and branch. The color, spacing and radius rules read `style={({ isPressed }) => ({ ... })}` like a style object, and check each branch of a conditional style value (`isPressed ? "#ef4444" : undefined`).
