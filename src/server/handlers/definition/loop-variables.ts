/**
 * Loop variable definition lookup.
 * Handles finding loop variable declarations in list comprehensions.
 */

import { Location, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { findEnclosingBrackets } from './utils';

/**
 * Find list comprehension variable definition.
 * For expressions like: [for x in items: if x > 10 { x }]
 * When clicking on 'x' (reference), find the 'x' in 'for x in' (declaration).
 */
export function findListComprehensionVariable(
    document: TextDocument,
    text: string,
    offset: number,
    word: string
): Location | null {
    // Find the enclosing list comprehension brackets
    const bracketRange = findEnclosingBrackets(text, offset);
    if (!bracketRange) return null;

    const { start: bracketStart, end: bracketEnd } = bracketRange;
    const comprehensionText = text.substring(bracketStart, bracketEnd + 1);

    // Check if this is a list comprehension (contains 'for ... in')
    const forInMatch = comprehensionText.match(/\bfor\s+(\w+)\s+in\b/);
    if (!forInMatch) return null;

    const loopVar = forInMatch[1];

    // Check if the word we're looking for matches the loop variable
    if (word !== loopVar) return null;

    // Check if the cursor is on the declaration itself (for x in) - if so, don't navigate
    const forVarOffset = bracketStart + forInMatch.index! + forInMatch[0].indexOf(loopVar);
    const forVarEnd = forVarOffset + loopVar.length;
    if (offset >= forVarOffset && offset < forVarEnd) {
        // Cursor is on the declaration, return null or return itself
        return null;
    }

    // Return the location of the loop variable declaration
    const startPos = document.positionAt(forVarOffset);
    const endPos = document.positionAt(forVarEnd);

    return Location.create(document.uri, Range.create(startPos, endPos));
}
