// Copyright (c) 2026 ObjectStack. Licensed under the Apache-2.0 license.

/**
 * `sys_approval_request`'s record-detail page — the slotted page this plugin
 * serves through its manifest `pages` (maintainer ruling 乙 on objectui#12045,
 * `6079807016`: the page is metadata in plugin-approvals; objectui registers
 * renderers and mounts `RecordDetailView`).
 *
 * Four questions, each answered against the shipped artifacts and never a
 * copy of them:
 *
 *   1. the plugin's manifest carries the page, so the registry — and the
 *      metadata API reading it — has it;
 *   2. the slot map is the one the ruling's build list names: one
 *      `record:approval_decision` node, `record:details`, `sys_approval_action`
 *      as the related list, no discussion thread, and a highlights strip that
 *      leaves `record_id` to the details grid (the seat's choice on the ui
 *      seat's design input `6081889955`);
 *   3. the page passes what `os validate` judges a page by — the parse, the
 *      component-type vocabulary, the props rows and the build rules — with a
 *      control for each half that can go red;
 *   4. its label is translated in every shipped locale, `en` byte-equal to
 *      the page literal, and served as the translation (not the fallback);
 *   5. the Details tab's `record:json` panel names a key the request read
 *      really serves — no publish check judges that `field`, so this does.
 */

import { describe, it, expect } from 'vitest';
import { ObjectStackDefinitionSchema, normalizeStackInput } from '@objectstack/spec';
import { PageSchema } from '@objectstack/spec/ui';
import {
  COMPONENT_PROPS_UNKNOWN_KEY,
  COMPONENT_TYPE_UNKNOWN,
  runAuthoringRules,
  splitBySeverity,
  validateComponentProps,
  validateComponentTypes,
} from '@objectstack/lint';
import { ApprovalsServicePlugin } from './approvals-plugin.js';
import { ApprovalService } from './approval-service.js';
import { SysApprovalRequestDetailPage } from './sys-approval-request.page.js';
import { SysApprovalRequest } from './sys-approval-request.object.js';
import { SysApprovalAction } from './sys-approval-action.object.js';
import { ApprovalsTranslations } from './translations/index.js';
import { approvalsPageTranslations } from './translations/pages.js';

type AnyRec = Record<string, any>;

const PAGE = SysApprovalRequestDetailPage as AnyRec;
const SLOTS = (PAGE.slots ?? {}) as AnyRec;
const TAB_ITEMS = (SLOTS.tabs?.properties?.items ?? []) as AnyRec[];

/** The plugin's one manifest, as `init` registers it. */
async function registeredManifest(): Promise<AnyRec> {
  const registered: AnyRec[] = [];
  const ctx: any = {
    getService: (name: string) =>
      name === 'manifest' ? { register: (m: AnyRec) => registered.push(m) } : undefined,
    logger: { info: () => {}, warn: () => {} },
  };
  await new ApprovalsServicePlugin({ disableService: true }).init(ctx);
  expect(registered).toHaveLength(1);
  return registered[0];
}

/** Every component node under the page, slots and tab children included. */
function nodesOf(value: unknown, out: AnyRec[] = []): AnyRec[] {
  if (Array.isArray(value)) {
    for (const v of value) nodesOf(v, out);
  } else if (value && typeof value === 'object') {
    const rec = value as AnyRec;
    if (typeof rec.type === 'string') out.push(rec);
    for (const v of Object.values(rec)) nodesOf(v, out);
  }
  return out;
}

const MANIFEST = {
  id: 'com.objectstack.test.approval-request-page',
  name: 'approval_request_page',
  version: '1.0.0',
  type: 'app',
} as const;

/** The page in a stack beside the two objects it binds, parsed as `os validate` parses it. */
function judgedStack(page: AnyRec) {
  const normalized = normalizeStackInput({
    manifest: MANIFEST,
    objects: [SysApprovalRequest, SysApprovalAction],
    pages: [page],
  }) as AnyRec;
  const result = ObjectStackDefinitionSchema.safeParse(normalized);
  if (!result.success) {
    throw new Error(
      'stack is not spec-valid: '
        + result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
    );
  }
  return { normalized, parsed: result.data as AnyRec };
}

/** The build rules' findings located on the page (the objects' own are not this file's question). */
function pageBuildFindings(page: AnyRec) {
  const { normalized, parsed } = judgedStack(page);
  return runAuthoringRules('build', { normalized, parsed }).filter((f) => f.path.startsWith('pages'));
}

/** The page with its decision node replaced. */
const withDecisionNode = (node: AnyRec): AnyRec => ({ ...PAGE, slots: { ...SLOTS, actions: [node] } });

/** The subject-record snapshot a stored request row holds in `payload_json`. */
const SNAPSHOT = { id: 'exp_1', title: 'Q1 travel', amount: 1200 };
const SUBMITTER = 'employee_7';

/**
 * One request, read the way the request page loads its record. The console
 * routes that `findOne` to `GET /approvals/requests/:id` (objectui's
 * `routeApprovalRecordReads`), whose handler answers `ApprovalService.getRequest`'s
 * row as it stands; this is that call, as the request's submitter, over a
 * find-only engine double holding the stored row.
 */
async function servedRequestRow(): Promise<AnyRec> {
  const tables: Record<string, AnyRec[]> = {
    sys_approval_request: [{
      id: 'req_1',
      organization_id: 't1',
      process_name: 'flow:expense_review',
      object_name: 'expense_report',
      record_id: 'exp_1',
      submitter_id: SUBMITTER,
      status: 'pending',
      current_step: 'finance',
      pending_approvers: 'finance_user',
      payload_json: JSON.stringify(SNAPSHOT),
      created_at: '2026-08-01T00:00:00Z',
    }],
    expense_report: [{ ...SNAPSHOT, organization_id: 't1' }],
  };
  const matches = (row: AnyRec, where: AnyRec | undefined): boolean =>
    Object.entries(where ?? {}).every(([k, v]) => {
      if (k === '$or') return (v as AnyRec[]).some((w) => matches(row, w));
      if (k === '$and') return (v as AnyRec[]).every((w) => matches(row, w));
      if (v != null && typeof v === 'object' && '$in' in v) return (v.$in as unknown[]).includes(row[k]);
      return row[k] === v;
    });
  const engine = {
    async find(object: string, options?: AnyRec) {
      return (tables[object] ?? []).filter((r) => matches(r, options?.where ?? options?.filter)).map((r) => ({ ...r }));
    },
  };
  const row = await new ApprovalService({ engine: engine as any })
    .getRequest('req_1', { userId: SUBMITTER, tenantId: 't1', positions: [], permissions: [] } as any);
  expect(row, 'the submitter reads their own request').not.toBeNull();
  return row as AnyRec;
}

describe('sys_approval_request detail page — served through the manifest', () => {
  it('the plugin manifest carries the page in `pages`', async () => {
    const manifest = await registeredManifest();
    expect(manifest.pages).toEqual([SysApprovalRequestDetailPage]);
  });

  it('is the default slotted record page of sys_approval_request', () => {
    expect(PAGE).toMatchObject({
      name: 'sys_approval_request_detail',
      type: 'record',
      object: 'sys_approval_request',
      kind: 'slotted',
      isDefault: true,
    });
    const parsed = PageSchema.safeParse(PAGE);
    expect(parsed.success, JSON.stringify(parsed.error?.issues ?? [])).toBe(true);
  });
});

describe('sys_approval_request detail page — the slot map', () => {
  it('authors exactly the decision panel, the highlights, the tabs and an empty discussion', () => {
    // No `details` slot: the console builds the tab strip from `tabs` when both
    // are present, so the details body lives in the first tab. No header: it
    // falls through to the synthesizer.
    expect(Object.keys(SLOTS).sort()).toEqual(['actions', 'discussion', 'highlights', 'tabs']);
  });

  it('holds ONE record:approval_decision node, with no properties (its props row is empty and strict)', () => {
    const decision = nodesOf(SLOTS).filter((n) => n.type === 'record:approval_decision');
    expect(decision).toHaveLength(1);
    expect(SLOTS.actions).toEqual([{ type: 'record:approval_decision' }]);
  });

  it('highlights the object\'s highlightFields minus record_id, which the object itself keeps', () => {
    // The seat's choice on the ui seat's design input: the page's strip drops
    // `record_id` so the details grid keeps it (that grid is where the console
    // draws the target-record card of the `record_id` / `object_name` pointer
    // pair), and the object's `highlightFields` is left as it is.
    const declared = SysApprovalRequest.highlightFields ?? [];
    expect(declared).toContain('record_id');
    expect(SLOTS.highlights?.type).toBe('record:highlights');
    expect(SLOTS.highlights.properties.fields).toEqual(declared.filter((f: string) => f !== 'record_id'));
    expect((SysApprovalRequest.fields as AnyRec).record_id?.referenceVia).toBe('object_name');
  });

  it('tabs: Details is record:details then the raw snapshot panel, Timeline is sys_approval_action as a related list on request_id', () => {
    expect(TAB_ITEMS.map((t) => t.label?.en)).toEqual(['Details', 'Timeline']);
    const details = TAB_ITEMS[0].children as AnyRec[];
    expect(details.map((n) => n.type)).toEqual(['record:details', 'record:json']);
    expect(details[0]).toEqual({ type: 'record:details' });
    // The panel: the parsed request snapshot, gated on the platform-scope
    // capability the inbox side sheet's raw panel is gated on. Its label is
    // copy, so only its locales are held here.
    const { label, ...panel } = details[1].properties as AnyRec;
    expect(panel).toEqual({ field: 'payload', requiredPermissions: ['studio.access'] });
    expect(Object.keys(label).sort()).toEqual(Object.keys(ApprovalsTranslations).sort());
    const [timeline] = TAB_ITEMS[1].children as AnyRec[];
    expect(timeline.type).toBe('record:related_list');
    expect(timeline.properties).toMatchObject({ objectName: 'sys_approval_action', relationshipField: 'request_id' });
    // The relationship really points back at this object.
    expect((SysApprovalAction.fields as AnyRec).request_id).toMatchObject({ type: 'lookup', reference: 'sys_approval_request' });
  });

  it('every field the page names exists on its object', () => {
    const requestFields = Object.keys(SysApprovalRequest.fields);
    const actionFields = Object.keys(SysApprovalAction.fields);
    const [timeline] = TAB_ITEMS[1].children as AnyRec[];
    const missing = [
      ...(SLOTS.highlights.properties.fields as string[]).filter((f) => !requestFields.includes(f)).map((f) => `request.${f}`),
      ...(timeline.properties.columns as string[]).filter((f) => !actionFields.includes(f)).map((f) => `action.${f}`),
      ...(timeline.properties.sort as AnyRec[]).map((s) => s.field).filter((f) => !actionFields.includes(f)).map((f) => `action.${f}`),
    ];
    expect(missing).toEqual([]);
  });

  it('has no discussion thread anywhere — the reply is the declared approval_comment action', () => {
    expect(SLOTS.discussion).toEqual([]);
    expect(nodesOf(SLOTS).map((n) => n.type).filter((t) => t === 'record:discussion' || t === 'record:chatter')).toEqual([]);
    const actions = (SysApprovalRequest.actions ?? []) as AnyRec[];
    expect(actions.find((a) => a.name === 'approval_comment')?.locations).toEqual(['record_section']);
  });
});

describe('sys_approval_request detail page — the raw snapshot panel draws a key the request read serves', () => {
  // `record:json`'s `field` is not judged against the object's fields at
  // publish (the key it exists for is served beside them), so a key the
  // request read does not serve draws nothing, and nothing says so.
  it('the request read serves the parsed snapshot under the panel\'s `field`, and never the stored column', async () => {
    const panels = nodesOf(SLOTS).filter((n) => n.type === 'record:json');
    expect(panels).toHaveLength(1);
    const { field } = panels[0].properties as AnyRec;
    const row = await servedRequestRow();
    expect({ field, served: row[field] }).toEqual({ field, served: SNAPSHOT });
    // `payload_json` is the declared column the stored row holds; the read
    // serves its parse as `payload`, never the column under its own name.
    expect(Object.keys(SysApprovalRequest.fields)).toContain('payload_json');
    expect(row).not.toHaveProperty('payload_json');
  });
});

describe('sys_approval_request detail page — what `os validate` judges a page by', () => {
  it('the component-type vocabulary knows every node, record:approval_decision included', () => {
    expect(validateComponentTypes({ pages: [PAGE] })).toEqual([]);
  });

  it('control: a misspelled decision-panel type is refused by the same call', () => {
    const findings = validateComponentTypes({ pages: [withDecisionNode({ type: 'record:approval_decison' })] });
    expect(findings.map((f) => [f.rule, f.path])).toEqual([[COMPONENT_TYPE_UNKNOWN, 'pages[0].slots.actions[0].type']]);
  });

  it('every node\'s props are inside its declared props row', () => {
    expect(validateComponentProps({ pages: [PAGE] })).toEqual([]);
  });

  it('control: a property on the decision node is refused by the same call', () => {
    const findings = validateComponentProps({ pages: [withDecisionNode({ type: 'record:approval_decision', properties: { showProgress: true } })] });
    expect(findings.map((f) => f.rule)).toEqual([COMPONENT_PROPS_UNKNOWN_KEY]);
  });

  it('the build rules raise no error on the page, in a stack beside the two objects it binds', () => {
    const { errors } = splitBySeverity(pageBuildFindings(PAGE));
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
  });

  it('control: the build rules see the page — the misspelled type is an error there too', () => {
    const { errors } = splitBySeverity(pageBuildFindings(withDecisionNode({ type: 'record:approval_decison' })));
    expect(errors.map((f) => f.rule)).toContain(COMPONENT_TYPE_UNKNOWN);
  });
});

describe('sys_approval_request detail page — its label in the translation bundles', () => {
  const NAME = 'sys_approval_request_detail';

  it('the `en` entry is byte-equal to the page literal', () => {
    // `translatePage` applies the bundle in `en` too, so a drifted `en` entry
    // would override the page's own label rather than fall back to it.
    expect(approvalsPageTranslations.en[NAME]?.label).toBe(PAGE.label);
  });

  it('every served locale carries the label, and a translated locale serves its translation', () => {
    const locales = Object.keys(ApprovalsTranslations).sort();
    expect(locales).toEqual(['en', 'es-ES', 'ja-JP', 'zh-CN']);
    for (const locale of locales) {
      const served = (ApprovalsTranslations as AnyRec)[locale]?.pages?.[NAME]?.label;
      const authored = (approvalsPageTranslations as AnyRec)[locale]?.[NAME]?.label;
      expect({ locale, served }).toEqual({ locale, served: authored });
      // Served AS the translation: the recorded source digest is current, so
      // the staleness fallback did not put the English source in its place.
      if (locale !== 'en') expect({ locale, english: served === PAGE.label }).toEqual({ locale, english: false });
    }
  });
});
