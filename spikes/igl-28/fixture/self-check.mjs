import assert from 'node:assert/strict';
import { load } from './ledger.mjs';

const roles = ['viewer', 'member', 'admin'];
const orders = ['declared', 'reversed'];
const names = ['list_expenses', 'get_expense', 'create_expense', 'approve_expense', 'delete_expense', 'get_total', 'switch_workspace', 'sign_out'];
const seed = {
  alpha: [{ id: 'a1', amount_cents: 1200, currency: 'EUR', note: '', status: 'pending' }, { id: 'a2', amount_cents: 3000, currency: 'EUR', note: '', status: 'approved' }],
  beta: [{ id: 'b1', amount_cents: 500, currency: 'EUR', note: '', status: 'pending' }, { id: 'b2', amount_cents: 1000, currency: 'USD', note: '', status: 'pending' }],
};
const err = code => ({ isError: true, content: { code } });
let checks = 0;
function equal(actual, expected) { assert.deepEqual(actual, expected); checks++; }
async function session(role, workspace, bugs = [], enumOrder = 'declared') {
  const app = await load({ bugs, enumOrder });
  const pages = [];
  app.onPageError(e => pages.push(e));
  const call = (name, args) => app.modelContext.callTool(name, args);
  const list = () => app.modelContext.listTools();
  equal(list().map(t => t.name), ['sign_in']);
  equal(await call('sign_in', { role }), { content: { ok: true } });
  if (workspace === 'beta') await call('switch_workspace', { workspace });
  equal(list().map(t => t.name), names);
  return { call, list, pages };
}

// Full clean role × workspace × tool matrix, in both enum orders.
for (const order of orders) for (const role of roles) for (const workspace of ['alpha', 'beta']) {
  const { call, list, pages } = await session(role, workspace, [], order);
  const descriptors = list();
  const total = workspace === 'alpha' ? 4200 : 1400;
  const id = seed[workspace][0].id;
  equal(await call('list_expenses'), { content: seed[workspace] });
  for (const row of seed[workspace]) equal(await call('get_expense', { id: row.id }), { content: row });
  equal(await call('get_total'), { content: { amount_cents: total, currency: 'EUR' } });
  for (const missing of ['unknown', workspace === 'alpha' ? 'b1' : 'a1']) {
    equal(await call('get_expense', { id: missing }), err('NOT_FOUND'));
    for (const tool of ['approve_expense', 'delete_expense']) equal(await call(tool, { id: missing }), err(role === 'admin' ? 'NOT_FOUND' : 'FORBIDDEN'));
  }
  // Mutating a returned row or schema cannot modify the app.
  const read = await call('list_expenses'); read.content[0].amount_cents = 0;
  list()[0].inputSchema.type = 'null';
  equal(await call('list_expenses'), { content: seed[workspace] }); equal(list(), descriptors);
  for (const currency of ['EUR', 'USD']) {
    const result = await call('create_expense', { amount_cents: 100, currency, note: 'check' });
    if (role === 'viewer') {
      equal(result, err('FORBIDDEN')); equal(await call('list_expenses'), { content: seed[workspace] });
    } else {
      equal(result, { content: { id: currency === 'EUR' ? 'e1' : 'e2', amount_cents: 100, currency, note: 'check', status: 'pending' } });
      equal(await call('get_expense', { id: result.content.id }), result);
    }
  }
  equal(await call('get_total'), { content: { amount_cents: total + (role === 'viewer' ? 0 : 190), currency: 'EUR' } });
  const before = await call('list_expenses');
  const approval = await call('approve_expense', { id });
  if (role !== 'admin') {
    equal(approval, err('FORBIDDEN')); equal(await call('list_expenses'), before);
    equal(await call('delete_expense', { id }), err('FORBIDDEN')); equal(await call('list_expenses'), before);
  } else {
    equal(approval, { content: { ...seed[workspace][0], status: 'approved' } });
    equal(await call('get_expense', { id }), approval);
    equal((await call('list_expenses')).content[0], approval.content);
    equal(await call('approve_expense', { id }), approval);
    if (workspace === 'beta') equal((await call('approve_expense', { id: 'b2' })).content.status, 'approved');
    equal(await call('delete_expense', { id }), { content: { ok: true } });
    equal(await call('get_expense', { id }), err('NOT_FOUND'));
    equal((await call('list_expenses')).content.some(row => row.id === id), false);
    equal(await call('get_total'), { content: { amount_cents: total + 190 - seed[workspace][0].amount_cents, currency: 'EUR' } });
  }
  const written = await call('list_expenses');
  const other = workspace === 'alpha' ? 'beta' : 'alpha';
  equal(await call('switch_workspace', { workspace: other }), { content: { ok: true } });
  equal(await call('list_expenses'), { content: seed[other] });
  await call('switch_workspace', { workspace }); equal(await call('list_expenses'), written);
  equal(list(), descriptors);
  equal(await call('sign_out'), { content: { ok: true } }); equal(list().map(t => t.name), ['sign_in']);
  equal(await call('get_total'), err('TOOL_NOT_FOUND'));
  await call('sign_in', { role });
  equal(await call('list_expenses'), workspace === 'alpha' ? written : { content: seed.alpha });
  equal(pages, []);
}

// Explicit witnesses record the predicted wrong value/error, not merely any failure.
async function witness(flag, enabled, order, role) {
  const { call, list, pages } = await session(role, 'alpha', enabled ? [flag] : [], order);
  const descriptors = list();
  let observed;
  switch (flag) {
    case 'B1': {
      const result = await call('approve_expense', { id: 'a1' });
      equal(result, enabled ? { content: { ...seed.alpha[0], status: 'approved' } } : err('FORBIDDEN'));
      observed = (await call('get_expense', { id: 'a1' })).content.status;
      equal(observed, enabled ? 'approved' : 'pending'); break;
    }
    case 'B2':
      equal(await call('delete_expense', { id: 'a1' }), { content: { ok: true } });
      equal(await call('get_expense', { id: 'a1' }), enabled ? { content: seed.alpha[0] } : err('NOT_FOUND'));
      observed = (await call('list_expenses')).content.map(row => row.id);
      equal(observed, enabled ? ['a1', 'a2'] : ['a2']); break;
    case 'B3':
      await call('switch_workspace', { workspace: 'beta' });
      observed = (await call('get_total')).content.amount_cents; equal(observed, enabled ? 1500 : 1400); break;
    case 'B4':
      await call('switch_workspace', { workspace: 'beta' }); await call('switch_workspace', { workspace: 'alpha' });
      observed = (await call('list_expenses')).content; equal(observed, seed[enabled ? 'beta' : 'alpha']); break;
    case 'B5':
      equal((await call('approve_expense', { id: 'a1' })).content.status, 'approved');
      observed = (await call('get_expense', { id: 'a1' })).content.status; equal(observed, enabled ? 'pending' : 'approved'); break;
    case 'B6':
      await call('switch_workspace', { workspace: 'beta' });
      if (enabled) { await assert.rejects(call('approve_expense', { id: 'b2' }), TypeError); observed = 'TypeError'; }
      else { observed = (await call('approve_expense', { id: 'b2' })).content.status; equal(observed, 'approved'); }
      break;
    case 'B7':
      equal((await call('create_expense', { amount_cents: 100, currency: 'USD', note: '' })).content.id, 'e1');
      observed = list().length; equal(observed, enabled ? 0 : 8); break;
    case 'B8':
      if (enabled) { await assert.rejects(call('get_expense', { id: 'unknown' }), TypeError); observed = 'TypeError'; }
      else { observed = await call('get_expense', { id: 'unknown' }); equal(observed, err('NOT_FOUND')); }
      break;
  }
  if (flag !== 'B7' || !enabled) equal(list(), descriptors);
  equal(pages, []);
  return observed;
}
for (const flag of ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8']) {
  const applicable = ['B3', 'B4', 'B8'].includes(flag) ? roles : flag === 'B1' ? ['viewer'] : flag === 'B7' ? ['member', 'admin'] : ['admin'];
  for (const role of applicable) {
    let declared;
    for (const order of orders) {
      const clean = await witness(flag, false, order, role);
      const faulty = await witness(flag, true, order, role);
      assert.notDeepEqual(clean, faulty);
      if (order === 'declared') declared = { clean, faulty }; else equal({ clean, faulty }, declared);
    }
    console.log(`${flag} ${role}: ${JSON.stringify(declared)}`);
  }
}

// Every enum is reversed, all other descriptor content stays unchanged.
const declared = await load(); const reversed = await load({ enumOrder: 'reversed' });
function reverseEnums(value) {
  if (Array.isArray(value)) return value.map(reverseEnums);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, key === 'enum' ? [...val].reverse() : reverseEnums(val)]));
}
for (const signedIn of [false, true]) {
  if (signedIn) for (const app of [declared, reversed]) await app.modelContext.callTool('sign_in', { role: 'admin' });
  equal(reversed.modelContext.listTools(), reverseEnums(declared.modelContext.listTools()));
}
const { call, list } = await session('admin', 'alpha');
for (const amount_cents of [0, -1, 1.5, '1']) equal(await call('create_expense', { amount_cents, currency: 'EUR', note: '' }), err('INVALID_ARGUMENT'));
equal(await call('create_expense', { amount_cents: 1, currency: 'GBP', note: '' }), err('INVALID_ARGUMENT'));
equal(await call('switch_workspace', { workspace: 'unknown' }), err('INVALID_ARGUMENT'));
equal((await call('create_expense', { amount_cents: 1, currency: 'EUR', note: '' })).content.id, 'e1');
for (const row of (await call('list_expenses')).content) await call('delete_expense', { id: row.id });
equal((await call('list_expenses')).content, []);
equal((await call('get_total')).content, { amount_cents: 0, currency: 'EUR' }); equal(list().map(t => t.name), names);
const fresh = await session('admin', 'alpha'); equal((await fresh.call('list_expenses')).content, seed.alpha);
console.log(`PASS: ${checks} comparisons; clean matrix, B1–B8 witnesses, both enum orders; no spike imported.`);
