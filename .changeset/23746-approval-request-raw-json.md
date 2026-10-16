---
'@objectstack/plugin-approvals': patch
---

feat(plugin-approvals): the approval request page's Details tab ends with the request snapshot's raw JSON, gated on `studio.access`

Clause-②: no

- **One block on the served `sys_approval_request_detail` page.** The Details tab now holds `record:details`, then a `record:json` block on `payload`, labelled "Raw data (JSON)" in the four shipped locales and gated on `requiredPermissions: ['studio.access']`. It is a platform operator's debug view, never the approver's read path: a viewer without `studio.access` draws nothing there.
- **`payload` is the key the request read serves.** `GET /api/v1/approvals/requests/:id`, the read the console's request page loads its record through, serves the parsed snapshot as `payload`, already narrowed to the fields the reader may see on the subject object. The stored column `payload_json` is never served under its own name, and the object definition is unchanged.
- **The block is drawn by the console's `record:json` renderer.** A console with no renderer registered for `record:json` draws its unknown-component panel in that place.
- **Nothing else moves.** No export, type, route, stored value or accepted input changes.

A patch: one block on one platform page's served definition.
