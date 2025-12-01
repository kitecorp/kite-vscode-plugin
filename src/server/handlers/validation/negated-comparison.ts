/**
 * Negated comparison detection for the Kite language server.
 * Reports hints for `!(x == y)` → `x != y`, `!(x > y)` → `x <= y`, etc.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

// Map of operators to their negated equivalents
const OPERATOR_NEGATIONS: Record<string, string> = {
    '==': '!=',
    '!=': '==',
    '<': '>=',
    '>': '<=',
    '<=': '>',
    '>=': '<',
};

/**
 * Check for negated comparisons that can be simplified
 */
export function checkNegatedComparison(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match !(expr op expr) pattern
    const negatedRegex = /!\s*\(\s*([^()]+)\s*(==|!=|<=|>=|<|>)\s*([^()]+)\s*\)/g;

    let match;
    while ((match = negatedRegex.exec(text)) !== null) {
        if (isInCommentOrString(text, match.index)) continue;

        const left = match[1].trim();
        const operator = match[2];
        const right = match[3].trim();

        const negatedOp = OPERATOR_NEGATIONS[operator];
        if (!negatedOp) continue;

        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);

        const original = `!(${left} ${operator} ${right})`;
        const suggestion = `${left} ${negatedOp} ${right}`;

        diagnostics.push({
            severity: DiagnosticSeverity.Hint,
            range: Range.create(startPos, endPos),
            message: `Negated comparison: '${original}' can be simplified to '${suggestion}'`,
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
