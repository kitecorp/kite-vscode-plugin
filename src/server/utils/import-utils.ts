/**
 * Import utilities for the Kite language server.
 * Functions for parsing and resolving import statements.
 */

import * as path from 'path';
import { ImportInfo } from '../types';

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
        // Handle relative imports like "common.kite" or "./common.kite"
        let resolvedPath: string;

        if (importInfo.path.startsWith('./') || importInfo.path.startsWith('../')) {
            resolvedPath = path.resolve(currentDir, importInfo.path);
        } else if (importInfo.path.endsWith('.kite')) {
            // Relative to current directory
            resolvedPath = path.resolve(currentDir, importInfo.path);
        } else {
            // Package-style path like "aws.DatabaseConfig" -> aws/DatabaseConfig.kite
            const packagePath = importInfo.path.replace(/\./g, '/') + '.kite';
            resolvedPath = path.resolve(currentDir, packagePath);
        }

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
