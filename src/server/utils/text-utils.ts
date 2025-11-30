/**
 * Text utility functions for the Kite language server.
 */

import { Position, CompletionItemKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DeclarationType } from '../types';

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
 * Find the matching closing brace for an opening brace
 */
export function findMatchingBrace(text: string, openBracePos: number): number {
    let braceDepth = 1;
    let pos = openBracePos + 1;

    while (pos < text.length && braceDepth > 0) {
        if (text[pos] === '{') braceDepth++;
        else if (text[pos] === '}') braceDepth--;
        pos++;
    }

    return pos;
}
