---
'onsystem': patch
---

Small fixes that make the package say what is true:

- `engines` asks for Node.js 20.19 or later, which the CLI and the server run on; a TypeScript config file still needs 22.18, and on an older Node.js it now says so plainly and points to `.json` or `.mjs`.
- `get_component` has an output schema, like every other tool, and integer fields no longer carry ±9007199254740991 bounds in the tool definitions.
- `get_tokens` in a project without tokens says that none were found and how to configure them, instead of suggesting to call it without filters; with filters that match nothing, it lists the categories there are.
- `isInvalid` on a native field suggests `aria-invalid`, not `onInvalid`.
