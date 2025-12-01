/**
 * Implicit any detection for the Kite language server.
 * Reports hints when variable types cannot be inferred.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Check for variables with implicit any type
 */
export function checkImplicitAny(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match var declarations without explicit type: var name = value
    // Skip ones with explicit type: var type name = value
    const varRegex = /\bvar\s+(\w+)\s*=\s*([^\n;]+)/g;

    let match;
    while ((match = varRegex.exec(text)) !== null) {
        // Skip if in comment or string
        if (isInCommentOrString(text, match.index)) continue;

        const varName = match[1];
        const value = match[2].trim();

        // Check if this is actually "var type name = value" (has explicit type)
        // by looking at what comes after "var "
        const afterVar = text.substring(match.index + 4).trim();
        const typeNameMatch = /^(\w+)\s+(\w+)\s*=/.exec(afterVar);
        if (typeNameMatch) {
            // This has explicit type, skip
            continue;
        }

        // Try to infer the type from the value
        const inferredType = inferType(value);

        if (inferredType === null) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);

            diagnostics.push({
                severity: DiagnosticSeverity.Hint,
                range: Range.create(startPos, endPos),
                message: `Variable '${varName}' has implicit 'any' type. Consider adding an explicit type annotation.`,
                source: 'kite',
            });
        }
    }

    // Also check for var declarations without initialization
    const uninitVarRegex = /\bvar\s+(\w+)\s*$/gm;
    while ((match = uninitVarRegex.exec(text)) !== null) {
        if (isInCommentOrString(text, match.index)) continue;

        const varName = match[1];

        // Skip if this looks like "var type name" (part of a typed declaration)
        const beforeMatch = text.substring(Math.max(0, match.index - 50), match.index);
        if (/\bvar\s+\w+\s*$/.test(beforeMatch)) continue;

        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);

        diagnostics.push({
            severity: DiagnosticSeverity.Hint,
            range: Range.create(startPos, endPos),
            message: `Variable '${varName}' has implicit 'any' type. Consider adding a type annotation or initial value.`,
            source: 'kite',
        });
    }

    return diagnostics;
}

/**
 * Try to infer type from a value expression
 * Returns null if type cannot be inferred
 */
function inferType(value: string): string | null {
    const trimmed = value.trim();

    // String literal
    if (/^"[^"]*"$/.test(trimmed) || /^'[^']*'$/.test(trimmed)) {
        return 'string';
    }

    // Number literal
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return 'number';
    }

    // Boolean literal
    if (trimmed === 'true' || trimmed === 'false') {
        return 'boolean';
    }

    // Null literal
    if (trimmed === 'null') {
        return 'null';
    }

    // Array literal
    if (/^\[.*\]$/.test(trimmed)) {
        return 'array';
    }

    // Object literal
    if (/^\{.*\}$/.test(trimmed)) {
        return 'object';
    }

    // Simple arithmetic with numbers (result is number)
    if (/^\d+\s*[+\-*/%]\s*\d+$/.test(trimmed)) {
        return 'number';
    }

    // String concatenation (result is string)
    if (/^"[^"]*"\s*\+\s*/.test(trimmed) || /\s*\+\s*"[^"]*"$/.test(trimmed)) {
        return 'string';
    }

    // Cannot infer type (function call, variable reference, complex expression)
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
