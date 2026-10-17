const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function page(storage, userId = '7', mode = 'CSV') {
  const elements = {};
  let reloads = 0;
  const ctx = {
    sessionStorage: {
      getItem: key => storage[key] || null,
      setItem: (key, value) => { storage[key] = value; },
      removeItem: key => { delete storage[key]; }
    },
    location: { pathname: '/index.html', reload: () => { reloads++; } },
    DataService: { getCurrentUser: () => userId ? { id: userId } : null, isSharePoint: () => mode === 'SHAREPOINT' },
    document: { getElementById: id => elements[id] || (elements[id] = { value: '' }) }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8').replace('global.onload = start;', `
    setAdminVisibility=function(){}; filterAnnouncements=function(){};
    clearForm=function(){}; setHidden=function(){};
    global.api={activate:activateAdmin,restore:restoreAdminMode,deactivate:deactivateAdmin,
      reload:reloadPage,active:function(){return adminActive;},
      edit:markEdited,dirty:function(){return unsaved || formDirty;},
      busy:function(){workflowBusy=true;},pending:function(){pendingSave=function(){};}};
  `), ctx);
  ctx.document.getElementById('admin-password').value = 'snk';
  return { ...ctx.api, reloads: () => reloads };
}

test('administrator mode survives a reload in CSV and SharePoint; logout persists', () => {
  for (const mode of ['CSV', 'SHAREPOINT']) {
    const storage = {};
    const first = page(storage, '7', mode);
    first.activate();
    first.reload();
    assert.equal(first.reloads(), 1);
    const next = page(storage, '7', mode);
    next.deactivate(true); // Loading data temporarily hides administrator controls.
    next.restore();
    assert.equal(next.active(), true);
    next.deactivate();
    const last = page(storage, '7', mode);
    last.restore();
    assert.equal(last.active(), false);
  }
});

test('user mode stays user mode; changed or missing identity cannot restore administrator mode', () => {
  const normal = page({});
  normal.restore();
  normal.reload();
  assert.equal(normal.active(), false);
  assert.equal(normal.reloads(), 1);
  for (const [id, mode] of [['8', 'CSV'], [null, 'CSV'], ['7', 'SHAREPOINT']]) {
    const storage = {};
    page(storage).activate();
    const next = page(storage, id, mode);
    next.restore();
    assert.equal(next.active(), false);
    assert.deepEqual(storage, {});
  }
});

test('reload is blocked during processing or pending save', () => {
  for (const state of ['busy', 'pending']) {
    const current = page({});
    current[state]();
    current.reload();
    assert.equal(current.reloads(), 0);
  }
});

test('administrator password input does not mark data as unsaved; actual edits remain protected', () => {
  const current = page({});
  current.edit({ target: { tagName: 'INPUT', id: 'admin-password' } });
  current.activate();
  assert.equal(current.active(), true);
  assert.equal(current.dirty(), false);
  current.edit({ target: { tagName: 'TEXTAREA', id: 'remarks-input' } });
  assert.equal(current.dirty(), true);
  current.edit({ target: { tagName: 'INPUT', id: 'admin-password' } });
  current.activate();
  assert.equal(current.dirty(), true);
});
