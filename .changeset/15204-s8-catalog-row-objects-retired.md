---
'@objectstack/plugin-security': minor
'@objectstack/platform-objects': minor
'@objectstack/spec': minor
'@objectstack/core': minor
'@objectstack/metadata-protocol': minor
'@objectstack/cloud-connection': patch
'@objectstack/objectql': patch
'@objectstack/plugin-sharing': patch
'@objectstack/lint': patch
'@objectstack/service-settings': patch
---

feat(plugin-security)!: the four security-catalog row objects are retired — `sys_position`, `sys_permission_set`, `sys_position_permission_set` and `sys_capability` (ADR-0131 D3)

Clause-②: yes (narrowing)

<!-- adr-0087: registered catalog-row-objects-retired -->

**BREAKING**, shipped as `minor` under the repo's launch-window convention for breaking changes.

Positions, permission sets and capabilities live in the security catalog — the environment registry, fed by package declarations and by environment metadata saved through `/api/v1/meta` (ADR-0131 D3). The four row objects that mirrored them are no longer registered, so their data and REST routes and their Setup object pages are gone. No table is dropped and no row is deleted.

FROM → TO:

- `GET|POST|PATCH|DELETE /api/v1/data/sys_permission_set` → `GET|PUT|DELETE /api/v1/meta/permission/:name`; to copy a set, `POST /api/v1/security/permission-sets/:name/clone` with `{ name, label }`.
- `… /api/v1/data/sys_position` → `/api/v1/meta/position/:name`. A position's permission sets are its definition's `permissionSets`.
- `… /api/v1/data/sys_position_permission_set` → the position definition's `permissionSets` (`PUT /api/v1/meta/position/:name`).
- `… /api/v1/data/sys_capability` → read-only `GET /api/v1/meta/capability`; a package declares a capability with `defineCapability` (`stack.capabilities`).
- Setup → Access Control → Positions / Capabilities / Permission Sets now open Setup's catalog lists (`/apps/setup/metadata/<type>?scope=environment`) instead of the object pages; the `sys_position` record page (`SysPositionDetailPage`) is removed.
- An object permission on one of the four names in a permission set grants nothing and can be deleted.

What else changes:

- `sys_user_permission_set.permission_set_id` is a plain text column now, not a lookup: same column, same stored ids, same indexes. It is not written and grants nothing; a grant names its set by `permission_set`.
- A permission set saved through the metadata door is written to no row: the `permission` mutation projector, the `sys_permission_set` and `sys_position` data-door write-throughs and the row-only position backfill are no longer registered.
- On a fresh `single`-posture database the first human is promoted to platform administrator without reading any catalog row. An unscoped grant written before `sys_user_permission_set.permission_set` existed (it names no set) still withholds the promotion until the organization-ownership migration names it.
- Uninstalling a package revokes every grant naming a permission set the package declared. The uninstalling door reads those names off the package before withdrawing it and hands them to each uninstall cleanup as `declared` (`UninstallCleanup`, `@objectstack/metadata-protocol`; `declaredCatalogItemsOf` is exported).
- `capability-reference-unknown` no longer counts a `sys_capability` seed row as a declared capability — no runtime reader consults one. Declare the capability with `defineCapability`.

Removed exports, no replacement:

- `@objectstack/plugin-security`: the object definitions `SysPosition`, `SysPermissionSet`, `SysPositionPermissionSet`, `SysCapability` (from `./objects`); `securityObjects` lists the remaining three.
- `@objectstack/platform-objects/pages`: `SysPositionDetailPage`.
- `@objectstack/spec`: `SystemObjectName.POSITION`, `SystemObjectName.PERMISSION_SET`; the four names leave `PLATFORM_OBJECTS_BY_PACKAGE['plugin-security']` and `PLATFORM_PROVIDED_OBJECT_NAMES`.
- `@objectstack/core`: `isRowActive` and `ActivatableRow` — a catalog row's `active` column decides nothing; deactivation is the activation ledger's (`sys_metadata_activation`).
