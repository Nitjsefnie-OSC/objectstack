---
'@objectstack/cli': patch
---

fix(cli): `os migrate organization-ownership --apply` promotes the presentational `sys_metadata` rows its plan has always counted (ADR-0131 D10)

The plan counts an `organization-presentational-promotion` category on `sys_metadata`: the organization-scoped rows of `view`, `dashboard`, `report`, `translation` and `email_template`. Until now no `--apply` step consumed it. Two things followed. A view saved through the v17 `/meta` door for the Default Organization stayed unserved at v18, because `/meta` reads the environment and then the code, and never an organization's row. And `column-drops` held `sys_metadata.organization_id` on those rows on every run.

A new step, `presentational-promotion`, runs after the template promotion and before the settings move. It is checkpointed and resumable like the others.

- **Promoted (under `single`):** each of the Default Organization's rows becomes an environment row in place. Its `organization_id` is cleared, and its body, state, package, bundle member and version are untouched. That is the row the `/meta` read serves. Every write is an `UPDATE` scoped by the category's own predicate, the row's id and the Default Organization. Each one is read back. Nothing is deleted.
- **Reported, never promoted:** each of these rows is listed in the step's notes with its remedy, and it keeps the column from being dropped until the operator chooses per row:
  - another organization's row, whether or not the Default Organization holds the same name (the conflict rule: the Default Organization's row is the one promoted);
  - every row under `isolated` or `group`;
  - a row the environment already holds an active or draft row of the same item for (the environment's row is never overwritten);
  - a row the Default Organization holds twice;
  - a body that is not JSON.
- **Public-form withdrawals are carried fail-closed under every posture.** A form that any organization's active `view` row withdraws is withdrawn in the row this step promotes: `allowAnonymous: false`, with the link kept. The step judges this with the anonymous doors' own kill-switch predicate. Sometimes the environment layer would still serve such a form open from a body this step does not write: the environment's own row, or the code's item when no environment row holds the name. Then the step stops and names the form, the withdrawing rows and the remedy.

`column-drops` now runs the promotion pass again before it judges `sys_metadata`. A row written after the step's checkpoint is therefore promoted, or reported, rather than left behind. The apply report lists the new step under `steps`.
