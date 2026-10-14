// Copyright (c) 2026 ObjectStack. Licensed under the Apache-2.0 license.

/**
 * The presentational promotion (ADR-0131 D10 `--apply`, rulings 6020163868 A
 * and 6020151485 A) read back through the REAL doors, on both kernels.
 *
 * `organization-ownership-apply.test.ts` pins what the step writes. This file
 * pins what a deployment serves afterwards, which is the card's whole claim:
 *
 *  (a) a view Studio saved for the Default Organization under 17.x is not
 *      served by the v18 `/meta` read (environment → code) — the I8 rehearsal
 *      answered 404 — and after `--apply` it is, with the body the row stored;
 *  (b) a public form an organization withdrew before the upgrade is refused at
 *      both anonymous intake doors (`GET /forms/:slug`, `POST
 *      /forms/:slug/submit`) after it, on both kernels, and nothing lands —
 *      including a withdrawal by an organization other than the Default
 *      Organization, the fail-closed half (before the upgrade that form was
 *      open: no door read that organization's row).
 *
 * What is real: the database (the stack's own schema, booted by
 * `bootSchemaStack`), the ceremony (the full `--apply` sequence over that
 * file), the metadata protocol that reads it after a REBOOT (the upgrade's
 * shape: the ceremony runs offline, the next boot serves), and the REST
 * server's form doors (`registerFormEndpoints`). "Both kernels" is the pair
 * the metadata-protocol pins drive: an unscoped host kernel and an
 * environment-scoped one (`ObjectStackProtocolImplementation`'s
 * `environmentId`), the scoped doors reached through the kernel manager. The
 * doors are read in two shapes: with the Default Organization's legacy read
 * they still carry (`legacyFormOrganizationId`, until ADR-0131 C7 retires
 * it), and with the environment-wide read alone — the shape after that
 * retirement, and the one that proves the withdrawal now lives in the
 * environment layer. The record writes are a spy (`createData`): a refused
 * door never reaches it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObjectStackProtocolImplementation } from '@objectstack/metadata-protocol';
import { RestServer } from '@objectstack/rest';
import { bootSchemaStack } from './schema-migrate.js';
import {
  applyOrganizationOwnership,
  type ApplyExecutor,
  type CeremonyCheckpoint,
  type OrganizationOwnershipApplyReport,
} from './organization-ownership-apply.js';

const SYSTEM = { context: { isSystem: true } };
const DEFAULT_ORG = 'org_default';
const OTHER_ORG = 'org_b';
const SLUG = 'contact-us';

const ARTIFACT = {
  manifest: { id: 'com.example.presentational-promotion', name: 'Presentational Promotion', version: '0.0.0', type: 'app' },
  objects: [{ name: 'pp_inquiry', fields: { name: { type: 'text' }, email: { type: 'text' } } }],
};

/** A Studio-created list view — the I8 case: it exists only as the Default Organization's row. */
const LIST_VIEW = {
  name: 'pp_inquiry.board',
  label: 'Inquiry board',
  object: 'pp_inquiry',
  viewKind: 'list',
  config: { type: 'grid', data: { provider: 'object', object: 'pp_inquiry' }, columns: [{ field: 'name' }, { field: 'email' }] },
};

/** A public form view; `allowAnonymous: false` with the link kept is an explicit withdrawal. */
const formView = (allowAnonymous: boolean, label: string) => ({
  name: 'pp_inquiry.contact',
  label,
  object: 'pp_inquiry',
  viewKind: 'form',
  config: {
    type: 'simple',
    data: { provider: 'object', object: 'pp_inquiry' },
    sections: [{ fields: ['name', 'email'] }],
    sharing: { enabled: true, allowAnonymous, publicLink: `/forms/${SLUG}` },
  },
});

let dir: string;
let dbFile: string;
const savedEnv: Record<string, string | undefined> = {};
const stacks: Array<{ shutdown(): Promise<void> }> = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'os-presentational-promotion-'));
  mkdirSync(join(dir, 'dist'), { recursive: true });
  mkdirSync(join(dir, 'data'), { recursive: true });
  dbFile = join(dir, 'data', 'app.db');
  writeFileSync(join(dir, 'dist', 'objectstack.json'), JSON.stringify(ARTIFACT));
  savedEnv.OS_ARTIFACT_PATH = process.env.OS_ARTIFACT_PATH;
  savedEnv.NODE_ENV = process.env.NODE_ENV;
  process.env.OS_ARTIFACT_PATH = join(dir, 'dist', 'objectstack.json');
  process.env.NODE_ENV = 'production';
});

afterEach(async () => {
  while (stacks.length) await stacks.pop()!.shutdown();
  process.env.OS_ARTIFACT_PATH = savedEnv.OS_ARTIFACT_PATH;
  process.env.NODE_ENV = savedEnv.NODE_ENV;
  rmSync(dir, { recursive: true, force: true });
});

async function boot() {
  const stack = await bootSchemaStack({ jsonOutput: false, databaseUrl: `file:${dbFile}`, projectRoot: dir });
  stacks.push(stack);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kernel = stack.kernel as { getService(name: string): any };
  return { stack, ql: kernel.getService('objectql'), host: kernel.getService('protocol') };
}

/** A 17.x deployment's database: the Default Organization, another one, and the rows their `/meta` saves left. */
async function seed17x(rows: Array<{ id: string; organization: string; body: Record<string, unknown> }>): Promise<void> {
  const { stack, ql } = await boot();
  const now = new Date().toISOString();
  for (const row of rows) {
    await ql.insert('sys_metadata', {
      id: row.id, type: 'view', name: row.body.name, organization_id: row.organization, package_id: null, state: 'active',
      version: 1, checksum: null, created_at: now, updated_at: now, metadata: JSON.stringify(row.body),
    }, SYSTEM);
  }
  await stack.shutdown();
  stacks.pop();
  const db = new Database(dbFile);
  try {
    db.exec('CREATE TABLE IF NOT EXISTS sys_organization (id TEXT PRIMARY KEY, slug TEXT)');
    db.prepare('INSERT INTO sys_organization (id, slug) VALUES (?, ?), (?, ?)').run(DEFAULT_ORG, 'default', OTHER_ORG, 'b');
  } finally {
    db.close();
  }
}

/** `os migrate organization-ownership --apply`, under `single`, over the file the stack left (no stack is up). */
async function ceremony(): Promise<OrganizationOwnershipApplyReport> {
  const db = new Database(dbFile);
  const executor: ApplyExecutor = {
    client: 'better-sqlite3',
    async query(sql, params = []) {
      return db.prepare(sql).all(...(params as unknown[])) as Record<string, unknown>[];
    },
    async execute(sql, params = []) {
      db.prepare(sql).run(...(params as unknown[]));
    },
  };
  let checkpoint: CeremonyCheckpoint | null = null;
  try {
    return await applyOrganizationOwnership({
      executor,
      posture: 'single',
      database: dbFile,
      catalog: { resolve: async () => undefined },
      door: {
        save: async () => {
          throw new Error('nothing in this fixture is saved through the door');
        },
      },
      templates: { find: async () => undefined },
      views: { served: async () => [] },
      // This release still declares `sys_metadata.organization_id`: no drop is proposed (the family's own stage).
      columnDrops: { drop: async (tables) => tables.map((table) => ({ table, outcome: 'not-proposed' as const })) },
      ledger: {
        read: async () => checkpoint,
        write: async (next) => {
          checkpoint = next;
        },
      },
    });
  } finally {
    db.close();
  }
}

/**
 * The two kernels over one booted engine: the stack's unscoped host protocol,
 * and an environment-scoped protocol over the same engine.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function kernels(ql: any, host: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scoped: any = new ObjectStackProtocolImplementation(ql, () => new Map(), 'env_presentational');
  return [
    { label: 'the unscoped host kernel', protocol: host, environmentId: undefined },
    { label: 'an environment-scoped kernel', protocol: scoped, environmentId: 'env_presentational' },
  ] as const;
}

function mockServer() {
  return {
    get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn(),
    use: vi.fn(), listen: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
  };
}

function mockRes() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn((b: unknown) => { res.body = b; return res; });
  res.header = vi.fn(() => res);
  res.end = vi.fn(() => res);
  return res;
}

/** Reproduces the registry's own "never registered" rejection: the doors then read environment-wide alone. */
function notRegistered(): Error {
  return Object.assign(new Error("Service 'tenancy' not found"), {
    __objectstackServiceNotRegistered: true,
    code: 'SERVICE_NOT_REGISTERED',
    serviceName: 'tenancy',
  });
}

/**
 * Both anonymous doors of one kernel, read through the REST server's own form
 * routes. `legacy`: the tenancy names the Default Organization, so the doors
 * still read its legacy layer; otherwise they read environment-wide alone.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function doors(protocol: any, environmentId: string | undefined, legacy: boolean) {
  const createData = vi.fn().mockResolvedValue({ object: 'pp_inquiry', id: 'rec_1', record: {} });
  // The metadata reads are the real protocol's; only the record write is a spy.
  const reads = {
    getDiscovery: async () => ({ version: 'v0', routes: { data: '', metadata: '' } }),
    getMetaTypes: async () => [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getMetaItems: (request: any) => protocol.getMetaItems(request),
    createData,
  };
  const tenancy = async () => {
    if (!legacy) throw notRegistered();
    return { posture: 'single', defaultOrgId: async () => DEFAULT_ORG };
  };
  const scoped = environmentId !== undefined;
  const kernelManager = scoped
    ? { getOrCreate: async () => ({ getServiceAsync: async (name: string) => (name === 'protocol' ? reads : name === 'tenancy' ? tenancy() : undefined) }) }
    : undefined;
  const rest = new RestServer(
    mockServer() as never, reads as never,
    { api: { requireAuth: false, ...(scoped ? { enableProjectScoping: true, projectResolution: 'required' } : {}) } } as never,
    kernelManager as never, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    scoped ? undefined : tenancy,
  );
  rest.registerRoutes();
  const route = (method: string, suffix: string) => rest.getRoutes().find((r) => r.method === method && r.path.endsWith(suffix))!;
  const params = { slug: SLUG, ...(scoped ? { environmentId } : {}) };
  const get = mockRes();
  await route('GET', '/forms/:slug').handler({ params, query: {}, headers: {} } as never, get);
  const post = mockRes();
  await route('POST', '/forms/:slug/submit').handler(
    { params, query: {}, headers: {}, body: { name: 'probe', email: 'probe@example.com' } } as never,
    post,
  );
  return { doors: [get.statusCode, get.body?.code ?? null, post.statusCode, post.body?.code ?? null], landed: createData.mock.calls.length };
}

const CLOSED = { doors: [404, 'FORM_NOT_FOUND', 404, 'FORM_NOT_FOUND'], landed: 0 };
const OPEN = { doors: [200, null, 201, null], landed: 1 };

describe('ADR-0131 D10 --apply on a real stack: what the deployment serves after the presentational promotion', () => {
  it("(a) a view saved for the Default Organization under 17.x is served by /meta after --apply, with the row's body", async () => {
    await seed17x([{ id: 'md_board', organization: DEFAULT_ORG, body: LIST_VIEW }]);
    const before = await boot();
    for (const { label, protocol } of kernels(before.ql, before.host)) {
      await expect(protocol.getMetaItem({ type: 'view', name: LIST_VIEW.name }), label).resolves.toSatisfy(
        (answer: { item?: unknown } | null | undefined) => !answer?.item,
      );
    }
    await before.stack.shutdown();
    stacks.pop();

    const report = await ceremony();
    expect(report.steps.find((s) => s.step === 'presentational-promotion')).toMatchObject({ status: 'done', summary: { promoted: 1 } });

    const after = await boot();
    for (const { label, protocol } of kernels(after.ql, after.host)) {
      const answer = await protocol.getMetaItem({ type: 'view', name: LIST_VIEW.name });
      expect(answer?.item, label).toMatchObject({ name: LIST_VIEW.name, label: 'Inquiry board', viewKind: 'list' });
    }
  });

  it('(b) a public form withdrawn before the upgrade, by the Default Organization or another one, is refused at both doors after it, on both kernels', async () => {
    await seed17x([
      // The Default Organization's form, open, and another organization's withdrawal of the same form.
      { id: 'md_form_default', organization: DEFAULT_ORG, body: formView(true, 'Contact (default)') },
      { id: 'md_form_b', organization: OTHER_ORG, body: formView(false, 'Contact (b)') },
    ]);
    // Before the upgrade the form is open: the doors read the Default Organization's row, never the other's.
    const before = await boot();
    for (const { label, protocol, environmentId } of kernels(before.ql, before.host)) {
      expect(await doors(protocol, environmentId, true), label).toEqual(OPEN);
    }
    await before.stack.shutdown();
    stacks.pop();

    const report = await ceremony();
    expect(report.steps.find((s) => s.step === 'presentational-promotion')).toMatchObject({
      status: 'done', summary: { promoted: 1, withdrawalsCarried: 1, reported: 1 },
    });

    const after = await boot();
    for (const { label, protocol, environmentId } of kernels(after.ql, after.host)) {
      // Refused through the legacy read the doors still carry, and through the environment layer alone.
      expect(await doors(protocol, environmentId, true), `${label}, legacy read`).toEqual(CLOSED);
      expect(await doors(protocol, environmentId, false), `${label}, environment-wide`).toEqual(CLOSED);
    }
    // The legacy read now reads nothing the environment-wide read does not: the Default Organization holds no view row.
    const legacy = await after.host.getMetaItems({ type: 'view', legacyFormOrganizationId: DEFAULT_ORG });
    const envWide = await after.host.getMetaItems({ type: 'view' });
    expect(legacy.items).toEqual(envWide.items);
  });
});
