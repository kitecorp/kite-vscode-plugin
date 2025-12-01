/**
 * Useless expression detection for the Kite language server.
 * Reports warnings for statements with no effect like `x + 1` (no assignment).
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Check for useless expressions (statements with no side effects)
 */
export function checkUselessExpression(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        const trimmed = line.trim();

        // Skip empty lines, comments, and lines starting with keywords
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

        // Skip lines that are part of declarations or control flow
        if (/^\s*(schema|component|resource|fun|var|input|output|type|if|else|for|while|return|import|@)/.test(line)) continue;

        // Skip lines that contain assignment
        if (/[^=!<>]=[^=]/.test(line)) continue;

        // Skip lines that are function calls (end with ) or ); or ) {)
        if (/\)\s*[;{]?\s*$/.test(trimmed)) continue;
        if (/\)\s*$/.test(trimmed)) continue;

        // Skip lines that are just closing braces
        if (/^[}\])\s;]*$/.test(trimmed)) continue;

        // Skip lines that are property definitions (type name or name = value)
        if (/^\w+(\[\])?\s+\w+(\s*=.*)?$/.test(trimmed)) continue;

        // Skip lines that are just identifiers (variable references, property names)
        if (/^\w+\s*$/.test(trimmed)) continue;

        // Skip string/array/object literals
        if (/^["'\[{]/.test(trimmed)) continue;

        // Calculate line offset
        const lineOffset = lines.slice(0, lineNum).reduce((acc, l) => acc + l.length + 1, 0);

        // Check if this line is inside a comment or string
        if (isInCommentOrString(text, lineOffset)) continue;

        // Look for arithmetic expressions without assignment
        // Pattern: identifier or number followed by operator and another operand
        const uselessExprRegex = /^(\w+|\d+(?:\.\d+)?)\s*([+\-*/%])\s*(\w+|\d+(?:\.\d+)?)\s*$/;
        const match = uselessExprRegex.exec(trimmed);

        if (match) {
            const startPos = document.positionAt(lineOffset + line.indexOf(trimmed));
            const endPos = document.positionAt(lineOffset + line.indexOf(trimmed) + trimmed.length);

            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: Range.create(startPos, endPos),
                message: `Useless expression: '${trimmed}' has no effect. Did you forget to assign the result?`,
                source: 'kite',
            });
        }

        // Also check for standalone comparison expressions (less common but still useless)
        const uselessCompareRegex = /^(\w+|\d+(?:\.\d+)?)\s*(==|!=|<|>|<=|>=)\s*(\w+|\d+(?:\.\d+)?)\s*$/;
        const compareMatch = uselessCompareRegex.exec(trimmed);

        if (compareMatch && !isInsideCondition(text, lineOffset)) {
            const startPos = document.positionAt(lineOffset + line.indexOf(trimmed));
            const endPos = document.positionAt(lineOffset + line.indexOf(trimmed) + trimmed.length);

            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: Range.create(startPos, endPos),
                message: `Useless expression: '${trimmed}' has no effect. Did you mean to use this in a condition or assignment?`,
                source: 'kite',
            });
        }
    }

    return diagnostics;
}

/**
 * Check if position is inside a condition (if/while)
 */
function isInsideCondition(text: string, position: number): boolean {
    // Look back for if/while keyword on the same logical line
    const before = text.substring(Math.max(0, position - 100), position);
    return /\b(if|while)\s+[^{]*$/.test(before);
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
