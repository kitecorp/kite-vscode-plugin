/**
 * Constant condition detection for the Kite language server.
 * Reports warnings when if/while conditions are always true or always false.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Check for constant conditions in if/while statements
 */
export function checkConstantCondition(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match if/while statements with conditions
    const conditionRegex = /\b(if|while)\s+([^{]+)\s*\{/g;

    let match;
    while ((match = conditionRegex.exec(text)) !== null) {
        // Skip if in comment or string
        if (isInCommentOrString(text, match.index)) continue;

        const keyword = match[1];
        const condition = match[2].trim();

        const constantValue = evaluateConstantCondition(condition);
        if (constantValue !== null) {
            const conditionStart = match.index + match[0].indexOf(condition);
            const startPos = document.positionAt(conditionStart);
            const endPos = document.positionAt(conditionStart + condition.length);

            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: Range.create(startPos, endPos),
                message: `Constant condition: '${condition}' is always ${constantValue}`,
                source: 'kite',
            });
        }
    }

    return diagnostics;
}

/**
 * Evaluate if a condition is constant
 * Returns 'true', 'false', or null if not constant
 */
function evaluateConstantCondition(condition: string): string | null {
    const trimmed = condition.trim();

    // Direct boolean literals
    if (trimmed === 'true') return 'true';
    if (trimmed === 'false') return 'false';

    // Numeric comparisons with same literal on both sides
    const sameNumberCompare = /^(\d+(?:\.\d+)?)\s*(==|!=|<|>|<=|>=)\s*(\d+(?:\.\d+)?)$/;
    const numMatch = sameNumberCompare.exec(trimmed);
    if (numMatch) {
        const left = parseFloat(numMatch[1]);
        const op = numMatch[2];
        const right = parseFloat(numMatch[3]);

        switch (op) {
            case '==': return left === right ? 'true' : 'false';
            case '!=': return left !== right ? 'true' : 'false';
            case '<': return left < right ? 'true' : 'false';
            case '>': return left > right ? 'true' : 'false';
            case '<=': return left <= right ? 'true' : 'false';
            case '>=': return left >= right ? 'true' : 'false';
        }
    }

    // String comparisons with same literal on both sides
    const sameStringCompare = /^(["'])([^"']*)\1\s*(==|!=)\s*(["'])([^"']*)\4$/;
    const strMatch = sameStringCompare.exec(trimmed);
    if (strMatch) {
        const left = strMatch[2];
        const op = strMatch[3];
        const right = strMatch[5];

        switch (op) {
            case '==': return left === right ? 'true' : 'false';
            case '!=': return left !== right ? 'true' : 'false';
        }
    }

    // Boolean literal comparisons
    const boolCompare = /^(true|false)\s*(==|!=)\s*(true|false)$/;
    const boolMatch = boolCompare.exec(trimmed);
    if (boolMatch) {
        const left = boolMatch[1] === 'true';
        const op = boolMatch[2];
        const right = boolMatch[3] === 'true';

        switch (op) {
            case '==': return left === right ? 'true' : 'false';
            case '!=': return left !== right ? 'true' : 'false';
        }
    }

    // Negation of constant
    if (trimmed === '!true') return 'false';
    if (trimmed === '!false') return 'true';

    // Double negation
    if (trimmed === '!!true') return 'true';
    if (trimmed === '!!false') return 'false';

    // Tautologies: true || anything, anything || true
    if (/^true\s*\|\|/.test(trimmed) || /\|\|\s*true$/.test(trimmed)) {
        return 'true';
    }

    // Contradictions: false && anything, anything && false
    if (/^false\s*&&/.test(trimmed) || /&&\s*false$/.test(trimmed)) {
        return 'false';
    }

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
