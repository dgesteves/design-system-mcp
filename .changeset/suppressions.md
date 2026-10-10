---
'onsystem': minor
---

Findings can be suppressed where they are intended. `// onsystem-disable-next-line <rule>[, <rule>]` covers the next line (`{/* … */}` in JSX), `// onsystem-disable-line <rule>` its own line, and `/* onsystem-disable [<rule>] */` the rest of the file; text after `--` explains why. A misspelled rule name is reported as a `suppression` warning with the closest one. In the config, `overrides` set rules for the files that match globs, such as `[{ "files": ["app/legacy/**"], "rules": { "no-hardcoded-color": "warn" } }]`, validated like `rules`; `check` keeps baseline entries of rules an override turns off.
