const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const XLSX = require('xlsx');
const root = path.resolve(__dirname, '..');
const version = '0.20.3';
const browserUrl = `https://cdn.sheetjs.com/xlsx-${version}/package/dist/xlsx.full.min.js`;
const rows = [
  { 'Test Point': 'Fictional TP α', 'Reading Timestamp': '2026-10-24T12:00:00+08:00', 'Potential (mV)': -850, Temperature: 28.5, Conductivity: 0, Note: '' },
  { 'Test Point': 'Fictional TP β', 'Reading Timestamp': '2026-10-24T12:02:00+08:00', 'Potential (mV)': -849, Temperature: 0, Conductivity: 125.75, Note: 'A & B <sample>' }
];

test('Node dependency and all browser entry points use patched SheetJS 0.20.3', () => {
  assert.equal(XLSX.version, version);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies.xlsx, `https://cdn.sheetjs.com/xlsx-${version}/xlsx-${version}.tgz`);
  for (const file of ['www/testpoints.php', 'www/testpoint-view.php', 'www/js/navigation-controller.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(source.includes(browserUrl), file);
    assert.ok(!source.includes('xlsx@0.18.5'), file);
  }
});

test('Node XLSX round trip preserves readings, optional blanks, zeroes and Unicode', () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Readings');
  const bytes = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
  const restored = XLSX.read(bytes, { type: 'buffer', cellDates: false });
  assert.deepEqual(XLSX.utils.sheet_to_json(restored.Sheets.Readings, { defval: '', raw: true }), rows);
});

test('standalone browser bundle reads Node exports and produces compatible XLSX exports', () => {
  // No browser globals supplied by Node: exercise the actual standalone XLSX global.
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'), 'utf8'), context);
  assert.equal(context.XLSX.version, version);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Readings');
  context.inputBytes = Array.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  vm.runInContext(`
    const imported = XLSX.read(inputBytes, { type: 'array', cellDates: false });
    const importedRows = XLSX.utils.sheet_to_json(imported.Sheets.Readings, { defval: '', raw: true });
    resultJson = JSON.stringify(importedRows);
    const exported = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(exported, XLSX.utils.json_to_sheet(importedRows), 'Readings');
    outputBytes = Array.from(new Uint8Array(XLSX.write(exported, { type: 'array', bookType: 'xlsx' })));
  `, context);
  assert.deepEqual(JSON.parse(context.resultJson), rows);
  const restored = XLSX.read(Buffer.from(context.outputBytes), { type: 'buffer', cellDates: false });
  assert.deepEqual(XLSX.utils.sheet_to_json(restored.Sheets.Readings, { defval: '', raw: true }), rows);
});
