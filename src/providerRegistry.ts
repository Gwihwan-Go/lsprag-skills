import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DefinitionProvider } from './definitionCore';
import type { TokenProvider } from './tokenCore';
import type { ReferenceProvider } from './referenceCore';

export type ProviderBundle = {
    definition?: DefinitionProvider;
    token?: TokenProvider;
    reference?: ReferenceProvider;
};

let providers: ProviderBundle = {};
let loadPromise: Promise<void> | null = null;
let loadAttempted = false;

function normalizeModule(mod: any): ProviderBundle {
    if (!mod) {
        return {};
    }

    const bundle = (mod.providers ?? mod.providerBundle ?? null) as ProviderBundle | null;
    if (bundle && (bundle.definition || bundle.token || bundle.reference)) {
        return bundle;
    }

    const fallback = mod.provider ?? mod.default ?? null;
    return {
        token: mod.tokenProvider ?? fallback ?? undefined,
        definition: mod.definitionProvider ?? fallback ?? undefined,
        reference: mod.referenceProvider ?? fallback ?? undefined
    };
}

async function loadProvidersFromEnv(): Promise<void> {
    if (loadAttempted || providers.definition || providers.token || providers.reference) {
        return;
    }

    loadAttempted = true;
    const modulePath = process.env.LSPRAG_LSP_PROVIDER || process.env.LSPRAG_PROVIDER_PATH;
    if (!modulePath) {
        return;
    }

    if (loadPromise) {
        await loadPromise;
        return;
    }

    loadPromise = (async () => {
        const specifier = modulePath.startsWith('.') || modulePath.startsWith('/')
            ? pathToFileURL(path.resolve(modulePath)).href
            : modulePath;
        const mod = await import(specifier);
        const loaded = normalizeModule(mod);
        providers = { ...providers, ...loaded };
    })();

    await loadPromise;
}

export function registerProviders(next: ProviderBundle): void {
    providers = { ...providers, ...next };
}

function missingProviderMessage(kind: string): string {
    return [
        `No ${kind} configured.`,
        'Set LSPRAG_LSP_PROVIDER to a provider module or call registerProviders(...) once at startup.',
        'The installer writes a default provider module for offline use.'
    ].join(' ');
}

export async function getTokenProvider(explicit?: TokenProvider): Promise<TokenProvider> {
    if (explicit) {
        return explicit;
    }
    await loadProvidersFromEnv();
    if (providers.token) {
        return providers.token;
    }
    throw new Error(missingProviderMessage('TokenProvider'));
}

export async function getDefinitionProvider(explicit?: DefinitionProvider): Promise<DefinitionProvider> {
    if (explicit) {
        return explicit;
    }
    await loadProvidersFromEnv();
    if (providers.definition) {
        return providers.definition;
    }
    if (providers.token) {
        return providers.token;
    }
    throw new Error(missingProviderMessage('DefinitionProvider'));
}

export async function getReferenceProvider(explicit?: ReferenceProvider): Promise<ReferenceProvider> {
    if (explicit) {
        return explicit;
    }
    await loadProvidersFromEnv();
    if (providers.reference) {
        return providers.reference;
    }
    throw new Error(missingProviderMessage('ReferenceProvider'));
}

export function _resetProvidersForTests(): void {
    providers = {};
    loadAttempted = false;
    loadPromise = null;
}
