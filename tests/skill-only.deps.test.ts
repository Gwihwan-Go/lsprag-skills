import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const targets = [path.join(repoRoot, "src"), path.join(repoRoot, "skills")];

type Violation = { file: string; pattern: string; line: string };

function collectFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, out);
    } else if (entry.isFile() && fullPath.endsWith(".ts")) {
      out.push(fullPath);
    }
  }
  return out;
}

const forbiddenPatterns: { label: string; regex: RegExp }[] = [
  { label: "vscode import", regex: /\bfrom\s+['"]vscode['"]|\brequire\(['"]vscode['"]\)/ },
  { label: "LSPRAG source path", regex: /\/LSPRAG\/src|\\LSPRAG\\src|src\/lsp\// },
];

const violations: Violation[] = [];
for (const target of targets) {
  const files = collectFiles(target);
  for (const file of files) {
    const contents = fs.readFileSync(file, "utf8");
    const lines = contents.split("\n");
    for (const { label, regex } of forbiddenPatterns) {
      lines.forEach((line) => {
        if (regex.test(line)) {
          violations.push({ file, pattern: label, line: line.trim() });
        }
      });
    }
  }
}

assert.equal(
  violations.length,
  0,
  `Found skill-only dependency violations:\n${violations
    .map((v) => `${v.file}: ${v.pattern}: ${v.line}`)
    .join("\n")}`
);

console.log("PASS: skill-only dependency check");
