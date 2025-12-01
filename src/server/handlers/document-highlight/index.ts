/**
 * Document highlight handler for the Kite language server.
 * Highlights all occurrences of the symbol under the cursor.
 */

import {
    DocumentHighlight,
    DocumentHighlightKind,
    Position,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getWordAtPosition, wordBoundaryRegex, isInComment } from '../../utils/text-utils';
import { KEYWORDS } from '../../constants';

/**
 * Handle document highlight request.
 * Returns all occurrences of the symbol at the given position.
 */
export function handleDocumentHighlight(
    document: TextDocument,
    position: Position
): DocumentHighlight[] {
    const word = getWordAtPosition(document, position);
    if (!word) return [];

    // Don't highlight keywords
    if (KEYWORDS.includes(word)) {
        return [];
    }

    const text = document.getText();
    const highlights: DocumentHighlight[] = [];

    // Find all occurrences using word boundary regex
    const regex = wordBoundaryRegex(word);
    let match;

    while ((match = regex.exec(text)) !== null) {
        const matchStart = match.index;
        const matchEnd = matchStart + word.length;

        // Skip if inside comment
        if (isInComment(text, matchStart)) {
            continue;
        }

        // Skip if inside non-interpolated string (single quotes)
        if (isInsideSingleQuoteString(text, matchStart)) {
            continue;
        }

        // Skip if inside double-quoted string but NOT in interpolation
        if (isInsideDoubleQuoteStringNonInterpolated(text, matchStart, word)) {
            continue;
        }

        const startPos = document.positionAt(matchStart);
        const endPos = document.positionAt(matchEnd);
        const kind = determineHighlightKind(text, matchStart, word);

        highlights.push({
            range: Range.create(startPos, endPos),
            kind,
        });
    }

    return highlights;
}

/**
 * Determine if the occurrence is a read or write.
 */
function determineHighlightKind(text: string, offset: number, word: string): DocumentHighlightKind {
    // Check for declaration patterns
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineBeforeWord = text.substring(lineStart, offset);

    // Variable declaration: var [type] name =
    if (/\bvar\s+(?:\w+\s+)?$/.test(lineBeforeWord)) {
        return DocumentHighlightKind.Write;
    }

    // Input/output declaration: input/output type name
    if (/\b(?:input|output)\s+\w+\s+$/.test(lineBeforeWord)) {
        return DocumentHighlightKind.Write;
    }

    // Function declaration: fun name(
    if (/\bfun\s+$/.test(lineBeforeWord)) {
        return DocumentHighlightKind.Write;
    }

    // Schema definition: schema Name
    if (/\bschema\s+$/.test(lineBeforeWord)) {
        return DocumentHighlightKind.Write;
    }

    // Type definition: type Name
    if (/\btype\s+$/.test(lineBeforeWord)) {
        return DocumentHighlightKind.Write;
    }

    // Component definition (not instance): component Name { - where Name is followed by {
    // vs Component instance: component TypeName instanceName { - where TypeName is Read, instanceName is Write
    if (/\bcomponent\s+$/.test(lineBeforeWord)) {
        // Check what comes after the word - if it's { directly, it's a definition (Write)
        // If there's another identifier, this is the type reference (Read)
        const afterWord = text.substring(offset + word.length);
        if (/^\s*\{/.test(afterWord)) {
            return DocumentHighlightKind.Write; // component Definition {}
        }
        return DocumentHighlightKind.Read; // component TypeRef instanceName {}
    }

    // Component instance name: component Type instanceName
    if (/\bcomponent\s+\w+(?:\.\w+)*\s+$/.test(lineBeforeWord)) {
        return DocumentHighlightKind.Write;
    }

    // Resource type is always a reference (Read), instance name is Write
    // resource TypeName instanceName {}
    if (/\bresource\s+$/.test(lineBeforeWord)) {
        return DocumentHighlightKind.Read; // Type reference
    }

    // Resource instance name: resource Type instanceName
    if (/\bresource\s+\w+(?:\.\w+)*\s+$/.test(lineBeforeWord)) {
        return DocumentHighlightKind.Write;
    }

    // For loop variable: for name in
    if (/\bfor\s+$/.test(lineBeforeWord)) {
        return DocumentHighlightKind.Write;
    }

    // Function parameter in declaration
    if (/\bfun\s+\w+\s*\([^)]*\b\w+\s+$/.test(lineBeforeWord)) {
        return DocumentHighlightKind.Write;
    }

    // Check for assignment after the word
    const afterWord = text.substring(offset + word.length);
    const assignmentMatch = afterWord.match(/^\s*(=|\+=|-=|\*=|\/=)/);

    if (assignmentMatch) {
        // Make sure it's not == or !=
        const op = assignmentMatch[1];
        if (op === '=' && afterWord.match(/^\s*==/)) {
            return DocumentHighlightKind.Read;
        }
        return DocumentHighlightKind.Write;
    }

    return DocumentHighlightKind.Read;
}

/**
 * Check if position is inside a single-quoted string (no interpolation).
 */
function isInsideSingleQuoteString(text: string, pos: number): boolean {
    let inSingleQuote = false;
    let i = 0;

    while (i < pos) {
        const char = text[i];

        // Skip escaped characters
        if (char === '\\' && i + 1 < text.length) {
            i += 2;
            continue;
        }

        if (char === "'") {
            inSingleQuote = !inSingleQuote;
        }

        // Reset on newline (strings don't span lines in Kite)
        if (char === '\n') {
            inSingleQuote = false;
        }

        i++;
    }

    return inSingleQuote;
}

/**
 * Check if position is inside a double-quoted string but NOT in interpolation.
 * Interpolation like ${var} or $var should still be highlighted.
 */
function isInsideDoubleQuoteStringNonInterpolated(text: string, pos: number, word: string): boolean {
    let inDoubleQuote = false;
    let i = 0;

    while (i < pos) {
        const char = text[i];

        // Skip escaped characters
        if (char === '\\' && i + 1 < text.length) {
            i += 2;
            continue;
        }

        if (char === '"') {
            inDoubleQuote = !inDoubleQuote;
        }

        // Reset on newline
        if (char === '\n') {
            inDoubleQuote = false;
        }

        i++;
    }

    if (!inDoubleQuote) {
        return false;
    }

    // We're inside a double quote string - check if this is an interpolation
    // Check for ${word} pattern - look backwards for ${
    const beforePos = text.substring(Math.max(0, pos - 10), pos);
    if (/\$\{$/.test(beforePos) || /\$\{\s*$/.test(beforePos)) {
        return false; // It's inside ${...} interpolation
    }

    // Check for $word pattern - look for $ immediately before
    if (pos > 0 && text[pos - 1] === '$') {
        return false; // It's a simple $var interpolation
    }

    return true;
}
