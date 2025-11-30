/**
 * Block utilities for the Kite language server.
 * Functions for finding and parsing code blocks (resource, component).
 */

import { BlockContext } from '../types';

/**
 * Find the position of the closing brace matching an opening brace.
 * @param text - The text to search in
 * @param openBracePos - Position of the opening brace
 * @returns Position after the closing brace
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
        const blockEnd = findMatchingBrace(text, openBracePos);

        // Check if offset is inside this block
        if (offset > openBracePos && offset < blockEnd) {
            // Found a block containing our position
            // Keep searching for nested blocks (most specific)
            enclosing = {
                name: match[3],
                type: match[1] as 'resource' | 'component',
                typeName: match[2],
                start: blockStart,
                end: blockEnd
            };
        }
    }

    return enclosing;
}
