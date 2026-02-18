# Quick tests

This folder contains lightweight "smoke/core" tests to validate critical logic without running the full app.

## Files

- `core-randomness.test.ts`
  - verifies deterministic uniform draw from hex input
  - verifies sold-out filtering logic (`maxSupply`)
  - verifies stable selection over available IDs

## Run

From project root:

```bash
npm run test:core
```

For a quick full check (tests + TypeScript):

```bash
npm run test:quick
```
