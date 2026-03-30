import { CoreDecodedToken, LspDocument, LspSymbol } from './coreTypes';
import { retrieveDefs } from './definitionCore';
import { TokenProvider, getDecodedTokensFromSymbol } from './tokenCore';

export type { TokenProvider } from './tokenCore';

export async function getDecodedTokensFromSymbolWithDefs(
    document: LspDocument,
    functionSymbol: LspSymbol,
    provider: TokenProvider,
    skipDefinition: boolean = false
): Promise<CoreDecodedToken[]> {
    const decodedTokens = await getDecodedTokensFromSymbol(provider, document, functionSymbol);
    return retrieveDefs(document, decodedTokens, provider, skipDefinition);
}
