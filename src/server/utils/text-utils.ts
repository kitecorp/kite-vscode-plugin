/**
 * Text and file utility functions for the Kite language server.
 */

import * as fs from 'fs';
import { Position, CompletionItemKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DeclarationType, BlockContext } from '../types';

/**
 * Convert text offset to LSP position
 */
export function offsetToPosition(text: string, offset: number): Position {
    const lines = text.substring(0, offset).split('\n');
    return Position.create(lines.length - 1, lines[lines.length - 1].length);
}

/**
 * Get the word at a given position in a document
 */
export function getWordAtPosition(document: TextDocument, position: Position): string | null {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Handle case where cursor might be at the very end of a word
    let adjustedOffset = offset;
    if (adjustedOffset > 0 && !/\w/.test(text[adjustedOffset] || '') && /\w/.test(text[adjustedOffset - 1])) {
        adjustedOffset--;
    }

    // Find word boundaries
    let start = adjustedOffset;
    let end = adjustedOffset;

    while (start > 0 && /\w/.test(text[start - 1])) {
        start--;
    }
    while (end < text.length && /\w/.test(text[end])) {
        end++;
    }

    if (start === end) return null;
    return text.substring(start, end);
}

/**
 * Get completion item kind for declaration type
 */
export function getCompletionKind(type: DeclarationType): CompletionItemKind {
    switch (type) {
        case 'variable': return CompletionItemKind.Variable;
        case 'input': return CompletionItemKind.Field;
        case 'output': return CompletionItemKind.Field;
        case 'resource': return CompletionItemKind.Class;
        case 'component': return CompletionItemKind.Module;
        case 'schema': return CompletionItemKind.Interface;
        case 'function': return CompletionItemKind.Function;
        case 'type': return CompletionItemKind.TypeParameter;
        case 'for': return CompletionItemKind.Variable;
        default: return CompletionItemKind.Text;
    }
}

/**
 * Find the matching closing brace for an opening brace.
 * Handles nested braces and string literals.
 * @param text - The text to search in
 * @param startPos - Position of the opening brace
 * @returns Position of the matching closing brace, or -1 if not found
 */
export function findMatchingBrace(text: string, startPos: number): number {
    if (text[startPos] !== '{') return -1;

    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = startPos; i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        if ((char === '"' || char === "'") && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
            continue;
        }

        if (inString) continue;

        if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }

    return -1;
}

/**
 * Find the matching closing bracket for an opening bracket.
 * Handles nested brackets and string literals.
 * @param text - The text to search in
 * @param startPos - Position of the opening bracket
 * @returns Position of the matching closing bracket, or -1 if not found
 */
export function findMatchingBracket(text: string, startPos: number): number {
    if (text[startPos] !== '[') return -1;

    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = startPos; i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        // Handle string literals
        if ((char === '"' || char === "'") && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
            continue;
        }

        if (inString) continue;

        if (char === '[') {
            depth++;
        } else if (char === ']') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }

    return -1;
}

/**
 * Read file content safely.
 * @param filePath - Path to the file to read
 * @returns File content as string or null if read fails
 */
export function readFileContent(filePath: string): string | null {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return null;
    }
}

/**
 * Find the enclosing resource/component block for a given offset.
 * @param text - The document text
 * @param offset - The cursor offset to find enclosing block for
 * @returns The enclosing block context or null if not inside a block
 */
export function findEnclosingBlock(text: string, offset: number): BlockContext | null {
    // Find all resource/component declarations
    // Pattern: resource SchemaName instanceName { or component TypeName instanceName {
    const blockRegex = /\b(resource|component)\s+([\w.]+)\s+(\w+)\s*\{/g;
    let match;
    let enclosing: BlockContext | null = null;

    while ((match = blockRegex.exec(text)) !== null) {
        const blockStart = match.index;
        const openBracePos = blockStart + match[0].length - 1;
        const closeBracePos = findMatchingBrace(text, openBracePos);

        if (closeBracePos === -1) continue;

        // Check if offset is inside this block (between the braces)
        if (offset > openBracePos && offset < closeBracePos) {
            // Found a block containing our position
            // Keep searching for nested blocks (most specific)
            enclosing = {
                name: match[3],
                type: match[1] as 'resource' | 'component',
                typeName: match[2],
                start: blockStart,
                end: closeBracePos
            };
        }
    }

    return enclosing;
}
