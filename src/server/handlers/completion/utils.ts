/**
 * Utility functions for completion handling.
 */

import { escapeRegex } from '../../utils/rename-utils';
import { findMatchingBrace } from '../../utils/text-utils';

/**
 * Check if cursor is after '=' sign (assignment, not comparison)
 */
export function isAfterEquals(text: string, offset: number): boolean {
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineBeforeCursor = text.substring(lineStart, offset);

    const equalsIndex = lineBeforeCursor.indexOf('=');
    if (equalsIndex === -1) return false;

    // Check it's not ==, !=, <=, or >=
    const charBefore = lineBeforeCursor[equalsIndex - 1];
    const charAfter = lineBeforeCursor[equalsIndex + 1];
    if (charBefore === '=' || charBefore === '!' || charBefore === '<' || charBefore === '>') {
        return false;
    }
    if (charAfter === '=') {
        return false;
    }

    const afterEquals = lineBeforeCursor.substring(equalsIndex + 1).trim();
    return afterEquals === '' || /^[\w"'\[\{]/.test(afterEquals) === false;
}

/**
 * Check if cursor is inside a nested structure
 */
export function isInsideNestedStructure(text: string, blockStart: number, cursorOffset: number): boolean {
    const bodyText = text.substring(blockStart, cursorOffset);
    let braceDepth = 0;
    let bracketDepth = 0;

    for (let i = 0; i < bodyText.length; i++) {
        const char = bodyText[i];
        if (char === '{') braceDepth++;
        else if (char === '}') braceDepth--;
        else if (char === '[') bracketDepth++;
        else if (char === ']') bracketDepth--;
    }

    return braceDepth > 1 || bracketDepth > 0;
}

/**
 * Extract properties from body of a resource/component instantiation
 */
export function extractPropertiesFromBody(text: string, declarationName: string): string[] {
    const properties: string[] = [];

    const regex = new RegExp(`\\b(?:resource|component)\\s+\\w+\\s+${escapeRegex(declarationName)}\\s*\\{`, 'g');
    const match = regex.exec(text);
    if (!match) return properties;

    const braceStart = match.index + match[0].length - 1;
    const braceEnd = findMatchingBrace(text, braceStart);
    if (braceEnd === -1) return properties;

    const bodyText = text.substring(braceStart + 1, braceEnd);
    const propRegex = /^\s*(\w+)\s*=/gm;
    let propMatch;

    while ((propMatch = propRegex.exec(bodyText)) !== null) {
        properties.push(propMatch[1]);
    }

    return properties;
}
