import { LspPosition, LspRange } from './coreTypes';
import { getCallHierarchyProvider } from './providerRegistry';

// ── LSP Call-Hierarchy types ─────────────────────────────────────────────────

export interface CallHierarchyItem {
    name: string;
    kind: number;
    uri: string;
    range: LspRange;
    selectionRange: LspRange;
    detail?: string;
    tags?: number[];
}

export interface CallHierarchyIncomingCall {
    from: CallHierarchyItem;
    fromRanges: LspRange[];
}

export interface CallHierarchyOutgoingCall {
    to: CallHierarchyItem;
    fromRanges: LspRange[];
}

// ── Provider interface ───────────────────────────────────────────────────────

export interface CallHierarchyProvider {
    prepareCallHierarchy(
        uri: string,
        position: LspPosition
    ): Promise<CallHierarchyItem[] | null>;

    getIncomingCalls(
        item: CallHierarchyItem
    ): Promise<CallHierarchyIncomingCall[]>;

    getOutgoingCalls(
        item: CallHierarchyItem
    ): Promise<CallHierarchyOutgoingCall[]>;

    log?: (message: string) => void;
}

// ── Options ──────────────────────────────────────────────────────────────────

export type CallHierarchyDirection = 'incoming' | 'outgoing' | 'both';

export interface CallHierarchyOptions {
    direction?: CallHierarchyDirection;
    depth?: number;
}

// ── Tree node for formatted output ──────────────────────────────────────────

export interface CallHierarchyNode {
    item: CallHierarchyItem;
    callSites: LspRange[];
    children: CallHierarchyNode[];
    truncated?: boolean;
}

// ── Core logic ───────────────────────────────────────────────────────────────

async function buildCallTree(
    provider: CallHierarchyProvider,
    item: CallHierarchyItem,
    direction: 'incoming' | 'outgoing',
    maxDepth: number,
    depth: number,
    visited: Set<string>
): Promise<CallHierarchyNode> {
    const key = `${item.uri}#${item.name}#${item.selectionRange.start.line}`;
    const node: CallHierarchyNode = {
        item,
        callSites: [],
        children: [],
    };

    if (depth >= maxDepth) {
        node.truncated = true;
        return node;
    }

    if (visited.has(key)) {
        node.truncated = true;
        return node;
    }
    visited.add(key);

    if (direction === 'incoming') {
        const calls = await provider.getIncomingCalls(item);
        for (const call of calls) {
            const child = await buildCallTree(
                provider, call.from, direction, maxDepth, depth + 1, visited
            );
            child.callSites = call.fromRanges;
            node.children.push(child);
        }
    } else {
        const calls = await provider.getOutgoingCalls(item);
        for (const call of calls) {
            const child = await buildCallTree(
                provider, call.to, direction, maxDepth, depth + 1, visited
            );
            child.callSites = call.fromRanges;
            node.children.push(child);
        }
    }

    visited.delete(key);
    return node;
}

export function prettyPrintCallTree(
    node: CallHierarchyNode,
    prefix: string = '',
    isLast: boolean = true,
    depth: number = 0
): string {
    const connector = depth === 0 ? '' : (isLast ? '└─ ' : '├─ ');
    const uri = node.item.uri.replace(/^file:\/\//, '');
    const line = node.item.selectionRange.start.line + 1;
    const label = `${node.item.name} (${uri}:${line})`;
    const suffix = node.truncated && node.children.length === 0
        ? ' [...]'
        : '';
    const lines: string[] = [`${prefix}${connector}${label}${suffix}`];

    const nextPrefix = depth === 0 ? '' : (isLast ? '   ' : '│  ');

    for (let i = 0; i < node.children.length; i++) {
        const childIsLast = i === node.children.length - 1;
        lines.push(
            prettyPrintCallTree(node.children[i], prefix + nextPrefix, childIsLast, depth + 1)
        );
    }

    return lines.join('\n');
}

export async function getCallHierarchyInfo(
    uri: string,
    position: LspPosition,
    provider?: CallHierarchyProvider,
    options: CallHierarchyOptions = {}
): Promise<string> {
    const activeProvider = await getCallHierarchyProvider(provider);
    const direction = options.direction ?? 'incoming';
    const maxDepth = options.depth ?? 3;

    activeProvider.log?.(
        `[callHierarchy] Preparing at ${uri} ${position.line}:${position.character}, direction=${direction}, depth=${maxDepth}`
    );

    const items = await activeProvider.prepareCallHierarchy(uri, position);
    if (!items || items.length === 0) {
        activeProvider.log?.('[callHierarchy] No call hierarchy items found');
        return '';
    }

    const sections: string[] = [];

    for (const item of items) {
        if (direction === 'incoming' || direction === 'both') {
            const tree = await buildCallTree(
                activeProvider, item, 'incoming', maxDepth, 0, new Set()
            );
            const header = `Incoming calls to '${item.name}':`;
            const body = tree.children.length > 0
                ? prettyPrintCallTree(tree)
                : `${item.name}\n  (no incoming calls)`;
            sections.push(`${header}\n${body}`);
        }

        if (direction === 'outgoing' || direction === 'both') {
            const tree = await buildCallTree(
                activeProvider, item, 'outgoing', maxDepth, 0, new Set()
            );
            const header = `Outgoing calls from '${item.name}':`;
            const body = tree.children.length > 0
                ? prettyPrintCallTree(tree)
                : `${item.name}\n  (no outgoing calls)`;
            sections.push(`${header}\n${body}`);
        }
    }

    return sections.join('\n\n');
}
