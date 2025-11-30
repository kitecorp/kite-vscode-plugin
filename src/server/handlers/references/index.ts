/**
 * References handler for the Kite language server.
 * Provides "Find All References" functionality with scope awareness.
 *
 * This module re-exports functionality from:
 * - types.ts: ReferencesContext interface
 * - scope-utils.ts: Bracket/brace matching and string utilities
 * - loop-scope.ts: Loop variable scope detection
 * - property-references.ts: Component/schema property reference finding
 * - find-references.ts: Core reference finding logic
 */

import { Location } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { findAllReferences } from './find-references';

// Re-export types
export { ReferencesContext } from './types';

// Re-export utilities for use by other modules (e.g., rename handler)
export {
    findMatchingBracket,
    findMatchingBrace,
    isInStringLiteral,
    isInInterpolation,
    findReferencesInScope,
} from './scope-utils';

export { findLoopVariableScope, LoopVariableScope } from './loop-scope';

export {
    findComponentPropertyReferences,
    findSchemaPropertyReferences,
} from './property-references';

export { findAllReferences } from './find-references';

/**
 * Handle references request - finds all references to a symbol.
 * This is the main entry point called by the language server.
 */
export function handleReferences(
    document: TextDocument,
    word: string,
    cursorOffset: number,
    ctx: import('./types').ReferencesContext
): Location[] {
    return findAllReferences(word, document.uri, cursorOffset, ctx);
}
