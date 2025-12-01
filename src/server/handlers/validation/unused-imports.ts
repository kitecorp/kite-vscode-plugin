/**
 * Unused import detection for the Kite language server.
 * Detects imports that are not used in the document and provides diagnostics.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    DiagnosticTag,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ImportInfo } from '../../types';
import { escapeRegex } from '../../utils/text-utils';

/**
 * Data attached to unused import diagnostics for quick fixes
 */
export interface UnusedImportData {
    type: 'unused-import';
    importPath: string;
    symbol?: string;  // undefined for wildcard, specific symbol for named import
    isWildcard: boolean;
    // For removal quick fix
    importLineStart: number;
    importLineEnd: number;
}

/**
 * Check for unused imports in a document.
 * Returns diagnostics for each unused import symbol.
 */
export function checkUnusedImports(
    document: TextDocument,
    _imports: ImportInfo[]  // Kept for API compatibility, but we find imports directly
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Find all import statements in the text with their positions
    const importStatements = findImportStatements(text);

    for (const importStmt of importStatements) {
        if (importStmt.isWildcard) {
            // Wildcard import - check if ANY symbol could be used
            // We can't know all symbols from the file, so we check common patterns
            const isUsed = checkWildcardImportUsed(text, importStmt);

            if (!isUsed) {
                const range = Range.create(
                    document.positionAt(importStmt.start),
                    document.positionAt(importStmt.end)
                );

                const data: UnusedImportData = {
                    type: 'unused-import',
                    importPath: importStmt.path,
                    isWildcard: true,
                    importLineStart: importStmt.start,
                    importLineEnd: importStmt.end,
                };

                diagnostics.push({
                    severity: DiagnosticSeverity.Hint,
                    range,
                    message: `Unused import from "${importStmt.path}"`,
                    source: 'kite',
                    tags: [DiagnosticTag.Unnecessary],
                    data,
                });
            }
        } else {
            // Named import - check each symbol individually
            for (const symbol of importStmt.symbols) {
                const isUsed = checkSymbolUsed(text, symbol, importStmt);

                if (!isUsed) {
                    // Find the position of this specific symbol in the import
                    const symbolRange = findSymbolInImport(text, importStmt, symbol);
                    const range = symbolRange || Range.create(
                        document.positionAt(importStmt.start),
                        document.positionAt(importStmt.end)
                    );

                    const data: UnusedImportData = {
                        type: 'unused-import',
                        importPath: importStmt.path,
                        symbol,
                        isWildcard: false,
                        importLineStart: importStmt.start,
                        importLineEnd: importStmt.end,
                    };

                    diagnostics.push({
                        severity: DiagnosticSeverity.Hint,
                        range,
                        message: `Unused import '${symbol}' from "${importStmt.path}"`,
                        source: 'kite',
                        tags: [DiagnosticTag.Unnecessary],
                        data,
                    });
                }
            }
        }
    }

    return diagnostics;
}

/**
 * Parsed import statement with position information
 */
interface ImportStatement {
    path: string;
    isWildcard: boolean;
    symbols: string[];
    start: number;
    end: number;
}

/**
 * Find all import statements in text with their positions
 */
function findImportStatements(text: string): ImportStatement[] {
    const statements: ImportStatement[] = [];

    // Match: import * from "path"
    const wildcardRegex = /\bimport\s+\*\s+from\s+["']([^"']+)["']/g;
    let match;
    while ((match = wildcardRegex.exec(text)) !== null) {
        statements.push({
            path: match[1],
            isWildcard: true,
            symbols: [],
            start: match.index,
            end: match.index + match[0].length,
        });
    }

    // Match: import Symbol1, Symbol2 from "path"
    const namedRegex = /\bimport\s+([\w\s,]+)\s+from\s+["']([^"']+)["']/g;
    while ((match = namedRegex.exec(text)) !== null) {
        const symbolsPart = match[1].trim();
        if (symbolsPart !== '*') {
            const symbols = symbolsPart.split(',').map(s => s.trim()).filter(s => s);
            statements.push({
                path: match[2],
                isWildcard: false,
                symbols,
                start: match.index,
                end: match.index + match[0].length,
            });
        }
    }

    return statements;
}

/**
 * Check if a wildcard import is used.
 * Since we don't know all symbols from the imported file,
 * we assume unused if no PascalCase identifiers (types/schemas/components)
 * or function calls appear that could be from the import.
 */
function checkWildcardImportUsed(text: string, importStmt: ImportStatement): boolean {
    // Get text after the import statement
    const textAfterImport = text.substring(importStmt.end);

    // Check if any identifier is used in a type/schema/component context
    // These patterns indicate potential use of imported symbols:
    // - resource TypeName instanceName {
    // - component TypeName instanceName {
    // - var type TypeName =
    // - schema TypeName {

    // For now, we'll be conservative and check if there are any PascalCase
    // identifiers used in contexts that could reference imports

    // Check for resource/component type usage
    const resourcePattern = /\bresource\s+(\w+)\s+\w+\s*\{/g;
    const componentInstPattern = /\bcomponent\s+(\w+)\s+\w+\s*\{/g;

    let m;
    while ((m = resourcePattern.exec(textAfterImport)) !== null) {
        // Check if this type is NOT defined in the same file
        const typeName = m[1];
        if (!isDefinedLocally(text, typeName)) {
            return true; // Could be from this import
        }
    }

    while ((m = componentInstPattern.exec(textAfterImport)) !== null) {
        const typeName = m[1];
        if (!isDefinedLocally(text, typeName)) {
            return true;
        }
    }

    // Check for function calls that might be from the import
    const funcCallPattern = /\b([a-z]\w*)\s*\(/g;
    while ((m = funcCallPattern.exec(textAfterImport)) !== null) {
        const funcName = m[1];
        if (!isDefinedLocally(text, funcName) && !isBuiltinFunction(funcName)) {
            return true;
        }
    }

    // Check for variable references (identifiers not in declaration context)
    // This is tricky without full semantic analysis, so we'll be conservative

    return false;
}

/**
 * Check if a specific symbol is used in the document
 */
function checkSymbolUsed(text: string, symbol: string, importStmt: ImportStatement): boolean {
    // Get text after the import statement
    const textAfterImport = text.substring(importStmt.end);

    // Remove comments from text for accurate checking
    const textNoComments = removeComments(textAfterImport);

    // Check for word boundary match of the symbol
    // Must be preceded and followed by non-word characters
    const symbolPattern = new RegExp(`\\b${escapeRegex(symbol)}\\b`);

    return symbolPattern.test(textNoComments);
}

/**
 * Check if a symbol is defined locally in the file
 */
function isDefinedLocally(text: string, name: string): boolean {
    // Check for schema definition
    if (new RegExp(`\\bschema\\s+${escapeRegex(name)}\\s*\\{`).test(text)) {
        return true;
    }

    // Check for component definition (not instantiation)
    // Definition: component Name {
    // Instantiation: component Type name {
    if (new RegExp(`\\bcomponent\\s+${escapeRegex(name)}\\s*\\{`).test(text)) {
        return true;
    }

    // Check for function definition
    if (new RegExp(`\\bfun\\s+${escapeRegex(name)}\\s*\\(`).test(text)) {
        return true;
    }

    // Check for variable/type definition
    if (new RegExp(`\\bvar\\s+(?:\\w+\\s+)?${escapeRegex(name)}\\s*=`).test(text)) {
        return true;
    }
    if (new RegExp(`\\btype\\s+${escapeRegex(name)}\\s*=`).test(text)) {
        return true;
    }

    return false;
}

/**
 * Check if a function name is a built-in function
 */
function isBuiltinFunction(name: string): boolean {
    const builtins = new Set([
        'println', 'print', 'len', 'toString', 'toNumber', 'typeof',
        'if', 'while', 'for', 'fun', 'return'
    ]);
    return builtins.has(name);
}

/**
 * Find the range of a specific symbol within an import statement
 */
function findSymbolInImport(
    text: string,
    importStmt: ImportStatement,
    symbol: string
): Range | null {
    // This would need document context to convert to Range
    // For now, return null to use the full import range
    return null;
}

/**
 * Remove comments from text
 */
function removeComments(text: string): string {
    // Remove single-line comments
    let result = text.replace(/\/\/.*$/gm, '');

    // Remove multi-line comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');

    return result;
}
