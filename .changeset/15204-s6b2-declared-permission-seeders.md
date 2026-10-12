---
'@objectstack/plugin-security': minor
---

feat(plugin-security)!: the boot writes no `sys_permission_set` row — the declared-permission seeder and the platform-default materialization are deleted

Clause-②: yes (narrowing)

<!-- adr-0087: not-required (no-migration-prescription) A runtime change on a platform object's rows and on TypeScript surfaces, not on any metadata schema: no key of any spec schema is removed, renamed or re-shaped, so there is nothing for `objectstack migrate meta` to rewrite and no tombstone. The rows the retired seeders wrote stay in the table until a later ADR-0131 stage; nothing reads them for authorization. The package publishes (not unpublished); no ADR-0087 id covers this rule and this diff adds none (not registered / already-registered). -->

**BREAKING**, shipped as `minor` under the repo's launch-window convention for breaking changes.

`SecurityPlugin` no longer writes a `sys_permission_set` row for any permission set: not for the platform defaults (`admin_full_access`, `member_default`, …), not for a set a package declares, not for an organization's copy, and not on a package-door publish, a metadata reload or an organization's creation. Permission sets are served by the security catalog (ADR-0131 D3), and since the grant names its set (`sys_user_permission_set.permission_set`), no grant path needs a row. A fresh database still promotes its first platform administrator, grants organization administrators and self-registered members, and grants every principal what it was granted before. On a database that was already seeded, the existing rows stay as they are; they are no longer refreshed at boot.

- **Accepted package defaults follow every publish.** The `everyone` anchor is derived again after every landed `permission` mutation (publish, direct save or delete, through any door), so an accepted set whose new body no longer qualifies stops granting at once. Before this release the re-derivation ran only inside the publish materializer, and only when the published body carried an `isDefault` key.
- **`drift_status` and `drift_detail` are gone from `sys_permission_set`**, with the **Needs Attention** list view that listed them. Nothing computes them any more: the declared-versus-enforced diagnostic retired with the rows it compared. A Studio overlay that shadows a packaged set is still named at boot.
- `bootstrapPlatformAdmin` no longer takes the `resync` option and no longer reports `seeded`, `resynced` or `resyncSkipped`. A refused read of the legacy `admin_full_access` row (the restrict-only reach to a grant written before the name column existed) withholds the promotion and says so once.

Removed from `@objectstack/plugin-security`'s public exports, with no replacement:

- `bootstrapDeclaredPermissions`
- `normalizeManagedByVocab`
- `computePermissionSetDriftDiagnostics`, `persistPermissionSetDriftDiagnostics`, `runPermissionSetDriftDiagnostics`, and the types `PermissionSetDriftStatus`, `PermissionSetDriftDiagnostic`, `DriftDiagnosticsOptions`
- `CAPABILITY_DECLARATION_UNOWNED`, `CAPABILITY_PLATFORM_NAME_REFUSED`, `PERMISSION_SET_DECLARATION_UNOWNED`, `capabilityDeclarationUnownedDiagnostic`, `capabilityPlatformNameRefusedDiagnostic`, `permissionSetDeclarationUnownedDiagnostic`, `reportCapabilityDeclarationUnowned`, `reportCapabilityPlatformNameRefused`, `reportPermissionSetDeclarationUnowned`, and the types `CapabilityDeclarationUnownedDiagnostic`, `CapabilityPlatformNameRefusedDiagnostic`, `PermissionSetDeclarationUnownedDiagnostic`
