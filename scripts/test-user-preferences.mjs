import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url), key = "jlpt-practice.preferences.v1";
const compile = name => ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const terms = {}; vm.runInNewContext(compile("term-study-data"), {exports: terms});
const validation = {}; vm.runInNewContext(compile("backup-validation"), { exports: validation, require: name => name === "./term-study-data" ? terms : require(name) });
const compiled = compile("user-preferences");
function environment(initial) {
  let raw = initial ?? null, writes = 0, fail = false;
  const api = {};
  vm.runInNewContext(compiled, { exports: api, require: name => name === "./backup-validation" ? validation : require(name), window: { localStorage: {
    getItem: name => name === key ? raw : null,
    setItem: (name, value) => { assert.equal(name, key); if (fail) throw new Error("Quota"); writes++; raw = value; },
  } } });
  return { api, raw: () => raw, writes: () => writes, fail: value => { fail = value; } };
}
test("defaults are read-only and chosen home selections, including random, survive reload", () => {
  const e = environment();
  assert.equal(e.api.readUserPreferences().ready, true);
  assert.equal(e.writes(), 0);
  assert.equal(e.api.setUserPreferences("home", { source: "original", level: "N3", year: "random", type: "reading", mode: "exam" }), true);
  const reloaded = environment(e.raw());
  assert.deepEqual(JSON.parse(JSON.stringify(reloaded.api.readUserPreferences().data.home)), { source: "original", level: "N3", year: "random", type: "reading", mode: "exam" });
  assert.equal(reloaded.writes(), 0);
});
test("practice and favorite settings persist independently without overwriting selection", () => {
  const e = environment();
  e.api.setUserPreferences("home", { level: "N1", year: "202412" });
  e.api.setUserPreferences("practice", { swipeEnabled: false, buttonsEnabled: false, keyboardEnabled: false, instantFeedback: true, fontSize: 24, mobileFontSize: 20, playbackRate: 1.25 });
  e.api.setUserPreferences("favorites", { mode: "cards", fontSize: 22, sort: "paper", mistakesSort: "recent" });
  const data = environment(e.raw()).api.readUserPreferences().data;
  assert.equal(data.home.level, "N1"); assert.equal(data.home.year, "202412");
  assert.equal(data.practice.swipeEnabled, false); assert.equal(data.practice.instantFeedback, true);
  assert.equal(data.practice.fontSize, 24); assert.equal(data.practice.mobileFontSize, 20); assert.equal(data.practice.playbackRate, 1.25);
  assert.equal(data.favorites.mode, "cards"); assert.equal(data.favorites.sort, "paper"); assert.equal(data.favorites.dueSort, "due");
});
test("invalid preferences cannot be saved or accepted by the server backup validator", () => {
  const e = environment(); e.api.setUserPreferences("home", { level: "N4" });
  const before = e.raw();
  for (const [section, patch] of [["home", { year: "random", type: "all" }], ["home", { year: "random-bad" }], ["home", { level: "N6" }], ["practice", { fontSize: 29 }], ["practice", { playbackRate: 2 }], ["practice", { buttonsEnabled: "false" }], ["favorites", { mode: "memorize" }], ["favorites", { fontSize: 0 }]]) {
    assert.equal(e.api.setUserPreferences(section, patch), false);
    assert.equal(e.raw(), before);
    const data = JSON.parse(before); Object.assign(data[section], patch);
    assert.equal(validation.isUserPreferences(data), false);
  }
});
test("corrupt stored settings are preserved and quota errors can be retried without changing saved bytes", () => {
  const bad = environment("{broken");
  assert.ok(bad.api.readUserPreferences().error);
  assert.equal(bad.api.setUserPreferences("home", { level: "N1" }), false);
  assert.equal(bad.raw(), "{broken");
  const good = environment(); good.api.setUserPreferences("home", { level: "N2" });
  const before = good.raw(); good.fail(true);
  assert.equal(good.api.setUserPreferences("home", { level: "N1" }), false);
  assert.equal(good.raw(), before); assert.equal(good.api.readUserPreferences().data.home.level, "N2");
  good.fail(false); assert.equal(good.api.setUserPreferences("home", { level: "N1" }), true);
  assert.equal(good.api.readUserPreferences().error, null);
});
test("example/preview defaults persist, old preferences remain valid and invalid display flags are rejected", () => {
  const old=JSON.parse(JSON.stringify(environment().api.defaultPreferences));delete old.frequency;
  assert.equal(validation.isUserPreferences(old),true);
  const e=environment(JSON.stringify(old));
  assert.equal(e.api.setUserPreferences('frequency',{examplesExpanded:false}),true);
  let saved=environment(e.raw()).api.readUserPreferences().data;
  assert.equal(saved.frequency.examplesExpanded,false);assert.equal(saved.frequency.previewsExpanded,false);
  assert.equal(e.api.setUserPreferences('frequency',{previewsExpanded:true}),true);
  saved=environment(e.raw()).api.readUserPreferences().data;
  assert.equal(saved.frequency.examplesExpanded,false);assert.equal(saved.frequency.previewsExpanded,true);
  const before=e.raw();assert.equal(e.api.setUserPreferences('frequency',{examplesExpanded:'false'}),false);assert.equal(e.raw(),before);
});
