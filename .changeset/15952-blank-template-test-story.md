---
'create-objectstack': minor
---

The blank starter ships a test story: `pnpm test` boots the scaffolded app's own stack with `bootStack` from `@objectstack/verify` and asserts one business fact through its in-process handle

Clause-②: no

A project scaffolded with `npx create-objectstack` used to start with no `test` script and no way to assert its own behaviour, so the first test an author wrote was a hand-assembled kernel or a faked `ctx`. The blank template now carries:

- **`note.test.ts`**, one starter test. It boots the app the project declares (its objects, its plugins, the services it requires) on the real engine, in-process, with an in-memory database and no server, and asserts that a note without a title is refused with the engine's own `VALIDATION_FAILED` error naming `title`, beside the same note with a title being saved. It addresses the object as `Note.name`, so it follows the namespace scaffolding writes.
- **`vitest.config.ts`**: a 60 s hook timeout for the boot, and vitest's console capture switched off, so a log line the stack writes while a worker shuts down cannot fail a green run.
- **`package.json`**: a `test` script (`vitest run`), and `@objectstack/verify` (at the project's `@objectstack/*` range) and `vitest` (`^4.0.0`, the range `objectstack init` and `objectstack create` declare) as devDependencies.
- **`tsconfig.json`** includes every root `*.ts` (`"*.ts"`, as `objectstack init` writes it), so `pnpm typecheck` checks the starter test and the vitest config.
- **`README.md`** lists `pnpm test` beside `validate`, `lint` and `typecheck`.

The project's CI workflow is unchanged: its steps are the script set every scaffolder declares, and only this one ships a `test` script today.
