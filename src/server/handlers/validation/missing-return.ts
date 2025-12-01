/**
 * Missing return statement detection for the Kite language server.
 * Reports errors when a function declares a return type but has no return statement.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment } from '../../utils/text-utils';

/**
 * Check for missing return statements in functions with return types
 */
export function checkMissingReturn(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match functions with return type: fun name(params) returnType {
    const funcRegex = /\bfun\s+(\w+)\s*\(([^)]*)\)\s+(\w+)\s*\{/g;

    let match;
    while ((match = funcRegex.exec(text)) !== null) {
        if (isInComment(text, match.index)) continue;

        const funcName = match[1];
        const returnType = match[3];

        // Skip void/no return type functions
        if (returnType === 'void') continue;

        const braceStart = match.index + match[0].length - 1;
        const braceEnd = findMatchingBrace(text, braceStart);
        if (braceEnd === -1) continue;

        const funcBody = text.substring(braceStart + 1, braceEnd);

        // Check if there's a return statement in the function body
        if (!hasReturnStatement(funcBody)) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);

            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: Range.create(startPos, endPos),
                message: `Function '${funcName}' has return type '${returnType}' but no return statement`,
                source: 'kite',
            });
        }
    }

    return diagnostics;
}

/**
 * Check if code contains a return statement (not in nested function)
 */
function hasReturnStatement(code: string): boolean {
    // Simple check: look for 'return' keyword not in comments or strings
    let i = 0;
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inBlockComment = false;
    let depth = 0; // Track nested function depth

    while (i < code.length) {
        const char = code[i];
        const prevChar = i > 0 ? code[i - 1] : '';

        // Handle block comments
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
        if (inBlockComment) {
            i++;
            continue;
        }

        // Handle line comments
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
        if (inComment) {
            i++;
            continue;
        }

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
        if (inString) {
            i++;
            continue;
        }

        // Track nested functions
        if (code.substring(i).match(/^\bfun\s/)) {
            depth++;
        }
        if (char === '{' && depth > 0) {
            // Inside nested function
        }
        if (char === '}' && depth > 0) {
            depth--;
        }

        // Look for return keyword at depth 0
        if (depth === 0 && code.substring(i).match(/^\breturn\b/)) {
            return true;
        }

        i++;
    }

    return false;
}

/**
 * Find the matching closing brace
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
