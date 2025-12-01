/**
 * Assignment in condition detection for the Kite language server.
 * Reports warnings when using = instead of == in if/while conditions.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Check for assignment operators in conditions (likely meant ==)
 */
export function checkAssignmentInCondition(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match if or while followed by condition containing single =
    // We need to extract the condition and check for single = (not ==, !=, <=, >=, +=, etc.)
    const conditionRegex = /\b(if|while)\s*\(?([^{]+)\{/g;

    let match;
    while ((match = conditionRegex.exec(text)) !== null) {
        // Skip if in comment or string
        if (isInCommentOrString(text, match.index)) continue;

        const keyword = match[1];
        const conditionWithPossibleParen = match[2].trim();

        // Remove trailing ) if present
        let condition = conditionWithPossibleParen;
        if (condition.endsWith(')')) {
            condition = condition.slice(0, -1).trim();
        }

        // Skip empty conditions or simple boolean identifiers
        if (!condition || /^\w+$/.test(condition)) continue;

        // Look for single = that's not part of ==, !=, <=, >=, +=, -=, *=, /=
        // Strategy: find all = and check what's before/after
        let i = 0;
        while (i < condition.length) {
            if (condition[i] === '=') {
                const prevChar = i > 0 ? condition[i - 1] : '';
                const nextChar = i + 1 < condition.length ? condition[i + 1] : '';

                // Skip if it's ==, !=, <=, >=, or compound assignment
                if (nextChar === '=' ||
                    prevChar === '=' ||
                    prevChar === '!' ||
                    prevChar === '<' ||
                    prevChar === '>' ||
                    prevChar === '+' ||
                    prevChar === '-' ||
                    prevChar === '*' ||
                    prevChar === '/') {
                    i++;
                    continue;
                }

                // Found a suspicious single =
                // Calculate position in original text
                const conditionStart = match.index + match[0].indexOf(match[2]);
                const assignmentPos = conditionStart + i;

                const startPos = document.positionAt(assignmentPos);
                const endPos = document.positionAt(assignmentPos + 1);

                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: Range.create(startPos, endPos),
                    message: `Assignment in condition. Did you mean '==' instead of '='?`,
                    source: 'kite',
                });
                break; // Only report once per condition
            }
            i++;
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
