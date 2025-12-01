/**
 * Invalid number literal detection for the Kite language server.
 * Reports errors for malformed number literals.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment, isInString } from '../../utils/text-utils';

/**
 * Check for invalid number literals
 */
export function checkInvalidNumbers(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match potential malformed numbers: multiple dots, trailing dots, leading dots
    // Valid: 123, 12.34, 0.5, .5 (maybe)
    // Invalid: 1.2.3, 12., 1..2

    // Pattern for numbers with multiple decimal points
    const multiDotRegex = /\b(\d+\.(?:\d*\.)+\d*)\b/g;
    let match;
    while ((match = multiDotRegex.exec(text)) !== null) {
        if (isInComment(text, match.index)) continue;
        if (isInString(text, match.index)) continue;

        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[1].length);

        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: Range.create(startPos, endPos),
            message: `Invalid number literal '${match[1]}'`,
            source: 'kite',
        });
    }

    // Pattern for trailing decimal point: 123.
    const trailingDotRegex = /\b(\d+)\.\s*(?=[^0-9]|$)/g;
    while ((match = trailingDotRegex.exec(text)) !== null) {
        if (isInComment(text, match.index)) continue;
        if (isInString(text, match.index)) continue;

        // Check it's not followed by a digit and not a property access
        const afterDot = text.substring(match.index + match[0].length - 1).trim();
        if (/^\d/.test(afterDot)) continue; // Has digits after, it's valid
        if (/^[a-zA-Z_]/.test(afterDot)) continue; // Property access like 123.toString

        const numWithDot = match[1] + '.';
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + numWithDot.length);

        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: Range.create(startPos, endPos),
            message: `Invalid number literal '${numWithDot}' (trailing decimal point)`,
            source: 'kite',
        });
    }

    return diagnostics;
}
