// MEASUREMENT PROBE (not a pin): run with `pnpm --filter @objectstack/runtime exec vitest run --project local src/zz-probe-25073.integration.test.ts`; drop this file when the build resumes.
import { describe, it, afterEach } from 'vitest';
import { ObjectQL } from '@objectstack/objectql';
import { SqlDriver } from '@objectstack/driver-sql';
import { InMemoryDriver } from '@objectstack/driver-memory';

const CASE = {
  name: 'pcase',
  fields: {
    subject: { type: 'text' },
    case_number: { type: 'autonumber', format: 'CASE-{00000}', unique: true },
    display_title: { type: 'text', expression: 'record.case_number + " - " + record.subject' },
    plain_title: { type: 'text', expression: '"S:" + record.subject' },
    must: { type: 'text', required: true },
  },
} as any;
const PRODUCT = {
  name: 'pproduct',
  fields: {
    name: { type: 'text' },
    product_code: { type: 'autonumber', format: 'PRD-{0000}' },
    title: { type: 'text', expression: 'has(record.product_code) ? record.product_code + " " + record.name : record.name' },
  },
} as any;

const out: string[] = [];
const log = (...a: unknown[]) => { out.push(a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); };
const open: any[] = [];
afterEach(async () => { while (open.length) { try { await open.pop().disconnect(); } catch { /* */ } } console.log('\n=== PROBE ===\n' + out.splice(0).join('\n')); });

async function bootMemory() {
  const driver = new InMemoryDriver();
  const engine = new ObjectQL();
  engine.registerDriver(driver as any, true);
  await engine.init();
  engine.registry.registerObject(CASE, 'probe');
  engine.registry.registerObject(PRODUCT, 'probe');
  await driver.syncSchema('pcase', CASE); await driver.syncSchema('pproduct', PRODUCT);
  return { driver, engine };
}
async function bootSql() {
  const driver = new SqlDriver({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  open.push(driver);
  const engine = new ObjectQL();
  engine.registerDriver(driver as any, true);
  await engine.init();
  engine.registry.registerObject(CASE, 'probe');
  engine.registry.registerObject(PRODUCT, 'probe');
  await driver.initObjects([CASE, PRODUCT]);
  return { driver, engine };
}
const stored = async (engine: ObjectQL, object: string) =>
  (await engine.find(object, { fields: undefined } as any, { context: { isSystem: true } } as any) as any[])
    .map((r) => ({ n: r.case_number ?? r.product_code, t: r.display_title ?? r.title, p: r.plain_title }));

describe('probe #25073', () => {
  it('P1 engine-issued (memory): single, batch, partial', async () => {
    const { engine } = await bootMemory();
    const one = await engine.insert('pcase', { subject: 'one', must: 'x' });
    log('P1 single response', { n: one.case_number, t: one.display_title });
    await engine.insert('pcase', [{ subject: 'b1', must: 'x' }, { subject: 'b2', must: 'x' }]);
    const partial = await (engine as any).insertMany('pcase', [{ subject: 'p1', must: 'x' }, { subject: 'dead' }, { subject: 'p3', must: 'x' }]);
    log('P1 partial outcomes', partial.map((o: any) => o.ok ? { n: o.record.case_number, t: o.record.display_title } : 'dead'));
    const p = await engine.insert('pproduct', { name: 'Probe product' });
    log('P1 product response', { n: p.product_code, t: p.title });
    log('P1 stored pcase', await stored(engine, 'pcase'));
    log('P1 stored pproduct', await stored(engine, 'pproduct'));
  });

  it('P2 collision re-issue (memory)', async () => {
    const { engine, driver } = await bootMemory();
    await engine.insert('pcase', { subject: 'seed', must: 'x' }); // counter -> 1
    await driver.create('pcase', { id: 'oob', subject: 'oob', must: 'x', case_number: 'CASE-00002' }); // out-of-band
    const r = await engine.insert('pcase', { subject: 'collide', must: 'x' });
    log('P2 response', { n: r.case_number, t: r.display_title });
    log('P2 stored', await stored(engine, 'pcase'));
  });

  it('P3 driver-issued (sql/sqlite): single, batch, product', async () => {
    const { engine } = await bootSql();
    const one = await engine.insert('pcase', { subject: 'one', must: 'x' });
    log('P3 single response', { n: one.case_number, t: one.display_title, p: one.plain_title });
    await engine.insert('pcase', [{ subject: 'b1', must: 'x' }, { subject: 'b2', must: 'x' }]);
    const p = await engine.insert('pproduct', { name: 'Probe product' });
    log('P3 product response', { n: p.product_code, t: p.title });
    log('P3 stored pcase', await stored(engine, 'pcase'));
    log('P3 stored pproduct', await stored(engine, 'pproduct'));
    const up = await engine.update('pcase', { subject: 'one!' }, { where: { id: one.id } } as any);
    log('P3 after update by id', { n: up.case_number, t: up.display_title });
  });

  it('P6 sql single with an ambient unit + afterInsert hook view', async () => {
    const { engine } = await bootSql();
    const seen: any[] = [];
    (engine as any).registerHook('afterInsert', async (ctx: any) => { seen.push(ctx.result?.display_title); }, { object: 'pcase' });
    const r: any = await engine.insert('pcase', { subject: 'hooked', must: 'x' });
    log('P6 afterInsert saw', seen, 'response', r.display_title);
  });

  it('P4 sql driver collision self-heal: outside vs inside a unit', async () => {
    const { engine, driver } = await bootSql();
    await engine.insert('pcase', { subject: 'seed', must: 'x' });
    await (driver as any).knex('pcase').insert({ id: 'oob', subject: 'oob', must: 'x', case_number: 'CASE-00002' });
    try {
      const r = await engine.insert('pcase', { subject: 'outside', must: 'x' });
      log('P4 outside-unit insert', { ok: true, n: r.case_number });
    } catch (e: any) { log('P4 outside-unit insert', { ok: false, code: e.code, msg: String(e.message).slice(0, 120) }); }
    const { engine: e2, driver: d2 } = await bootSql();
    await e2.insert('pcase', { subject: 'seed', must: 'x' });
    await (d2 as any).knex('pcase').insert({ id: 'oob', subject: 'oob', must: 'x', case_number: 'CASE-00002' });
    for (let k = 0; k < 2; k++) {
      try {
        const r = await e2.transaction((ctx: any) => e2.insert('pcase', { subject: 'inside', must: 'x' }, { context: ctx } as any));
        log('P4 inside-unit insert', k, { ok: true, n: (r as any).case_number });
      } catch (e: any) { log('P4 inside-unit insert', k, { ok: false, code: e.code, msg: String(e.message).slice(0, 120) }); }
    }
  });

  it('P5 route B prototype: insert + by-id driver update in one unit (sql)', async () => {
    const { engine, driver } = await bootSql();
    const r: any = await engine.transaction(async (ctx: any) => {
      const row: any = await engine.insert('pcase', { subject: 'proto', must: 'x' }, { context: ctx } as any);
      await (driver as any).update('pcase', row.id, { display_title: `${row.case_number} - ${row.subject}` }, { transaction: ctx.transaction });
      return row;
    });
    const back: any = (await (driver as any).knex('pcase').where('id', r.id))[0];
    log('P5 stored after unit', { n: back.case_number, t: back.display_title, created_at: back.created_at, updated_at: back.updated_at });
    log('P5 driver supports', (driver as any).supports);
  });
});
