---
'onsystem': minor
---

An ESLint plugin, `onsystem/eslint`, with the same rules for ESLint 9 and 10 (flat config): add `onsystem.configs.recommended` to `eslint.config.mjs`. Each file is checked as `check` checks it, against its own project's design system with that project's config and suppression comments, with the same messages, positions and fixes; `settings.onsystem.root` and `config` point it elsewhere. The design system loads once in a worker thread and is refreshed while an editor keeps ESLint running. The real-world corpus runs through it too (`pnpm corpus eslint`) and reports the same findings as `check`. The docs page "ESLint plugin" shows how to use it alongside @shadcn/lint.
