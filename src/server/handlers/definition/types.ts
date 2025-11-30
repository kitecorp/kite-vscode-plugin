/**
 * Type definitions for the definition handler.
 */

import { BlockContext, ImportInfo, BaseContext } from '../../types';

/**
 * Context for definition handler - provides access to shared functions.
 */
export interface DefinitionContext extends BaseContext {
    /** Extract imports from document text */
    extractImports: (text: string) => ImportInfo[];
    /** Check if a symbol is imported from a file */
    isSymbolImported: (imports: ImportInfo[], symbolName: string, filePath: string, currentFilePath: string) => boolean;
    /** Find enclosing block (resource or component) */
    findEnclosingBlock: (text: string, offset: number) => BlockContext | null;
}
