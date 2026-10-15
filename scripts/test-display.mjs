import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const modules = ["display-preferences", "display-boot", "i18n/messages", "i18n/translate"];
const compiled = Object.fromEntries(modules.map(name => [name, ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText]));
function environment(blocked = false) {
  const values = new Map([["jlpt-practice.study.v1", "study-sentinel"], ["jlpt-practice.favorites.v1", "favorites-sentinel"]]);
  const loaded = {};
  function load(name) {
    if (!loaded[name]) {
      const exports = {}; loaded[name] = exports;
      vm.runInNewContext(compiled[name], { exports, Intl, Date, require: specifier => specifier === "./messages" ? load("i18n/messages") : require(specifier), window: { localStorage: {
        getItem: key => { if (blocked) throw new Error("Blocked"); return values.get(key) ?? null; },
        setItem: (key, value) => { if (blocked) throw new Error("Blocked"); values.set(key, value); },
      } } });
    }
    return loaded[name];
  }
  return { load, values };
}

test("preferences validate supported locales/themes and do not alter learning data", () => {
  const e = environment(), p = e.load("display-preferences");
  assert.equal(p.parseDisplayPreferences("broken").locale, "zh");
  assert.equal(p.parseDisplayPreferences('{"locale":"fr","theme":"unknown"}').theme, "system");
  assert.equal(p.setDisplayPreferences({ locale: "ja", theme: "dark" }), true);
  assert.equal(p.setDisplayPreferences({ locale: "en" }), true);
  const saved = JSON.parse(e.values.get(p.DISPLAY_STORAGE_KEY));
  assert.deepEqual(saved, { locale: "en", theme: "dark" });
  assert.equal(e.values.get("jlpt-practice.study.v1"), "study-sentinel");
  assert.equal(e.values.get("jlpt-practice.favorites.v1"), "favorites-sentinel");
  assert.equal(environment(true).load("display-preferences").setDisplayPreferences({ theme: "dark" }), false);
});

test("UI translations cover all catalog entries, dates and interpolated counters", () => {
  const e = environment(), { translate: t } = e.load("i18n/translate"), { messages } = e.load("i18n/messages");
  assert.equal(new Set(messages.map(row => row[0])).size, messages.length);
  for (const [source, ja, en] of messages) {
    assert.ok(ja.length && en.length, source);
    assert.equal(t(source, "zh"), source);
    assert.equal(t(source, "ja"), ja);
    assert.equal(t(source, "en"), en);
  }
  assert.equal(t("2024年12月", "en"), "Dec 2024");
  assert.equal(t("N2 · 2024年12月 · 词汇", "en"), "N2 · Dec 2024 · Vocabulary");
  assert.equal(t("答题卡 · 已提交 2/69", "en"), "Answer sheet · 2/69 submitted");
  assert.equal(t("一键收藏错题（3）", "ja"), "不正解を一括保存（3）");
  assert.equal(t(false, "en"), "");
});

test("named values preserve custom folder names and source question text", () => {
  const { translate: t, translatePeriod } = environment().load("i18n/translate");
  assert.equal(t("管理收藏：{0}", "en", { 0: "语法" }), "Manage favorite: 语法");
  assert.equal(translatePeriod("语法", "favorites", value => t(value, "en")), "语法");
  assert.equal(translatePeriod("2024年12月", "imported", value => t(value, "en")), "Dec 2024");
  assert.equal(t("第 {0} 题 · {1}", "en", { 0: 2, 1: "Vocabulary" }), "#2 · Vocabulary");
  assert.equal(t("「貢献」の読み方はどれですか。", "en"), "「貢献」の読み方はどれですか。");
});

test("pre-paint bootstrap respects explicit light/dark, follows system, and tolerates bad storage", () => {
  const { displayBootScript } = environment().load("display-boot");
  function boot(raw, dark, blocked = false) {
    const element = { dataset: {}, lang: "zh-CN" };
    vm.runInNewContext(displayBootScript, { document: { documentElement: element }, matchMedia: () => ({ matches: dark }), localStorage: { getItem: () => { if (blocked) throw new Error("Denied"); return raw; } } });
    return element;
  }
  assert.equal(boot('{"theme":"dark","locale":"en"}', false).dataset.theme, "dark");
  assert.equal(boot('{"theme":"light","locale":"ja"}', true).dataset.theme, "light");
  assert.equal(boot('{"theme":"system"}', true).dataset.theme, "dark");
  assert.equal(boot("broken", true).dataset.theme, "dark");
  assert.equal(boot(null, false, true).dataset.theme, "light");
  assert.equal(boot('{"locale":"ja"}', false).lang, "ja");
});
