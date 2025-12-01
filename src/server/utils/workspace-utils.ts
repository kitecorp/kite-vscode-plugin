/**
 * Workspace utilities for the Kite language server.
 * Functions for searching across workspace files.
 */

/**
 * Context interface for workspace operations.
 */
export interface WorkspaceContext {
    findKiteFilesInWorkspace: () => string[];
    getFileContent: (filePath: string, currentDocUri?: string) => string | null;
}

/**
 * Result of finding a symbol in workspace.
 */
export interface SymbolSearchResult<T> {
    /** The found result, or null if not found */
    result: T | null;
    /** The file path where the symbol was found */
    filePath: string | null;
}

/**
 * Search for a symbol across workspace files using a custom finder function.
 *
 * This utility encapsulates the common pattern of:
 * 1. Iterating through workspace files
 * 2. Skipping the current file
 * 3. Getting file content
 * 4. Running a finder function on each file
 *
 * @param ctx - Workspace context with file access methods
 * @param currentFilePath - Path of the current file (will be skipped)
 * @param currentDocUri - URI of the current document (for content fetching)
 * @param finder - Function that searches for the symbol in file content
 * @returns Object with result and filePath where found, or null values if not found
 *
 * @example
 * // Find a schema definition
 * const result = findSymbolInWorkspace(
 *   ctx,
 *   currentFilePath,
 *   document.uri,
 *   (content, path) => findSchemaDefinition(content, schemaName, path)
 * );
 * if (result.result) {
 *   console.log(`Found in ${result.filePath}`);
 * }
 */
export function findSymbolInWorkspace<T>(
    ctx: WorkspaceContext,
    currentFilePath: string,
    currentDocUri: string,
    finder: (fileContent: string, filePath: string) => T | null
): SymbolSearchResult<T> {
    const kiteFiles = ctx.findKiteFilesInWorkspace();

    for (const filePath of kiteFiles) {
        if (filePath === currentFilePath) continue;

        const fileContent = ctx.getFileContent(filePath, currentDocUri);
        if (!fileContent) continue;

        const result = finder(fileContent, filePath);
        if (result !== null) {
            return { result, filePath };
        }
    }

    return { result: null, filePath: null };
}

/**
 * Search for a symbol across all workspace files (including current file).
 * Use this when you want to search everywhere, not skip the current file.
 */
export function findSymbolInAllWorkspaceFiles<T>(
    ctx: WorkspaceContext,
    currentDocUri: string,
    finder: (fileContent: string, filePath: string) => T | null
): SymbolSearchResult<T> {
    const kiteFiles = ctx.findKiteFilesInWorkspace();

    for (const filePath of kiteFiles) {
        const fileContent = ctx.getFileContent(filePath, currentDocUri);
        if (!fileContent) continue;

        const result = finder(fileContent, filePath);
        if (result !== null) {
            return { result, filePath };
        }
    }

    return { result: null, filePath: null };
}
