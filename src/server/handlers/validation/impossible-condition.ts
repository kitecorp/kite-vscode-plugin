/**
 * Impossible condition detection for the Kite language server.
 * Reports warnings when conditions are mathematically impossible.
 *
 * Detects patterns like:
 * - x > 5 && x < 5 (impossible: x cannot be both > 5 and < 5)
 * - x == 5 && x == 6 (impossible: x cannot equal two different values)
 * - x > 10 && x < 5 (impossible: contradictory ranges)
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment, isInString } from '../../utils/text-utils';

interface Comparison {
    variable: string;
    operator: string;
    value: number;
    fullMatch: string;
    index: number;
}

/**
 * Check for impossible conditions
 */
export function checkImpossibleCondition(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match patterns: if (...) or while (...)
    const conditionBlockRegex = /\b(if|while)\s*\(([^)]+)\)/g;
    let blockMatch;

    while ((blockMatch = conditionBlockRegex.exec(text)) !== null) {
        const conditionStart = blockMatch.index + blockMatch[0].indexOf('(') + 1;
        const conditionText = blockMatch[2];

        // Skip if inside a comment
        if (isInComment(text, blockMatch.index)) continue;

        // Find all comparisons in this condition joined by &&
        const comparisons = extractComparisons(conditionText, conditionStart);

        // Check for impossible combinations
        const impossiblePairs = findImpossibleCombinations(comparisons);

        for (const pair of impossiblePairs) {
            const startPos = document.positionAt(blockMatch.index);
            const endPos = document.positionAt(blockMatch.index + blockMatch[0].length);

            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: Range.create(startPos, endPos),
                message: pair.message,
                source: 'kite',
            });
        }
    }

    return diagnostics;
}

/**
 * Extract numeric comparisons from a condition string
 */
function extractComparisons(condition: string, baseOffset: number): Comparison[] {
    const comparisons: Comparison[] = [];

    // Match: variable op number (e.g., x > 5, x == 10, x <= 3)
    const compRegex = /\b([a-zA-Z_]\w*)\s*(==|!=|>=|<=|>|<)\s*(\d+)\b/g;
    let match;

    while ((match = compRegex.exec(condition)) !== null) {
        comparisons.push({
            variable: match[1],
            operator: match[2],
            value: parseInt(match[3], 10),
            fullMatch: match[0],
            index: baseOffset + match.index,
        });
    }

    // Also match: number op variable (e.g., 5 < x)
    const reverseRegex = /\b(\d+)\s*(==|!=|>=|<=|>|<)\s*([a-zA-Z_]\w*)\b/g;
    while ((match = reverseRegex.exec(condition)) !== null) {
        // Flip the operator for normalized comparison
        const op = flipOperator(match[2]);
        comparisons.push({
            variable: match[3],
            operator: op,
            value: parseInt(match[1], 10),
            fullMatch: match[0],
            index: baseOffset + match.index,
        });
    }

    return comparisons;
}

/**
 * Flip a comparison operator (for when value is on left side)
 */
function flipOperator(op: string): string {
    switch (op) {
        case '>': return '<';
        case '<': return '>';
        case '>=': return '<=';
        case '<=': return '>=';
        default: return op;
    }
}

interface ImpossibleResult {
    message: string;
}

/**
 * Find impossible combinations among comparisons
 */
function findImpossibleCombinations(comparisons: Comparison[]): ImpossibleResult[] {
    const results: ImpossibleResult[] = [];

    // Group comparisons by variable
    const byVariable = new Map<string, Comparison[]>();
    for (const comp of comparisons) {
        const existing = byVariable.get(comp.variable) || [];
        existing.push(comp);
        byVariable.set(comp.variable, existing);
    }

    // Check each variable for impossible combinations
    for (const [variable, comps] of byVariable) {
        if (comps.length < 2) continue;

        // Check all pairs
        for (let i = 0; i < comps.length; i++) {
            for (let j = i + 1; j < comps.length; j++) {
                const impossible = checkPairImpossible(comps[i], comps[j]);
                if (impossible) {
                    results.push({
                        message: createImpossibleMessage(variable, comps[i], comps[j], impossible),
                    });
                }
            }
        }
    }

    return results;
}

/**
 * Check if two comparisons on the same variable are impossible together
 */
function checkPairImpossible(a: Comparison, b: Comparison): string | null {
    // == && == with different values
    if (a.operator === '==' && b.operator === '==' && a.value !== b.value) {
        return 'equal-different';
    }

    // > n && < n (impossible when n is same)
    if (a.operator === '>' && b.operator === '<' && a.value >= b.value) {
        return 'contradictory-range';
    }
    if (a.operator === '<' && b.operator === '>' && a.value <= b.value) {
        return 'contradictory-range';
    }

    // >= n && < n (impossible when n is same)
    if (a.operator === '>=' && b.operator === '<' && a.value >= b.value) {
        return 'contradictory-range';
    }
    if (a.operator === '<' && b.operator === '>=' && a.value <= b.value) {
        return 'contradictory-range';
    }

    // > n && <= n (impossible when n is same)
    if (a.operator === '>' && b.operator === '<=' && a.value >= b.value) {
        return 'contradictory-range';
    }
    if (a.operator === '<=' && b.operator === '>' && a.value <= b.value) {
        return 'contradictory-range';
    }

    // >= n && <= m where n > m
    if (a.operator === '>=' && b.operator === '<=' && a.value > b.value) {
        return 'contradictory-range';
    }
    if (a.operator === '<=' && b.operator === '>=' && a.value < b.value) {
        return 'contradictory-range';
    }

    // == n && > n or == n && < n
    if (a.operator === '==' && (b.operator === '>' && b.value >= a.value)) {
        return 'equal-and-greater';
    }
    if (a.operator === '==' && (b.operator === '<' && b.value <= a.value)) {
        return 'equal-and-less';
    }
    if (b.operator === '==' && (a.operator === '>' && a.value >= b.value)) {
        return 'equal-and-greater';
    }
    if (b.operator === '==' && (a.operator === '<' && a.value <= b.value)) {
        return 'equal-and-less';
    }

    return null;
}

/**
 * Create a human-readable message for an impossible condition
 */
function createImpossibleMessage(
    variable: string,
    a: Comparison,
    b: Comparison,
    reason: string
): string {
    const condStr = variable + ' ' + a.operator + ' ' + a.value + ' && ' +
                   variable + ' ' + b.operator + ' ' + b.value;

    switch (reason) {
        case 'equal-different':
            return 'Impossible condition: ' + variable + ' cannot equal both ' + a.value + ' and ' + b.value;
        case 'contradictory-range':
            return 'Impossible condition: ' + condStr + ' can never be true';
        case 'equal-and-greater':
        case 'equal-and-less':
            return 'Impossible condition: ' + condStr + ' can never be true';
        default:
            return 'Impossible condition detected: ' + condStr;
    }
}
