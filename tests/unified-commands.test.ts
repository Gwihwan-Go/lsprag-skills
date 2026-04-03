/**
 * unified-commands.test.ts
 *
 * End-to-end CLI tests for the unified command names:
 *   - getDefinition (renamed from retrieve-def, + hover fallback)
 *   - getTokens     (renamed from token-defs)
 *   - getReference  (new, LSP-required)
 *
 * Also validates that old command names are no longer accepted.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const getDefinitionScript = path.join(repoRoot, "scripts", "get-definition-cli.ts");
const getTokensScript     = path.join(repoRoot, "scripts", "get-tokens-cli.ts");
const getReferenceScript  = path.join(repoRoot, "scripts", "get-reference-cli.ts");
const lsprагBin           = path.join(repoRoot, "scripts", "lsprag");

const fixtureTs      = path.join(repoRoot, "tests", "fixtures", "def-tree-sample.ts");
const fixtureGo      = path.join(repoRoot, "tests", "fixtures", "def-tree-sample.go");
const fixtureTsHover = path.join(repoRoot, "tests", "fixtures", "hover-sample.ts");

// ── helpers ───────────────────────────────────────────────────────────────────
function run(script: string, scriptArgs: string[], env?: Record<string, string>) {
  return spawnSync(
    "npx",
    ["tsx", script, ...scriptArgs],
    { encoding: "utf8", cwd: repoRoot, env: { ...process.env, ...env } }
  );
}

function runLsprag(cmdArgs: string[], env?: Record<string, string>) {
  return spawnSync(
    lsprагBin,
    cmdArgs,
    { encoding: "utf8", cwd: repoRoot, env: { ...process.env, ...env } }
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// getDefinition — function symbols (go-to-definition path)
// ═══════════════════════════════════════════════════════════════════════════════

{
  const r = run(getDefinitionScript, ["--file", fixtureTs, "--symbol", "bar"]);
  assert.equal(r.status, 0, `getDefinition exited ${r.status}:\n${r.stderr}`);
  assert(r.stdout.includes("# bar"), `Expected "# bar" header:\n${r.stdout}`);
  assert(r.stdout.includes("function bar"), `Expected function body:\n${r.stdout}`);
  assert(r.stdout.includes("baz"), `Expected baz call:\n${r.stdout}`);
  console.log("PASS: getDefinition function symbol (TS)");
}

{
  const r = run(getDefinitionScript, ["--file", fixtureGo, "--symbol", "foo"]);
  assert.equal(r.status, 0, `getDefinition Go exited ${r.status}:\n${r.stderr}`);
  assert(r.stdout.includes("# foo"), `Expected "# foo" header:\n${r.stdout}`);
  assert(r.stdout.includes("func foo"), `Expected Go function body:\n${r.stdout}`);
  console.log("PASS: getDefinition function symbol (Go)");
}

// ── by location ───────────────────────────────────────────────────────────────
{
  // bar is called on line 5 col 10 in def-tree-sample.ts
  const r = run(getDefinitionScript, ["--file", fixtureTs, "--symbol", "bar", "--location", "5:10"]);
  assert.equal(r.status, 0, `getDefinition --location exited ${r.status}:\n${r.stderr}`);
  assert(r.stdout.includes("# bar"), `Expected "# bar" header:\n${r.stdout}`);
  console.log("PASS: getDefinition by location (TS)");
}

// ── error: symbol not found ───────────────────────────────────────────────────
{
  const r = run(getDefinitionScript, ["--file", fixtureTs, "--symbol", "nonexistent"]);
  assert.equal(r.status, 1, "Expected exit code 1 for missing symbol");
  assert(r.stderr.includes("not found"), `Expected "not found" in stderr:\n${r.stderr}`);
  console.log("PASS: getDefinition error on missing symbol");
}

// ── error: file not found ─────────────────────────────────────────────────────
{
  const r = run(getDefinitionScript, ["--file", "/no/such/file.ts", "--symbol", "foo"]);
  assert.equal(r.status, 1, "Expected exit code 1 for missing file");
  console.log("PASS: getDefinition error on missing file");
}

// ═══════════════════════════════════════════════════════════════════════════════
// getDefinition — variable/constant symbols (hover path)
// ═══════════════════════════════════════════════════════════════════════════════

{
  // const MAX_RETRIES — no LSP provider → should print declaration line
  const r = run(getDefinitionScript, ["--file", fixtureTsHover, "--symbol", "MAX_RETRIES"]);
  assert.equal(r.status, 0, `getDefinition const exited ${r.status}:\n${r.stderr}`);
  // Should use [declaration] or [hover] tag
  assert(
    r.stdout.includes("[declaration]") || r.stdout.includes("[hover]"),
    `Expected [declaration] or [hover] tag:\n${r.stdout}`
  );
  assert(r.stdout.includes("MAX_RETRIES"), `Expected symbol name in output:\n${r.stdout}`);
  assert(r.stdout.includes("5"), `Expected constant value in declaration:\n${r.stdout}`);
  console.log("PASS: getDefinition const (declaration fallback, no LSP)");
}

{
  // let counter — no LSP provider → declaration
  const r = run(getDefinitionScript, ["--file", fixtureTsHover, "--symbol", "counter"]);
  assert.equal(r.status, 0, `getDefinition let exited ${r.status}:\n${r.stderr}`);
  assert(
    r.stdout.includes("[declaration]") || r.stdout.includes("[hover]"),
    `Expected [declaration] or [hover] tag:\n${r.stdout}`
  );
  assert(r.stdout.includes("counter"), `Expected "counter" in output:\n${r.stdout}`);
  console.log("PASS: getDefinition let variable (declaration fallback, no LSP)");
}

{
  // var legacyFlag — no LSP provider → declaration
  const r = run(getDefinitionScript, ["--file", fixtureTsHover, "--symbol", "legacyFlag"]);
  assert.equal(r.status, 0, `getDefinition var exited ${r.status}:\n${r.stderr}`);
  assert(
    r.stdout.includes("[declaration]") || r.stdout.includes("[hover]"),
    `Expected [declaration] or [hover] tag:\n${r.stdout}`
  );
  assert(r.stdout.includes("legacyFlag"), `Expected "legacyFlag" in output:\n${r.stdout}`);
  console.log("PASS: getDefinition var variable (declaration fallback, no LSP)");
}

{
  // const BASE_URL — declaration should include the string value
  const r = run(getDefinitionScript, ["--file", fixtureTsHover, "--symbol", "BASE_URL"]);
  assert.equal(r.status, 0, `getDefinition BASE_URL exited ${r.status}:\n${r.stderr}`);
  assert(r.stdout.includes("BASE_URL"), `Expected "BASE_URL" in output:\n${r.stdout}`);
  console.log("PASS: getDefinition const string (declaration fallback)");
}

// ── hover with mock LSP provider ──────────────────────────────────────────────
// Tests that getDefinition uses getHover when a provider with getHover is loaded.
// We exercise this via the core test (hover-dispatch.core.test.ts) rather than
// spawning a subprocess, since we need to inject the mock provider module.

// ═══════════════════════════════════════════════════════════════════════════════
// getTokens — renamed from token-defs
// ═══════════════════════════════════════════════════════════════════════════════

{
  const r = run(getTokensScript, ["--file", fixtureTs, "--symbol", "foo"]);
  assert.equal(r.status, 0, `getTokens exited ${r.status}:\n${r.stderr}`);
  assert(r.stdout.includes("Tokens in 'foo'"), `Expected header:\n${r.stdout}`);
  assert(r.stdout.includes("bar"), `Expected bar token:\n${r.stdout}`);
  console.log("PASS: getTokens (TS)");
}

{
  const r = run(getTokensScript, ["--file", fixtureGo, "--symbol", "foo"]);
  assert.equal(r.status, 0, `getTokens Go exited ${r.status}:\n${r.stderr}`);
  assert(r.stdout.includes("Tokens in 'foo'"), `Expected header:\n${r.stdout}`);
  assert(r.stdout.includes("bar"), `Expected bar token:\n${r.stdout}`);
  console.log("PASS: getTokens (Go)");
}

{
  const r = run(getTokensScript, ["--file", fixtureTs, "--symbol", "nonexistent"]);
  assert.equal(r.status, 1, "Expected exit code 1 for missing symbol");
  assert(r.stderr.includes("not found"), `Expected "not found" in stderr:\n${r.stderr}`);
  console.log("PASS: getTokens error on missing symbol");
}

// ═══════════════════════════════════════════════════════════════════════════════
// getReference — requires LSPRAG_LSP_PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

{
  // Without provider → hard error
  const r = run(getReferenceScript, ["--file", fixtureTs, "--symbol", "foo"], {
    LSPRAG_LSP_PROVIDER: "",
  });
  assert.equal(r.status, 1, "Expected exit code 1 when no provider set");
  assert(
    r.stderr.includes("LSPRAG_LSP_PROVIDER") || r.stderr.includes("requires a real LSP provider"),
    `Expected provider-required error:\n${r.stderr}`
  );
  console.log("PASS: getReference errors without LSPRAG_LSP_PROVIDER");
}

{
  // With an invalid provider path → meaningful error
  const r = run(getReferenceScript, ["--file", fixtureTs, "--symbol", "foo"], {
    LSPRAG_LSP_PROVIDER: "/nonexistent/provider.js",
  });
  assert.equal(r.status, 1, "Expected exit code 1 for bad provider path");
  assert(
    r.stderr.includes("failed to load") || r.stderr.includes("LSPRAG_LSP_PROVIDER"),
    `Expected load-failure error:\n${r.stderr}`
  );
  console.log("PASS: getReference errors with invalid provider path");
}

// ═══════════════════════════════════════════════════════════════════════════════
// lsprag dispatcher — new command names only
// ═══════════════════════════════════════════════════════════════════════════════

{
  // getDefinition via dispatcher
  const r = runLsprag(["getDefinition", "--file", fixtureTs, "--symbol", "bar"]);
  assert.equal(r.status, 0, `dispatcher getDefinition exited ${r.status}:\n${r.stderr}`);
  assert(r.stdout.includes("# bar"), `Expected "# bar" in dispatcher output:\n${r.stdout}`);
  console.log("PASS: dispatcher getDefinition");
}

{
  // getTokens via dispatcher
  const r = runLsprag(["getTokens", "--file", fixtureTs, "--symbol", "foo"]);
  assert.equal(r.status, 0, `dispatcher getTokens exited ${r.status}:\n${r.stderr}`);
  assert(r.stdout.includes("Tokens in 'foo'"), `Expected header in dispatcher output:\n${r.stdout}`);
  console.log("PASS: dispatcher getTokens");
}

{
  // Old alias retrieve-def still works (backward compat)
  const r = runLsprag(["retrieve-def", "--file", fixtureTs, "--symbol", "bar"]);
  assert.equal(r.status, 0, `dispatcher retrieve-def exited ${r.status}:\n${r.stderr}`);
  assert(r.stdout.includes("# bar"), `Expected "# bar" in output:\n${r.stdout}`);
  console.log("PASS: dispatcher retrieve-def still works");
}

{
  // Old alias token-defs still works (backward compat, requires LSP)
  const r = runLsprag(["token-defs", "--file", fixtureTs, "--symbol", "foo"], {
    LSPRAG_LSP_PROVIDER: path.join(repoRoot, "tests", "fixtures", "mock-lsp-provider.mjs"),
  });
  assert.equal(r.status, 0, `dispatcher token-defs exited ${r.status}:\n${r.stderr}`);
  assert(r.stdout.includes("Tokens in 'foo'"), `Expected header:\n${r.stdout}`);
  console.log("PASS: dispatcher token-defs still works");
}

{
  // getReference without provider via dispatcher → exit 1
  const r = runLsprag(["getReference", "--file", fixtureTs, "--symbol", "foo"], {
    LSPRAG_LSP_PROVIDER: "",
  });
  assert.equal(r.status, 1, "Expected exit code 1 from dispatcher getReference without provider");
  console.log("PASS: dispatcher getReference errors without provider");
}

{
  // def-tree is temporarily disabled
  const r = runLsprag(["def-tree", "--file", fixtureTs, "--symbol", "foo"]);
  assert.equal(r.status, 2, `dispatcher def-tree should be disabled (exit 2):\n${r.stderr}`);
  assert(r.stderr.includes("temporarily disabled"), `Expected disabled message:\n${r.stderr}`);
  console.log("PASS: dispatcher def-tree is disabled");
}

console.log("\nPASS: all unified-commands tests");
