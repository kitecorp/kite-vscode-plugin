/**
 * Auto-import completions for the Kite language server.
 * Suggests symbols from other files with automatic import insertion.
 */

import {
    CompletionItem,
    CompletionItemKind,
    TextEdit,
    Position,
} from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import * as path from 'path';
import { CompletionContext } from './types';

/**
 * Symbol found in workspace that can be imported
 */
interface ImportableSymbol {
    name: string;
    kind: 'schema' | 'component' | 'function' | 'type';
    filePath: string;
    importPath: string;
}

/**
 * Parse existing imports from document text
 */
function parseExistingImports(text: string): Set<string> {
    const importedSymbols = new Set<string>();
    const importRegex = /^import\s+(.+)\s+from\s+["'][^"']+["']/gm;

    let match;
    while ((match = importRegex.exec(text)) !== null) {
        const symbolsPart = match[1].trim();
        if (symbolsPart === '*') {
            // Wildcard imports everything - we can't know what's imported
            // For safety, we could skip suggestions from this file
            // For now, just continue
            continue;
        }
        const symbols = symbolsPart.split(',').map(s => s.trim()).filter(s => s);
        for (const s of symbols) {
            importedSymbols.add(s);
        }
    }

    return importedSymbols;
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
 * Extract exportable symbols from file content
 */
function extractSymbolsFromFile(content: string): { name: string; kind: ImportableSymbol['kind'] }[] {
    const symbols: { name: string; kind: ImportableSymbol['kind'] }[] = [];

    // Schemas: schema Name {
    const schemaRegex = /\bschema\s+(\w+)\s*\{/g;
    let m;
    while ((m = schemaRegex.exec(content)) !== null) {
        symbols.push({ name: m[1], kind: 'schema' });
    }

    // Components (definitions only): component Name {
    // Skip instantiations which have two identifiers: component Type name {
    const componentRegex = /\bcomponent\s+(\w+)\s*\{/g;
    while ((m = componentRegex.exec(content)) !== null) {
        symbols.push({ name: m[1], kind: 'component' });
    }

    // Functions: fun name(
    const funcRegex = /\bfun\s+(\w+)\s*\(/g;
    while ((m = funcRegex.exec(content)) !== null) {
        symbols.push({ name: m[1], kind: 'function' });
    }

    // Type aliases: type Name =
    const typeRegex = /\btype\s+(\w+)\s*=/g;
    while ((m = typeRegex.exec(content)) !== null) {
        symbols.push({ name: m[1], kind: 'type' });
    }

    return symbols;
}

/**
 * Get completion item kind for symbol type
 */
function getCompletionItemKind(kind: ImportableSymbol['kind']): CompletionItemKind {
    switch (kind) {
        case 'schema':
            return CompletionItemKind.Struct;
        case 'component':
            return CompletionItemKind.Module;
        case 'function':
            return CompletionItemKind.Function;
        case 'type':
            return CompletionItemKind.TypeParameter;
    }
}

/**
 * Find all importable symbols from workspace
 */
function findImportableSymbols(
    currentFilePath: string,
    currentDir: string,
    currentDocUri: string,
    ctx: CompletionContext
): ImportableSymbol[] {
    const symbols: ImportableSymbol[] = [];
    const kiteFiles = ctx.findKiteFilesInWorkspace();

    for (const filePath of kiteFiles) {
        // Skip current file
        if (filePath === currentFilePath) continue;

        const content = ctx.getFileContent(filePath, currentDocUri);
        if (!content) continue;

        // Calculate import path
        let importPath = path.relative(currentDir, filePath);
        importPath = importPath.replace(/\\/g, '/');

        const fileSymbols = extractSymbolsFromFile(content);
        for (const sym of fileSymbols) {
            symbols.push({
                name: sym.name,
                kind: sym.kind,
                filePath,
                importPath,
            });
        }
    }

    return symbols;
}

/**
 * Create import text edit
 */
function createImportEdit(
    text: string,
    symbolName: string,
    importPath: string
): TextEdit {
    const lastImportLine = findLastImportLine(text);
    const insertLine = lastImportLine >= 0 ? lastImportLine + 1 : 0;
    const importStatement = `import ${symbolName} from "${importPath}"\n`;

    return TextEdit.insert(Position.create(insertLine, 0), importStatement);
}

/**
 * Get auto-import completions for symbols from other files.
 * These completions include additionalTextEdits to automatically add the import.
 */
export function getAutoImportCompletions(
    text: string,
    currentDocUri: string,
    localDeclarationNames: Set<string>,
    ctx: CompletionContext
): CompletionItem[] {
    const completions: CompletionItem[] = [];
    const currentFilePath = URI.parse(currentDocUri).fsPath;
    const currentDir = path.dirname(currentFilePath);

    // Get already imported symbols
    const importedSymbols = parseExistingImports(text);

    // Find all importable symbols
    const importableSymbols = findImportableSymbols(currentFilePath, currentDir, currentDocUri, ctx);

    // Track added symbols to avoid duplicates (same symbol from multiple files)
    const addedSymbols = new Set<string>();

    for (const sym of importableSymbols) {
        // Skip if already imported
        if (importedSymbols.has(sym.name)) continue;

        // Skip if declared locally
        if (localDeclarationNames.has(sym.name)) continue;

        // Skip if already added (from another file)
        if (addedSymbols.has(sym.name)) continue;

        addedSymbols.add(sym.name);

        // Get filename for display
        const fileName = path.basename(sym.filePath);

        completions.push({
            label: sym.name,
            kind: getCompletionItemKind(sym.kind),
            detail: `${sym.kind} (auto-import from ${fileName})`,
            // Lower priority than local symbols (sortText starting with 'z')
            sortText: 'z' + sym.name,
            // Add the import statement when this completion is selected
            additionalTextEdits: [createImportEdit(text, sym.name, sym.importPath)],
        });
    }

    return completions;
}
