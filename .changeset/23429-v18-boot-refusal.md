---
'@objectstack/runtime': minor
'@objectstack/cli': minor
'@objectstack/spec': minor
---

feat(runtime,cli)!: `os serve` refuses to start against a database still in the v17 organization-ownership shape until `os migrate organization-ownership` has verified it (ADR-0131 D10 item 5)

Clause-②: yes (narrowing)

<!-- adr-0087: not-required (already-registered sys-audit-log-organization-column-retired, sys-flow-dispatch-organization-column-retired, sys-job-organization-column-retired, sys-job-queue-organization-column-retired, sys-job-run-organization-column-retired, sys-migration-journal-organization-column-retired, sys-migration-organization-column-retired, sys-presence-organization-column-retired) The step-18 D3 entries named here, registered before this change, record the retirement of each organization column this refusal reads, with the remedy that clears it; the metadata family's four entries land with its schema change, which this refusal ships beside. This change adds no authorable surface, moves no spec key and rewrites no stored row: it refuses to boot while a retired column is still physically present, and the remedy is the operator's own migration: the ceremony, whose column-drops step drops what those entries prescribe dropping. No new D3 entry and no D2 conversion. -->

**BREAKING**, shipped as `minor` under the repo's launch-window convention for breaking changes.

A v18 runtime no longer serves a database it was never migrated for. At `kernel:ready`, `os serve` (and so `os dev`) checks every table whose object declares no organization column (`systemFields.tenant: false`). If one still carries a physical `organization_id`, the boot is refused unless the `sys_migration` row `adr-0131-organization-ownership` is verified. The refusal names the tables and the command. It is thrown before `kernel:listening`, so no request is served. Its code is `ORGANIZATION_OWNERSHIP_MIGRATION_REQUIRED`.

FROM → TO:

- A 17.x database started by an 18.x `os serve` → run `os migrate organization-ownership`, review its plan, then `os migrate organization-ownership --apply`, and start again. To keep 17.x semantics on an unmigrated database, run a 17.x runtime.
- There is no escape hatch: no `OS_ALLOW_*` or `OS_SKIP_*` variable and no flag skips the check.

What does not change:

- A fresh database boots: no table it creates carries a retired column, so no marker is needed.
- A database whose ceremony verified boots, whatever its columns.
- The `os migrate` commands, the ceremony's own boot among them, are not refused: the guard is composed by `os serve` only, never by the shared standalone stack.
- A driver with no physical columns to read (memory, MongoDB) is not checked.
- A host that composes its own kernel can add the guard itself: `OrganizationOwnershipBootGuardPlugin`, or `assertOrganizationOwnershipMigrated(engine)` from `@objectstack/runtime`. `ORGANIZATION_OWNERSHIP_MIGRATION_ID` is now exported from `@objectstack/spec/system`.
