/**
 * Long function detection for the Kite language server.
 * Reports warnings when functions exceed 50 lines.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

const MAX_FUNCTION_LINES = 50;

/**
 * Check for functions that are too long
 */
export function checkLongFunction(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match function declarations: fun name(params) or fun name(params) returnType {
    const functionRegex = /\bfun\s+(\w+)\s*\([^)]*\)(?:\s*\w+)?\s*\{/g;

    let match;
    while ((match = functionRegex.exec(text)) !== null) {
        // Skip if in comment or string
        if (isInCommentOrString(text, match.index)) continue;

        const funcName = match[1];
        const funcStart = match.index;
        const braceStart = funcStart + match[0].length - 1;

        // Find the matching closing brace
        const braceEnd = findMatchingBrace(text, braceStart);
        if (braceEnd === -1) continue;

        // Count lines in the function body
        const funcBody = text.substring(braceStart, braceEnd + 1);
        const lineCount = countLines(funcBody);

        if (lineCount > MAX_FUNCTION_LINES) {
            const startPos = document.positionAt(funcStart);
            const endPos = document.positionAt(funcStart + match[0].length);

            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: Range.create(startPos, endPos),
                message: `Function '${funcName}' is ${lineCount} lines long. Consider breaking it into smaller functions (max recommended: ${MAX_FUNCTION_LINES} lines).`,
                source: 'kite',
            });
        }
    }

    return diagnostics;
}

/**
 * Find the matching closing brace for an opening brace
 */
function findMatchingBrace(text: string, openBracePos: number): number {
    let depth = 1;
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inBlockComment = false;

    for (let i = openBracePos + 1; i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        // Handle block comments
        if (!inString && !inComment && char === '*' && prevChar === '/') {
            inBlockComment = true;
            continue;
        }
        if (inBlockComment && char === '/' && prevChar === '*') {
            inBlockComment = false;
            continue;
        }
        if (inBlockComment) continue;

        // Handle line comments
        if (!inString && char === '/' && text[i + 1] === '/') {
            inComment = true;
            continue;
        }
        if (inComment && char === '\n') {
            inComment = false;
            continue;
        }
        if (inComment) continue;

        // Handle strings
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

        // Count braces
        if (char === '{') depth++;
        if (char === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }

    return -1;
}

/**
 * Count non-empty, non-comment lines in a string
 */
function countLines(text: string): number {
    const lines = text.split('\n');
    let count = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines and comment-only lines
        if (trimmed && !trimmed.startsWith('//')) {
            count++;
        }
    }

    return count;
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
