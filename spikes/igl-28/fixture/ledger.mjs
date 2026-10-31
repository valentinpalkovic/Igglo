// Dependency-free, deterministic in-process WebMCP-shaped fixture.
export async function load({ bugs = [], enumOrder = 'declared' } = {}) {
  if (!['declared', 'reversed'].includes(enumOrder)) throw new TypeError('Invalid enumOrder');
  if (!Array.isArray(bugs) || bugs.length > 1 || bugs.some(b => !/^B[1-8]$/.test(b))) {
    throw new TypeError('Use no bug flag or exactly one of B1–B8');
  }
  const has = id => bugs.includes(id);
  const copy = value => structuredClone(value);
  const ok = content => ({ content: copy(content) });
  const error = code => ({ isError: true, content: { code } });
  const row = (id, amount_cents, currency, status = 'pending') =>
    ({ id, amount_cents, currency, note: '', status });
  let store = {
    alpha: [row('a1', 1200, 'EUR'), row('a2', 3000, 'EUR', 'approved')],
    beta: [row('b1', 500, 'EUR'), row('b2', 1000, 'USD')],
  };
  let role = null, workspace = 'alpha', listWorkspace = 'alpha', nextId = 1;
  const stale = new Map();
  const pageListeners = new Set();
  const registry = new Map();
  const registerTool = tool => registry.set(tool.name, tool);
  const unregisterTool = name => registry.delete(name);
  const enumeration = values => ({ type: 'string', enum: enumOrder === 'reversed' ? [...values].reverse() : values });
  const idSchema = { id: { type: 'string' } };
  const definitions = [
    ['sign_in', 'Sign in with a role.', { role: enumeration(['viewer', 'member', 'admin']) }, ({ role: selected }) => {
      role = selected; workspace = listWorkspace = 'alpha'; refresh(); return ok({ ok: true });
    }],
    ['list_expenses', 'List expenses in the current workspace.', {}, () => ok(store[listWorkspace])],
    ['get_expense', 'Read an expense in the current workspace.', idSchema, ({ id }) => {
      const item = store[workspace].find(item => item.id === id);
      if (!item) {
        if (has('B8')) throw new TypeError('Cannot read unknown expense');
        return error('NOT_FOUND');
      }
      return ok(stale.get(id) ?? item);
    }],
    ['create_expense', 'Create a pending expense.', {
      amount_cents: { type: 'integer', minimum: 1 }, currency: enumeration(['EUR', 'USD']), note: { type: 'string' },
    }, args => {
      if (role === 'viewer') return error('FORBIDDEN');
      const item = { ...row(`e${nextId++}`, args.amount_cents, args.currency), note: args.note };
      store[workspace].push(item);
      if (has('B7') && args.currency === 'USD') {
        store = null;
        for (const name of registry.keys()) unregisterTool(name);
      }
      return ok(item);
    }],
    ['approve_expense', 'Approve an expense.', idSchema, ({ id }) => {
      const item = store[workspace].find(item => item.id === id);
      if (role !== 'admin' && !(has('B1') && role === 'viewer' && item?.status === 'pending')) return error('FORBIDDEN');
      if (!item) return error('NOT_FOUND');
      if (has('B6') && role === 'admin' && item.currency === 'USD') throw new TypeError('Cannot approve USD expense');
      if (has('B5') && id === 'a1' && !stale.has(id)) stale.set(id, copy(item));
      item.status = 'approved'; return ok(item);
    }],
    ['delete_expense', 'Delete an expense.', idSchema, ({ id }) => {
      if (role !== 'admin') return error('FORBIDDEN');
      const index = store[workspace].findIndex(item => item.id === id);
      if (index < 0) return error('NOT_FOUND');
      if (!has('B2')) { store[workspace].splice(index, 1); stale.delete(id); }
      return ok({ ok: true });
    }],
    ['get_total', 'Total the current workspace in EUR cents.', {}, () => ok({
      amount_cents: Math.round(store[workspace].reduce((sum, item) => sum + item.amount_cents *
        (item.currency === 'USD' && !(has('B3') && workspace === 'beta') ? 0.9 : 1), 0)), currency: 'EUR',
    })],
    ['switch_workspace', 'Select the current workspace.', { workspace: enumeration(['alpha', 'beta']) }, ({ workspace: selected }) => {
      if (!(has('B4') && workspace === 'beta' && selected === 'alpha')) listWorkspace = selected;
      workspace = selected; return ok({ ok: true });
    }],
    ['sign_out', 'Sign out.', {}, () => { role = null; refresh(); return ok({ ok: true }); }],
  ];
  function refresh() {
    for (const name of registry.keys()) unregisterTool(name);
    for (const [name, description, properties, execute] of definitions) {
      if ((role === null) !== (name === 'sign_in')) continue;
      registerTool({ name, description, inputSchema: {
        type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
      }, execute });
    }
  }
  refresh();
  return {
    modelContext: {
      listTools: () => [...registry.values()].map(({ execute, ...descriptor }) => copy(descriptor)),
      async callTool(name, args = {}) {
        const tool = registry.get(name);
        if (!tool) return error('TOOL_NOT_FOUND');
        const properties = tool.inputSchema.properties;
        if (!args || typeof args !== 'object' || Array.isArray(args) ||
          Object.keys(args).some(key => !Object.hasOwn(properties, key)) ||
          Object.entries(properties).some(([key, schema]) =>
            schema.type === 'integer' ? !Number.isSafeInteger(args[key]) || args[key] < schema.minimum :
              typeof args[key] !== 'string' || (schema.enum && !schema.enum.includes(args[key])))) return error('INVALID_ARGUMENT');
        return tool.execute(args);
      },
    },
    onPageError(cb) {
      if (typeof cb !== 'function') throw new TypeError('Expected callback');
      pageListeners.add(cb);
    },
  };
}
