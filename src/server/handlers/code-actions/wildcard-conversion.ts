/**
 * Wildcard to named import conversion.
 * Converts `import * from "file"` to `import UsedA, UsedB from "file"`.
 */

import {
    CodeAction,
    CodeActionKind,
    TextEdit,
    Range,
    WorkspaceEdit,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import * as path from 'path';
import { wordBoundaryRegex } from '../../utils/text-utils';
import { resolveImportPath } from '../../utils/import-utils';

/**
 * Context for wildcard conversion.
 */
export interface WildcardConversionContext {
    findKiteFilesInWorkspace: () => string[];
    getFileContent: (filePath: string, currentDocUri?: string) => string | null;
}

/**
 * Create a code action to convert wildcard import to named import.
 */
export function createWildcardConversionAction(
    document: TextDocument,
    importRange: Range,
    ctx: WildcardConversionContext
): CodeAction | null {
    const text = document.getText();
    const lineText = document.getText(importRange);

    // Extract the import path from the line
    const pathMatch = lineText.match(/import\s+\*\s+from\s+["']([^"']+)["']/);
    if (!pathMatch) {
        return null;
    }

    const importPath = pathMatch[1];

    // Resolve the imported file
    const currentFilePath = URI.parse(document.uri).fsPath;
    const currentDir = path.dirname(currentFilePath);
    const resolvedPath = resolveImportPath(importPath, currentDir);

    // Get content of imported file
    const importedContent = ctx.getFileContent(resolvedPath, document.uri);
    if (!importedContent) {
        return null;
    }

    // Get exported symbols from the imported file
    const exportedSymbols = collectExportedSymbols(importedContent);
    if (exportedSymbols.length === 0) {
        return null;
    }

    // Find which symbols are used in the current file
    const usedSymbols = findUsedSymbolsFromFile(text, exportedSymbols);
    if (usedSymbols.length === 0) {
        return null;
    }

    // Generate the new import statement
    const symbolList = usedSymbols.join(', ');
    const newImport = `import ${symbolList} from "${importPath}"`;

    const edit: WorkspaceEdit = {
        changes: {
            [document.uri]: [
                TextEdit.replace(importRange, newImport)
            ]
        }
    };

    return {
        title: 'Convert to named import',
        kind: CodeActionKind.RefactorRewrite,
        edit
    };
}

/**
 * Collect all exported (top-level) symbols from a file.
 */
export function collectExportedSymbols(content: string): string[] {
    const symbols: string[] = [];

    // Schema: schema Name {
    const schemaRegex = /\bschema\s+(\w+)\s*\{/g;
    let match;
    while ((match = schemaRegex.exec(content)) !== null) {
        symbols.push(match[1]);
    }

    // Component definition: component Name { (not instance)
    const componentRegex = /\bcomponent\s+(\w+)\s*\{/g;
    while ((match = componentRegex.exec(content)) !== null) {
        // Check if this is a definition (Name followed by {) or instance (TypeName instanceName {)
        const beforeBrace = content.substring(match.index, match.index + match[0].length - 1).trim();
        const parts = beforeBrace.replace('component', '').trim().split(/\s+/);
        if (parts.length === 1) {
            // Definition: component Name {
            symbols.push(match[1]);
        }
    }

    // Function: fun name(
    const funcRegex = /\bfun\s+(\w+)\s*\(/g;
    while ((match = funcRegex.exec(content)) !== null) {
        symbols.push(match[1]);
    }

    // Type: type Name =
    const typeRegex = /\btype\s+(\w+)\s*=/g;
    while ((match = typeRegex.exec(content)) !== null) {
        symbols.push(match[1]);
    }

    // Top-level variable: var [type] name =
    // We need to be careful to only match top-level vars, not those inside blocks
    const varRegex = /^var\s+(?:\w+\s+)?(\w+)\s*=/gm;
    while ((match = varRegex.exec(content)) !== null) {
        // Check if this is at top level (no preceding unclosed {)
        const beforeMatch = content.substring(0, match.index);
        const openBraces = (beforeMatch.match(/\{/g) || []).length;
        const closeBraces = (beforeMatch.match(/\}/g) || []).length;
        if (openBraces === closeBraces) {
            symbols.push(match[1]);
        }
    }

    // Resource instance: resource Type instanceName {
    const resourceRegex = /\bresource\s+\w+(?:\.\w+)*\s+(\w+)\s*\{/g;
    while ((match = resourceRegex.exec(content)) !== null) {
        symbols.push(match[1]);
    }

    return [...new Set(symbols)].sort();
}

/**
 * Find which of the exported symbols are actually used in the current file.
 */
export function findUsedSymbolsFromFile(text: string, exportedSymbols: string[]): string[] {
    const usedSymbols: Set<string> = new Set();

    // Remove import lines from consideration
    const textWithoutImports = text.replace(/^import\s+.*$/gm, '');

    for (const symbol of exportedSymbols) {
        const regex = wordBoundaryRegex(symbol);
        if (regex.test(textWithoutImports)) {
            usedSymbols.add(symbol);
        }
    }

    return [...usedSymbols].sort();
}

/**
 * Check if a line is a wildcard import and return its range.
 */
export function findWildcardImportAtPosition(
    document: TextDocument,
    line: number
): { range: Range; importPath: string } | null {
    const lineText = document.getText({
        start: { line, character: 0 },
        end: { line, character: Number.MAX_VALUE }
    });

    const match = lineText.match(/^(\s*import\s+\*\s+from\s+["'])([^"']+)(["']\s*)$/);
    if (!match) {
        return null;
    }

    return {
        range: {
            start: { line, character: 0 },
            end: { line, character: lineText.length }
        },
        importPath: match[2]
    };
}
