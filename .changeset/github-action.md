---
'onsystem': minor
---

A GitHub Action: `uses: dgesteves/onsystem@v0` runs `check` on a pull request, honours the baseline, and reports only the findings on the lines the pull request changed, as annotations and in the job summary, failing on errors (`fail-on` sets the level, `only-changed-lines: false` reports every line). It runs in merge queues too, and each release of the action runs the CLI of the same version. The new docs page "Make it a required check on agent pull requests" has the workflow, how to require the check, and what to know for pull requests from Copilot, Codex and Claude.
