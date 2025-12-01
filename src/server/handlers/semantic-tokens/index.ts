/**
 * Semantic Tokens handler for the Kite language server.
 * Provides enhanced syntax highlighting via LSP.
 */

import {
    SemanticTokens,
    SemanticTokensLegend,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Token types for semantic highlighting
 */
export const TOKEN_TYPES = {
    namespace: 0,
    type: 1,
    class: 2,
    enum: 3,
    interface: 4,
    struct: 5,
    typeParameter: 6,
    parameter: 7,
    variable: 8,
    property: 9,
    enumMember: 10,
    event: 11,
    function: 12,
    method: 13,
    macro: 14,
    keyword: 15,
    modifier: 16,
    comment: 17,
    string: 18,
    number: 19,
    regexp: 20,
    operator: 21,
    decorator: 22,
};

/**
 * Token modifiers for semantic highlighting
 */
export const TOKEN_MODIFIERS = {
    declaration: 0,
    definition: 1,
    readonly: 2,
    static: 3,
    deprecated: 4,
    abstract: 5,
    async: 6,
    modification: 7,
    documentation: 8,
    defaultLibrary: 9,
};

/**
 * Semantic tokens legend - defines available token types and modifiers
 */
export const semanticTokensLegend: SemanticTokensLegend = {
    tokenTypes: [
        'namespace',
        'type',
        'class',
        'enum',
        'interface',
        'struct',
        'typeParameter',
        'parameter',
        'variable',
        'property',
        'enumMember',
        'event',
        'function',
        'method',
        'macro',
        'keyword',
        'modifier',
        'comment',
        'string',
        'number',
        'regexp',
        'operator',
        'decorator',
    ],
    tokenModifiers: [
        'declaration',
        'definition',
        'readonly',
        'static',
        'deprecated',
        'abstract',
        'async',
        'modification',
        'documentation',
        'defaultLibrary',
    ],
};

/**
 * Token info for building semantic tokens
 */
interface TokenInfo {
    line: number;
    char: number;
    length: number;
    type: number;
    modifiers: number;
}

/**
 * Handle semantic tokens request
 */
export function handleSemanticTokens(document: TextDocument): SemanticTokens {
    const text = document.getText();
    const tokens: TokenInfo[] = [];

    const lines = text.split('\n');
    let inBlockComment = false;
    let inString = false;
    let stringChar = '';

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];

        // Track block comment state
        if (inBlockComment) {
            const endIdx = line.indexOf('*/');
            if (endIdx !== -1) {
                inBlockComment = false;
            }
            continue;
        }

        // Check for block comment start
        const blockCommentStart = line.indexOf('/*');
        if (blockCommentStart !== -1) {
            const blockCommentEnd = line.indexOf('*/', blockCommentStart + 2);
            if (blockCommentEnd === -1) {
                inBlockComment = true;
            }
            continue;
        }

        // Skip line comments
        const lineCommentIdx = line.indexOf('//');
        const effectiveLine = lineCommentIdx !== -1 ? line.substring(0, lineCommentIdx) : line;

        // Process tokens on this line
        extractTokensFromLine(effectiveLine, lineNum, tokens);
    }

    // Sort tokens by position
    tokens.sort((a, b) => {
        if (a.line !== b.line) return a.line - b.line;
        return a.char - b.char;
    });

    // Encode tokens as delta format
    const data = encodeTokens(tokens);

    return { data };
}

/**
 * Extract semantic tokens from a line
 */
function extractTokensFromLine(line: string, lineNum: number, tokens: TokenInfo[]): void {
    // Skip if line is mostly whitespace
    if (!line.trim()) return;

    // Decorator: @name or @name(...)
    const decoratorRegex = /@(\w+)/g;
    let match;
    while ((match = decoratorRegex.exec(line)) !== null) {
        if (!isInsideString(line, match.index)) {
            tokens.push({
                line: lineNum,
                char: match.index + 1, // After @
                length: match[1].length,
                type: TOKEN_TYPES.decorator,
                modifiers: 0,
            });
        }
    }

    // Schema definition: schema Name {
    const schemaMatch = line.match(/^\s*schema\s+(\w+)/);
    if (schemaMatch) {
        const nameStart = line.indexOf(schemaMatch[1]);
        tokens.push({
            line: lineNum,
            char: nameStart,
            length: schemaMatch[1].length,
            type: TOKEN_TYPES.class,
            modifiers: modifierBits(['definition']),
        });
    }

    // Schema property: type propertyName (inside schema body)
    const propertyMatch = line.match(/^\s+(string|number|boolean|any|object|\w+)\s+(\w+)/);
    if (propertyMatch && !line.includes('var ') && !line.includes('input ') && !line.includes('output ')) {
        const typeStart = line.indexOf(propertyMatch[1]);
        const nameStart = line.indexOf(propertyMatch[2], typeStart + propertyMatch[1].length);

        // Type token
        if (isBuiltinType(propertyMatch[1])) {
            tokens.push({
                line: lineNum,
                char: typeStart,
                length: propertyMatch[1].length,
                type: TOKEN_TYPES.type,
                modifiers: 0,
            });
        }

        // Property name token
        tokens.push({
            line: lineNum,
            char: nameStart,
            length: propertyMatch[2].length,
            type: TOKEN_TYPES.property,
            modifiers: modifierBits(['declaration']),
        });
    }

    // Component definition: component Name { (single word)
    const componentDefMatch = line.match(/^\s*component\s+(\w+)\s*\{/);
    if (componentDefMatch) {
        const nameStart = line.indexOf(componentDefMatch[1]);
        tokens.push({
            line: lineNum,
            char: nameStart,
            length: componentDefMatch[1].length,
            type: TOKEN_TYPES.class,
            modifiers: modifierBits(['definition']),
        });
    }

    // Component instance: component Type instanceName {
    const componentInstMatch = line.match(/^\s*component\s+(\w+)\s+(\w+)\s*\{/);
    if (componentInstMatch) {
        const typeStart = line.indexOf(componentInstMatch[1]);
        const nameStart = line.indexOf(componentInstMatch[2], typeStart + componentInstMatch[1].length);

        // Type reference
        tokens.push({
            line: lineNum,
            char: typeStart,
            length: componentInstMatch[1].length,
            type: TOKEN_TYPES.class,
            modifiers: 0,
        });

        // Instance name
        tokens.push({
            line: lineNum,
            char: nameStart,
            length: componentInstMatch[2].length,
            type: TOKEN_TYPES.variable,
            modifiers: modifierBits(['declaration']),
        });
    }

    // Input declaration: input type name
    const inputMatch = line.match(/^\s*input\s+(\w+)\s+(\w+)/);
    if (inputMatch) {
        const typeStart = line.indexOf(inputMatch[1], line.indexOf('input') + 5);
        const nameStart = line.indexOf(inputMatch[2], typeStart + inputMatch[1].length);

        if (isBuiltinType(inputMatch[1])) {
            tokens.push({
                line: lineNum,
                char: typeStart,
                length: inputMatch[1].length,
                type: TOKEN_TYPES.type,
                modifiers: 0,
            });
        }

        tokens.push({
            line: lineNum,
            char: nameStart,
            length: inputMatch[2].length,
            type: TOKEN_TYPES.parameter,
            modifiers: modifierBits(['declaration']),
        });
    }

    // Output declaration: output type name
    const outputMatch = line.match(/^\s*output\s+(\w+)\s+(\w+)/);
    if (outputMatch) {
        const typeStart = line.indexOf(outputMatch[1], line.indexOf('output') + 6);
        const nameStart = line.indexOf(outputMatch[2], typeStart + outputMatch[1].length);

        if (isBuiltinType(outputMatch[1])) {
            tokens.push({
                line: lineNum,
                char: typeStart,
                length: outputMatch[1].length,
                type: TOKEN_TYPES.type,
                modifiers: 0,
            });
        }

        tokens.push({
            line: lineNum,
            char: nameStart,
            length: outputMatch[2].length,
            type: TOKEN_TYPES.property,
            modifiers: modifierBits(['declaration']),
        });
    }

    // Resource: resource Type name {
    const resourceMatch = line.match(/^\s*resource\s+([\w.]+)\s+(\w+)/);
    if (resourceMatch) {
        const typeStart = line.indexOf(resourceMatch[1], line.indexOf('resource') + 8);
        const nameStart = line.indexOf(resourceMatch[2], typeStart + resourceMatch[1].length);

        // Type reference
        tokens.push({
            line: lineNum,
            char: typeStart,
            length: resourceMatch[1].length,
            type: TOKEN_TYPES.class,
            modifiers: 0,
        });

        // Instance name
        tokens.push({
            line: lineNum,
            char: nameStart,
            length: resourceMatch[2].length,
            type: TOKEN_TYPES.variable,
            modifiers: modifierBits(['declaration']),
        });
    }

    // Function definition: fun name(params) returnType {
    const funcMatch = line.match(/^\s*fun\s+(\w+)\s*\(([^)]*)\)(?:\s+(\w+))?/);
    if (funcMatch) {
        const nameStart = line.indexOf(funcMatch[1], line.indexOf('fun') + 3);

        // Function name
        tokens.push({
            line: lineNum,
            char: nameStart,
            length: funcMatch[1].length,
            type: TOKEN_TYPES.function,
            modifiers: modifierBits(['definition']),
        });

        // Parameters
        if (funcMatch[2]) {
            const paramsStr = funcMatch[2];
            const paramsStart = line.indexOf('(') + 1;
            extractFunctionParams(paramsStr, lineNum, paramsStart, tokens);
        }

        // Return type
        if (funcMatch[3]) {
            const returnTypeStart = line.indexOf(funcMatch[3], line.indexOf(')') + 1);
            tokens.push({
                line: lineNum,
                char: returnTypeStart,
                length: funcMatch[3].length,
                type: TOKEN_TYPES.type,
                modifiers: 0,
            });
        }
    }

    // Type alias: type Name =
    const typeAliasMatch = line.match(/^\s*type\s+(\w+)\s*=/);
    if (typeAliasMatch) {
        const nameStart = line.indexOf(typeAliasMatch[1]);
        tokens.push({
            line: lineNum,
            char: nameStart,
            length: typeAliasMatch[1].length,
            type: TOKEN_TYPES.type,
            modifiers: modifierBits(['definition']),
        });
    }

    // Variable declaration: var [type] name =
    const varMatch = line.match(/^\s*var\s+(\w+)(?:\s+(\w+))?\s*=/);
    if (varMatch) {
        if (varMatch[2]) {
            // Typed variable: var type name =
            const typeStart = line.indexOf(varMatch[1], line.indexOf('var') + 3);
            const nameStart = line.indexOf(varMatch[2], typeStart + varMatch[1].length);

            if (isBuiltinType(varMatch[1])) {
                tokens.push({
                    line: lineNum,
                    char: typeStart,
                    length: varMatch[1].length,
                    type: TOKEN_TYPES.type,
                    modifiers: 0,
                });
            }

            tokens.push({
                line: lineNum,
                char: nameStart,
                length: varMatch[2].length,
                type: TOKEN_TYPES.variable,
                modifiers: modifierBits(['declaration']),
            });
        } else {
            // Inferred type: var name =
            const nameStart = line.indexOf(varMatch[1], line.indexOf('var') + 3);
            tokens.push({
                line: lineNum,
                char: nameStart,
                length: varMatch[1].length,
                type: TOKEN_TYPES.variable,
                modifiers: modifierBits(['declaration']),
            });
        }
    }

    // Keywords
    const keywords = ['if', 'else', 'for', 'while', 'in', 'return'];
    for (const kw of keywords) {
        const kwRegex = new RegExp(`\\b${kw}\\b`, 'g');
        while ((match = kwRegex.exec(line)) !== null) {
            if (!isInsideString(line, match.index)) {
                tokens.push({
                    line: lineNum,
                    char: match.index,
                    length: kw.length,
                    type: TOKEN_TYPES.keyword,
                    modifiers: 0,
                });
            }
        }
    }

    // Variable/function references (identifiers not part of declarations)
    // This is a simplified approach - in a full implementation we'd track scopes
    const identifierRegex = /\b([a-z_]\w*)\b/gi;
    while ((match = identifierRegex.exec(line)) !== null) {
        const name = match[1];
        const pos = match.index;

        // Skip if already processed or inside string
        if (isInsideString(line, pos)) continue;
        if (tokens.some(t => t.line === lineNum && t.char === pos)) continue;
        if (keywords.includes(name)) continue;
        if (['var', 'fun', 'schema', 'component', 'resource', 'input', 'output', 'type', 'import', 'from', 'true', 'false', 'null'].includes(name)) continue;

        // Check if it's a function call
        const afterName = line.substring(pos + name.length);
        const isCall = afterName.match(/^\s*\(/) !== null;

        tokens.push({
            line: lineNum,
            char: pos,
            length: name.length,
            type: isCall ? TOKEN_TYPES.function : TOKEN_TYPES.variable,
            modifiers: 0,
        });
    }
}

/**
 * Extract function parameters
 */
function extractFunctionParams(
    paramsStr: string,
    lineNum: number,
    offset: number,
    tokens: TokenInfo[]
): void {
    const params = paramsStr.split(',');
    let currentOffset = offset;

    for (const param of params) {
        const trimmed = param.trim();
        if (!trimmed) {
            currentOffset += param.length + 1;
            continue;
        }

        const paramMatch = trimmed.match(/(\w+)\s+(\w+)/);
        if (paramMatch) {
            const typePos = currentOffset + param.indexOf(paramMatch[1]);
            const namePos = currentOffset + param.indexOf(paramMatch[2], param.indexOf(paramMatch[1]) + paramMatch[1].length);

            if (isBuiltinType(paramMatch[1])) {
                tokens.push({
                    line: lineNum,
                    char: typePos,
                    length: paramMatch[1].length,
                    type: TOKEN_TYPES.type,
                    modifiers: 0,
                });
            }

            tokens.push({
                line: lineNum,
                char: namePos,
                length: paramMatch[2].length,
                type: TOKEN_TYPES.parameter,
                modifiers: modifierBits(['declaration']),
            });
        }

        currentOffset += param.length + 1; // +1 for comma
    }
}

/**
 * Check if a position is inside a string literal
 */
function isInsideString(line: string, pos: number): boolean {
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < pos; i++) {
        const ch = line[i];
        const prevCh = i > 0 ? line[i - 1] : '';

        if (!inString && (ch === '"' || ch === "'")) {
            inString = true;
            stringChar = ch;
        } else if (inString && ch === stringChar && prevCh !== '\\') {
            inString = false;
        }
    }

    return inString;
}

/**
 * Check if a type name is a builtin type
 */
function isBuiltinType(name: string): boolean {
    return ['string', 'number', 'boolean', 'any', 'object', 'void'].includes(name);
}

/**
 * Convert modifier names to bitmask
 */
function modifierBits(modifiers: string[]): number {
    let bits = 0;
    for (const mod of modifiers) {
        const idx = semanticTokensLegend.tokenModifiers.indexOf(mod);
        if (idx >= 0) {
            bits |= (1 << idx);
        }
    }
    return bits;
}

/**
 * Encode tokens into delta format
 */
function encodeTokens(tokens: TokenInfo[]): number[] {
    const data: number[] = [];
    let prevLine = 0;
    let prevChar = 0;

    for (const token of tokens) {
        const deltaLine = token.line - prevLine;
        const deltaChar = deltaLine === 0 ? token.char - prevChar : token.char;

        data.push(deltaLine, deltaChar, token.length, token.type, token.modifiers);

        prevLine = token.line;
        prevChar = token.char;
    }

    return data;
}
