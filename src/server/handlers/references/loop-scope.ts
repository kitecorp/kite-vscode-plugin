/**
 * Loop variable scope detection for reference finding.
 * Handles for-loops in list comprehensions and for-prefixed statements.
 */

import { findMatchingBracket, findMatchingBrace } from './scope-utils';

/**
 * Result of finding a loop variable scope.
 */
export interface LoopVariableScope {
    scopeStart: number;
    scopeEnd: number;
}

/**
 * Find the scope of a loop variable if the cursor is on one.
 * Returns the scope boundaries where the loop variable is valid.
 *
 * Handles patterns like:
 * - [for x in items: { ... }] - list comprehension
 * - [for env in environments] resource S3.Bucket data { ... } - for-prefixed statement
 */
export function findLoopVariableScope(
    text: string,
    cursorOffset: number,
    word: string
): LoopVariableScope | null {
    // Check if cursor is on a loop variable declaration in a for expression
    // Pattern: [for <variable> in ...
    const forPattern = /\[\s*for\s+(\w+)\s+in\s+/g;
    let forMatch;

    while ((forMatch = forPattern.exec(text)) !== null) {
        const varName = forMatch[1];
        if (varName !== word) continue;

        const varStart = forMatch.index + forMatch[0].indexOf(varName, 5);
        const varEnd = varStart + varName.length;

        // Check if cursor is on this variable declaration
        if (cursorOffset >= varStart && cursorOffset <= varEnd) {
            const scope = findScopeForLoopAt(text, forMatch.index);
            if (scope) return scope;
        }
    }

    // Also check if cursor is on a reference to the loop variable within scope
    // We need to find all loop variables and check if cursor is in their scope
    forPattern.lastIndex = 0;
    while ((forMatch = forPattern.exec(text)) !== null) {
        const varName = forMatch[1];
        if (varName !== word) continue;

        const scope = findScopeForLoopAt(text, forMatch.index);
        if (scope && cursorOffset >= scope.scopeStart && cursorOffset <= scope.scopeEnd) {
            return scope;
        }
    }

    return null;
}

/**
 * Find the scope for a for-loop starting at the given position.
 */
function findScopeForLoopAt(text: string, bracketStart: number): LoopVariableScope | null {
    const afterFor = text.substring(bracketStart);
    const closingBracketIdx = findMatchingBracket(afterFor, 0);

    if (closingBracketIdx === -1) return null;

    const closingBracketPos = bracketStart + closingBracketIdx;

    // Check what follows the closing bracket
    const afterBracket = text.substring(closingBracketPos + 1).trimStart();

    if (afterBracket.startsWith('resource') || afterBracket.startsWith('component')) {
        // For-prefixed statement: scope is the following resource/component block
        const blockMatch = afterBracket.match(/^(resource|component)\s+\S+\s+\S+\s*\{/);
        if (blockMatch) {
            const blockStartInText = closingBracketPos + 1 + (text.substring(closingBracketPos + 1).indexOf('{'));
            const scopeEnd = findMatchingBrace(text, blockStartInText);
            if (scopeEnd !== -1) {
                return { scopeStart: bracketStart, scopeEnd: scopeEnd + 1 };
            }
        }
    } else {
        // List comprehension: scope is within the brackets
        return { scopeStart: bracketStart, scopeEnd: closingBracketPos + 1 };
    }

    return null;
}
