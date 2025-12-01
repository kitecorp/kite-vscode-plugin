/**
 * Empty string check detection for the Kite language server.
 * Reports hints suggesting len(str) == 0 instead of str == "".
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Check for empty string comparisons that could use len()
 */
export function checkEmptyStringCheck(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match comparisons with empty string: x == "" or x != "" or "" == x or "" != x
    const emptyStringRegex = /(\w+)\s*(==|!=)\s*""\s*|""\s*(==|!=)\s*(\w+)/g;

    let match;
    while ((match = emptyStringRegex.exec(text)) !== null) {
        if (isInCommentOrString(text, match.index)) continue;

        // Determine variable name and operator
        const varName = match[1] || match[4];
        const operator = match[2] || match[3];

        if (!varName) continue;

        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);

        const suggestion = operator === '=='
            ? `len(${varName}) == 0`
            : `len(${varName}) != 0`;

        diagnostics.push({
            severity: DiagnosticSeverity.Hint,
            range: Range.create(startPos, endPos),
            message: `Empty string check: consider using '${suggestion}' instead of '${varName} ${operator} ""'`,
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
