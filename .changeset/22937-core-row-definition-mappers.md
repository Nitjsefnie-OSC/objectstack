---
"@objectstack/core": minor
---

feat(core): two pure row → definition mappers for the ADR-0131 upgrade ceremony (`permissionSetDefinitionFromRow`, `positionDefinitionFromRow`)

Clause-②: yes (widening)

- **What is new.** `permissionSetDefinitionFromRow(row)` turns one `sys_permission_set` row into the permission-set definition it carries, and `positionDefinitionFromRow(row)` turns one `sys_position` row into the position definition it carries. The row types `PermissionSetRowForDefinition` and `PositionRowForDefinition` are exported with them. Both sit beside `convertPositionBindingRows`, and the upgrade ceremony (`os migrate`) applies them to save Setup-authored rows through the metadata door. ⛔ Neither runs at boot.
- **The permission-set mapping.** The JSON-text facet columns become the camelCase body keys: `object_permissions` → `objects`, `field_permissions` → `fields`, `system_permissions` → `systemPermissions`, `row_level_security` → `rowLevelSecurity`, `tab_permissions` → `tabPermissions`, and `admin_scope` → `adminScope` when set. `label` falls back to the name. A facet that is absent, empty or unparseable answers its default. The body keeps only the keys `PermissionSetSchema` declares, so `active`, `managed_by`, `customized` and the timestamps never travel.
- **The position mapping.** `{ name, label, description, delegatable }`: `label` falls back to the name unless it is a non-empty string, a `null` or blank `description` is absent, and `delegatable` is `true` only for a stored `true`, `1`, `'1'` or `'true'`. `active` and `is_default` are row state and never travel.
- **No behaviour changes.** Both functions are pure (one row in, one body out). They produce the same output as the security plugin's own copies, `permissionSetBodyFromRow` and `positionBodyFromRow`, and nothing calls them yet. Neither validates: the metadata door still refuses a body or a name it does not accept.
