---
'@objectstack/plugin-security': patch
'@objectstack/platform-objects': patch
'@objectstack/spec': patch
---

fix(plugin-security): the data-door write gates of the retired catalog row objects are removed, and the texts that still named those objects are corrected (ADR-0131 D3, C3 stage 8-post)

Clause-②: no

Stage 8 retired the `sys_position`, `sys_permission_set`, `sys_position_permission_set` and `sys_capability` row objects, so no write to them reaches the engine. This change removes what only guarded those writes. No export of any package's entry changes, and no request that reaches the server is answered differently.

- **`@objectstack/plugin-security`.** The security middleware's four gates on those objects are gone: the package-provenance gate on `sys_permission_set`, the platform/package row gate on `sys_position` and `sys_capability`, the curated capability-name gate on `sys_capability`, and the audience-anchor binding gate on `sys_position_permission_set`. The delegated-administration gate no longer judges `sys_position_permission_set` bindings or `sys_permission_set` authoring; it still governs `sys_user_position` assignments, `sys_user_permission_set` grants and `sys_member`. The rules those gates carried still hold where the catalog now lives: `everyone` and `guest` are code-declared positions an environment cannot overlay, and a capability cannot be created or overlaid through the metadata door at all. The internal duplicate-name refusal class that only the retired permission-set data door raised is removed.
- **`@objectstack/platform-objects`** and **`@objectstack/plugin-security`** object metadata: the descriptions of `sys_invitation.positions`, `sys_user_position` (object and `position`), and `sys_audience_binding_suggestion`'s permission-set name no longer name the retired objects. The translated texts follow.
- **`@objectstack/spec`**: the `projectionApplied` and `materializeApplied` descriptions on the metadata save, publish and batch-publish responses give a current example (`datasource`, `flow`) instead of `permission` → `sys_permission_set`. `EvalUser.positions` describes the positions assigned through `sys_user_position`. The error-code ledger drops `@objectstack/plugin-security`'s `UNIQUE_VIOLATION` row, which named the removed refusal; `UNIQUE_VIOLATION` stays registered by its other emitters.
