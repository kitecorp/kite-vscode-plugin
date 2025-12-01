/**
 * Missing value detection for the Kite language server.
 * Reports errors when assignment has no value after '='.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment, isInString } from '../../utils/text-utils';

/**
 * Check for missing values after '=' in assignments
 */
export function checkMissingValues(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (trimmed === '' || trimmed.startsWith('//')) continue;

        // Find '=' in the line
        const equalsIndex = line.indexOf('=');
        if (equalsIndex === -1) continue;

        // Calculate offset for this position
        const lineStart = lines.slice(0, lineNum).join('\n').length + (lineNum > 0 ? 1 : 0);
        const equalsOffset = lineStart + equalsIndex;

        // Skip if in comment or string
        if (isInComment(text, equalsOffset)) continue;
        if (isInString(text, equalsOffset)) continue;

        // Skip compound assignments (==, !=, <=, >=, +=, -=, *=, /=)
        const charBefore = equalsIndex > 0 ? line[equalsIndex - 1] : '';
        const charAfter = equalsIndex < line.length - 1 ? line[equalsIndex + 1] : '';

        if (charBefore === '=' || charBefore === '!' || charBefore === '<' ||
            charBefore === '>' || charBefore === '+' || charBefore === '-' ||
            charBefore === '*' || charBefore === '/') {
            continue;
        }
        if (charAfter === '=') continue; // ==

        // Check what comes after '='
        const afterEquals = line.substring(equalsIndex + 1).trim();

        // If nothing after '=' or only whitespace until end of line/comment
        const afterWithoutComment = afterEquals.split('//')[0].trim();

        if (afterWithoutComment === '') {
            // Check if next non-empty line starts with something that could be a value
            // (multiline assignments are not typical in Kite, so flag this)
            const startPos = document.positionAt(equalsOffset);
            const endPos = document.positionAt(equalsOffset + 1);

            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: Range.create(startPos, endPos),
                message: 'Missing value after \'=\'',
                source: 'kite',
            });
        }
    }

    return diagnostics;
}
