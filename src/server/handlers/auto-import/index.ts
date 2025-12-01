/**
 * Auto-import handler for the Kite language server.
 * Automatically adds missing imports when paste-like changes are detected.
 */

import {
    Connection,
    TextEdit,
    Position,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import * as path from 'path';
import { ImportSuggestion, Declaration } from '../../types';
import { findSymbolInWorkspace } from '../../utils/workspace-utils';

/**
 * Minimum number of characters inserted to trigger auto-import (paste detection)
 */
const MIN_PASTE_LENGTH = 15;

/**
 * Debounce delay in milliseconds before applying auto-imports
 */
const DEBOUNCE_DELAY = 300;

/**
 * Context for auto-import operations
 */
export interface AutoImportContext {
    findKiteFilesInWorkspace: () => string[];
    getFileContent: (filePath: string, currentDocUri?: string) => string | null;
    getDeclarations: (uri: string) => Declaration[] | undefined;
}

/**
 * Track previous document content for paste detection
 */
const previousContentLength = new Map<string, number>();

/**
 * Debounce timers for auto-import
 */
const debounceTimers = new Map<string, NodeJS.Timeout>();

/**
 * Parse existing imports from document
 */
function parseExistingImports(text: string): Map<string, Set<string>> {
    const imports = new Map<string, Set<string>>();
    const importRegex = /^import\s+(.+)\s+from\s+["']([^"']+)["']/gm;

    let match;
    while ((match = importRegex.exec(text)) !== null) {
        const symbolsPart = match[1].trim();
        const importPath = match[2];

        if (symbolsPart === '*') {
            // Wildcard import - mark with special symbol
            imports.set(importPath, new Set(['*']));
        } else {
            const symbols = symbolsPart.split(',').map(s => s.trim()).filter(s => s);
            const existing = imports.get(importPath) || new Set();
            for (const s of symbols) {
                existing.add(s);
            }
            imports.set(importPath, existing);
        }
    }

    return imports;
}

/**
 * Find the last import line number
 */
function findLastImportLine(text: string): number {
    const lines = text.split('\n');
    let lastImportLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('import ')) {
            lastImportLine = i;
        } else if (line !== '' && !line.startsWith('//')) {
            // Stop at first non-import, non-empty, non-comment line
            break;
        }
    }

    return lastImportLine;
}

/**
 * Find a schema, component, or function definition in file content
 */
function findSymbolDefinition(content: string, symbolName: string): boolean {
    // Schema: schema SymbolName {
    const schemaRegex = new RegExp(`\\bschema\\s+${symbolName}\\s*\\{`);
    if (schemaRegex.test(content)) return true;

    // Component: component SymbolName {
    const componentRegex = new RegExp(`\\bcomponent\\s+${symbolName}\\s*\\{`);
    if (componentRegex.test(content)) return true;

    // Function: fun SymbolName(
    const funRegex = new RegExp(`\\bfun\\s+${symbolName}\\s*\\(`);
    if (funRegex.test(content)) return true;

    // Type alias: type SymbolName =
    const typeRegex = new RegExp(`\\btype\\s+${symbolName}\\s*=`);
    if (typeRegex.test(content)) return true;

    return false;
}

/**
 * Find undefined symbols in text that can be imported
 */
function findUndefinedSymbols(
    document: TextDocument,
    ctx: AutoImportContext
): ImportSuggestion[] {
    const text = document.getText();
    const currentUri = document.uri;
    const currentFilePath = URI.parse(currentUri).fsPath;
    const currentDir = path.dirname(currentFilePath);
    const suggestions: ImportSuggestion[] = [];

    // Get current file declarations
    const declarations = ctx.getDeclarations(currentUri) || [];
    const declaredNames = new Set(declarations.map(d => d.name));

    // Get existing imports
    const existingImports = parseExistingImports(text);

    // Built-in types and keywords to skip
    const builtins = new Set([
        'string', 'number', 'boolean', 'any', 'object', 'void', 'null',
        'true', 'false', 'if', 'else', 'for', 'while', 'in', 'return',
        'var', 'fun', 'schema', 'component', 'resource', 'input', 'output',
        'type', 'import', 'from', 'init', 'this', 'println', 'print', 'len',
    ]);

    // Find potential undefined symbols (PascalCase identifiers likely to be types)
    const pascalCaseRegex = /\b([A-Z][a-zA-Z0-9]*)\b/g;
    const foundSymbols = new Set<string>();

    let match;
    while ((match = pascalCaseRegex.exec(text)) !== null) {
        const symbol = match[1];

        // Skip if already processed, declared, or built-in
        if (foundSymbols.has(symbol)) continue;
        if (declaredNames.has(symbol)) continue;
        if (builtins.has(symbol.toLowerCase())) continue;

        // Check if already imported
        let alreadyImported = false;
        for (const [, symbols] of existingImports) {
            if (symbols.has('*') || symbols.has(symbol)) {
                alreadyImported = true;
                break;
            }
        }
        if (alreadyImported) continue;

        foundSymbols.add(symbol);

        // Try to find the symbol in workspace files
        const result = findSymbolInWorkspace(
            ctx,
            currentFilePath,
            currentUri,
            (content) => findSymbolDefinition(content, symbol) ? symbol : null
        );

        if (result.result && result.filePath) {
            // Calculate import path
            let importPath = path.relative(currentDir, result.filePath);
            importPath = importPath.replace(/\\/g, '/');

            suggestions.push({
                symbolName: symbol,
                filePath: result.filePath,
                importPath,
            });
        }
    }

    return suggestions;
}

/**
 * Build import edits for the suggestions
 */
function buildImportEdits(
    document: TextDocument,
    suggestions: ImportSuggestion[]
): TextEdit[] {
    if (suggestions.length === 0) {
        return [];
    }

    const text = document.getText();
    const existingImports = parseExistingImports(text);
    const edits: TextEdit[] = [];

    // Group suggestions by import path
    const groupedByPath = new Map<string, string[]>();
    for (const suggestion of suggestions) {
        // Skip if already covered by wildcard
        const existing = existingImports.get(suggestion.importPath);
        if (existing?.has('*')) continue;
        if (existing?.has(suggestion.symbolName)) continue;

        const symbols = groupedByPath.get(suggestion.importPath) || [];
        if (!symbols.includes(suggestion.symbolName)) {
            symbols.push(suggestion.symbolName);
        }
        groupedByPath.set(suggestion.importPath, symbols);
    }

    // Find where to insert new imports
    const lastImportLine = findLastImportLine(text);
    const insertLine = lastImportLine >= 0 ? lastImportLine + 1 : 0;

    // Build edits for each import path
    for (const [importPath, newSymbols] of groupedByPath.entries()) {
        // Add new import line
        const sortedSymbols = newSymbols.sort((a, b) =>
            a.toLowerCase().localeCompare(b.toLowerCase())
        );
        const importStatement = `import ${sortedSymbols.join(', ')} from "${importPath}"\n`;

        edits.push(TextEdit.insert(
            Position.create(insertLine, 0),
            importStatement
        ));
    }

    return edits;
}

/**
 * Check if a change looks like a paste operation
 */
export function isPasteOperation(
    document: TextDocument,
    previousLength: number | undefined
): boolean {
    const currentLength = document.getText().length;
    const previousLen = previousLength ?? 0;
    const insertedLength = currentLength - previousLen;

    return insertedLength >= MIN_PASTE_LENGTH;
}

/**
 * Handle document change and trigger auto-import if needed
 */
export function handleAutoImport(
    document: TextDocument,
    connection: Connection,
    ctx: AutoImportContext
): void {
    const uri = document.uri;
    const currentLength = document.getText().length;
    const previousLength = previousContentLength.get(uri);

    // Update tracked length
    previousContentLength.set(uri, currentLength);

    // Check if this looks like a paste
    if (!isPasteOperation(document, previousLength)) {
        return;
    }

    // Cancel any pending auto-import for this document
    const existingTimer = debounceTimers.get(uri);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    // Debounce to avoid running on every keystroke
    const timer = setTimeout(() => {
        debounceTimers.delete(uri);

        // Find undefined symbols that can be imported
        const suggestions = findUndefinedSymbols(document, ctx);

        if (suggestions.length === 0) {
            return;
        }

        // Build import edits
        const edits = buildImportEdits(document, suggestions);

        if (edits.length === 0) {
            return;
        }

        // Apply the edits automatically
        connection.workspace.applyEdit({
            label: 'Auto-import',
            edit: {
                changes: {
                    [uri]: edits,
                },
            },
        }).then(result => {
            if (result.applied) {
                // Show a message to the user
                connection.window.showInformationMessage(
                    `Added ${suggestions.length} missing import${suggestions.length > 1 ? 's' : ''}`
                );
            }
        }).catch(() => {
            // Silently ignore errors (user may have modified the document)
        });
    }, DEBOUNCE_DELAY);

    debounceTimers.set(uri, timer);
}

/**
 * Clean up when document is closed
 */
export function cleanupAutoImport(uri: string): void {
    previousContentLength.delete(uri);
    const timer = debounceTimers.get(uri);
    if (timer) {
        clearTimeout(timer);
        debounceTimers.delete(uri);
    }
}
