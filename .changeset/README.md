# Changesets

Every pull request that changes the published `bearminion` package adds a changeset:

```bash
pnpm changeset
```

Pick `bearminion`, choose the bump (`major` for a breaking change, `minor` for a new feature, `patch` for a fix), and
write one line for the changelog. The release workflow turns the pending changesets into a version pull request; merging it
publishes to npm.

The templates and the tests package are private and are never published.
