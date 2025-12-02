/**
 * Return outside function detection for the Kite language server.
 * Reports errors when a return statement is used outside of a function body.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Check for return statements outside of functions
 */
export function checkReturnOutsideFunction(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Find all function bodies and init blocks
    const functionBodies: { start: number; end: number }[] = [];

    // Regex to find function definitions and init blocks
    // Matches: fun name(params) returnType { or fun name(params) returnType[] { or init {
    const funcRegex = /\b(fun\s+\w+\s*\([^)]*\)(?:\s+\w+(?:\[\])?)?\s*\{|\binit\s*\{)/g;

    let match;
    while ((match = funcRegex.exec(text)) !== null) {
        // Skip if in comment
        if (isInCommentOrString(text, match.index)) continue;

        const braceStart = match.index + match[0].length - 1;
        const braceEnd = findMatchingBrace(text, braceStart);
        if (braceEnd !== -1) {
            functionBodies.push({ start: braceStart, end: braceEnd });
        }
    }

    // Find all return statements
    const returnRegex = /\breturn\b/g;
    while ((match = returnRegex.exec(text)) !== null) {
        // Skip if in comment or string
        if (isInCommentOrString(text, match.index)) continue;

        // Check if this return is inside any function body
        const isInFunction = functionBodies.some(
            body => match!.index > body.start && match!.index < body.end
        );

        if (!isInFunction) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + 6);

            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: Range.create(startPos, endPos),
                message: `'return' statement outside of function`,
                source: 'kite',
            });
        }
    }

    return diagnostics;
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
