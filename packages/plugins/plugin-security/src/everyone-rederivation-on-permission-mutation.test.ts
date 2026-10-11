// Copyright (c) 2026 ObjectStack. Licensed under the Apache-2.0 license.

/**
 * [#22801 → A, C3 stage 6b-2] Every landed `permission` mutation derives the
 * `everyone` anchor again.
 *
 * The derivation used to ride the `permission` publish materializer, which
 * retired with the declared-permission seeder (ADR-0131 D3: no catalog row is
 * written). It now hangs off the protocol's post-persistence mutation signal
 * (`onMetadataMutation`), the one choke point every authoring door funnels
 * through — and unconditionally on the body: whether an accepted set still
 * qualifies is `readAcceptedEveryoneSets`' question, asked of what the catalog
 * now serves, so a publish that drops `isDefault` or deletes the set stops it
 * granting at once.
 *
 * Pinned at the wiring: which events re-derive, which do not, and that a
 * bootstrap re-run (the first-user replay) never registers a second listener.
 * What a derivation then declares is U2's own suite
 * (`suggested-audience-bindings.test.ts`, the dogfood acceptance pin).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { assertEngineFindOnePredicate, assertEngineUpdateDispatch, type EngineFindOneQueryInput } from '@objectstack/metadata-core';
import { SecurityPlugin } from './security-plugin.js';

afterEach(() => { vi.restoreAllMocks(); });

type MutationListener = (evt: { type: string; name: string; state: 'active' | 'draft' | 'deleted' }) => void;

/**
 * Field equality plus `{ $in: [...] }`. Anything else is REFUSED rather than
 * answered — a combinator read as a field name matches no row and would report
 * that as "no rows".
 */
function rowMatches(row: any, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k.startsWith('$')) {
      throw new Error(`this double implements field predicates only; it cannot answer '${k}'`);
    }
    const actual = row?.[k] ?? null;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const ops = Object.keys(v as Record<string, unknown>);
      if (ops.length === 1 && ops[0] === '$in') {
        return ((v as any).$in as unknown[]).some((m) => (m ?? null) === actual);
      }
      throw new Error(`this double implements equality and $in only; it cannot answer ${JSON.stringify(ops)}`);
    }
    return actual === (v ?? null);
  });
}

/** Boot the real plugin over an in-memory engine, with a protocol that exposes the mutation signal. */
async function boot() {
  const tables: Record<string, any[]> = {};
  const ql: any = {
    registerMiddleware: () => {},
    // Only the identity objects the plugin's boot gate requires.
    getSchema: (name: string) =>
      name === 'sys_user' || name === 'sys_member' ? { name, fields: {} } : undefined,
    registry: { listItems: () => [] },
    find: async (object: string, opts?: any) => {
      const matched = (tables[object] ?? []).filter((r) => rowMatches(r, opts?.where ?? {}));
      // The caller's bound, applied BY PRESENCE and after the filter
      // (`check:objectql-double-limit`).
      return (typeof opts?.limit === 'number' ? matched.slice(0, opts.limit) : matched).map((r) => ({ ...r }));
    },
    findOne: async (object: string, query?: EngineFindOneQueryInput) => {
      assertEngineFindOnePredicate(object, query);
      return null;
    },
    count: async () => 0,
    insert: async (object: string, data: any) => {
      const row = { id: data?.id ?? `${object}_${(tables[object] ?? []).length + 1}`, ...data };
      (tables[object] ??= []).push(row);
      return { ...row };
    },
    update: async (_object: string, data: any, options?: any) => {
      assertEngineUpdateDispatch(data, options);
      return 0;
    },
  };
  const listeners: MutationListener[] = [];
  const protocol = {
    // Present so the projection wiring takes its awaited seam and adds no
    // listener of its own: every listener counted below is this stage's.
    registerMutationProjector: vi.fn(),
    onMetadataMutation: (listener: MutationListener) => {
      listeners.push(listener);
      return () => {};
    },
  };
  const services: Record<string, any> = {
    manifest: { register: vi.fn() },
    objectql: ql,
    metadata: { get: async () => null, list: async () => [] },
    protocol,
  };
  const hook = vi.fn();
  const ctx: any = {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    registerService: vi.fn(),
    getService: (name: string) => {
      if (!(name in services)) throw new Error(`service not registered: ${name}`);
      return services[name];
    },
    hook,
  };
  const derive = vi.spyOn(SecurityPlugin.prototype as any, 'declareEveryone').mockResolvedValue(undefined);
  const plugin = new SecurityPlugin();
  await plugin.init(ctx);
  await plugin.start(ctx);
  const fire = async (event: string) => {
    for (const [, cb] of hook.mock.calls.filter((c: any[]) => c[0] === event)) await cb();
  };
  /** Let a fire-and-forget listener's promise chain settle. */
  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
  return { ctx, fire, settle, listeners, derive };
}

describe('[#22801 → A] a landed permission mutation re-derives everyone', () => {
  it('registers ONE listener, and a bootstrap re-run never adds a second', async () => {
    const { ctx, fire, listeners } = await boot();
    await fire('kernel:ready');
    // Positive control: the bootstrap really completed.
    expect(
      ctx.logger.info.mock.calls.filter((c: any[]) => String(c[0]).includes('platform bootstrap complete')),
    ).toHaveLength(1);
    expect(listeners).toHaveLength(1);
    await fire('kernel:ready');
    expect(listeners).toHaveLength(1);
  });

  it('a published or deleted permission derives everyone again — whatever the body said', async () => {
    const { fire, settle, listeners, derive } = await boot();
    await fire('kernel:ready');
    const before = derive.mock.calls.length;

    listeners[0]!({ type: 'permission', name: 'crm_sales_user', state: 'active' });
    await settle();
    expect(derive.mock.calls.length - before).toBe(1);

    listeners[0]!({ type: 'permission', name: 'crm_sales_user', state: 'deleted' });
    await settle();
    expect(derive.mock.calls.length - before).toBe(2);
  });

  it('a draft, or a mutation of another type, derives nothing', async () => {
    const { fire, settle, listeners, derive } = await boot();
    await fire('kernel:ready');
    const before = derive.mock.calls.length;

    listeners[0]!({ type: 'permission', name: 'crm_sales_user', state: 'draft' });
    listeners[0]!({ type: 'position', name: 'sales_rep', state: 'active' });
    listeners[0]!({ type: 'object', name: 'crm_lead', state: 'active' });
    await settle();
    expect(derive.mock.calls.length - before).toBe(0);
  });
});
