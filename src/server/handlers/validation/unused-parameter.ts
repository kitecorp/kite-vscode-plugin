/**
 * Unused parameter detection for the Kite language server.
 * Reports warnings when function parameters are never used.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    DiagnosticTag,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Check for unused function parameters
 */
export function checkUnusedParameter(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match function declarations: fun name(params) { body }
    const functionRegex = /\bfun\s+\w+\s*\(([^)]*)\)(?:\s*\w+)?\s*\{/g;

    let match;
    while ((match = functionRegex.exec(text)) !== null) {
        // Skip if in comment or string
        if (isInCommentOrString(text, match.index)) continue;

        const paramsStr = match[1].trim();
        if (!paramsStr) continue;

        const funcStart = match.index;
        const braceStart = funcStart + match[0].length - 1;

        // Find the matching closing brace
        const braceEnd = findMatchingBrace(text, braceStart);
        if (braceEnd === -1) continue;

        const funcBody = text.substring(braceStart + 1, braceEnd);

        // Parse parameters: type name, type name, ...
        const params = parseParameters(paramsStr);

        // Check each parameter for usage in function body
        for (const param of params) {
            // Skip parameters starting with _ (intentionally unused)
            if (param.name.startsWith('_')) continue;

            if (!isParameterUsed(param.name, funcBody)) {
                // Find the parameter position in the original text
                // Escape brackets in type for regex (e.g., string[] -> string\[\])
                const escapedType = param.type.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
                const paramPattern = new RegExp(`\\b${escapedType}\\s+(${param.name})\\b`);
                const paramMatch = paramPattern.exec(match[0]);

                if (paramMatch) {
                    const paramOffset = match.index + paramMatch.index + paramMatch[0].indexOf(param.name);
                    const startPos = document.positionAt(paramOffset);
                    const endPos = document.positionAt(paramOffset + param.name.length);

                    diagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        range: Range.create(startPos, endPos),
                        message: `Parameter '${param.name}' is declared but never used. Prefix with '_' if intentional.`,
                        source: 'kite',
                        tags: [DiagnosticTag.Unnecessary],
                    });
                }
            }
        }
    }

    return diagnostics;
}

interface Parameter {
    type: string;
    name: string;
}

/**
 * Parse parameters from parameter string
 */
function parseParameters(paramsStr: string): Parameter[] {
    const params: Parameter[] = [];
    const parts = paramsStr.split(',');

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // Match: type name or type[] name
        const paramMatch = /^(\w+(?:\[\])?)\s+(\w+)$/.exec(trimmed);
        if (paramMatch) {
            params.push({
                type: paramMatch[1],
                name: paramMatch[2],
            });
        }
    }

    return params;
}

/**
 * Check if a parameter is used in the function body
 */
function isParameterUsed(paramName: string, funcBody: string): boolean {
    // Create regex to match the parameter as a whole word
    const regex = new RegExp(`\\b${paramName}\\b`);

    // Check each line, skipping comments
    const lines = funcBody.split('\n');
    for (const line of lines) {
        // Skip comment lines
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) continue;

        // Remove inline comments
        const withoutComment = line.replace(/\/\/.*$/, '');

        // Remove string literals to avoid false positives
        const withoutStrings = withoutComment
            .replace(/"[^"]*"/g, '""')
            .replace(/'[^']*'/g, "''");

        if (regex.test(withoutStrings)) {
            return true;
        }
    }

    return false;
}

/**
 * Find the matching closing brace for an opening brace
 */
function findMatchingBrace(text: string, openBracePos: number): number {
    let depth = 1;
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inBlockComment = false;

    for (let i = openBracePos + 1; i < text.length; i++) {
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
        if (inString) continue;

        if (char === '{') depth++;
        if (char === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }

    return -1;
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
