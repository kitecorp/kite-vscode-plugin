/**
 * Utility functions for the definition handler.
 */

import { Location, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { PropertyAccessContext, PropertyResult } from '../../types';
import { escapeRegex } from '../../utils/rename-utils';
import { findMatchingBrace, offsetToPosition } from '../../utils/text-utils';

// Re-export for backward compatibility
export { offsetToPosition } from '../../utils/text-utils';

/**
 * Get property access context (e.g., server.tag.New.a).
 * Returns the chain of identifiers and the current property name.
 */
export function getPropertyAccessContext(text: string, offset: number, currentWord: string): PropertyAccessContext | null {
    // Find start of current word
    let wordStart = offset;
    while (wordStart > 0 && /\w/.test(text[wordStart - 1])) {
        wordStart--;
    }

    // Build the full property chain by walking backwards
    const chain: string[] = [currentWord];
    let pos = wordStart - 1;

    while (pos >= 0) {
        // Skip whitespace
        while (pos >= 0 && /\s/.test(text[pos])) {
            pos--;
        }

        // Check for dot
        if (pos >= 0 && text[pos] === '.') {
            pos--; // skip the dot

            // Skip whitespace before dot
            while (pos >= 0 && /\s/.test(text[pos])) {
                pos--;
            }

            // Find the identifier before the dot
            const identEnd = pos;
            while (pos > 0 && /\w/.test(text[pos - 1])) {
                pos--;
            }
            const identStart = pos;

            if (identStart <= identEnd) {
                const ident = text.substring(identStart, identEnd + 1);
                chain.unshift(ident);
                pos = identStart - 1;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    // Need at least object.property (2 elements)
    if (chain.length >= 2) {
        return {
            chain,
            propertyName: currentWord
        };
    }

    return null;
}

/**
 * Find the enclosing square brackets for a list comprehension.
 */
export function findEnclosingBrackets(text: string, offset: number): { start: number; end: number } | null {
    // Walk backwards to find opening bracket
    let depth = 0;
    let start = -1;

    for (let i = offset; i >= 0; i--) {
        const char = text[i];
        if (char === ']') {
            depth++;
        } else if (char === '[') {
            if (depth === 0) {
                start = i;
                break;
            }
            depth--;
        }
    }

    if (start === -1) return null;

    // Walk forward to find closing bracket
    depth = 0;
    let end = -1;

    for (let i = start; i < text.length; i++) {
        const char = text[i];
        if (char === '[') {
            depth++;
        } else if (char === ']') {
            depth--;
            if (depth === 0) {
                end = i;
                break;
            }
        }
    }

    if (end === -1) return null;

    return { start, end };
}

/**
 * Find a property within a range of text and return its location and value range.
 */
export function findPropertyInRange(
    document: TextDocument,
    text: string,
    rangeStart: number,
    rangeEnd: number,
    propertyName: string
): PropertyResult | null {
    const searchText = text.substring(rangeStart, rangeEnd);

    const propRegex = new RegExp(`(?:^|\\n)\\s*(${escapeRegex(propertyName)})\\s*[=:]`, 'g');
    let propMatch;

    while ((propMatch = propRegex.exec(searchText)) !== null) {
        const propNameStartInSearch = propMatch.index + propMatch[0].indexOf(propertyName);
        const propOffset = rangeStart + propNameStartInSearch;

        const startPos = document.positionAt(propOffset);
        const endPos = document.positionAt(propOffset + propertyName.length);
        const location = Location.create(document.uri, Range.create(startPos, endPos));

        // Find the value after = or :
        const afterPropName = rangeStart + propMatch.index + propMatch[0].length;

        // Skip whitespace
        let valueStart = afterPropName;
        while (valueStart < rangeEnd && /\s/.test(text[valueStart])) {
            valueStart++;
        }

        // Check if value is an object literal
        if (text[valueStart] === '{') {
            const valueEnd = findMatchingBrace(text, valueStart);
            return {
                location,
                valueStart: valueStart + 1,
                valueEnd: valueEnd - 1
            };
        }

        return { location };
    }

    // Also check for input/output declarations
    const memberRegex = new RegExp(`(?:^|\\n)\\s*(?:input|output)\\s+\\w+\\s+(${escapeRegex(propertyName)})\\b`, 'g');
    const memberMatch = memberRegex.exec(searchText);

    if (memberMatch) {
        const memberOffset = rangeStart + memberMatch.index + memberMatch[0].lastIndexOf(propertyName);
        const startPos = document.positionAt(memberOffset);
        const endPos = document.positionAt(memberOffset + propertyName.length);

        return { location: Location.create(document.uri, Range.create(startPos, endPos)) };
    }

    return null;
}
