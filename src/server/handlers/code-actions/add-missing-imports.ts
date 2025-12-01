/**
 * Add Missing Imports code action for the Kite language server.
 * Provides a single action to add all missing imports at once.
 * Useful after pasting code that references symbols from other files.
 */

import {
    CodeAction,
    CodeActionKind,
    TextEdit,
    Range,
    Position,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ImportSuggestion } from '../../types';
import { escapeRegex } from '../../utils/text-utils';
import {
    parseKite,
    findImportByPathAST,
    findLastImportLineAST,
} from '../../../parser';

/**
 * Group import suggestions by file path
 */
interface GroupedImports {
    /** Import path (e.g., "common.kite") */
    importPath: string;
    /** Symbols to import from this path */
    symbols: string[];
}

/**
 * Parse existing imports from document
 */
interface ExistingImport {
    path: string;
    symbols: string[];
    isWildcard: boolean;
    line: number;
    fullMatch: string;
    matchStart: number;
    matchEnd: number;
}

/**
 * Parse all existing import statements from document
 */
function parseExistingImports(text: string): ExistingImport[] {
    const imports: ExistingImport[] = [];
    const importRegex = /^import\s+(.+)\s+from\s+["']([^"']+)["']/gm;

    let match;
    while ((match = importRegex.exec(text)) !== null) {
        const symbolsPart = match[1].trim();
        const path = match[2];
        const isWildcard = symbolsPart === '*';
        const symbols = isWildcard
            ? []
            : symbolsPart.split(',').map(s => s.trim()).filter(s => s);

        const beforeMatch = text.substring(0, match.index);
        const line = beforeMatch.split('\n').length - 1;

        imports.push({
            path,
            symbols,
            isWildcard,
            line,
            fullMatch: match[0],
            matchStart: match.index,
            matchEnd: match.index + match[0].length,
        });
    }

    return imports;
}

/**
 * Create a code action to add all missing imports at once
 */
export function createAddMissingImportsAction(
    document: TextDocument,
    suggestions: ImportSuggestion[]
): CodeAction | null {
    if (suggestions.length === 0) {
        return null;
    }

    const text = document.getText();
    const existingImports = parseExistingImports(text);

    // Group suggestions by import path
    const groupedByPath = new Map<string, string[]>();
    for (const suggestion of suggestions) {
        const existing = groupedByPath.get(suggestion.importPath) || [];
        if (!existing.includes(suggestion.symbolName)) {
            existing.push(suggestion.symbolName);
        }
        groupedByPath.set(suggestion.importPath, existing);
    }

    // Filter out symbols that are already imported
    for (const [path, symbols] of groupedByPath.entries()) {
        const existingImport = existingImports.find(imp => imp.path === path);
        if (existingImport) {
            if (existingImport.isWildcard) {
                // Wildcard import covers everything
                groupedByPath.delete(path);
            } else {
                // Filter out already imported symbols
                const remaining = symbols.filter(s => !existingImport.symbols.includes(s));
                if (remaining.length === 0) {
                    groupedByPath.delete(path);
                } else {
                    groupedByPath.set(path, remaining);
                }
            }
        }
    }

    // Nothing to import
    if (groupedByPath.size === 0) {
        return null;
    }

    const edits: TextEdit[] = [];

    // Process each import path
    for (const [importPath, newSymbols] of groupedByPath.entries()) {
        const existingImport = existingImports.find(imp => imp.path === importPath);

        if (existingImport && !existingImport.isWildcard) {
            // Add to existing import
            const allSymbols = [...existingImport.symbols, ...newSymbols];
            const sortedSymbols = allSymbols.sort((a, b) =>
                a.toLowerCase().localeCompare(b.toLowerCase())
            );
            const newImportLine = `import ${sortedSymbols.join(', ')} from "${importPath}"`;

            const beforeMatch = text.substring(0, existingImport.matchStart);
            const startLine = beforeMatch.split('\n').length - 1;
            const startChar = existingImport.matchStart - beforeMatch.lastIndexOf('\n') - 1;

            const beforeEnd = text.substring(0, existingImport.matchEnd);
            const endLine = beforeEnd.split('\n').length - 1;
            const endChar = existingImport.matchEnd - beforeEnd.lastIndexOf('\n') - 1;

            edits.push(TextEdit.replace(
                Range.create(Position.create(startLine, startChar), Position.create(endLine, endChar)),
                newImportLine
            ));
        } else {
            // Add new import line
            const sortedSymbols = newSymbols.sort((a, b) =>
                a.toLowerCase().localeCompare(b.toLowerCase())
            );
            const importStatement = `import ${sortedSymbols.join(', ')} from "${importPath}"`;

            // Find where to insert (after last import, or at top)
            let insertLine = 0;
            if (existingImports.length > 0) {
                const lastImport = existingImports[existingImports.length - 1];
                insertLine = lastImport.line + 1;
            }

            edits.push(TextEdit.insert(
                Position.create(insertLine, 0),
                importStatement + '\n'
            ));
        }
    }

    // Count total symbols being imported
    let totalSymbols = 0;
    for (const symbols of groupedByPath.values()) {
        totalSymbols += symbols.length;
    }

    const title = totalSymbols === 1
        ? `Add missing import`
        : `Add ${totalSymbols} missing imports`;

    return {
        title,
        kind: CodeActionKind.QuickFix,
        edit: {
            changes: {
                [document.uri]: edits,
            },
        },
    };
}

/**
 * Create a source action to add all missing imports (can be triggered via shortcut)
 */
export function createAddMissingImportsSourceAction(
    document: TextDocument,
    suggestions: ImportSuggestion[]
): CodeAction | null {
    const action = createAddMissingImportsAction(document, suggestions);
    if (!action) {
        return null;
    }

    return {
        ...action,
        title: 'Add all missing imports',
        kind: CodeActionKind.SourceFixAll,
    };
}
