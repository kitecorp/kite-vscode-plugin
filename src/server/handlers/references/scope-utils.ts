/**
 * Utility functions for scope detection and bracket/brace matching.
 */

import { Location, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { escapeRegex, isInComment } from '../../utils/rename-utils';
import { offsetToPosition } from '../../utils/text-utils';

/**
 * Find the matching closing bracket for an opening bracket.
 * Handles nested brackets and string literals.
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
 * Find the matching closing brace for an opening brace.
 * Handles nested braces and string literals.
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
 * Check if an offset is inside a string literal.
 */
export function isInStringLiteral(text: string, offset: number): boolean {
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < offset; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        if ((char === '"' || char === "'") && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
        }
    }

    return inString;
}

/**
 * Check if an offset is inside a ${...} interpolation within a string.
 */
export function isInInterpolation(text: string, offset: number): boolean {
    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < offset; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';
        const nextChar = i < text.length - 1 ? text[i + 1] : '';

        // Track string state
        if ((char === '"' || char === "'") && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                // Check if we're in an interpolation before ending the string
                if (depth > 0) continue;
                inString = false;
            }
            continue;
        }

        // Only check for interpolation inside double-quoted strings
        if (inString && stringChar === '"') {
            if (char === '$' && nextChar === '{') {
                depth++;
            } else if (char === '}' && depth > 0) {
                depth--;
            }
        }
    }

    return depth > 0;
}

/**
 * Find all references to a word within a specific scope.
 * Handles string interpolation correctly.
 */
export function findReferencesInScope(
    text: string,
    word: string,
    scopeStart: number,
    scopeEnd: number,
    docUri: string,
    doc: TextDocument | undefined
): Location[] {
    const locations: Location[] = [];
    const scopeText = text.substring(scopeStart, scopeEnd);
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g');

    let match;
    while ((match = regex.exec(scopeText)) !== null) {
        const offset = scopeStart + match.index;

        // Skip if in comment
        if (isInComment(text, offset)) continue;

        // Check if this is in a regular string literal (not in interpolation)
        if (isInStringLiteral(text, offset) && !isInInterpolation(text, offset)) {
            continue;
        }

        const startPos = doc
            ? doc.positionAt(offset)
            : offsetToPosition(text, offset);
        const endPos = doc
            ? doc.positionAt(offset + word.length)
            : offsetToPosition(text, offset + word.length);

        locations.push(Location.create(docUri, Range.create(startPos, endPos)));
    }

    return locations;
}
