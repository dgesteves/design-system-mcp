---
'onsystem': minor
---

`check --format sarif` prints a SARIF 2.1.0 log for GitHub code scanning (`github/codeql-action/upload-sarif`) and other SARIF tools: each rule with its description and a link to its docs, and each finding with its level, message, location and a stable fingerprint. Paths are relative to the repository root, wherever `check` runs from, and baseline findings are left out.
