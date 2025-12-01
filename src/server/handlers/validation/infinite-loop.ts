/**
 * Infinite loop detection for the Kite language server.
 * Reports warnings when a while loop has a constant true condition without break/return.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Check for infinite loops (while true without break/return)
 */
export function checkInfiniteLoop(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match while true or while (true) or while 1
    const whileRegex = /\bwhile\s*\(?\s*(true|1)\s*\)?\s*\{/g;

    let match;
    while ((match = whileRegex.exec(text)) !== null) {
        // Skip if in comment or string
        if (isInCommentOrString(text, match.index)) continue;

        // Find the matching closing brace
        const braceStart = match.index + match[0].length - 1;
        const braceEnd = findMatchingBrace(text, braceStart);
        if (braceEnd === -1) continue;

        // Get the loop body
        const loopBody = text.substring(braceStart + 1, braceEnd);

        // Check if there's a break or return in the loop body (not in nested loops)
        if (!hasExitStatement(loopBody)) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);

            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: Range.create(startPos, endPos),
                message: `Infinite loop: 'while ${match[1]}' without break or return`,
                source: 'kite',
            });
        }
    }

    return diagnostics;
}

/**
 * Check if code has a break or return statement (not in nested loop)
 */
function hasExitStatement(code: string): boolean {
    let i = 0;
    let depth = 0; // Track nested loops
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inBlockComment = false;

    while (i < code.length) {
        const char = code[i];
        const prevChar = i > 0 ? code[i - 1] : '';

        // Handle comments
        if (!inString && !inComment && char === '*' && prevChar === '/') {
            inBlockComment = true;
            i++;
            continue;
        }
        if (inBlockComment && char === '/' && prevChar === '*') {
            inBlockComment = false;
            i++;
            continue;
        }
        if (inBlockComment) { i++; continue; }

        if (!inString && char === '/' && code[i + 1] === '/') {
            inComment = true;
            i++;
            continue;
        }
        if (inComment && char === '\n') {
            inComment = false;
            i++;
            continue;
        }
        if (inComment) { i++; continue; }

        // Handle strings
        if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
            i++;
            continue;
        }
        if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
            i++;
            continue;
        }
        if (inString) { i++; continue; }

        // Track nested while/for loops
        if (code.substring(i).match(/^\b(while|for)\b/)) {
            depth++;
        }

        // Track braces for nested structures
        if (char === '}' && depth > 0) {
            depth--;
        }

        // Look for break or return at depth 0 (not in nested loop)
        if (depth === 0) {
            if (code.substring(i).match(/^\breturn\b/)) {
                return true;
            }
            if (code.substring(i).match(/^\bbreak\b/)) {
                return true;
            }
        }

        i++;
    }

    return false;
}

/**
 * Check if position is inside a comment or string
 */
function isInCommentOrString(text: string, position: number): boolean {
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inBlockComment = false;

    for (let i = 0; i < position && i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        if (!inString && !inComment && char === '*' && prevChar === '/') {
            inBlockComment = true;
            continue;
        }
        if (inBlockComment && char === '/' && prevChar === '*') {
            inBlockComment = false;
            continue;
        }
        if (inBlockComment) continue;

        if (!inString && char === '/' && text[i + 1] === '/') {
            inComment = true;
            continue;
        }
        if (inComment && char === '\n') {
            inComment = false;
            continue;
        }
        if (inComment) continue;

        if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
            continue;
        }
        if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
            continue;
        }
    }

    return inString || inComment || inBlockComment;
}

/**
 * Find matching closing brace
 */
function findMatchingBrace(text: string, start: number): number {
    if (text[start] !== '{') return -1;

    let depth = 1;
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inBlockComment = false;

    for (let i = start + 1; i < text.length; i++) {
        const char = text[i];
        const prevChar = text[i - 1];

        if (!inString && !inComment && char === '*' && prevChar === '/') {
            inBlockComment = true;
            continue;
        }
        if (inBlockComment && char === '/' && prevChar === '*') {
            inBlockComment = false;
            continue;
        }
        if (inBlockComment) continue;

        if (!inString && char === '/' && text[i + 1] === '/') {
            inComment = true;
            continue;
        }
        if (inComment && char === '\n') {
            inComment = false;
            continue;
        }
        if (inComment) continue;

        if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
            continue;
        }
        if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
            continue;
        }
        if (inString) continue;

        if (char === '{') depth++;
        if (char === '}') depth--;

        if (depth === 0) return i;
    }

    return -1;
}
