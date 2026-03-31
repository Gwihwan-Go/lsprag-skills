/**
 * cli.test.ts — verifies that the def-tree-cli.ts script works end-to-end
 * for both TypeScript and Go fixtures.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const cliScript         = path.join(repoRoot, "scripts", "def-tree-cli.ts");
const retrieveDefScript = path.join(repoRoot, "scripts", "retrieve-def-cli.ts");
const tokenDefsScript   = path.join(repoRoot, "scripts", "token-defs-cli.ts");
const fixtureTs = path.join(repoRoot, "tests", "fixtures", "def-tree-sample.ts");
const fixtureGo = path.join(repoRoot, "tests", "fixtures", "def-tree-sample.go");

function runCli(file: string, symbol: string, depth = 3): string {
  const result = spawnSync(
    "npx",
    ["tsx", cliScript, "--file", file, "--symbol", symbol, "--depth", String(depth)],
    { encoding: "utf8", cwd: repoRoot }
  );
  if (result.status !== 0) {
    throw new Error(`CLI exited with ${result.status}:\n${result.stderr}`);
  }
  return result.stdout;
}

// TypeScript fixture: foo -> bar -> baz
{
  const output = runCli(fixtureTs, "foo");
  assert(output.includes("foo"), `Expected "foo" in output:\n${output}`);
  assert(output.includes("bar"), `Expected "bar" in output:\n${output}`);
  assert(output.includes("baz"), `Expected "baz" in output:\n${output}`);
  console.log("PASS: CLI TypeScript fixture (foo -> bar -> baz)");
}

// Go fixture: same structure
{
  const output = runCli(fixtureGo, "foo");
  assert(output.includes("foo"), `Expected "foo" in Go output:\n${output}`);
  assert(output.includes("bar"), `Expected "bar" in Go output:\n${output}`);
  assert(output.includes("baz"), `Expected "baz" in Go output:\n${output}`);
  console.log("PASS: CLI Go fixture (foo -> bar -> baz)");
}

// Error: symbol not found
{
  const result = spawnSync(
    "npx",
    ["tsx", cliScript, "--file", fixtureTs, "--symbol", "nonexistent"],
    { encoding: "utf8", cwd: repoRoot }
  );
  assert.equal(result.status, 1, "Expected exit code 1 for missing symbol");
  assert(result.stderr.includes("not found"), `Expected "not found" in stderr:\n${result.stderr}`);
  console.log("PASS: CLI error on missing symbol");
}

// Error: file not found
{
  const result = spawnSync(
    "npx",
    ["tsx", cliScript, "--file", "/nonexistent/file.ts", "--symbol", "foo"],
    { encoding: "utf8", cwd: repoRoot }
  );
  assert.equal(result.status, 1, "Expected exit code 1 for missing file");
  console.log("PASS: CLI error on missing file");
}

// ── retrieve-def: by name ─────────────────────────────────────────────────────
{
  const result = spawnSync(
    "npx",
    ["tsx", retrieveDefScript, "--file", fixtureTs, "--symbol", "bar"],
    { encoding: "utf8", cwd: repoRoot }
  );
  assert.equal(result.status, 0, `retrieve-def exited ${result.status}:\n${result.stderr}`);
  assert(result.stdout.includes("# bar"), `Expected "# bar" header:\n${result.stdout}`);
  assert(result.stdout.includes("function bar"), `Expected function body:\n${result.stdout}`);
  assert(result.stdout.includes("baz"), `Expected baz call in body:\n${result.stdout}`);
  console.log("PASS: retrieve-def by name (TS)");
}

// ── retrieve-def: by location (bar call on line 2 col 10) ────────────────────
{
  const result = spawnSync(
    "npx",
    ["tsx", retrieveDefScript, "--file", fixtureTs, "--symbol", "bar", "--location", "2:10"],
    { encoding: "utf8", cwd: repoRoot }
  );
  assert.equal(result.status, 0, `retrieve-def --location exited ${result.status}:\n${result.stderr}`);
  assert(result.stdout.includes("# bar"), `Expected "# bar" header:\n${result.stdout}`);
  console.log("PASS: retrieve-def by location (TS)");
}

// ── retrieve-def: Go fixture ──────────────────────────────────────────────────
{
  const result = spawnSync(
    "npx",
    ["tsx", retrieveDefScript, "--file", fixtureGo, "--symbol", "foo"],
    { encoding: "utf8", cwd: repoRoot }
  );
  assert.equal(result.status, 0, `retrieve-def Go exited ${result.status}:\n${result.stderr}`);
  assert(result.stdout.includes("# foo"), `Expected "# foo" header:\n${result.stdout}`);
  assert(result.stdout.includes("func foo"), `Expected Go function body:\n${result.stdout}`);
  console.log("PASS: retrieve-def by name (Go)");
}

// ── token-defs: TS fixture ────────────────────────────────────────────────────
{
  const result = spawnSync(
    "npx",
    ["tsx", tokenDefsScript, "--file", fixtureTs, "--symbol", "foo"],
    { encoding: "utf8", cwd: repoRoot }
  );
  assert.equal(result.status, 0, `token-defs exited ${result.status}:\n${result.stderr}`);
  assert(result.stdout.includes("Tokens in 'foo'"), `Expected header:\n${result.stdout}`);
  assert(result.stdout.includes("bar"), `Expected bar token:\n${result.stdout}`);
  console.log("PASS: token-defs (TS)");
}

// ── token-defs: Go fixture ────────────────────────────────────────────────────
{
  const result = spawnSync(
    "npx",
    ["tsx", tokenDefsScript, "--file", fixtureGo, "--symbol", "foo"],
    { encoding: "utf8", cwd: repoRoot }
  );
  assert.equal(result.status, 0, `token-defs Go exited ${result.status}:\n${result.stderr}`);
  assert(result.stdout.includes("Tokens in 'foo'"), `Expected header:\n${result.stdout}`);
  assert(result.stdout.includes("bar"), `Expected bar token:\n${result.stdout}`);
  console.log("PASS: token-defs (Go)");
}

console.log("PASS: all CLI tests");
