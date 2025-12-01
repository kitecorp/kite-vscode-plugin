/**
 * Import utilities for the Kite language server.
 * Functions for parsing and resolving import statements.
 */

import * as path from 'path';
import { URI } from 'vscode-uri';
import { ImportInfo } from '../types';

/**
 * Resolve an import path to an absolute file path.
 * Handles relative paths (./foo, ../bar), simple filenames (foo.kite),
 * and package-style paths (aws.DatabaseConfig -> aws/DatabaseConfig.kite).
 *
 * @param importPath - The import path from the import statement
 * @param currentDir - Directory of the current file
 * @returns Resolved absolute file path
 */
export function resolveImportPath(importPath: string, currentDir: string): string {
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
        // Relative path
        return path.resolve(currentDir, importPath);
    } else if (importPath.endsWith('.kite')) {
        // Simple filename relative to current directory
        return path.resolve(currentDir, importPath);
    } else {
        // Package-style path like "aws.DatabaseConfig" -> aws/DatabaseConfig.kite
        const packagePath = importPath.replace(/\./g, '/') + '.kite';
        return path.resolve(currentDir, packagePath);
    }
}

/**
 * Resolve an import path from a document URI.
 * Convenience wrapper that extracts the directory from a URI.
 *
 * @param importPath - The import path from the import statement
 * @param currentDocUri - URI of the current document
 * @returns Resolved absolute file path
 */
export function resolveImportPathFromUri(importPath: string, currentDocUri: string): string {
    const currentFilePath = URI.parse(currentDocUri).fsPath;
    const currentDir = path.dirname(currentFilePath);
    return resolveImportPath(importPath, currentDir);
}

/**
 * Extract all import statements from text.
 * Handles both wildcard imports (import * from "path") and named imports (import X, Y from "path").
 */
export function extractImports(text: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    // Pattern: import * from "path"
    const wildcardRegex = /\bimport\s+\*\s+from\s+["']([^"']+)["']/g;
    let match;
    while ((match = wildcardRegex.exec(text)) !== null) {
        imports.push({ path: match[1], symbols: [] });
    }

    // Pattern: import SymbolName from "path" or import Symbol1, Symbol2 from "path"
    const namedRegex = /\bimport\s+([\w\s,]+)\s+from\s+["']([^"']+)["']/g;
    while ((match = namedRegex.exec(text)) !== null) {
        const symbolsPart = match[1].trim();
        if (symbolsPart !== '*') {
            const symbols = symbolsPart.split(',').map(s => s.trim()).filter(s => s);
            imports.push({ path: match[2], symbols });
        }
    }

    return imports;
}

/**
 * Check if a symbol from a file is imported in the current file.
 * @param imports - List of imports from the current file
 * @param symbolName - Name of the symbol to check
 * @param filePath - Path of the file where the symbol is defined
 * @param currentFilePath - Path of the current file
 */
export function isSymbolImported(
    imports: ImportInfo[],
    symbolName: string,
    filePath: string,
    currentFilePath: string
): boolean {
    const currentDir = path.dirname(currentFilePath);

    for (const importInfo of imports) {
        const resolvedPath = resolveImportPath(importInfo.path, currentDir);

        // Normalize paths for comparison
        if (path.normalize(resolvedPath) === path.normalize(filePath)) {
            // File matches - check if symbol is imported
            if (importInfo.symbols.length === 0) {
                // Wildcard import - all symbols are accessible
                return true;
            } else if (importInfo.symbols.includes(symbolName)) {
                // Named import includes this symbol
                return true;
            }
        }
    }

    return false;
}
