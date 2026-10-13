---
'@objectstack/metadata-protocol': minor
'@objectstack/spec': patch
---

fix(metadata-protocol)!: a direct metadata save that names no package writes the row of the one package the item belongs to, and a name two or more packages hold is refused `409 RESOURCE_CONFLICT`, instead of answering `200` for a package-less row the item read never serves (ADR-0048)

Clause-②: no (narrowing)

<!-- adr-0087: not-required (no-migration-prescription) No metadata moves: no spec key, authorable spelling, export, response field or stored shape is added, removed, renamed or re-shaped, and no stored row is rewritten, converted or deleted, so there is nothing for `objectstack migrate meta` to rewrite. What narrows is one runtime write door: a save through the metadata API that names no package, of an item two or more packages hold or of an item a read-only package holds, is refused, and the remedy is in the request a caller sends to that door (name the package), never a rewrite of a package source or a stored row. The other categories are closed on facts: the package publishes (not unpublished); no ADR-0087 id is named or touched (not registered or already-registered); and no exported declaration is removed or narrowed (not runtime-interface-only, type-surface-only or runtime-export-retired). -->

**BREAKING** (an accept-set narrowing), shipped as `minor` under the launch-window convention for breaking changes.

A `sys_metadata` row is keyed by its package (ADR-0048), so one item can hold one row per package. A save that names a package (`?package=` on the REST door, `packageId` in process) writes that package's row. A save that named none always wrote the package-unbound row, even for an item a package owns. The draft save already resolved this: a draft that names no package is stored in the package of the item's active row. The direct save did not.

**FROM.** Save an item into a package (`PUT /api/v1/meta/app/my_app?package=com.acme.app`), then save it again without `?package=`: the second save answered `200` "Saved app 'my_app' (env-wide, state=active)" and wrote a second, package-less row beside the package's row. The item read kept serving the package's row, so nothing the save carried took effect, and a console "Disable" reported success while the app stayed enabled. The same held for the API, the CLI and agents, and for an overlay row bound to a code package. The item read that names no package served `version: null` for such an item, as if a save would create it.

**TO.** A direct save that names no package resolves its address from the item's active rows:

- **Bound to one package.** The save writes that package's row, exactly as a save naming the package does, and the item read serves it next. The receipt names the package: "Saved app 'my_app' (env-wide, package=com.acme.app, state=active)". Every check on the row the save writes reads that package: its stored lock, a stored credential carried forward, the optimistic lock, and the writable-base rule. The item read that names no package serves that row's `version`, so a read followed by a save with the served `If-Match` is accepted.
- **Bound to two or more packages.** The save is refused `409 RESOURCE_CONFLICT` and writes nothing. The message names the packages and the remedy: name one with `?package=`.
- **Bound to none.** The save writes the package-unbound row, as before, and its receipt reads as before.

**Also refused now**, each as the same save naming the package is refused: a package-less save of an item held by a read-only package (a code package's runtime-only item, or an installed `system`/`cloud` package's) answers `422 WRITABLE_PACKAGE_REQUIRED`; and a package-less save asserting a create (`If-None-Match: *`) of an item a package holds answers `409 METADATA_CONFLICT`.

`packageId: null` in process names no package too, as the request contract states. The server-side rewrites keep the row they name: `os migrate meta --stored --apply` and the stored flow credential move pass `null` for a package-unbound row they rewrite, and that row is still the one written; package duplication names its target package.

**Unchanged.** A save that names a package. A draft save, which keeps its own inheritance. An item a code package ships with no stored row: the package-less save still writes the package-unbound overlay, and the read serves it. Package-less rows already stored beside a package's row stay as they are; none is converted or deleted.

**Remedy.** For an item two packages hold, send the save with `?package=` naming the package whose row it edits. A save receipt now names the package when the save wrote a package's row; a client that compares the receipt text should expect `, package=<id>` after `env-wide`.

`@objectstack/spec`: the `SaveMetaItemRequestSchema.packageId` description now states what an `active` save that names no package writes, where it said the env-local overlay. Description only; the schema is unchanged.
