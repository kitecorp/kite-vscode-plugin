/**
 * Code Actions handler for the Kite language server.
 * Provides quick fixes like "Add import" and "Remove unused import".
 * Uses AST-based parsing for import detection where possible.
 */

import {
    CodeAction,
    CodeActionKind,
    CodeActionParams,
    TextEdit,
    Range,
    Position,
    WorkspaceEdit,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ImportSuggestion } from '../../types';
import { escapeRegex } from '../../utils/text-utils';
import {
    parseKite,
    findImportByPathAST,
    findLastImportLineAST,
} from '../../../parser';
import { UnusedImportData } from '../validation/unused-imports';
import { createWildcardConversionAction, findWildcardImportAtPosition, WildcardConversionContext } from './wildcard-conversion';
import { createSortImportsAction } from './sort-imports';

// Re-export for external use
export { WildcardConversionContext } from './wildcard-conversion';
export { createSortImportsAction } from './sort-imports';

/**
 * Handle code action request
 */
/**
 * Check if diagnostic data is unused import data
 */
function isUnusedImportData(data: unknown): data is UnusedImportData {
    return (
        typeof data === 'object' &&
        data !== null &&
        'type' in data &&
        (data as UnusedImportData).type === 'unused-import'
    );
}

export function handleCodeAction(
    params: CodeActionParams,
    document: TextDocument,
    diagnosticData: Map<string, ImportSuggestion>,
    wildcardCtx?: WildcardConversionContext
): CodeAction[] {
    const actions: CodeAction[] = [];
    const text = document.getText();

    // Parse document for AST-based import detection
    const parseResult = parseKite(text);

    // Check for wildcard import conversion (refactoring action, not diagnostic-based)
    if (wildcardCtx) {
        const startLine = params.range.start.line;
        const endLine = params.range.end.line;

        // Check each line in the selection for wildcard imports
        for (let line = startLine; line <= endLine; line++) {
            const wildcardImport = findWildcardImportAtPosition(document, line);
            if (wildcardImport) {
                const conversionAction = createWildcardConversionAction(
                    document,
                    wildcardImport.range,
                    wildcardCtx
                );
                if (conversionAction) {
                    actions.push(conversionAction);
                    break; // Only one conversion action per request
                }
            }
        }
    }

    // Collect all unused import diagnostics for "Remove all" action
    const unusedImportDiagnostics: { diagnostic: typeof params.context.diagnostics[0]; data: UnusedImportData }[] = [];

    for (const diagnostic of params.context.diagnostics) {
        if (diagnostic.source !== 'kite') continue;
        if (!diagnostic.data) continue;

        // Handle unused import diagnostics
        if (isUnusedImportData(diagnostic.data)) {
            unusedImportDiagnostics.push({ diagnostic, data: diagnostic.data });
            const unusedData = diagnostic.data;

            // Create remove action for this unused import
            const removeAction = createRemoveImportAction(
                params.textDocument.uri,
                document,
                diagnostic,
                unusedData,
                text
            );
            if (removeAction) {
                actions.push(removeAction);
            }
            continue;
        }

        const suggestion = diagnosticData.get(diagnostic.data as string);
        if (!suggestion) continue;

        // Check if there's already an import from this file using AST
        let existingImport = parseResult.tree
            ? findImportByPathAST(parseResult.tree, suggestion.importPath)
            : null;

        // If AST found a wildcard import, no action needed
        if (existingImport?.isWildcard) {
            continue;
        }

        let edit: WorkspaceEdit;

        // Fallback to regex for non-wildcard imports (which AST doesn't support)
        const existingImportRegex = new RegExp(
            `^(import\\s+)([\\w\\s,]+)(\\s+from\\s+["']${escapeRegex(suggestion.importPath)}["'])`,
            'gm'
        );
        const existingMatch = existingImportRegex.exec(text);

        if (existingMatch) {
            // Add to existing import
            const existingSymbols = existingMatch[2].trim();
            if (existingSymbols === '*') {
                // Wildcard import - no action needed
                continue;
            }

            const symbolList = existingSymbols.split(',').map(s => s.trim());
            if (symbolList.includes(suggestion.symbolName)) {
                // Already imported
                continue;
            }

            const newSymbols = existingSymbols + ', ' + suggestion.symbolName;
            const newImportLine = existingMatch[1] + newSymbols + existingMatch[3];

            const matchStart = existingMatch.index;
            const matchEnd = matchStart + existingMatch[0].length;

            const beforeMatch = text.substring(0, matchStart);
            const startLine = beforeMatch.split('\n').length - 1;
            const startChar = matchStart - beforeMatch.lastIndexOf('\n') - 1;

            const beforeEnd = text.substring(0, matchEnd);
            const endLine = beforeEnd.split('\n').length - 1;
            const endChar = matchEnd - beforeEnd.lastIndexOf('\n') - 1;

            edit = {
                changes: {
                    [params.textDocument.uri]: [
                        TextEdit.replace(
                            Range.create(Position.create(startLine, startChar), Position.create(endLine, endChar)),
                            newImportLine
                        )
                    ]
                }
            };
        } else {
            // Add new import line - use AST to find last import position
            let insertLine = 0;

            if (parseResult.tree) {
                const lastImportLine = findLastImportLineAST(parseResult.tree);
                if (lastImportLine >= 0) {
                    insertLine = lastImportLine + 1;
                }
            }

            const importStatement = `import ${suggestion.symbolName} from "${suggestion.importPath}"`;

            edit = {
                changes: {
                    [params.textDocument.uri]: [
                        TextEdit.insert(Position.create(insertLine, 0), importStatement + '\n')
                    ]
                }
            };
        }

        actions.push({
            title: `Import '${suggestion.symbolName}' from "${suggestion.importPath}"`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred: true,
            edit
        });
    }

    // Add "Remove all unused imports" action if there are multiple unused imports
    if (unusedImportDiagnostics.length > 1) {
        const removeAllAction = createRemoveAllUnusedImportsAction(
            params.textDocument.uri,
            document,
            unusedImportDiagnostics,
            text
        );
        if (removeAllAction) {
            actions.push(removeAllAction);
        }
    }

    // Add "Sort imports" action (source action, always available)
    const sortImportsAction = createSortImportsAction(document);
    if (sortImportsAction) {
        actions.push(sortImportsAction);
    }

    return actions;
}

/**
 * Create a code action to remove a single unused import
 */
function createRemoveImportAction(
    uri: string,
    document: TextDocument,
    diagnostic: { range: Range },
    unusedData: UnusedImportData,
    text: string
): CodeAction | null {
    const title = unusedData.symbol
        ? `Remove unused import '${unusedData.symbol}'`
        : `Remove unused import from "${unusedData.importPath}"`;

    // Find the import line in the text
    const importLineMatch = findImportLine(text, unusedData);
    if (!importLineMatch) {
        return null;
    }

    let edit: WorkspaceEdit;

    if (unusedData.isWildcard || isSingleSymbolImport(importLineMatch.fullLine)) {
        // Remove entire import line
        edit = createDeleteLineEdit(uri, document, importLineMatch);
    } else if (unusedData.symbol) {
        // Remove just the unused symbol from multi-symbol import
        edit = createRemoveSymbolEdit(uri, document, importLineMatch, unusedData.symbol);
    } else {
        return null;
    }

    return {
        title,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic as any],
        edit,
    };
}

/**
 * Create a code action to remove all unused imports
 */
function createRemoveAllUnusedImportsAction(
    uri: string,
    document: TextDocument,
    unusedImports: { diagnostic: { range: Range }; data: UnusedImportData }[],
    text: string
): CodeAction | null {
    const edits: TextEdit[] = [];

    // Group by import line to handle multi-symbol imports
    const lineEdits = new Map<number, { start: number; end: number; delete: boolean }>();

    for (const { data } of unusedImports) {
        const importLineMatch = findImportLine(text, data);
        if (!importLineMatch) continue;

        const lineNum = document.positionAt(importLineMatch.start).line;

        if (data.isWildcard || isSingleSymbolImport(importLineMatch.fullLine)) {
            // Mark entire line for deletion
            lineEdits.set(lineNum, {
                start: importLineMatch.start,
                end: importLineMatch.end,
                delete: true,
            });
        }
        // For multi-symbol imports, we'd need more complex logic
        // For simplicity, mark entire line if all symbols are unused
    }

    for (const [_, lineEdit] of lineEdits) {
        if (lineEdit.delete) {
            const startPos = document.positionAt(lineEdit.start);
            // Include newline in deletion
            const endOffset = Math.min(lineEdit.end + 1, text.length);
            const endPos = document.positionAt(endOffset);
            edits.push(TextEdit.del(Range.create(startPos, endPos)));
        }
    }

    if (edits.length === 0) {
        return null;
    }

    return {
        title: 'Remove all unused imports',
        kind: CodeActionKind.QuickFix,
        edit: {
            changes: {
                [uri]: edits,
            },
        },
    };
}

/**
 * Find the import line in text
 */
interface ImportLineMatch {
    fullLine: string;
    start: number;
    end: number;
    lineStart: number;
}

function findImportLine(text: string, unusedData: UnusedImportData): ImportLineMatch | null {
    // Use the stored positions if available
    if (unusedData.importLineStart !== undefined && unusedData.importLineEnd !== undefined) {
        const fullLine = text.substring(unusedData.importLineStart, unusedData.importLineEnd);
        // Find actual line start (beginning of the line)
        let lineStart = unusedData.importLineStart;
        while (lineStart > 0 && text[lineStart - 1] !== '\n') {
            lineStart--;
        }
        return {
            fullLine,
            start: lineStart,
            end: unusedData.importLineEnd,
            lineStart,
        };
    }

    // Fallback: search for the import by path
    const importRegex = new RegExp(
        `^import\\s+[^"']+\\s+from\\s+["']${escapeRegex(unusedData.importPath)}["']`,
        'gm'
    );
    const match = importRegex.exec(text);
    if (!match) {
        return null;
    }

    // Find line start
    let lineStart = match.index;
    while (lineStart > 0 && text[lineStart - 1] !== '\n') {
        lineStart--;
    }

    return {
        fullLine: match[0],
        start: lineStart,
        end: match.index + match[0].length,
        lineStart,
    };
}

/**
 * Check if import has only one symbol
 */
function isSingleSymbolImport(importLine: string): boolean {
    // Match: import Symbol from "path" (without commas)
    const match = importLine.match(/^import\s+([\w\s,*]+)\s+from/);
    if (!match) return true;

    const symbols = match[1].trim();
    if (symbols === '*') return true;

    // Check if there are commas (multiple symbols)
    return !symbols.includes(',');
}

/**
 * Create edit to delete entire import line
 */
function createDeleteLineEdit(
    uri: string,
    document: TextDocument,
    importMatch: ImportLineMatch
): WorkspaceEdit {
    const startPos = document.positionAt(importMatch.lineStart);
    // Include newline in deletion if present
    const text = document.getText();
    let endOffset = importMatch.end;
    if (endOffset < text.length && text[endOffset] === '\n') {
        endOffset++;
    }
    const endPos = document.positionAt(endOffset);

    return {
        changes: {
            [uri]: [TextEdit.del(Range.create(startPos, endPos))],
        },
    };
}

/**
 * Create edit to remove a single symbol from multi-symbol import
 */
function createRemoveSymbolEdit(
    uri: string,
    document: TextDocument,
    importMatch: ImportLineMatch,
    symbol: string
): WorkspaceEdit {
    // Parse the import: import Symbol1, Symbol2, Symbol3 from "path"
    const match = importMatch.fullLine.match(/^(import\s+)([\w\s,]+)(\s+from\s+["'][^"']+["'])/);
    if (!match) {
        // Fallback: delete entire line
        return createDeleteLineEdit(uri, document, importMatch);
    }

    const [, prefix, symbolsPart, suffix] = match;
    const symbols = symbolsPart.split(',').map(s => s.trim()).filter(s => s);

    // Remove the specified symbol
    const newSymbols = symbols.filter(s => s !== symbol);

    if (newSymbols.length === 0) {
        // No symbols left, delete entire line
        return createDeleteLineEdit(uri, document, importMatch);
    }

    const newImportLine = prefix + newSymbols.join(', ') + suffix;

    const startPos = document.positionAt(importMatch.lineStart);
    const endPos = document.positionAt(importMatch.end);

    return {
        changes: {
            [uri]: [TextEdit.replace(Range.create(startPos, endPos), newImportLine)],
        },
    };
}
