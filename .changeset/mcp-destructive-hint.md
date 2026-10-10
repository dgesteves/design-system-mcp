---
'onsystem': patch
---

Every MCP tool now states all four annotation hints, adding `destructiveHint: false` to `readOnlyHint`, `idempotentHint` and `openWorldHint`. The spec defaults a missing `destructiveHint` to true, and some clients and directories reject tools that leave a hint out.
