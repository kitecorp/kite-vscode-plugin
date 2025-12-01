/**
 * Organize Imports code action for the Kite language server.
 * Combines multiple import optimizations:
 * - Merges imports from the same file
 * - Sorts imports alphabetically by path
 * - Removes unused imports (when diagnostic data is available)
 */

import {
    CodeAction,
    CodeActionKind,
    TextEdit,
    Range,
    Position,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Result of organizing imports
 */
export interface OrganizeImportsResult {
    /** The organized imports as a string */
    newText: string;
    /** The range to replace */
    range: Range;
    /** Whether any changes were made */
    hasChanges: boolean;
}

/**
 * Parsed import information
 */
interface ParsedImport {
    /** Full original import line */
    fullLine: string;
    /** Import path (the string in quotes) */
    path: string;
    /** Imported symbols (empty for wildcard) */
    symbols: string[];
    /** Whether this is a wildcard import */
    isWildcard: boolean;
    /** Line number in document */
    lineNumber: number;
    /** Start offset in document */
    startOffset: number;
    /** End offset in document */
    endOffset: number;
}

/**
 * Parse all import statements from document
 * Only returns contiguous imports from the beginning of the file
 */
function parseImports(document: TextDocument): ParsedImport[] {
    const text = document.getText();
    const lines = text.split('\n');
    const imports: ParsedImport[] = [];

    let offset = 0;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        const trimmedLine = line.trim();

        // Match import statements: import ... from "path" or import ... from 'path'
        const importMatch = trimmedLine.match(/^import\s+(.+)\s+from\s+["']([^"']+)["']$/);

        if (importMatch) {
            const symbolsPart = importMatch[1].trim();
            const path = importMatch[2];
            const isWildcard = symbolsPart === '*';
            const symbols = isWildcard
                ? []
                : symbolsPart.split(',').map(s => s.trim()).filter(s => s);

            imports.push({
                fullLine: trimmedLine,
                path,
                symbols,
                isWildcard,
                lineNumber: lineNum,
                startOffset: offset,
                endOffset: offset + line.length,
            });
        } else if (trimmedLine !== '' && !trimmedLine.startsWith('//')) {
            // Stop at first non-import, non-empty, non-comment line
            break;
        }

        offset += line.length + 1; // +1 for newline
    }

    return imports;
}

/**
 * Merge imports from the same path into a single import
 */
function mergeImports(imports: ParsedImport[]): Map<string, { symbols: Set<string>; isWildcard: boolean }> {
    const merged = new Map<string, { symbols: Set<string>; isWildcard: boolean }>();

    for (const imp of imports) {
        const existing = merged.get(imp.path);

        if (existing) {
            // If either is wildcard, keep wildcard
            if (imp.isWildcard) {
                existing.isWildcard = true;
            } else {
                // Merge symbols
                for (const symbol of imp.symbols) {
                    existing.symbols.add(symbol);
                }
            }
        } else {
            merged.set(imp.path, {
                symbols: new Set(imp.symbols),
                isWildcard: imp.isWildcard,
            });
        }
    }

    return merged;
}

/**
 * Build import line from path and symbols
 */
function buildImportLine(path: string, symbols: Set<string>, isWildcard: boolean): string {
    if (isWildcard) {
        return `import * from "${path}"`;
    }

    // Sort symbols alphabetically
    const sortedSymbols = Array.from(symbols).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
    );

    return `import ${sortedSymbols.join(', ')} from "${path}"`;
}

/**
 * Organize imports: merge duplicates, sort by path, optionally remove unused
 * Returns null if no changes needed
 */
export function organizeImports(
    document: TextDocument,
    unusedSymbols?: Set<string>
): OrganizeImportsResult | null {
    const imports = parseImports(document);

    // Need at least 1 import to organize
    if (imports.length === 0) {
        return null;
    }

    // Merge imports from same path
    const merged = mergeImports(imports);

    // Remove unused symbols if provided
    if (unusedSymbols && unusedSymbols.size > 0) {
        for (const [path, data] of merged.entries()) {
            if (!data.isWildcard) {
                for (const symbol of data.symbols) {
                    if (unusedSymbols.has(symbol)) {
                        data.symbols.delete(symbol);
                    }
                }
                // Remove entire import if all symbols are unused
                if (data.symbols.size === 0) {
                    merged.delete(path);
                }
            }
        }
    }

    // Sort by path (case-insensitive)
    const sortedPaths = Array.from(merged.keys()).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
    );

    // Build organized import lines
    const organizedLines: string[] = [];
    for (const path of sortedPaths) {
        const data = merged.get(path)!;
        organizedLines.push(buildImportLine(path, data.symbols, data.isWildcard));
    }

    // Build the original import text for comparison
    const originalLines = imports.map(imp => imp.fullLine);
    const originalText = originalLines.join('\n');
    const organizedText = organizedLines.join('\n');

    // Check if any changes needed
    if (originalText === organizedText) {
        return null;
    }

    // Calculate the range covering all imports
    const firstImport = imports[0];
    const lastImport = imports[imports.length - 1];

    const startPos = Position.create(firstImport.lineNumber, 0);
    const endPos = Position.create(lastImport.lineNumber, lastImport.fullLine.length);

    return {
        newText: organizedText,
        range: Range.create(startPos, endPos),
        hasChanges: true,
    };
}

/**
 * Create a code action for organizing imports
 * Returns null if imports are already organized
 */
export function createOrganizeImportsAction(
    document: TextDocument,
    unusedSymbols?: Set<string>
): CodeAction | null {
    const result = organizeImports(document, unusedSymbols);

    if (!result) {
        return null;
    }

    const edit = TextEdit.replace(result.range, result.newText);

    return {
        title: 'Organize imports',
        kind: CodeActionKind.SourceOrganizeImports,
        edit: {
            changes: {
                [document.uri]: [edit],
            },
        },
    };
}
