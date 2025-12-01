/**
 * Comparison to self detection for the Kite language server.
 * Reports warnings when comparing a variable to itself (always true/false).
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Check for comparison to self (x == x, x != x, etc.)
 */
export function checkComparisonToSelf(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match comparisons: x == x, x != x, x < x, x > x, x <= x, x >= x
    const comparisonRegex = /\b(\w+)\s*(==|!=|<=|>=|<|>)\s*(\w+)\b/g;

    let match;
    while ((match = comparisonRegex.exec(text)) !== null) {
        // Skip if in comment or string
        if (isInCommentOrString(text, match.index)) continue;

        const leftSide = match[1];
        const operator = match[2];
        const rightSide = match[3];

        // Skip if either side contains dot (property access) - check original match
        const beforeMatch = text.substring(Math.max(0, match.index - 1), match.index);
        const afterMatch = text.substring(match.index + match[0].length, match.index + match[0].length + 1);
        if (beforeMatch === '.' || afterMatch === '.') continue;

        // Check if left and right are the same simple identifier
        if (leftSide === rightSide) {
            // Determine if result is always true or always false
            let result: string;
            switch (operator) {
                case '==':
                case '>=':
                case '<=':
                    result = 'always true';
                    break;
                case '!=':
                case '<':
                case '>':
                    result = 'always false';
                    break;
                default:
                    result = 'constant';
            }

            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);

            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: Range.create(startPos, endPos),
                message: `Comparison to self: '${leftSide} ${operator} ${rightSide}' is ${result}`,
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
