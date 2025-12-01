/**
 * Too many parameters detection for the Kite language server.
 * Reports warnings when functions have more than 5 parameters.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

const MAX_PARAMETERS = 5;

/**
 * Check for functions with too many parameters
 */
export function checkTooManyParameters(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match function declarations: fun name(params) or fun name(params) returnType
    const functionRegex = /\bfun\s+(\w+)\s*\(([^)]*)\)/g;

    let match;
    while ((match = functionRegex.exec(text)) !== null) {
        // Skip if in comment or string
        if (isInCommentOrString(text, match.index)) continue;

        const funcName = match[1];
        const paramsStr = match[2].trim();

        // Count parameters (skip if empty)
        if (!paramsStr) continue;

        // Split by comma and count non-empty params
        const params = paramsStr.split(',')
            .map(p => p.trim())
            .filter(p => p.length > 0);

        const paramCount = params.length;

        if (paramCount > MAX_PARAMETERS) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);

            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: Range.create(startPos, endPos),
                message: `Function '${funcName}' has ${paramCount} parameters. Consider using fewer than ${MAX_PARAMETERS + 1} parameters or grouping them into a schema.`,
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
