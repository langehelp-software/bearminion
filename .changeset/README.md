# Changesets

Every pull request that changes a published package (`bearminion`, `create-bearminion`, or `templates/default`, which the CLI ships) adds a changeset:

```bash
pnpm changeset
```

Pick the package you changed (for a template change, `create-bearminion`), choose the bump (`major` for a breaking change, `minor` for a new feature, `patch` for a fix), and
write one line for the changelog. The release workflow turns the pending changesets into a version pull request; merging it
publishes to npm.

`bearminion` and `create-bearminion` are a fixed group: they always release together, with the same version. The template and the tests package are private and are never published on their own.
