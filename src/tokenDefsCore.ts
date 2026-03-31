import { CoreDecodedToken, LspDocument, LspSymbol } from './coreTypes';
import { retrieveDefs } from './definitionCore';
import { TokenProvider, getDecodedTokensFromSymbol } from './tokenCore';
import { getTokenProvider } from './providerRegistry';

export type { TokenProvider } from './tokenCore';

export async function getDecodedTokensFromSymbolWithDefs(
    document: LspDocument,
    functionSymbol: LspSymbol,
    provider?: TokenProvider | boolean,
    skipDefinition: boolean = false
): Promise<CoreDecodedToken[]> {
    let resolvedProvider: TokenProvider | undefined;
    let resolvedSkip = skipDefinition;
    if (typeof provider === 'boolean') {
        resolvedSkip = provider;
    } else if (provider) {
        resolvedProvider = provider;
    }
    const activeProvider = await getTokenProvider(resolvedProvider);
    const decodedTokens = await getDecodedTokensFromSymbol(activeProvider, document, functionSymbol);
    return retrieveDefs(document, decodedTokens, activeProvider, resolvedSkip);
}
