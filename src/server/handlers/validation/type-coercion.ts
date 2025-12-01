/**
 * Type coercion detection for the Kite language server.
 * Reports warnings when comparing values of different types.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Check for comparisons between different literal types
 */
export function checkTypeCoercion(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match comparisons with literals
    const comparisonRegex = /([^\s=!<>]+)\s*(==|!=)\s*([^\s=!<>{]+)/g;

    let match;
    while ((match = comparisonRegex.exec(text)) !== null) {
        if (isInCommentOrString(text, match.index)) continue;

        const left = match[1].trim();
        const right = match[3].trim();

        const leftType = inferLiteralType(left);
        const rightType = inferLiteralType(right);

        // Only check if both sides have determinable types and they differ
        if (leftType && rightType && leftType !== rightType) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);

            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: Range.create(startPos, endPos),
                message: `Type coercion: comparing ${leftType} with ${rightType} may produce unexpected results`,
                source: 'kite',
            });
        }
    }

    return diagnostics;
}

/**
 * Infer the type of a literal value
 * Returns null if type cannot be determined (e.g., variable)
 */
function inferLiteralType(value: string): string | null {
    const trimmed = value.trim();

    // String literal
    if (/^".*"$/.test(trimmed) || /^'.*'$/.test(trimmed)) {
        return 'string';
    }

    // Boolean literal
    if (trimmed === 'true' || trimmed === 'false') {
        return 'boolean';
    }

    // Null literal
    if (trimmed === 'null') {
        return 'null';
    }

    // Number literal (integer or decimal)
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return 'number';
    }

    // Array literal
    if (/^\[/.test(trimmed)) {
        return 'array';
    }

    // Object literal
    if (/^\{/.test(trimmed)) {
        return 'object';
    }

    // Unknown (variable, function call, etc.)
    return null;
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
