#!/usr/bin/env tsx
/**
 * lsp-integration.test.ts — Integration tests for the real LSP client provider.
 *
 * Tests definitions, references, document symbols, and call hierarchy
 * against real language servers (pylsp, typescript-language-server, gopls).
 *
 * NO mocks, NO regex — real LSP servers only.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURES = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  "fixtures/lsp-integration"
);

// ── import provider ──────────────────────────────────────────────────────────

const providerPath = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  "../providers/lsp-client.ts"
);

const mod = await import(pathToFileURL(providerPath).href);
const provider = mod.provider;
const shutdownAll = mod.shutdownAll;

// ── test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;
const errors: string[] = [];

async function test(name: string, fn: () => Promise<void>, timeoutMs = 30000) {
  const start = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    const ms = Date.now() - start;
    console.log(`  ✓ ${name} (${ms}ms)`);
    passed++;
  } catch (err: any) {
    const ms = Date.now() - start;
    if (err.message?.includes("No language server") || err.message?.includes("ENOENT")) {
      console.log(`  ○ ${name} — SKIPPED (server not available)`);
      skipped++;
    } else {
      console.log(`  ✗ ${name} (${ms}ms)`);
      console.log(`    ${err.message ?? err}`);
      errors.push(`${name}: ${err.message ?? err}`);
      failed++;
    }
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertGt(actual: number, expected: number, message: string) {
  if (actual <= expected)
    throw new Error(`${message}: expected > ${expected}, got ${actual}`);
}

function assertIncludes(arr: string[], target: string, message: string) {
  if (!arr.includes(target))
    throw new Error(
      `${message}: expected array to include "${target}", got [${arr.join(", ")}]`
    );
}

// ── Python tests ─────────────────────────────────────────────────────────────

console.log("\n═══ Python (pylsp) ═══");

const pyFile = path.join(FIXTURES, "python/main.py");
const pyUri = pathToFileURL(pyFile).href;

await test("Python: openDocument returns valid document", async () => {
  const doc = await provider.openDocument(pyUri);
  assert(doc.uri.includes("main.py"), "URI should contain main.py");
  assert(doc.languageId === "python", `languageId should be python, got ${doc.languageId}`);
  const text = doc.getText();
  assert(text.includes("class Calculator"), "Text should contain Calculator class");
});

await test("Python: getDocumentSymbols finds classes and functions", async () => {
  const doc = await provider.openDocument(pyUri);
  const symbols = await provider.getDocumentSymbols(pyUri);
  assert(symbols.length > 0, "Should find symbols");
  const names = symbols.map((s: any) => s.name);
  assertIncludes(names, "Calculator", "Should find Calculator class");
  assertIncludes(names, "main", "Should find main function");
  assertIncludes(names, "compute_sum", "Should find compute_sum function");
  assertIncludes(names, "create_calculator", "Should find create_calculator function");
  console.log(`    Found ${symbols.length} symbols: ${names.join(", ")}`);
});

await test("Python: getDefinitions resolves function definition", async () => {
  // 'create_calculator' is called on line 29 (0-indexed: 28), character ~10
  const doc = await provider.openDocument(pyUri);
  // Find the line with "calc = create_calculator()" in compute_sum
  const text = doc.getText();
  const lines = text.split("\n");
  let targetLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("calc = create_calculator()")) {
      targetLine = i;
      break;
    }
  }
  assert(targetLine >= 0, "Should find create_calculator call line");
  const col = lines[targetLine].indexOf("create_calculator");

  const defs = await provider.getDefinitions(doc, { line: targetLine, character: col + 1 });
  assert(defs.length > 0, "Should find at least one definition");
  // Definition should point to the function definition line
  const defLine = defs[0].range.start.line;
  const defLineText = lines[defLine];
  assert(
    defLineText.includes("def create_calculator"),
    `Definition should point to 'def create_calculator', got line ${defLine}: "${defLineText}"`
  );
  console.log(`    Definition at line ${defLine + 1}: ${defLineText.trim()}`);
});

await test("Python: getReferences finds all usages of create_calculator", async () => {
  const doc = await provider.openDocument(pyUri);
  const text = doc.getText();
  const lines = text.split("\n");
  let defLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("def create_calculator")) {
      defLine = i;
      break;
    }
  }
  assert(defLine >= 0, "Should find create_calculator def line");
  const col = lines[defLine].indexOf("create_calculator");

  const refs = await provider.getReferences(doc, { line: defLine, character: col + 1 });
  assert(refs.length >= 3, `Should find at least 3 references (def + 2 calls), got ${refs.length}`);
  console.log(`    Found ${refs.length} references`);
});

await test("Python: getSymbols returns hierarchical symbols", async () => {
  const doc = await provider.openDocument(pyUri);
  const symbols = await provider.getSymbols(pyUri);
  assert(symbols.length > 0, "Should find symbols");
  // Check that Calculator has methods as children
  const calcSymbol = symbols.find((s: any) => s.name === "Calculator");
  assert(calcSymbol !== undefined, "Should find Calculator");
  if (calcSymbol?.children?.length) {
    const childNames = calcSymbol.children.map((c: any) => c.name);
    console.log(`    Calculator children: ${childNames.join(", ")}`);
    assertIncludes(childNames, "add", "Calculator should have add method");
  }
});

// ── TypeScript tests ─────────────────────────────────────────────────────────

console.log("\n═══ TypeScript (typescript-language-server) ═══");

const tsFile = path.join(FIXTURES, "typescript/main.ts");
const tsUri = pathToFileURL(tsFile).href;

await test("TypeScript: openDocument returns valid document", async () => {
  const doc = await provider.openDocument(tsUri);
  assert(doc.uri.includes("main.ts"), "URI should contain main.ts");
  assert(
    doc.languageId === "typescript",
    `languageId should be typescript, got ${doc.languageId}`
  );
  const text = doc.getText();
  assert(text.includes("interface Shape"), "Text should contain Shape interface");
});

await test("TypeScript: getDocumentSymbols finds classes, interfaces, functions", async () => {
  const doc = await provider.openDocument(tsUri);
  const symbols = await provider.getDocumentSymbols(tsUri);
  assert(symbols.length > 0, "Should find symbols");
  const names = symbols.map((s: any) => s.name);
  assertIncludes(names, "Circle", "Should find Circle class");
  assertIncludes(names, "Rectangle", "Should find Rectangle class");
  assertIncludes(names, "createShape", "Should find createShape function");
  assertIncludes(names, "totalArea", "Should find totalArea function");
  console.log(`    Found ${symbols.length} symbols: ${names.join(", ")}`);
});

await test("TypeScript: getDefinitions resolves createShape", async () => {
  const doc = await provider.openDocument(tsUri);
  const text = doc.getText();
  const lines = text.split("\n");
  // Find 'const circle = createShape("circle", 5);'
  let targetLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('createShape("circle"')) {
      targetLine = i;
      break;
    }
  }
  assert(targetLine >= 0, "Should find createShape call line");
  const col = lines[targetLine].indexOf("createShape");

  const defs = await provider.getDefinitions(doc, { line: targetLine, character: col + 1 });
  assert(defs.length > 0, "Should find at least one definition");
  const defLine = defs[0].range.start.line;
  const defLineText = lines[defLine];
  assert(
    defLineText.includes("function createShape"),
    `Definition should point to 'function createShape', got: "${defLineText.trim()}"`
  );
  console.log(`    Definition at line ${defLine + 1}: ${defLineText.trim()}`);
});

await test("TypeScript: getReferences finds all usages of totalArea", async () => {
  const doc = await provider.openDocument(tsUri);
  const text = doc.getText();
  const lines = text.split("\n");
  let defLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("function totalArea")) {
      defLine = i;
      break;
    }
  }
  assert(defLine >= 0, "Should find totalArea def");
  const col = lines[defLine].indexOf("totalArea");

  const refs = await provider.getReferences(doc, { line: defLine, character: col + 1 });
  assert(refs.length >= 2, `Should find >= 2 references (def + call + export), got ${refs.length}`);
  console.log(`    Found ${refs.length} references`);
});

await test("TypeScript: call hierarchy — prepareCallHierarchy on main", async () => {
  const doc = await provider.openDocument(tsUri);
  const text = doc.getText();
  const lines = text.split("\n");
  let mainLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("function main")) {
      mainLine = i;
      break;
    }
  }
  assert(mainLine >= 0, "Should find main function");
  const col = lines[mainLine].indexOf("main");

  const items = await provider.prepareCallHierarchy(tsUri, {
    line: mainLine,
    character: col + 1,
  });
  assert(items !== null && items.length > 0, "Should prepare call hierarchy for main");
  assert(items[0].name === "main", `Item name should be 'main', got '${items[0].name}'`);
  console.log(`    Prepared: ${items[0].name} (kind=${items[0].kind})`);
});

await test("TypeScript: call hierarchy — outgoing calls from main", async () => {
  const doc = await provider.openDocument(tsUri);
  const text = doc.getText();
  const lines = text.split("\n");
  let mainLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("function main")) {
      mainLine = i;
      break;
    }
  }
  const col = lines[mainLine].indexOf("main");
  const items = await provider.prepareCallHierarchy(tsUri, {
    line: mainLine,
    character: col + 1,
  });
  assert(items && items.length > 0, "Should have prepared items");

  const outgoing = await provider.getOutgoingCalls(items[0]);
  assert(outgoing.length > 0, "main should have outgoing calls");
  const calleeNames = outgoing.map((c: any) => c.to.name);
  console.log(`    Outgoing from main: ${calleeNames.join(", ")}`);
  assertIncludes(calleeNames, "createShape", "main should call createShape");
  assertIncludes(calleeNames, "totalArea", "main should call totalArea");
});

await test("TypeScript: call hierarchy — incoming calls to createShape", async () => {
  const doc = await provider.openDocument(tsUri);
  const text = doc.getText();
  const lines = text.split("\n");
  let defLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("function createShape")) {
      defLine = i;
      break;
    }
  }
  const col = lines[defLine].indexOf("createShape");
  const items = await provider.prepareCallHierarchy(tsUri, {
    line: defLine,
    character: col + 1,
  });
  assert(items && items.length > 0, "Should prepare for createShape");

  const incoming = await provider.getIncomingCalls(items[0]);
  assert(incoming.length > 0, "createShape should have incoming calls");
  const callerNames = incoming.map((c: any) => c.from.name);
  console.log(`    Incoming to createShape: ${callerNames.join(", ")}`);
  assertIncludes(callerNames, "main", "main should call createShape");
});

// ── Go tests ─────────────────────────────────────────────────────────────────

console.log("\n═══ Go (gopls) ═══");

const goFile = path.join(FIXTURES, "go/main.go");
const goUri = pathToFileURL(goFile).href;

await test("Go: openDocument returns valid document", async () => {
  const doc = await provider.openDocument(goUri);
  assert(doc.uri.includes("main.go"), "URI should contain main.go");
  assert(doc.languageId === "go", `languageId should be go, got ${doc.languageId}`);
  const text = doc.getText();
  assert(text.includes("type Calculator struct"), "Text should contain Calculator struct");
});

await test("Go: getDocumentSymbols finds types and functions", async () => {
  const doc = await provider.openDocument(goUri);
  const symbols = await provider.getDocumentSymbols(goUri);
  assert(symbols.length > 0, "Should find symbols");
  const names = symbols.map((s: any) => s.name);
  assertIncludes(names, "Calculator", "Should find Calculator struct");
  assertIncludes(names, "NewCalculator", "Should find NewCalculator function");
  assertIncludes(names, "ComputeSum", "Should find ComputeSum function");
  assertIncludes(names, "main", "Should find main function");
  console.log(`    Found ${symbols.length} symbols: ${names.join(", ")}`);
});

await test("Go: getDefinitions resolves NewCalculator call", async () => {
  const doc = await provider.openDocument(goUri);
  const text = doc.getText();
  const lines = text.split("\n");
  // Find "calc := NewCalculator(0)" in ComputeSum
  let targetLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("NewCalculator(0)")) {
      targetLine = i;
      break;
    }
  }
  assert(targetLine >= 0, "Should find NewCalculator call");
  const col = lines[targetLine].indexOf("NewCalculator");

  const defs = await provider.getDefinitions(doc, { line: targetLine, character: col + 1 });
  assert(defs.length > 0, "Should find definition");
  const defLine = defs[0].range.start.line;
  const defLineText = lines[defLine];
  assert(
    defLineText.includes("func NewCalculator"),
    `Should point to func NewCalculator, got: "${defLineText.trim()}"`
  );
  console.log(`    Definition at line ${defLine + 1}: ${defLineText.trim()}`);
});

await test("Go: getReferences finds all usages of NewCalculator", async () => {
  const doc = await provider.openDocument(goUri);
  const text = doc.getText();
  const lines = text.split("\n");
  let defLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("func NewCalculator")) {
      defLine = i;
      break;
    }
  }
  assert(defLine >= 0, "Should find NewCalculator def");
  const col = lines[defLine].indexOf("NewCalculator");

  const refs = await provider.getReferences(doc, { line: defLine, character: col + 1 });
  assert(refs.length >= 3, `Should find >= 3 references (def + 2 calls), got ${refs.length}`);
  console.log(`    Found ${refs.length} references`);
});

await test("Go: call hierarchy — outgoing calls from ComputeSum", async () => {
  const doc = await provider.openDocument(goUri);
  const text = doc.getText();
  const lines = text.split("\n");
  let defLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("func ComputeSum")) {
      defLine = i;
      break;
    }
  }
  assert(defLine >= 0, "Should find ComputeSum");
  const col = lines[defLine].indexOf("ComputeSum");

  const items = await provider.prepareCallHierarchy(goUri, {
    line: defLine,
    character: col + 1,
  });
  assert(items && items.length > 0, "Should prepare call hierarchy");

  const outgoing = await provider.getOutgoingCalls(items[0]);
  assert(outgoing.length > 0, "ComputeSum should have outgoing calls");
  const calleeNames = outgoing.map((c: any) => c.to.name);
  console.log(`    Outgoing from ComputeSum: ${calleeNames.join(", ")}`);
  assertIncludes(calleeNames, "NewCalculator", "Should call NewCalculator");
});

await test("Go: call hierarchy — incoming calls to NewCalculator", async () => {
  const doc = await provider.openDocument(goUri);
  const text = doc.getText();
  const lines = text.split("\n");
  let defLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("func NewCalculator")) {
      defLine = i;
      break;
    }
  }
  const col = lines[defLine].indexOf("NewCalculator");

  const items = await provider.prepareCallHierarchy(goUri, {
    line: defLine,
    character: col + 1,
  });
  assert(items && items.length > 0, "Should prepare for NewCalculator");

  const incoming = await provider.getIncomingCalls(items[0]);
  assert(incoming.length >= 2, `NewCalculator should have >= 2 callers, got ${incoming.length}`);
  const callerNames = incoming.map((c: any) => c.from.name);
  console.log(`    Incoming to NewCalculator: ${callerNames.join(", ")}`);
});

// ── Cleanup and summary ──────────────────────────────────────────────────────

console.log("\n═══ Cleanup ═══");
await shutdownAll();
console.log("  All LSP servers shut down.");

console.log("\n═══════════════════════════════════════════════");
console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
if (errors.length > 0) {
  console.log("\n  Failures:");
  for (const e of errors) {
    console.log(`    - ${e}`);
  }
}
console.log("═══════════════════════════════════════════════\n");

process.exit(failed > 0 ? 1 : 0);
