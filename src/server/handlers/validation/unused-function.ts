/**
 * Unused function detection for the Kite language server.
 * Reports warnings when a function is declared but never called.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    DiagnosticTag,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

interface FunctionDecl {
    name: string;
    nameStart: number;
    nameEnd: number;
}

/**
 * Check for unused functions
 */
export function checkUnusedFunctions(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Find all function declarations
    const functions: FunctionDecl[] = [];
    const funcRegex = /\bfun\s+(\w+)\s*\(/g;

    let match;
    while ((match = funcRegex.exec(text)) !== null) {
        // Skip if in comment
        if (isInCommentOrString(text, match.index)) continue;

        const funcName = match[1];
        const nameStart = match.index + match[0].indexOf(funcName);
        const nameEnd = nameStart + funcName.length;

        functions.push({
            name: funcName,
            nameStart,
            nameEnd,
        });
    }

    // For each function, check if it's used elsewhere in the file
    for (const func of functions) {
        const isUsed = isFunctionUsed(text, func.name, func.nameStart);

        if (!isUsed) {
            const startPos = document.positionAt(func.nameStart);
            const endPos = document.positionAt(func.nameEnd);

            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: Range.create(startPos, endPos),
                message: `Function '${func.name}' is declared but never called`,
                source: 'kite',
                tags: [DiagnosticTag.Unnecessary],
            });
        }
    }

    return diagnostics;
}

/**
 * Check if a function is used anywhere in the text
 */
function isFunctionUsed(text: string, funcName: string, declarationPos: number): boolean {
    // Create a regex to find usage (function call or reference)
    // Must be word boundary, not part of function declaration
    const usageRegex = new RegExp(`\\b${escapeRegex(funcName)}\\b`, 'g');

    let match;
    while ((match = usageRegex.exec(text)) !== null) {
        // Skip the declaration itself
        if (match.index === declarationPos) continue;

        // Skip if in comment or string (except interpolation)
        if (isInComment(text, match.index)) continue;

        // Check if in a non-interpolated string
        if (isInNonInterpolatedString(text, match.index)) continue;

        // Skip if this is another function definition
        const beforeMatch = text.substring(Math.max(0, match.index - 20), match.index);
        if (/\bfun\s+$/.test(beforeMatch)) continue;

        // Found a usage
        return true;
    }

    return false;
}

/**
 * Check if position is inside a comment
 */
function isInComment(text: string, position: number): boolean {
    let inComment = false;
    let inBlockComment = false;

    for (let i = 0; i < position && i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        if (!inComment && char === '*' && prevChar === '/') {
            inBlockComment = true;
            continue;
        }
        if (inBlockComment && char === '/' && prevChar === '*') {
            inBlockComment = false;
            continue;
        }
        if (inBlockComment) continue;

        if (char === '/' && text[i + 1] === '/') {
            inComment = true;
            continue;
        }
        if (inComment && char === '\n') {
            inComment = false;
            continue;
        }
    }

    return inComment || inBlockComment;
}

/**
 * Check if position is inside a non-interpolated string (single-quoted or in double-quoted without ${})
 */
function isInNonInterpolatedString(text: string, position: number): boolean {
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inInterpolation = false;
    let interpolationDepth = 0;

    for (let i = 0; i < position && i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        // Handle escape sequences
        if (prevChar === '\\') continue;

        // Single-quoted strings
        if (!inDoubleQuote && char === "'") {
            inSingleQuote = !inSingleQuote;
            continue;
        }

        // Double-quoted strings
        if (!inSingleQuote && char === '"') {
            inDoubleQuote = !inDoubleQuote;
            inInterpolation = false;
            interpolationDepth = 0;
            continue;
        }

        // String interpolation in double-quoted strings
        if (inDoubleQuote && char === '$' && text[i + 1] === '{') {
            inInterpolation = true;
            interpolationDepth = 1;
            continue;
        }

        if (inInterpolation) {
            if (char === '{') interpolationDepth++;
            if (char === '}') {
                interpolationDepth--;
                if (interpolationDepth === 0) {
                    inInterpolation = false;
                }
            }
        }
    }

    // In single-quoted string - no interpolation possible
    if (inSingleQuote) return true;

    // In double-quoted string but not in interpolation
    if (inDoubleQuote && !inInterpolation) return true;

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
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
