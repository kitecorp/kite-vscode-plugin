/**
 * Code Lens handler for the Kite language server.
 * Shows "X references" above declarations.
 */

import {
    CodeLens,
    Range,
    Command,
    Position,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { escapeRegex, wordBoundaryRegex, isInComment } from '../../utils/text-utils';

/**
 * Context for code lens operations
 */
export interface CodeLensContext {
    findKiteFilesInWorkspace: () => string[];
    getFileContent: (filePath: string, currentDocUri?: string) => string | null;
}

/**
 * Declaration info for code lens
 */
interface DeclarationInfo {
    name: string;
    line: number;
    character: number;
    type: 'schema' | 'component' | 'function' | 'variable' | 'resource' | 'type';
}

/**
 * Handle code lens request
 */
export function handleCodeLens(
    document: TextDocument,
    ctx: CodeLensContext
): CodeLens[] {
    const text = document.getText();
    const declarations = findDeclarations(text);

    if (declarations.length === 0) {
        return [];
    }

    const codeLenses: CodeLens[] = [];

    for (const decl of declarations) {
        const refCount = countReferences(decl.name, document, ctx);
        const title = refCount === 1 ? '1 reference' : `${refCount} references`;

        const range = Range.create(
            Position.create(decl.line, decl.character),
            Position.create(decl.line, decl.character + decl.name.length)
        );

        const command: Command = {
            title,
            command: 'editor.action.showReferences',
            arguments: [
                document.uri,
                Position.create(decl.line, decl.character),
                [] // Locations will be resolved by VS Code
            ]
        };

        codeLenses.push({
            range,
            command
        });
    }

    return codeLenses;
}

/**
 * Find all declarations in the document
 */
function findDeclarations(text: string): DeclarationInfo[] {
    const declarations: DeclarationInfo[] = [];
    const lines = text.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];

        // Skip comments
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
            continue;
        }

        // Schema: schema Name {
        const schemaMatch = line.match(/^\s*schema\s+(\w+)\s*\{/);
        if (schemaMatch) {
            const name = schemaMatch[1];
            const character = line.indexOf(name);
            declarations.push({ name, line: lineNum, character, type: 'schema' });
            continue;
        }

        // Component definition: component Name { (only one word before {)
        const componentDefMatch = line.match(/^\s*component\s+(\w+)\s*\{/);
        if (componentDefMatch) {
            const name = componentDefMatch[1];
            const character = line.indexOf(name);
            declarations.push({ name, line: lineNum, character, type: 'component' });
            continue;
        }

        // Component instance: component Type instanceName {
        const componentInstMatch = line.match(/^\s*component\s+\w+\s+(\w+)\s*\{/);
        if (componentInstMatch) {
            const name = componentInstMatch[1];
            const character = line.lastIndexOf(name);
            declarations.push({ name, line: lineNum, character, type: 'resource' });
            continue;
        }

        // Resource: resource Type name {
        const resourceMatch = line.match(/^\s*resource\s+[\w.]+\s+(\w+)\s*\{/);
        if (resourceMatch) {
            const name = resourceMatch[1];
            const character = line.lastIndexOf(name);
            declarations.push({ name, line: lineNum, character, type: 'resource' });
            continue;
        }

        // Function: fun name(
        const funcMatch = line.match(/^\s*fun\s+(\w+)\s*\(/);
        if (funcMatch) {
            const name = funcMatch[1];
            const character = line.indexOf(name);
            declarations.push({ name, line: lineNum, character, type: 'function' });
            continue;
        }

        // Type alias: type Name =
        const typeMatch = line.match(/^\s*type\s+(\w+)\s*=/);
        if (typeMatch) {
            const name = typeMatch[1];
            const character = line.indexOf(name);
            declarations.push({ name, line: lineNum, character, type: 'type' });
            continue;
        }

        // Variable: var [type] name =
        const varMatch = line.match(/^\s*var\s+(?:\w+\s+)?(\w+)\s*=/);
        if (varMatch) {
            const name = varMatch[1];
            // Find the position of the variable name (last word before =)
            const eqPos = line.indexOf('=');
            const beforeEq = line.substring(0, eqPos).trim();
            const words = beforeEq.split(/\s+/);
            const varName = words[words.length - 1];
            const character = line.lastIndexOf(varName, eqPos);
            declarations.push({ name: varName, line: lineNum, character, type: 'variable' });
            continue;
        }
    }

    return declarations;
}

/**
 * Count references to a symbol
 */
function countReferences(
    symbolName: string,
    document: TextDocument,
    ctx: CodeLensContext
): number {
    let count = 0;
    const currentUri = document.uri;
    const currentPath = URI.parse(currentUri).fsPath;

    // Count in current document
    count += countReferencesInText(symbolName, document.getText(), true);

    // Count in other workspace files
    const kiteFiles = ctx.findKiteFilesInWorkspace();
    for (const filePath of kiteFiles) {
        if (filePath === currentPath) continue;

        const content = ctx.getFileContent(filePath);
        if (!content) continue;

        // Check if this file imports the symbol or uses wildcard import
        if (!importsSymbol(content, symbolName, currentPath, filePath)) {
            continue;
        }

        count += countReferencesInText(symbolName, content, false);
    }

    return count;
}

/**
 * Check if a file imports a symbol from the source file
 */
function importsSymbol(
    content: string,
    symbolName: string,
    sourceFilePath: string,
    importingFilePath: string
): boolean {
    // Extract imports
    const importRegex = /import\s+([^"']+)\s+from\s+["']([^"']+)["']/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
        const symbols = match[1].trim();
        const importPath = match[2];

        // Check if import path could refer to source file
        // This is simplified - in reality we'd need full path resolution
        const sourceFileName = sourceFilePath.split('/').pop()?.replace('.kite', '') || '';
        if (!importPath.includes(sourceFileName) && !importPath.endsWith('.kite')) {
            continue;
        }

        // Wildcard import
        if (symbols === '*') {
            return true;
        }

        // Named imports
        const importedSymbols = symbols.split(',').map(s => s.trim());
        if (importedSymbols.includes(symbolName)) {
            return true;
        }
    }

    return false;
}

/**
 * Count references to a symbol in text
 */
function countReferencesInText(
    symbolName: string,
    text: string,
    excludeDeclaration: boolean
): number {
    let count = 0;
    const regex = wordBoundaryRegex(symbolName);
    let match;

    while ((match = regex.exec(text)) !== null) {
        const offset = match.index;

        // Skip if in comment
        if (isInComment(text, offset)) {
            continue;
        }

        // Skip if in non-interpolated string
        if (isInNonInterpolatedString(text, offset)) {
            continue;
        }

        // Check if this is a declaration (not a reference)
        if (excludeDeclaration && isDeclarationSite(text, offset, symbolName)) {
            continue;
        }

        count++;
    }

    return count;
}

/**
 * Check if position is inside a non-interpolated string (single-quoted)
 * or in non-interpolation part of double-quoted string
 */
function isInNonInterpolatedString(text: string, offset: number): boolean {
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inInterpolation = false;
    let interpolationDepth = 0;

    for (let i = 0; i < offset; i++) {
        const ch = text[i];
        const prevCh = i > 0 ? text[i - 1] : '';

        if (inSingleQuote) {
            if (ch === "'" && prevCh !== '\\') {
                inSingleQuote = false;
            }
        } else if (inDoubleQuote) {
            if (ch === '"' && prevCh !== '\\') {
                inDoubleQuote = false;
                inInterpolation = false;
                interpolationDepth = 0;
            } else if (ch === '$' && i + 1 < text.length && text[i + 1] === '{') {
                inInterpolation = true;
                interpolationDepth = 1;
                i++; // Skip {
            } else if (inInterpolation) {
                if (ch === '{') interpolationDepth++;
                if (ch === '}') {
                    interpolationDepth--;
                    if (interpolationDepth === 0) {
                        inInterpolation = false;
                    }
                }
            }
        } else {
            if (ch === "'" && prevCh !== '\\') {
                inSingleQuote = true;
            } else if (ch === '"' && prevCh !== '\\') {
                inDoubleQuote = true;
            }
        }
    }

    // In single quote = always non-interpolated
    if (inSingleQuote) return true;

    // In double quote but not in interpolation = non-interpolated
    if (inDoubleQuote && !inInterpolation) return true;

    return false;
}

/**
 * Check if this is a declaration site (where symbol is defined)
 */
function isDeclarationSite(text: string, offset: number, symbolName: string): boolean {
    // Find the line containing this offset
    const lineStart = text.lastIndexOf('\n', offset) + 1;
    const lineEnd = text.indexOf('\n', offset);
    const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
    const posInLine = offset - lineStart;

    // Schema definition: schema Name {
    const schemaMatch = line.match(/^\s*schema\s+(\w+)\s*\{/);
    if (schemaMatch && schemaMatch[1] === symbolName) {
        const namePos = line.indexOf(symbolName);
        if (posInLine >= namePos && posInLine < namePos + symbolName.length) {
            return true;
        }
    }

    // Component definition: component Name {
    const compDefMatch = line.match(/^\s*component\s+(\w+)\s*\{/);
    if (compDefMatch && compDefMatch[1] === symbolName) {
        const namePos = line.indexOf(symbolName);
        if (posInLine >= namePos && posInLine < namePos + symbolName.length) {
            return true;
        }
    }

    // Component instance: component Type instanceName {
    const compInstMatch = line.match(/^\s*component\s+\w+\s+(\w+)\s*\{/);
    if (compInstMatch && compInstMatch[1] === symbolName) {
        const namePos = line.lastIndexOf(symbolName);
        if (posInLine >= namePos && posInLine < namePos + symbolName.length) {
            return true;
        }
    }

    // Resource: resource Type name {
    const resourceMatch = line.match(/^\s*resource\s+[\w.]+\s+(\w+)\s*\{/);
    if (resourceMatch && resourceMatch[1] === symbolName) {
        const namePos = line.lastIndexOf(symbolName);
        if (posInLine >= namePos && posInLine < namePos + symbolName.length) {
            return true;
        }
    }

    // Function: fun name(
    const funcMatch = line.match(/^\s*fun\s+(\w+)\s*\(/);
    if (funcMatch && funcMatch[1] === symbolName) {
        const namePos = line.indexOf(symbolName);
        if (posInLine >= namePos && posInLine < namePos + symbolName.length) {
            return true;
        }
    }

    // Type alias: type Name =
    const typeMatch = line.match(/^\s*type\s+(\w+)\s*=/);
    if (typeMatch && typeMatch[1] === symbolName) {
        const namePos = line.indexOf(symbolName);
        if (posInLine >= namePos && posInLine < namePos + symbolName.length) {
            return true;
        }
    }

    // Variable: var [type] name =
    const varMatch = line.match(/^\s*var\s+(?:\w+\s+)?(\w+)\s*=/);
    if (varMatch && varMatch[1] === symbolName) {
        const eqPos = line.indexOf('=');
        const beforeEq = line.substring(0, eqPos);
        const namePos = beforeEq.lastIndexOf(symbolName);
        if (posInLine >= namePos && posInLine < namePos + symbolName.length) {
            return true;
        }
    }

    return false;
}
