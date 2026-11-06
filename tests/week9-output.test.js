const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'www/js', file), 'utf8');

test('notification text and IDs remain inert DOM values', async () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.classList = { toggle() {} }; }
    set innerHTML(value) { throw new Error(`Unsafe HTML insertion: ${value}`); }
    setAttribute() {}
    replaceChildren() { this.children = []; }
    append(...children) { this.children.push(...children); }
  }
  const body = new Element('div');
  const button = new Element('button');
  const document = {
    getElementById: (id) => id === 'notificationButton' ? button : id === 'notificationPopoverBody' ? body : null,
    createElement: (tag) => new Element(tag), addEventListener() {}
  };
  const window = {};
  vm.runInNewContext(read('notifications.js'), { window, document });
  const payload = '<img src=x onerror=alert(1)>"\'&';
  window.AppNotifications.init({
    async getUnreadCount() { return 1; },
    async getNotifications() { return [{ id: payload, title: payload, message: payload }]; }
  });
  await window.AppNotifications.refresh();
  assert.equal(body.children[0].dataset.notificationId, payload);
  assert.equal(body.children[0].children[0].textContent, payload);
  assert.equal(body.children[0].children[1].textContent, payload);
});

test('history table escapes stored labels, paths and engineer names', () => {
  const source = read('history.js');
  const escapeFn = source.slice(source.indexOf('function escapeHistoryHtml('), source.indexOf('\nfunction ', source.indexOf('function escapeHistoryHtml(') + 1));
  const renderFn = source.slice(source.indexOf('function renderHistoryTable('), source.indexOf('\nfunction renderHistoryPagination('));
  const payload = '<img src=x onerror=alert(1)>';
  const elements = new Map();
  const context = {
    historyState: { page: 1, rowsPerPage: 10, processed: [{ timestamp: '', testPointId: payload, name: payload, assetPath: payload, engineer: payload, status: 'Protected', reading: -850 }] },
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } },
    formatHistoryDate: () => '24 Oct 2026', formatHistoryNumeric: () => '', statusClass: () => 'green', renderHistoryPagination() {},
    HISTORY_CONDUCTIVITY_UNIT: 'µS/cm'
  };
  vm.runInNewContext(`${escapeFn}\n${renderFn}\nrenderHistoryTable();`, context);
  const html = elements.get('historyTableBody').innerHTML;
  assert.doesNotMatch(html, /<img/);
  assert.equal((html.match(/&lt;img/g) || []).length, 4);
});

test('profile HTML encoder handles quotes, ampersands and markup once', () => {
  const source = read('common.js');
  const fn = source.slice(source.indexOf('function escapeCommonHtml('), source.indexOf('\nconst navItems'));
  const context = {};
  vm.runInNewContext(fn, context);
  assert.equal(context.escapeCommonHtml('<script>"\'&'), '&lt;script&gt;&quot;&#39;&amp;');
  assert.equal(context.escapeCommonHtml(null), '');
});

test('toast messages are rendered as text, never HTML', () => {
  const source = read('toast.js');
  assert.doesNotMatch(source, /\$\{message\}/, 'message must not be interpolated into innerHTML');
  assert.match(source, /querySelector\("\.app-toast-message"\)\.textContent = String\(message \?\? ""\)/);
});
