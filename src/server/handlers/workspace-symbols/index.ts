/**
 * Workspace Symbols handler for the Kite language server.
 * Provides global "Go to Symbol" (Cmd+T) across all workspace files.
 */

import {
    SymbolInformation,
    SymbolKind,
    Location,
    Range,
    Position,
} from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';

/**
 * Context for workspace symbols operations
 */
export interface WorkspaceSymbolsContext {
    findKiteFilesInWorkspace: () => string[];
    getFileContent: (filePath: string) => string | null;
}

/**
 * Symbol info extracted from a file
 */
interface ExtractedSymbol {
    name: string;
    kind: SymbolKind;
    line: number;
    character: number;
}

/**
 * Handle workspace symbols request
 */
export function handleWorkspaceSymbols(
    query: string,
    ctx: WorkspaceSymbolsContext
): SymbolInformation[] {
    const symbols: SymbolInformation[] = [];
    const kiteFiles = ctx.findKiteFilesInWorkspace();
    const queryLower = query.toLowerCase();

    for (const filePath of kiteFiles) {
        const content = ctx.getFileContent(filePath);
        if (!content) continue;

        const fileSymbols = extractSymbolsFromFile(content);
        const fileName = filePath.split('/').pop() || filePath;
        const fileUri = URI.file(filePath).toString();

        for (const sym of fileSymbols) {
            // Filter by query (case-insensitive substring match)
            if (query && !sym.name.toLowerCase().includes(queryLower)) {
                continue;
            }

            symbols.push({
                name: sym.name,
                kind: sym.kind,
                location: Location.create(
                    fileUri,
                    Range.create(
                        Position.create(sym.line, sym.character),
                        Position.create(sym.line, sym.character + sym.name.length)
                    )
                ),
                containerName: fileName,
            });
        }
    }

    return symbols;
}

/**
 * Extract all symbols from file content
 */
function extractSymbolsFromFile(content: string): ExtractedSymbol[] {
    const symbols: ExtractedSymbol[] = [];
    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];

        // Skip comment lines
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
            continue;
        }

        // Schema: schema Name {
        const schemaMatch = line.match(/^\s*schema\s+(\w+)\s*\{/);
        if (schemaMatch) {
            const name = schemaMatch[1];
            const character = line.indexOf(name);
            symbols.push({ name, kind: SymbolKind.Struct, line: lineNum, character });
            continue;
        }

        // Component definition: component Name { (only one word between component and {)
        const componentDefMatch = line.match(/^\s*component\s+(\w+)\s*\{/);
        if (componentDefMatch) {
            const name = componentDefMatch[1];
            const character = line.indexOf(name);
            symbols.push({ name, kind: SymbolKind.Class, line: lineNum, character });
            continue;
        }

        // Component instance: component Type instanceName {
        const componentInstMatch = line.match(/^\s*component\s+\w+\s+(\w+)\s*\{/);
        if (componentInstMatch) {
            const name = componentInstMatch[1];
            const character = line.lastIndexOf(name);
            symbols.push({ name, kind: SymbolKind.Object, line: lineNum, character });
            continue;
        }

        // Resource: resource Type name {
        const resourceMatch = line.match(/^\s*resource\s+[\w.]+\s+(\w+)\s*\{/);
        if (resourceMatch) {
            const name = resourceMatch[1];
            const character = line.lastIndexOf(name);
            symbols.push({ name, kind: SymbolKind.Object, line: lineNum, character });
            continue;
        }

        // Function: fun name(
        const funcMatch = line.match(/^\s*fun\s+(\w+)\s*\(/);
        if (funcMatch) {
            const name = funcMatch[1];
            const character = line.indexOf(name);
            symbols.push({ name, kind: SymbolKind.Function, line: lineNum, character });
            continue;
        }

        // Type alias: type Name =
        const typeMatch = line.match(/^\s*type\s+(\w+)\s*=/);
        if (typeMatch) {
            const name = typeMatch[1];
            const character = line.indexOf(name);
            symbols.push({ name, kind: SymbolKind.TypeParameter, line: lineNum, character });
            continue;
        }

        // Variable: var [type] name =
        const varMatch = line.match(/^\s*var\s+(?:\w+\s+)?(\w+)\s*=/);
        if (varMatch) {
            // Find the actual variable name (last word before =)
            const eqPos = line.indexOf('=');
            const beforeEq = line.substring(0, eqPos).trim();
            const words = beforeEq.split(/\s+/);
            const varName = words[words.length - 1];
            const character = line.lastIndexOf(varName, eqPos);
            symbols.push({ name: varName, kind: SymbolKind.Variable, line: lineNum, character });
            continue;
        }
    }

    return symbols;
}
