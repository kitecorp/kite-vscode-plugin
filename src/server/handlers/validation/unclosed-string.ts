/**
 * Unclosed string detection for the Kite language server.
 * Reports errors for string literals that are not properly closed.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment } from '../../utils/text-utils';

/**
 * Check for unclosed string literals
 */
export function checkUnclosedStrings(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    let lineOffset = 0;
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];

        // Track string state within the line
        let inString = false;
        let stringChar = '';
        let stringStart = -1;
        let i = 0;

        while (i < line.length) {
            // Skip line comments
            if (!inString && line[i] === '/' && line[i + 1] === '/') {
                break; // Rest of line is comment
            }

            // Check if in block comment (simplified - doesn't handle multi-line)
            if (isInComment(text, lineOffset + i)) {
                i++;
                continue;
            }

            const char = line[i];
            const prevChar = i > 0 ? line[i - 1] : '';

            if (!inString) {
                if (char === '"' || char === "'") {
                    inString = true;
                    stringChar = char;
                    stringStart = i;
                }
            } else {
                // Check for escape sequences
                if (char === stringChar && prevChar !== '\\') {
                    inString = false;
                    stringStart = -1;
                }
            }

            i++;
        }

        // If still in string at end of line, it's unclosed
        if (inString && stringStart >= 0) {
            const startPos = document.positionAt(lineOffset + stringStart);
            const endPos = document.positionAt(lineOffset + line.length);

            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: Range.create(startPos, endPos),
                message: 'Unclosed string literal',
                source: 'kite',
            });
        }

        lineOffset += line.length + 1; // +1 for newline
    }

    return diagnostics;
}
