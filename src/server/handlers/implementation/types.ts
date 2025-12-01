/**
 * Type definitions for the implementation handler.
 */

/**
 * Context interface for dependency injection into implementation handler.
 * This allows the handler to access server-scoped resources without direct coupling.
 */
export interface ImplementationContext {
    /** Find all .kite files in workspace */
    findKiteFilesInWorkspace: () => string[];
    /** Get file content by path */
    getFileContent: (filePath: string, currentDocUri?: string) => string | null;
}
