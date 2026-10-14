import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL("../src/lib/activation.server.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function activation() {
  const code = `TEST-${randomBytes(16).toString("hex").toUpperCase()}`;
  let cookie;
  const exports = {};
  vm.runInNewContext(compiled, { exports, Buffer, URLSearchParams, require: (name) => {
    if (name === "server-only") return {};
    if (name === "next/headers") return { cookies: async () => ({ get: () => cookie === undefined ? undefined : { value: cookie } }) };
    if (name === "./activation-code.server") return { ACTIVATION_CODE_DIGEST: createHash("sha256").update(code).digest("hex") };
    return require(name);
  } });
  return { api: exports, code, cookie: (value) => { cookie = value; } };
}

test("activation accepts the code and rejects missing, malformed and incorrect input", () => {
  const { api, code } = activation();
  assert.equal(api.verifyActivationCode(code), true);
  assert.equal(api.verifyActivationCode(`  ${code.toLowerCase()}  `), true);
  for (const value of [undefined, null, 123, {}, "", "wrong-code", "X".repeat(101)]) assert.equal(api.verifyActivationCode(value), false);
});

test("each request validates its own cookie instead of sharing activation state", async () => {
  const a = activation();
  assert.equal(await a.api.isActivated(), false);
  a.cookie(a.code);
  assert.equal(await a.api.isActivated(), true);
  a.cookie("forged-cookie");
  assert.equal(await a.api.isActivated(), false);
  a.cookie(undefined);
  assert.equal(await a.api.isActivated(), false);
  assert.equal(a.api.ACTIVATION_MAX_AGE, 30 * 24 * 60 * 60);
});

test("activation return paths preserve the selected paper and encode query values", () => {
  const { api } = activation();
  const path = api.practiceReturnPath("/favorites/practice", { folder: "重点 & 阅读", category: "阅读", missing: undefined });
  const parsed = new URL(path, "https://example.test");
  assert.equal(parsed.pathname, "/favorites/practice");
  assert.equal(parsed.searchParams.get("folder"), "重点 & 阅读");
  assert.equal(parsed.searchParams.get("category"), "阅读");
  assert.equal(parsed.searchParams.has("missing"), false);
});
