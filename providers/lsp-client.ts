/**
 * lsp-client.ts — Real LSP provider that spawns language servers and
 * communicates via vscode-jsonrpc over stdio.
 *
 * Implements all lsprag-skills provider interfaces:
 *   - TokenProvider (extends DefinitionProvider)
 *   - ReferenceProvider
 *   - CallHierarchyProvider
 *
 * Supports: pylsp (Python), typescript-language-server (TS/JS), gopls (Go)
 *
 * Usage:
 *   export LSPRAG_LSP_PROVIDER=/path/to/lsp-client.ts
 *
 * Or programmatically:
 *   import { createLspProvider, shutdownAll } from './lsp-client';
 *   const provider = await createLspProvider('/path/to/project');
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
  RequestType,
  NotificationType,
  RequestType0,
} from "vscode-jsonrpc/node";

// ── LSP protocol types ──────────────────────────────────────────────────────

interface LspPosition {
  line: number;
  character: number;
}
interface LspRange {
  start: LspPosition;
  end: LspPosition;
}
interface LspLocation {
  uri: string;
  range: LspRange;
}

// ── LSP protocol request/notification types (named params) ───────────────────

const InitializeRequest = new RequestType<any, any, any>("initialize");
const ShutdownRequest = new RequestType0<void, void>("shutdown");
const InitializedNotification = new NotificationType<any>("initialized");
const DidOpenNotification = new NotificationType<any>("textDocument/didOpen");
const ExitNotification = new NotificationType<void>("exit");

const DefinitionRequest = new RequestType<any, any, any>("textDocument/definition");
const ReferencesRequest = new RequestType<any, any, any>("textDocument/references");
const DocumentSymbolRequest = new RequestType<any, any, any>("textDocument/documentSymbol");
const HoverRequest = new RequestType<any, any, any>("textDocument/hover");
const SemanticTokensFullRequest = new RequestType<any, any, any>("textDocument/semanticTokens/full");
const SemanticTokensRangeRequest = new RequestType<any, any, any>("textDocument/semanticTokens/range");
const PrepareCallHierarchyRequest = new RequestType<any, any, any>("textDocument/prepareCallHierarchy");
const IncomingCallsRequest = new RequestType<any, any, any>("callHierarchy/incomingCalls");
const OutgoingCallsRequest = new RequestType<any, any, any>("callHierarchy/outgoingCalls");

// ── Language server definitions ──────────────────────────────────────────────

interface ServerDef {
  id: string;
  extensions: string[];
  command: string[];
  rootMarkers: string[];
  initializationOptions?: Record<string, any>;
}

const SERVER_DEFS: ServerDef[] = [
  {
    id: "pylsp",
    extensions: [".py", ".pyi"],
    command: ["pylsp"],
    rootMarkers: [
      "pyproject.toml",
      "setup.py",
      "setup.cfg",
      "requirements.txt",
      ".git",
    ],
  },
  {
    id: "typescript-language-server",
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    command: ["typescript-language-server", "--stdio"],
    rootMarkers: ["tsconfig.json", "package.json", ".git"],
  },
  {
    id: "gopls",
    extensions: [".go"],
    command: ["gopls", "serve"],
    rootMarkers: ["go.mod", "go.sum", ".git"],
    initializationOptions: {
      usePlaceholders: true,
    },
  },
];

// ── Utility ──────────────────────────────────────────────────────────────────

function uriToPath(uri: string): string {
  if (uri.startsWith("file://")) return fileURLToPath(uri);
  return uri;
}

function pathToUri(p: string): string {
  if (p.startsWith("file://")) return p;
  return pathToFileURL(p).href;
}

function languageIdFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".py": "python",
    ".pyi": "python",
    ".ts": "typescript",
    ".tsx": "typescriptreact",
    ".js": "javascript",
    ".jsx": "javascriptreact",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".go": "go",
  };
  return map[ext] ?? "plaintext";
}

function findProjectRoot(filePath: string, markers: string[]): string {
  let dir = path.dirname(filePath);
  while (dir !== path.dirname(dir)) {
    for (const marker of markers) {
      if (fs.existsSync(path.join(dir, marker))) return dir;
    }
    dir = path.dirname(dir);
  }
  return path.dirname(filePath);
}

function getServerDef(filePath: string): ServerDef | null {
  const ext = path.extname(filePath).toLowerCase();
  return SERVER_DEFS.find((s) => s.extensions.includes(ext)) ?? null;
}

function buildLineOffsets(text: string): number[] {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
}

function offsetAt(
  pos: LspPosition,
  lineOffsets: number[],
  textLen: number
): number {
  const line = Math.max(0, Math.min(pos.line, lineOffsets.length - 1));
  const lo = lineOffsets[line];
  const next =
    line + 1 < lineOffsets.length ? lineOffsets[line + 1] : textLen;
  const ch = Math.max(0, Math.min(pos.character, next - lo));
  return lo + ch;
}

// ── LSP Client ───────────────────────────────────────────────────────────────

class LspClient {
  private conn: MessageConnection;
  private proc: ChildProcess;
  private openFiles = new Map<string, number>(); // uri → version
  private _ready = false;
  private _serverCapabilities: any = {};
  readonly serverId: string;
  readonly rootUri: string;

  private constructor(
    conn: MessageConnection,
    proc: ChildProcess,
    serverId: string,
    rootUri: string
  ) {
    this.conn = conn;
    this.proc = proc;
    this.serverId = serverId;
    this.rootUri = rootUri;
  }

  static async create(
    serverDef: ServerDef,
    rootPath: string
  ): Promise<LspClient> {
    const [cmd, ...args] = serverDef.command;
    const proc = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: rootPath,
    });

    // Capture stderr for debugging but don't let it crash us
    proc.stderr?.on("data", () => {});

    const conn = createMessageConnection(
      new StreamMessageReader(proc.stdout!),
      new StreamMessageWriter(proc.stdin!)
    );
    conn.listen();

    const rootUri = pathToUri(rootPath);
    const client = new LspClient(conn, proc, serverDef.id, rootUri);

    // Initialize handshake — use RequestType to send named params
    const initResult: any = await conn.sendRequest(InitializeRequest, {
      processId: process.pid,
      rootUri,
      rootPath,
      workspaceFolders: [{ uri: rootUri, name: path.basename(rootPath) }],
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: false,
            willSave: false,
            willSaveWaitUntil: false,
            didSave: true,
          },
          completion: { completionItem: { snippetSupport: false } },
          hover: { contentFormat: ["plaintext", "markdown"] },
          definition: { dynamicRegistration: false },
          references: { dynamicRegistration: false },
          documentSymbol: {
            dynamicRegistration: false,
            hierarchicalDocumentSymbolSupport: true,
          },
          publishDiagnostics: { relatedInformation: false },
          callHierarchy: { dynamicRegistration: false },
          semanticTokens: {
            dynamicRegistration: false,
            requests: { range: true, full: { delta: false } },
            tokenTypes: [
              "namespace", "type", "class", "enum", "interface", "struct",
              "typeParameter", "parameter", "variable", "property",
              "enumMember", "event", "function", "method", "macro",
              "keyword", "modifier", "comment", "string", "number",
              "regexp", "operator", "decorator",
            ],
            tokenModifiers: [
              "declaration", "definition", "readonly", "static",
              "deprecated", "abstract", "async", "modification",
              "documentation", "defaultLibrary",
            ],
            formats: ["relative"],
            overlappingTokenSupport: false,
            multilineTokenSupport: false,
          },
        },
        workspace: {
          workspaceFolders: true,
          didChangeConfiguration: { dynamicRegistration: false },
        },
      },
      initializationOptions: serverDef.initializationOptions ?? {},
    });

    client._serverCapabilities = initResult?.capabilities ?? {};
    await conn.sendNotification(InitializedNotification, {});
    client._ready = true;
    return client;
  }

  get ready(): boolean {
    return this._ready;
  }

  get serverCapabilities(): any {
    return this._serverCapabilities;
  }

  async openDocument(
    uri: string
  ): Promise<{ uri: string; languageId: string; text: string; version: number }> {
    const filePath = uriToPath(uri);
    const text = fs.readFileSync(filePath, "utf8");
    const languageId = languageIdFromPath(filePath);
    const normalizedUri = pathToUri(filePath);

    if (!this.openFiles.has(normalizedUri)) {
      this.openFiles.set(normalizedUri, 0);
      await this.conn.sendNotification(DidOpenNotification, {
        textDocument: {
          uri: normalizedUri,
          languageId,
          version: 0,
          text,
        },
      });
      // Give the server a moment to index
      await new Promise((r) => setTimeout(r, 300));
    }

    return {
      uri: normalizedUri,
      languageId,
      text,
      version: this.openFiles.get(normalizedUri)!,
    };
  }

  async getDefinitions(uri: string, position: LspPosition): Promise<LspLocation[]> {
    const normalizedUri = pathToUri(uriToPath(uri));
    const result = await this.conn.sendRequest(DefinitionRequest, {
      textDocument: { uri: normalizedUri },
      position,
    });
    if (!result) return [];
    const arr = Array.isArray(result) ? result : [result];
    return arr
      .filter((r: any) => r.uri || r.targetUri)
      .map((r: any) => ({
        uri: r.uri ?? r.targetUri,
        range: r.range ?? r.targetSelectionRange ?? r.targetRange,
      }));
  }

  async getReferences(
    uri: string,
    position: LspPosition,
    includeDeclaration = true
  ): Promise<LspLocation[]> {
    const normalizedUri = pathToUri(uriToPath(uri));
    const result = await this.conn.sendRequest(ReferencesRequest, {
      textDocument: { uri: normalizedUri },
      position,
      context: { includeDeclaration },
    });
    if (!result) return [];
    return (result as any[]).map((r) => ({
      uri: r.uri,
      range: r.range,
    }));
  }

  async getDocumentSymbols(uri: string): Promise<any[]> {
    const normalizedUri = pathToUri(uriToPath(uri));
    const result = await this.conn.sendRequest(DocumentSymbolRequest, {
      textDocument: { uri: normalizedUri },
    });
    return (result as any[]) ?? [];
  }

  async getSemanticTokensFull(uri: string): Promise<{ data: number[] } | null> {
    const normalizedUri = pathToUri(uriToPath(uri));
    try {
      const result: any = await this.conn.sendRequest(
        SemanticTokensFullRequest,
        { textDocument: { uri: normalizedUri } }
      );
      return result ? { data: result.data ?? [] } : null;
    } catch {
      return null;
    }
  }

  async getSemanticTokensRange(
    uri: string,
    range: LspRange
  ): Promise<{ data: number[] } | null> {
    const normalizedUri = pathToUri(uriToPath(uri));
    try {
      const result: any = await this.conn.sendRequest(
        SemanticTokensRangeRequest,
        { textDocument: { uri: normalizedUri }, range }
      );
      return result ? { data: result.data ?? [] } : null;
    } catch {
      return null;
    }
  }

  async hover(
    uri: string,
    position: LspPosition
  ): Promise<{ contents: any } | null> {
    const normalizedUri = pathToUri(uriToPath(uri));
    try {
      return await this.conn.sendRequest(HoverRequest, {
        textDocument: { uri: normalizedUri },
        position,
      });
    } catch {
      return null;
    }
  }

  async prepareCallHierarchy(
    uri: string,
    position: LspPosition
  ): Promise<any[] | null> {
    const normalizedUri = pathToUri(uriToPath(uri));
    try {
      const result = await this.conn.sendRequest(
        PrepareCallHierarchyRequest,
        { textDocument: { uri: normalizedUri }, position }
      );
      return (result as any[]) ?? null;
    } catch {
      return null;
    }
  }

  async getIncomingCalls(item: any): Promise<any[]> {
    try {
      const result = await this.conn.sendRequest(
        IncomingCallsRequest,
        { item }
      );
      return (result as any[]) ?? [];
    } catch {
      return [];
    }
  }

  async getOutgoingCalls(item: any): Promise<any[]> {
    try {
      const result = await this.conn.sendRequest(
        OutgoingCallsRequest,
        { item }
      );
      return (result as any[]) ?? [];
    } catch {
      return [];
    }
  }

  async shutdown(): Promise<void> {
    try {
      await Promise.race([
        this.conn.sendRequest(ShutdownRequest),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
      await this.conn.sendNotification(ExitNotification);
    } catch {
      // ignore
    }
    this.conn.dispose();
    this.proc.kill();
    this._ready = false;
  }
}

// ── Client Pool ──────────────────────────────────────────────────────────────

const clientPool = new Map<string, LspClient>(); // "serverId:rootPath" → client
const broken = new Set<string>();

async function getClient(filePath: string): Promise<LspClient | null> {
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  const def = getServerDef(absPath);
  if (!def) return null;

  const rootPath = findProjectRoot(absPath, def.rootMarkers);
  const key = `${def.id}:${rootPath}`;

  if (broken.has(key)) return null;

  const existing = clientPool.get(key);
  if (existing?.ready) return existing;

  try {
    const client = await LspClient.create(def, rootPath);
    clientPool.set(key, client);
    return client;
  } catch (err) {
    broken.add(key);
    console.error(`[lsp-client] Failed to start ${def.id}: ${err}`);
    return null;
  }
}

export async function shutdownAll(): Promise<void> {
  const promises = [];
  for (const client of clientPool.values()) {
    promises.push(client.shutdown());
  }
  await Promise.allSettled(promises);
  clientPool.clear();
  broken.clear();
}

// ── Provider Implementation ──────────────────────────────────────────────────

async function openDocument(uri: string) {
  const filePath = uriToPath(uri);
  const client = await getClient(filePath);
  if (!client) {
    const text = fs.readFileSync(filePath, "utf8");
    const lineOffsets = buildLineOffsets(text);
    return {
      uri: pathToUri(filePath),
      languageId: languageIdFromPath(filePath),
      getText(range?: LspRange) {
        if (!range) return text;
        const start = offsetAt(range.start, lineOffsets, text.length);
        const end = offsetAt(range.end, lineOffsets, text.length);
        return text.slice(start, end);
      },
    };
  }
  const doc = await client.openDocument(uri);
  const lineOffsets = buildLineOffsets(doc.text);
  return {
    uri: doc.uri,
    languageId: doc.languageId,
    getText(range?: LspRange) {
      if (!range) return doc.text;
      const start = offsetAt(range.start, lineOffsets, doc.text.length);
      const end = offsetAt(range.end, lineOffsets, doc.text.length);
      return doc.text.slice(start, end);
    },
  };
}

async function getDefinitions(document: { uri: string }, position: LspPosition) {
  const filePath = uriToPath(document.uri);
  const client = await getClient(filePath);
  if (!client) return [];
  await client.openDocument(document.uri);
  return client.getDefinitions(document.uri, position);
}

async function getDocumentSymbols(uri: string) {
  const filePath = uriToPath(uri);
  const client = await getClient(filePath);
  if (!client) return [];
  await client.openDocument(uri);
  return flattenSymbols(await client.getDocumentSymbols(uri));
}

function flattenSymbols(symbols: any[], result: any[] = []): any[] {
  for (const sym of symbols) {
    result.push(sym);
    if (sym.children?.length) {
      flattenSymbols(sym.children, result);
    }
  }
  return result;
}

async function getSymbols(uri: string) {
  const filePath = uriToPath(uri);
  const client = await getClient(filePath);
  if (!client) return [];
  await client.openDocument(uri);
  const raw = await client.getDocumentSymbols(uri);
  return raw.map(normalizeSymbol);
}

function normalizeSymbol(sym: any): any {
  return {
    name: sym.name,
    kind: sym.kind,
    range: sym.range ?? sym.location?.range,
    selectionRange: sym.selectionRange ?? sym.range ?? sym.location?.range,
    children: sym.children?.map(normalizeSymbol) ?? [],
  };
}

async function getReferences(document: { uri: string }, position: LspPosition) {
  const filePath = uriToPath(document.uri);
  const client = await getClient(filePath);
  if (!client) return [];
  await client.openDocument(document.uri);
  return client.getReferences(document.uri, position);
}

async function getSemanticTokens(document: { uri: string }) {
  const filePath = uriToPath(document.uri);
  const client = await getClient(filePath);
  if (!client) return null;
  return client.getSemanticTokensFull(document.uri);
}

async function getSemanticTokensLegend() {
  return {
    tokenTypes: [
      "namespace", "type", "class", "enum", "interface", "struct",
      "typeParameter", "parameter", "variable", "property", "enumMember",
      "event", "function", "method", "macro", "keyword", "modifier",
      "comment", "string", "number", "regexp", "operator", "decorator",
    ],
    tokenModifiers: [
      "declaration", "definition", "readonly", "static", "deprecated",
      "abstract", "async", "modification", "documentation", "defaultLibrary",
    ],
  };
}

async function getSemanticTokensRange(document: { uri: string }, range: LspRange) {
  const filePath = uriToPath(document.uri);
  const client = await getClient(filePath);
  if (!client) return null;
  return client.getSemanticTokensRange(document.uri, range);
}

async function getSemanticTokensLegendRange(_document: { uri: string }, _range: LspRange) {
  return getSemanticTokensLegend();
}

// Call hierarchy

async function _prepareCallHierarchy(uri: string, position: LspPosition) {
  const filePath = uriToPath(uri);
  const client = await getClient(filePath);
  if (!client) return null;
  await client.openDocument(uri);
  return client.prepareCallHierarchy(uri, position);
}

async function _getIncomingCalls(item: any) {
  const filePath = uriToPath(item.uri);
  const client = await getClient(filePath);
  if (!client) return [];
  return client.getIncomingCalls(item);
}

async function _getOutgoingCalls(item: any) {
  const filePath = uriToPath(item.uri);
  const client = await getClient(filePath);
  if (!client) return [];
  return client.getOutgoingCalls(item);
}

// ── Exports (ProviderBundle shape) ───────────────────────────────────────────

export const provider = {
  openDocument,
  getDocumentSymbols,
  getSymbols,
  getDefinitions,
  getReferences,
  getSemanticTokens,
  getSemanticTokensLegend,
  getSemanticTokensRange,
  getSemanticTokensLegendRange: getSemanticTokensLegendRange,
  prepareCallHierarchy: _prepareCallHierarchy,
  getIncomingCalls: _getIncomingCalls,
  getOutgoingCalls: _getOutgoingCalls,
};

export const callHierarchyProvider = {
  prepareCallHierarchy: _prepareCallHierarchy,
  getIncomingCalls: _getIncomingCalls,
  getOutgoingCalls: _getOutgoingCalls,
};

export const tokenProvider = provider;
export const definitionProvider = provider;
export const referenceProvider = provider;

export const providers = {
  token: provider,
  definition: provider,
  reference: provider,
  callHierarchy: callHierarchyProvider,
};

export { createLspProvider };
export default provider;

// ── Factory for programmatic use ─────────────────────────────────────────────

async function createLspProvider(filePath: string) {
  const client = await getClient(filePath);
  if (!client) {
    throw new Error(
      `No language server available for ${path.extname(filePath)} files`
    );
  }
  return { provider, callHierarchyProvider, shutdownAll };
}
