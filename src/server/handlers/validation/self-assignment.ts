/**
 * Self-assignment detection for the Kite language server.
 * Reports warnings when a variable is assigned to itself.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Check for self-assignment (var x = x or x = x)
 */
export function checkSelfAssignment(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match var [type] name = name or name = name (simple assignment)
    // Exclude compound assignments (+=, -=, etc.)
    const selfAssignRegex = /\b(?:var\s+(?:\w+\s+)?)?(\w+)\s*=\s*(\w+)\b/g;

    let match;
    while ((match = selfAssignRegex.exec(text)) !== null) {
        // Skip if in comment or string
        if (isInCommentOrString(text, match.index)) continue;

        const leftSide = match[1];
        const rightSide = match[2];

        // Check if it's actually self-assignment (not compound)
        const charBefore = match.index > 0 ? text[match.index - 1] : '';
        const assignPos = match[0].indexOf('=');
        const charBeforeEquals = match[0][assignPos - 1];

        // Skip compound assignments
        if (['+', '-', '*', '/', '%'].includes(charBeforeEquals)) continue;

        // Skip if left side contains dot (property access)
        if (match[0].includes('.')) continue;

        // Check if left and right are the same
        if (leftSide === rightSide) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);

            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: Range.create(startPos, endPos),
                message: `Self-assignment: '${leftSide}' is assigned to itself`,
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
