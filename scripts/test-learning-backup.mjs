import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const favoriteKey = "jlpt-practice.favorites.v1", studyKey = "jlpt-practice.study.v1";
const compile = name => ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const compiled = Object.fromEntries(["term-study-data", "term-study-store", "favorites-store", "study-store", "learning-backup", "backup-validation", "study-history-data", "practice-scoring", "user-preferences", "display-preferences"].map(name => [name, compile(name)]));
const favorites = { version: 2, folders: [{ id: "default", name: "默认收藏夹" }, { id: "folder-a", name: "语法" }], entries: [{ questionId: "q1", folderIds: ["default", "folder-a"], savedAt: "2026-10-01T00:00:00Z" }] };
const paper = { id: "N2-2026-vocabulary", level: "N2", year: "2026", typeLabel: "词汇", questions: [{ id: "q1", level: "N2", category: "词汇", correctOptionId: "A", options: [{ id: "A" }, { id: "B" }] }] };
function environment(initial = {}) {
  const raw = new Map(Object.entries(initial).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]));
  let writes = 0, failAt = -1;
  const modules = {};
  const window = { localStorage: {
    getItem: key => raw.get(key) ?? null,
    setItem: (key, value) => { writes++; if (writes === failAt) throw new Error("Quota exceeded"); raw.set(key, value); },
    removeItem: key => raw.delete(key),
  } };
  function load(name) {
    if (!modules[name]) {
      const exports = {}; modules[name] = exports;
      vm.runInNewContext(compiled[name], { exports, require: specifier => specifier.startsWith("./") ? load(specifier.slice(2)) : require(specifier), window, Date, Intl, URLSearchParams });
    }
    return modules[name];
  }
  return { terms: load("term-study-store"), backup: load("learning-backup"), favorite: load("favorites-store"), study: load("study-store"), raw, preferences: load("user-preferences"), display: load("display-preferences"), failWrite: offset => { failAt = writes + offset; }, failNextSecondWrite: () => { failAt = writes + 2; } };
}
function completed(env, option = "B") {
  const a = env.study.createStudyAttempt(paper, "practice").attempt;
  assert.equal(env.study.updateStudyAttempt(a.id, { status: "completed", answers: { q1: { selectedOptionId: option, submitted: true } }, questionIndex: 0, deadline: null, elapsedSeconds: 0, timedOut: false, fontSize: 18 }).ok, true);
  return a.id;
}

test("combined backup round-trips folders, multiple memberships, answers and completed scores", () => {
  const source = environment({ [favoriteKey]: favorites });
  const id = completed(source);
  const backup = source.backup.createLearningBackup();
  assert.equal(backup.ok, true);
  assert.equal(backup.data.format, "jlpt-practice-backup");
  const restored = environment();
  assert.equal(restored.backup.importLearningBackup(JSON.parse(JSON.stringify(backup.data))).ok, true);
  const data = restored.backup.createLearningBackup().data;
  assert.deepEqual(JSON.parse(JSON.stringify(data.favorites)), favorites);
  assert.equal(data.study.attempts[0].id, id);
  assert.equal(data.study.attempts[0].answers.q1.selectedOptionId, "B");
  assert.equal(data.study.attempts[0].answers.q1.submittedAt, backup.data.study.attempts[0].answers.q1.submittedAt);
  assert.equal(Number.isSafeInteger(data.study.attempts[0].answers.q1.submittedAt), true);
  assert.equal(restored.study.studyScore(data.study.attempts[0]).percent, 0);
});

test("legacy untimed submissions export without rewriting bytes and round-trip without invented timestamps", () => {
  const source = environment({ [favoriteKey]: favorites });
  completed(source);
  const legacy = JSON.parse(source.raw.get(studyKey));
  delete legacy.attempts[0].answers.q1.submittedAt;
  const bytes = JSON.stringify(legacy, null, 2);
  const saved = environment({ [favoriteKey]: favorites, [studyKey]: bytes });
  const backup = saved.backup.createLearningBackup();
  assert.equal(backup.ok, true);
  assert.equal(Object.hasOwn(backup.data.study.attempts[0].answers.q1, "submittedAt"), false);
  assert.equal(saved.raw.get(studyKey), bytes);
  const destination = environment();
  assert.equal(destination.backup.importLearningBackup(JSON.parse(JSON.stringify(backup.data))).ok, true);
  const restored = destination.backup.createLearningBackup().data.study.attempts[0];
  assert.equal(Object.hasOwn(restored.answers.q1, "submittedAt"), false);
  assert.equal(destination.study.studyScore(restored).percent, 0);
});

test("invalid answer timestamps in combined backups are rejected before favorites or history changes", () => {
  const source = environment({ [favoriteKey]: favorites });
  completed(source);
  const valid = source.backup.createLearningBackup().data;
  const attempt = valid.study.attempts[0];
  for (const value of [attempt.createdAt - 1, attempt.updatedAt + 1, 0, -1, 1.5, "123", null]) {
    const incoming = JSON.parse(JSON.stringify(valid));
    incoming.study.attempts[0].answers.q1.submittedAt = value;
    const destination = environment({ [favoriteKey]: { version: 2, folders: [favorites.folders[0]], entries: [] } });
    const before = [...destination.raw];
    assert.equal(destination.backup.importLearningBackup(incoming).ok, false, `invalid timestamp ${String(value)}`);
    assert.deepEqual([...destination.raw], before);
  }
});

test("folder ID collisions are remapped, matching names merge, repeat imports deduplicate", () => {
  const local = environment({ [favoriteKey]: favorites });
  const incoming = environment({ [favoriteKey]: { version: 2, folders: [favorites.folders[0], { id: "folder-a", name: "阅读" }, { id: "other", name: "语法" }], entries: [{ questionId: "q1", folderIds: ["folder-a", "other"], savedAt: "2026-10-02T00:00:00Z" }, { questionId: "unavailable-imported-id", folderIds: ["folder-a"], savedAt: "2026-10-03T00:00:00Z" }] } });
  const backup = incoming.backup.createLearningBackup().data;
  assert.equal(local.backup.importLearningBackup(backup).ok, true);
  assert.equal(local.backup.importLearningBackup(backup).ok, true);
  const data = JSON.parse(local.raw.get(favoriteKey));
  assert.equal(data.folders.length, 3); assert.equal(data.entries.length, 2);
  assert.equal(data.folders.find(f => f.id === "folder-a").name, "语法");
  assert.equal(data.entries.find(e => e.questionId === "q1").folderIds.length, 3);
  assert.equal(data.entries.find(e => e.questionId === "q1").savedAt, favorites.entries[0].savedAt);
  assert.equal(data.folders.find(f => f.name === "阅读").id, data.entries.find(e => e.questionId === "unavailable-imported-id").folderIds[0]);
});

test("legacy study-only backups retain favorites and completed local scores", () => {
  const local = environment({ [favoriteKey]: favorites });
  completed(local);
  const backup = JSON.parse(local.raw.get(studyKey));
  backup.attempts[0].answers.q1.selectedOptionId = "A";
  const originalFavorites = local.raw.get(favoriteKey);
  assert.equal(local.backup.importLearningBackup(backup).ok, true);
  assert.equal(local.raw.get(favoriteKey), originalFavorites);
  assert.equal(JSON.parse(local.raw.get(studyKey)).attempts[0].answers.q1.selectedOptionId, "B");
});

test("invalid combined backup is rejected before either store changes", () => {
  const source = environment({ [favoriteKey]: favorites }), local = environment();
  completed(source);
  const backup = JSON.parse(JSON.stringify(source.backup.createLearningBackup().data));
  backup.favorites.entries[0].folderIds = ["missing-folder"];
  const before = [...local.raw];
  assert.equal(local.backup.importLearningBackup(backup).ok, false);
  assert.deepEqual([...local.raw], before);
  backup.favorites = favorites; backup.study.attempts[0].status = "nonsense";
  assert.equal(local.backup.importLearningBackup(backup).ok, false);
  assert.deepEqual([...local.raw], before);
});

test("failure writing study records restores the original favorites bytes", () => {
  const source = environment({ [favoriteKey]: favorites }); completed(source);
  for (const seed of [{}, { [favoriteKey]: { version: 2, folders: [favorites.folders[0]], entries: [] } }]) {
    const local = environment(seed), before = [...local.raw];
    local.failNextSecondWrite();
    assert.equal(local.backup.importLearningBackup(source.backup.createLearningBackup().data).ok, false);
    assert.deepEqual([...local.raw], before);
    assert.equal(local.favorite.readFavoritesSnapshot().data.entries.length, 0);
    assert.equal(local.study.readStudySnapshot().data.attempts.length, 0);
  }
});

test("corrupt local data cannot be silently exported as empty or overwritten", () => {
  const bad = environment({ [favoriteKey]: "{broken" });
  const source = environment({ [favoriteKey]: favorites });
  assert.equal(bad.backup.createLearningBackup().ok, false);
  assert.equal(bad.backup.importLearningBackup(source.backup.createLearningBackup().data).ok, false);
  assert.equal(bad.raw.get(favoriteKey), "{broken");
  assert.equal(bad.raw.has(studyKey), false);
});

test("clearing history preserves favorites and rejected single deletions preserve all records", () => {
  const e = environment({ [favoriteKey]: favorites });
  const id = completed(e);
  const untouched = e.raw.get(favoriteKey);
  const history = e.raw.get(studyKey);
  assert.equal(e.study.deleteStudyHistory(id).ok, false);
  assert.equal(e.raw.get(studyKey), history);
  assert.equal(e.raw.get(favoriteKey), untouched);
  completed(e);
  assert.equal(e.study.deleteStudyHistory(null).ok, true);
  assert.equal(e.raw.get(favoriteKey), untouched);
  assert.equal(e.backup.createLearningBackup().data.study.attempts.length, 0);
});

test("cloud backups round-trip remembered selections, practice/favorite settings and theme/language", () => {
  const source = environment({ [favoriteKey]: favorites }); completed(source);
  source.preferences.setUserPreferences("home", { level: "N3", year: "random", type: "grammar", mode: "exam" });
  source.preferences.setUserPreferences("practice", { swipeEnabled: false, buttonsEnabled: false, keyboardEnabled: false, instantFeedback: true, fontSize: 24, mobileFontSize: 20, playbackRate: 1.5 });
  source.preferences.setUserPreferences("favorites", { mode: "cards", sort: "paper", fontSize: 22 });
  source.preferences.setUserPreferences("frequency", { examplesExpanded: false, previewsExpanded: true });
  source.display.setDisplayPreferences({ theme: "dark", locale: "ja" });
  const backup = JSON.parse(JSON.stringify(source.backup.createLearningBackup().data));
  const destination = environment();
  assert.equal(destination.backup.importLearningBackup(backup).ok, true);
  assert.deepEqual(JSON.parse(destination.raw.get("jlpt-practice.preferences.v1")), backup.preferences);
  assert.deepEqual(JSON.parse(destination.raw.get("jlpt-practice.display.v1")), backup.display);
  assert.equal(destination.preferences.readUserPreferences().data.practice.fontSize, 24);
  assert.equal(destination.preferences.readUserPreferences().data.frequency.examplesExpanded, false);
  assert.equal(destination.preferences.readUserPreferences().data.frequency.previewsExpanded, true);
  assert.equal(destination.display.readDisplayPreferences().locale, "ja");
  destination.study.deleteStudyHistory(null);
  assert.deepEqual(destination.backup.createLearningBackup().data.preferences, destination.preferences.readUserPreferences().data);
});

test("old cloud backups preserve current settings and invalid new settings reject the whole import", () => {
  const source = environment({ [favoriteKey]: favorites }), destination = environment();
  destination.preferences.setUserPreferences("home", { level: "N1" }); destination.display.setDisplayPreferences({ theme: "dark", locale: "en" });
  const legacy = JSON.parse(JSON.stringify(source.backup.createLearningBackup().data)); delete legacy.preferences; delete legacy.display;
  const beforePreferences = destination.raw.get("jlpt-practice.preferences.v1"), beforeDisplay = destination.raw.get("jlpt-practice.display.v1");
  assert.equal(destination.backup.importLearningBackup(legacy).ok, true);
  assert.equal(destination.raw.get("jlpt-practice.preferences.v1"), beforePreferences); assert.equal(destination.raw.get("jlpt-practice.display.v1"), beforeDisplay);
  for (const field of ["preferences", "display"]) {
    const incoming = JSON.parse(JSON.stringify(source.backup.createLearningBackup().data)); incoming[field] = { invalid: true };
    const before = [...destination.raw];
    assert.equal(destination.backup.importLearningBackup(incoming).ok, false); assert.deepEqual([...destination.raw], before);
  }
});

test("failure writing either settings field rolls back favorites, study, preferences and display together", () => {
  const source = environment({ [favoriteKey]: favorites }); completed(source);
  source.preferences.setUserPreferences("home", { level: "N3" }); source.display.setDisplayPreferences({ locale: "ja" });
  for (const offset of [3, 4]) {
    const destination = environment(); destination.preferences.setUserPreferences("home", { level: "N1" }); destination.display.setDisplayPreferences({ locale: "en" });
    const before = [...destination.raw].sort(); destination.failWrite(offset);
    assert.equal(destination.backup.importLearningBackup(source.backup.createLearningBackup().data).ok, false);
    assert.deepEqual([...destination.raw].sort(), before);
    assert.equal(destination.preferences.readUserPreferences().data.home.level, "N1");
    assert.equal(destination.display.readDisplayPreferences().locale, "en");
  }
});

const sampleTerm = {kind:"word",label:"華々しい",reading:"はなばなしい",pos:"形容词",meaning:"华丽；壮烈",usage:""};
test("term collections and review states round-trip, merge idempotently, and old backups preserve them",()=>{
  const source=environment();source.terms.updateTermStudy(sampleTerm,"save");source.terms.updateTermStudy(sampleTerm,"mastered");
  const backup=JSON.parse(JSON.stringify(source.backup.createLearningBackup().data));assert.equal(backup.terms.entries[0].status,"mastered");
  const local=environment();assert.equal(local.backup.importLearningBackup(backup).ok,true);assert.equal(local.backup.importLearningBackup(backup).ok,true);assert.equal(local.terms.readTermStudySnapshot().data.entries.length,1);assert.equal(local.terms.readTermStudySnapshot().data.entries[0].reviews,1);
  const old={...backup};delete old.terms;assert.equal(local.backup.importLearningBackup(old).ok,true);assert.equal(local.terms.readTermStudySnapshot().data.entries.length,1);
  const bad=JSON.parse(JSON.stringify(backup));bad.terms.entries[0].key="numeric-index";const before=[...local.raw];assert.equal(local.backup.importLearningBackup(bad).ok,false);assert.deepEqual([...local.raw],before);
});
test("failure writing term collection rolls back all backup fields and corrupt term storage is preserved",()=>{
  const source=environment();source.terms.updateTermStudy(sampleTerm,"save");const backup=source.backup.createLearningBackup().data;
  const local=environment();const before=[...local.raw];local.failWrite(5);assert.equal(local.backup.importLearningBackup(backup).ok,false);assert.deepEqual([...local.raw],before);
  const broken=environment({"jlpt-practice.term-study.v1":"{broken"});assert.equal(broken.backup.createLearningBackup().ok,false);assert.equal(broken.backup.importLearningBackup(backup).ok,false);assert.equal(broken.raw.get("jlpt-practice.term-study.v1"),"{broken");
});

test('cloud backup round-trips filter presets, custom groups, saved examples and scheduled reviews without reviving deleted items',()=>{
 const source=environment(),term={kind:'word',label:'華々しい',reading:'はなばなしい',pos:'形容词',meaning:'华丽',usage:'',referenceLevels:['N1'],example:{text:'華々しい活躍。',path:'/practice?question=example',label:'N1'}};
 source.terms.updateTermStudy(term,'save');const group=source.terms.saveTermGroup('考前必看');const key=JSON.stringify([term.kind,term.label,term.reading,term.pos]);source.terms.batchTermStudy([key],'move',group.id);source.terms.rateTermStudy(key,'good');source.terms.saveFrequencyPreset('N1语法','kind=grammar&grade=N1&max=15');
 const backup=source.backup.createLearningBackup();assert.equal(backup.ok,true);assert.equal(backup.data.terms.entries[0].schedule.intervalDays,3);assert.equal(backup.data.terms.presets[0].query,'kind=grammar&grade=N1&max=15');
 const destination=environment();assert.equal(destination.backup.importLearningBackup(backup.data).ok,true);let data=destination.terms.readTermStudySnapshot().data;assert.equal(data.entries[0].groupIds[0],group.id);assert.equal(data.entries[0].example.text,term.example.text);assert.equal(data.presets[0].name,'N1语法');
 destination.terms.deleteFrequencyPreset(data.presets[0].id);destination.terms.deleteTermGroup(group.id);destination.terms.updateTermStudy(term,'remove');assert.equal(destination.backup.importLearningBackup(backup.data).ok,true);data=destination.terms.readTermStudySnapshot().data;assert.equal(data.entries.length,0);assert.ok(data.presets[0].deleted);assert.ok(data.groups[0].deleted);
 const invalid=structuredClone(backup.data);invalid.terms.presets[0].query='returnTo=https%3A%2F%2Fevil.example';const before=[...destination.raw];assert.equal(destination.backup.importLearningBackup(invalid).ok,false);assert.deepEqual([...destination.raw],before);
});
