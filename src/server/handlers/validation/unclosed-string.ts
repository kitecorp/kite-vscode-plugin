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
 * Now supports multiline strings - only reports error if string is never closed
 */
export function checkUnclosedStrings(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    let inString = false;
    let stringChar = '';
    let stringStart = -1;
    let inComment = false;
    let inBlockComment = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';
        const nextChar = i < text.length - 1 ? text[i + 1] : '';

        // Handle block comments
        if (!inString && char === '/' && nextChar === '*') {
            inBlockComment = true;
            i++; // Skip the *
            continue;
        }
        if (inBlockComment && char === '*' && nextChar === '/') {
            inBlockComment = false;
            i++; // Skip the /
            continue;
        }
        if (inBlockComment) continue;

        // Handle line comments
        if (!inString && char === '/' && nextChar === '/') {
            inComment = true;
            continue;
        }
        if (inComment && char === '\n') {
            inComment = false;
            continue;
        }
        if (inComment) continue;

        // Handle strings
        if (!inString) {
            if (char === '"' || char === "'") {
                inString = true;
                stringChar = char;
                stringStart = i;
            }
        } else {
            // Check for string end (not escaped)
            if (char === stringChar && prevChar !== '\\') {
                inString = false;
                stringStart = -1;
            }
        }
    }

    // If still in string at end of document, it's unclosed
    if (inString && stringStart >= 0) {
        const startPos = document.positionAt(stringStart);
        const endPos = document.positionAt(text.length);

        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: Range.create(startPos, endPos),
            message: 'Unclosed string literal',
            source: 'kite',
        });
    }

    return diagnostics;
}
