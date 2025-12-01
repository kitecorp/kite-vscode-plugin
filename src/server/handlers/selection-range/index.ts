/**
 * Selection Range handler for the Kite language server.
 * Provides smart expand selection (Cmd+Shift+→ / Ctrl+Shift+→).
 *
 * Expands selection hierarchically:
 * word → expression → statement → block → declaration → file
 */

import {
    SelectionRange,
    Position,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { findBraceEnd } from '../../utils/text-utils';

/**
 * Handle selection range request for multiple positions
 */
export function handleSelectionRange(
    document: TextDocument,
    positions: Position[]
): SelectionRange[] {
    const text = document.getText();
    return positions.map(position => createSelectionRangeAt(document, text, position));
}

/**
 * Create a selection range hierarchy for a single position
 */
function createSelectionRangeAt(
    document: TextDocument,
    text: string,
    position: Position
): SelectionRange {
    const offset = document.offsetAt(position);
    const ranges: Range[] = [];

    // 1. Find word/token at position
    const wordRange = findWordRange(text, offset, document);
    if (wordRange) {
        ranges.push(wordRange);
    }

    // 2. Find string if inside one
    const stringRange = findContainingString(text, offset, document);
    if (stringRange && !rangesEqual(stringRange, wordRange)) {
        // If we found a word inside string, add string range
        // Check if word is part of interpolation
        const interpolationRange = findContainingInterpolation(text, offset, document);
        if (interpolationRange && !rangesEqual(interpolationRange, wordRange)) {
            ranges.push(interpolationRange);
        }
        ranges.push(stringRange);
    }

    // 3. Find containing expression (property access, function call, etc.)
    const exprRange = findContainingExpression(text, offset, document);
    if (exprRange && !containsRange(ranges, exprRange)) {
        ranges.push(exprRange);
    }

    // 4. Find containing statement
    const stmtRange = findContainingStatement(text, offset, document);
    if (stmtRange && !containsRange(ranges, stmtRange)) {
        ranges.push(stmtRange);
    }

    // 5. Find all containing blocks (innermost to outermost)
    // First check for parentheses (function parameters, conditions)
    const parenRanges = findContainingParens(text, offset, document);
    for (const parenRange of parenRanges) {
        if (!containsRange(ranges, parenRange)) {
            ranges.push(parenRange);
        }
    }

    // Then check for braces (bodies, blocks)
    const blockRanges = findContainingBlocks(text, offset, document);
    for (const blockRange of blockRanges) {
        if (!containsRange(ranges, blockRange)) {
            ranges.push(blockRange);
        }
    }

    // 6. Find containing top-level declaration
    const declRange = findContainingDeclaration(text, offset, document);
    if (declRange && !containsRange(ranges, declRange)) {
        ranges.push(declRange);
    }

    // 7. Add whole document range
    const docRange = Range.create(
        document.positionAt(0),
        document.positionAt(text.length)
    );
    if (!containsRange(ranges, docRange)) {
        ranges.push(docRange);
    }

    // Sort ranges by size (smallest first) and remove duplicates
    const sortedRanges = deduplicateAndSort(ranges, document);

    // Build linked list from smallest to largest
    return buildSelectionRangeChain(sortedRanges);
}

/**
 * Find the word/identifier at position
 */
function findWordRange(text: string, offset: number, document: TextDocument): Range | null {
    if (offset >= text.length) {
        offset = Math.max(0, text.length - 1);
    }

    // Find word boundaries
    let start = offset;
    let end = offset;

    // Expand left
    while (start > 0 && isWordChar(text[start - 1])) {
        start--;
    }

    // Expand right
    while (end < text.length && isWordChar(text[end])) {
        end++;
    }

    if (start === end) {
        return null;
    }

    return Range.create(document.positionAt(start), document.positionAt(end));
}

/**
 * Check if character is part of a word
 */
function isWordChar(ch: string): boolean {
    return /[\w]/.test(ch);
}

/**
 * Find containing string literal
 */
function findContainingString(text: string, offset: number, document: TextDocument): Range | null {
    // Search backwards for string start
    let stringStart = -1;
    let stringChar = '';
    let i = offset;

    // First check if we're inside a string by scanning back
    while (i >= 0) {
        const ch = text[i];
        if ((ch === '"' || ch === "'") && (i === 0 || text[i - 1] !== '\\')) {
            // Found a quote, now determine if it's opening or closing
            // Count quotes before this position
            let quoteCount = 0;
            for (let j = 0; j < i; j++) {
                if (text[j] === ch && (j === 0 || text[j - 1] !== '\\')) {
                    quoteCount++;
                }
            }
            // If odd number of quotes before, this is a closing quote
            // If even number, this is an opening quote
            if (quoteCount % 2 === 0) {
                stringStart = i;
                stringChar = ch;
                break;
            }
        }
        i--;
    }

    if (stringStart === -1) {
        return null;
    }

    // Find string end
    let stringEnd = stringStart + 1;
    while (stringEnd < text.length) {
        if (text[stringEnd] === stringChar && text[stringEnd - 1] !== '\\') {
            stringEnd++; // Include closing quote
            break;
        }
        stringEnd++;
    }

    if (stringEnd <= offset) {
        return null; // Offset is after the string
    }

    return Range.create(document.positionAt(stringStart), document.positionAt(stringEnd));
}

/**
 * Find containing interpolation ${...}
 */
function findContainingInterpolation(text: string, offset: number, document: TextDocument): Range | null {
    // Search backwards for ${
    let i = offset;
    let depth = 0;

    while (i >= 1) {
        if (text[i] === '}' && depth === 0) {
            // We passed a closing brace without finding opening
            return null;
        }
        if (text[i] === '{' && text[i - 1] === '$') {
            // Found ${
            const start = i - 1;
            // Find matching }
            let end = offset;
            depth = 1;
            while (end < text.length && depth > 0) {
                if (text[end] === '{') depth++;
                if (text[end] === '}') depth--;
                end++;
            }
            if (depth === 0) {
                return Range.create(document.positionAt(start), document.positionAt(end));
            }
            return null;
        }
        i--;
    }

    return null;
}

/**
 * Find containing expression (handles property access, function calls)
 */
function findContainingExpression(text: string, offset: number, document: TextDocument): Range | null {
    // Find the start and end of the expression
    let start = offset;
    let end = offset;

    // Expand to include the full identifier
    while (start > 0 && isWordChar(text[start - 1])) {
        start--;
    }
    while (end < text.length && isWordChar(text[end])) {
        end++;
    }

    // Expand left to include property access chain (a.b.c)
    while (start > 0) {
        if (text[start - 1] === '.') {
            start--;
            while (start > 0 && isWordChar(text[start - 1])) {
                start--;
            }
        } else {
            break;
        }
    }

    // Expand right to include property access chain
    while (end < text.length) {
        if (text[end] === '.') {
            end++;
            while (end < text.length && isWordChar(text[end])) {
                end++;
            }
        } else {
            break;
        }
    }

    // Check for function call - include parentheses
    if (end < text.length && text[end] === '(') {
        const parenEnd = findMatchingParen(text, end);
        if (parenEnd !== -1) {
            end = parenEnd + 1;
        }
    }

    // Check for array index
    if (end < text.length && text[end] === '[') {
        const bracketEnd = findMatchingBracket(text, end);
        if (bracketEnd !== -1) {
            end = bracketEnd + 1;
        }
    }

    if (start === offset && end === offset) {
        return null;
    }

    return Range.create(document.positionAt(start), document.positionAt(end));
}

/**
 * Find matching closing parenthesis
 */
function findMatchingParen(text: string, openPos: number): number {
    let depth = 1;
    let i = openPos + 1;
    while (i < text.length && depth > 0) {
        if (text[i] === '(') depth++;
        if (text[i] === ')') depth--;
        i++;
    }
    return depth === 0 ? i - 1 : -1;
}

/**
 * Find matching closing bracket
 */
function findMatchingBracket(text: string, openPos: number): number {
    let depth = 1;
    let i = openPos + 1;
    while (i < text.length && depth > 0) {
        if (text[i] === '[') depth++;
        if (text[i] === ']') depth--;
        i++;
    }
    return depth === 0 ? i - 1 : -1;
}

/**
 * Find containing statement (line-based for simple cases)
 */
function findContainingStatement(text: string, offset: number, document: TextDocument): Range | null {
    // Find statement boundaries
    // Statements end with newline (outside of braces) or at braces

    // Find start of statement
    let start = offset;
    let braceDepth = 0;
    let parenDepth = 0;
    let bracketDepth = 0;

    while (start > 0) {
        const ch = text[start - 1];
        if (ch === '}') braceDepth++;
        if (ch === '{') braceDepth--;
        if (ch === ')') parenDepth++;
        if (ch === '(') parenDepth--;
        if (ch === ']') bracketDepth++;
        if (ch === '[') bracketDepth--;

        // Statement starts after newline (if we're at depth 0)
        if (ch === '\n' && braceDepth === 0 && parenDepth === 0 && bracketDepth === 0) {
            break;
        }
        // Statement starts after opening brace (for body content)
        if (ch === '{' && braceDepth < 0) {
            break;
        }
        start--;
    }

    // Skip leading whitespace
    while (start < text.length && /\s/.test(text[start])) {
        start++;
    }

    // Find end of statement
    let end = offset;
    braceDepth = 0;
    parenDepth = 0;
    bracketDepth = 0;

    while (end < text.length) {
        const ch = text[end];
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
        if (ch === '(') parenDepth++;
        if (ch === ')') parenDepth--;
        if (ch === '[') bracketDepth++;
        if (ch === ']') bracketDepth--;

        // Statement ends at newline (if at depth 0)
        if (ch === '\n' && braceDepth === 0 && parenDepth === 0 && bracketDepth === 0) {
            break;
        }
        // Statement ends at closing brace
        if (ch === '}' && braceDepth < 0) {
            break;
        }
        end++;
    }

    // Trim trailing whitespace
    while (end > start && /\s/.test(text[end - 1])) {
        end--;
    }

    if (start >= end) {
        return null;
    }

    return Range.create(document.positionAt(start), document.positionAt(end));
}

/**
 * Find all containing parentheses (for function params, conditions)
 */
function findContainingParens(text: string, offset: number, document: TextDocument): Range[] {
    const parens: Range[] = [];
    let searchStart = 0;

    while (true) {
        // Find opening paren before offset
        let parenStart = -1;
        let depth = 0;

        for (let i = offset - 1; i >= searchStart; i--) {
            if (text[i] === ')') depth++;
            if (text[i] === '(') {
                if (depth === 0) {
                    parenStart = i;
                    break;
                }
                depth--;
            }
        }

        if (parenStart === -1) break;

        // Find matching closing paren
        const parenEnd = findMatchingParen(text, parenStart);
        if (parenEnd === -1 || parenEnd < offset) {
            searchStart = parenStart + 1;
            continue;
        }

        // Add inner content range (between parens)
        const innerStart = parenStart + 1;
        const innerEnd = parenEnd;
        if (innerStart < innerEnd) {
            parens.push(Range.create(document.positionAt(innerStart), document.positionAt(innerEnd)));
        }

        // Add full paren range (including parens)
        parens.push(Range.create(document.positionAt(parenStart), document.positionAt(parenEnd + 1)));

        // Continue searching for outer parens
        searchStart = 0;
        offset = parenStart;
    }

    return parens;
}

/**
 * Find all containing blocks (brace-delimited)
 */
function findContainingBlocks(text: string, offset: number, document: TextDocument): Range[] {
    const blocks: Range[] = [];
    let searchStart = 0;

    while (true) {
        // Find opening brace before offset
        let braceStart = -1;
        let depth = 0;

        for (let i = offset - 1; i >= searchStart; i--) {
            if (text[i] === '}') depth++;
            if (text[i] === '{') {
                if (depth === 0) {
                    braceStart = i;
                    break;
                }
                depth--;
            }
        }

        if (braceStart === -1) break;

        // Find matching closing brace
        const braceEnd = findBraceEnd(text, braceStart);
        if (braceEnd === -1 || braceEnd < offset) {
            searchStart = braceStart + 1;
            continue;
        }

        // Add inner content range (between braces)
        const innerStart = braceStart + 1;
        const innerEnd = braceEnd;
        if (innerStart < innerEnd) {
            blocks.push(Range.create(document.positionAt(innerStart), document.positionAt(innerEnd)));
        }

        // Add full block range (including braces)
        blocks.push(Range.create(document.positionAt(braceStart), document.positionAt(braceEnd + 1)));

        // Continue searching for outer blocks
        searchStart = 0;
        offset = braceStart;
    }

    return blocks;
}

/**
 * Find containing top-level declaration
 */
function findContainingDeclaration(text: string, offset: number, document: TextDocument): Range | null {
    // Find declarations: schema, component, resource, fun, var, type, import
    const declPatterns = [
        /^(\s*(?:@[\w]+(?:\([^)]*\))?[\s\n]*)*)(schema\s+\w+\s*\{)/gm,
        /^(\s*(?:@[\w]+(?:\([^)]*\))?[\s\n]*)*)(component\s+\w+(?:\s+\w+)?\s*\{)/gm,
        /^(\s*(?:@[\w]+(?:\([^)]*\))?[\s\n]*)*)(resource\s+[\w.]+\s+\w+\s*\{)/gm,
        /^(\s*)(fun\s+\w+\s*\([^)]*\)[^{]*\{)/gm,
        /^(\s*)(type\s+\w+\s*=)/gm,
        /^(\s*)(var\s+(?:\w+\s+)?\w+\s*=)/gm,
        /^(\s*)(import\s+)/gm,
    ];

    let bestMatch: { start: number; end: number } | null = null;

    for (const pattern of declPatterns) {
        pattern.lastIndex = 0;
        let match;

        while ((match = pattern.exec(text)) !== null) {
            const declStart = match.index + match[1].length;

            // For block declarations, find the end
            if (match[2].includes('{')) {
                const bracePos = match.index + match[0].lastIndexOf('{');
                const braceEnd = findBraceEnd(text, bracePos);
                if (braceEnd !== -1) {
                    const declEnd = braceEnd + 1;
                    if (offset >= match.index && offset < declEnd) {
                        // Include decorators in the range
                        if (!bestMatch || (declEnd - match.index) < (bestMatch.end - bestMatch.start)) {
                            bestMatch = { start: match.index, end: declEnd };
                        }
                    }
                }
            } else {
                // For non-block declarations (var, type, import), find end of line
                let declEnd = match.index + match[0].length;
                while (declEnd < text.length && text[declEnd] !== '\n') {
                    declEnd++;
                }
                if (offset >= match.index && offset < declEnd) {
                    if (!bestMatch || (declEnd - match.index) < (bestMatch.end - bestMatch.start)) {
                        bestMatch = { start: match.index, end: declEnd };
                    }
                }
            }
        }
    }

    if (bestMatch) {
        // Trim leading whitespace from the range
        let start = bestMatch.start;
        while (start < bestMatch.end && /\s/.test(text[start])) {
            start++;
        }
        return Range.create(document.positionAt(start), document.positionAt(bestMatch.end));
    }

    return null;
}

/**
 * Check if two ranges are equal
 */
function rangesEqual(a: Range | null, b: Range | null): boolean {
    if (!a || !b) return false;
    return a.start.line === b.start.line &&
           a.start.character === b.start.character &&
           a.end.line === b.end.line &&
           a.end.character === b.end.character;
}

/**
 * Check if ranges array already contains an equivalent range
 */
function containsRange(ranges: Range[], range: Range): boolean {
    return ranges.some(r => rangesEqual(r, range));
}

/**
 * Calculate range size in characters
 */
function rangeSize(range: Range, document: TextDocument): number {
    const start = document.offsetAt(range.start);
    const end = document.offsetAt(range.end);
    return end - start;
}

/**
 * Deduplicate and sort ranges by size
 */
function deduplicateAndSort(ranges: Range[], document: TextDocument): Range[] {
    // Remove duplicates
    const unique: Range[] = [];
    for (const range of ranges) {
        if (!containsRange(unique, range)) {
            unique.push(range);
        }
    }

    // Sort by size (smallest first)
    return unique.sort((a, b) => rangeSize(a, document) - rangeSize(b, document));
}

/**
 * Build a linked list of selection ranges from sorted ranges
 */
function buildSelectionRangeChain(sortedRanges: Range[]): SelectionRange {
    if (sortedRanges.length === 0) {
        // Return empty range as fallback
        return {
            range: Range.create(0, 0, 0, 0)
        };
    }

    // Build from largest to smallest, so smallest is at the front
    let current: SelectionRange | undefined;

    for (let i = sortedRanges.length - 1; i >= 0; i--) {
        current = {
            range: sortedRanges[i],
            parent: current
        };
    }

    return current!;
}
