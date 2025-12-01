/**
 * Redundant boolean detection for the Kite language server.
 * Reports warnings for `if x == true` → `if x`, `if x == false` → `if !x`.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Check for redundant boolean comparisons
 */
export function checkRedundantBoolean(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match x == true, x != true, x == false, x != false
    // Also match true == x, true != x, false == x, false != x
    const boolCompareRegex = /\b(\w+)\s*(==|!=)\s*(true|false)\b|\b(true|false)\s*(==|!=)\s*(\w+)\b/g;

    let match;
    while ((match = boolCompareRegex.exec(text)) !== null) {
        if (isInCommentOrString(text, match.index)) continue;

        // Determine variable, operator, and boolean value
        let varName: string;
        let operator: string;
        let boolValue: string;

        if (match[1]) {
            // x == true or x != true
            varName = match[1];
            operator = match[2];
            boolValue = match[3];
        } else {
            // true == x or true != x
            boolValue = match[4];
            operator = match[5];
            varName = match[6];
        }

        // Skip if varName is a boolean literal itself
        if (varName === 'true' || varName === 'false') continue;

        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);

        let suggestion: string;
        let originalExpr: string;

        if (operator === '==') {
            if (boolValue === 'true') {
                suggestion = varName;
                originalExpr = `${varName} == true`;
            } else {
                suggestion = `!${varName}`;
                originalExpr = `${varName} == false`;
            }
        } else { // operator === '!='
            if (boolValue === 'true') {
                suggestion = `!${varName}`;
                originalExpr = `${varName} != true`;
            } else {
                suggestion = varName;
                originalExpr = `${varName} != false`;
            }
        }

        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: Range.create(startPos, endPos),
            message: `Redundant boolean: '${originalExpr}' can be simplified to '${suggestion}'`,
            source: 'kite',
        });
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
