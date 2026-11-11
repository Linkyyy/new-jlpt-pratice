import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/app/practice/use-question-keyboard.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;

function fixture({nativePopover = false} = {}) {
  const events = new Map(), selected = [], navigated = [];
  let advanced = 0, overlay = null, popover = null;
  class Element { closest() { return null; } }
  const body = new Element();
  const root = new Element();
  const anchor = {closest: () => root, getClientRects: () => [{}]};
  const document = {visibilityState: 'visible', activeElement: body, querySelector(selector) {
    // Safari 16.4 supports Dialog, but rejects the entire selector list if it
    // contains :popover-open, even when no popover is present in the document.
    if (/(^|[^\\]):popover-open/.test(selector)) {
      if (!nativePopover) throw new SyntaxError('Unsupported pseudo-class');
      return popover;
    }
    return overlay ?? (!nativePopover && selector.includes('[popover]') ? popover : null);
  }};
  const window = {matchMedia: () => ({matches: true}), getSelection: () => '',
    addEventListener: (name, listener) => events.set(name, listener), removeEventListener: name => events.delete(name)};
  const exports = {};
  vm.runInNewContext(compiled, {exports, document, window, Element, CSS: {supports: () => nativePopover},
    require: name => {assert.equal(name, 'react'); return {useEffect: effect => effect()};}});
  exports.useQuestionKeyboard({enabled: true, anchorRef: {current: anchor}, onSelect: value => selected.push(value), onAdvance: () => advanced++, onNavigate: direction => navigated.push(direction)});
  return {selected, navigated, advanced: () => advanced, setOverlay: value => {overlay = value;}, setPopover: value => {popover = value;}, key(key, target = body) {
    let prevented = false;
    events.get('keydown')({key, target, preventDefault: () => {prevented = true;}});
    return prevented;
  }, input() {const input = new Element(); input.closest = () => input; return input;}};
}

test('answer shortcuts work without Popover selector support', () => {
  const f = fixture();
  for (const key of ['1', '4', 'Enter', 'ArrowRight', 'ArrowLeft']) assert.equal(f.key(key), true);
  assert.deepEqual(f.selected, [0, 3]);
  assert.equal(f.advanced(), 1);
  assert.deepEqual(f.navigated, [1, -1]);
});

test('open settings suppress answer shortcuts until closed', () => {
  const f = fixture();
  f.setOverlay({});
  assert.equal(f.key('1'), false);
  assert.equal(f.key('Enter'), false);
  assert.deepEqual(f.selected, []);
  assert.equal(f.advanced(), 0);
  f.setOverlay(null);
  assert.equal(f.key('1'), true);
  assert.deepEqual(f.selected, [0]);
});

test('typing in settings controls does not answer questions', () => {
  const f = fixture();
  assert.equal(f.key('1', f.input()), false);
  assert.deepEqual(f.selected, []);
});

for (const nativePopover of [false, true]) {
  test(`${nativePopover ? 'native' : 'polyfilled'} settings suppress shortcuts without changing modal behavior`, () => {
    const f = fixture({nativePopover});
    f.setPopover({});
    assert.equal(f.key('1'), false);
    assert.deepEqual(f.selected, []);
    f.setPopover(null);
    assert.equal(f.key('1'), true);
    assert.deepEqual(f.selected, [0]);
  });
}
