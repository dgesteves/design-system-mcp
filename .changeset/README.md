# Changesets

Add a changeset with `pnpm changeset` for any user-facing change. On merge to
`main`, the release workflow opens a "chore: release" PR that bumps the version
and updates `CHANGELOG.md`; merging that PR publishes to npm with provenance.
