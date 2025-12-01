/**
 * Invalid string interpolation detection for the Kite language server.
 * Reports errors when a string has unclosed ${...} interpolation.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Check for invalid string interpolation (unclosed ${)
 */
export function checkInvalidStringInterpolation(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    let i = 0;
    let inComment = false;
    let inBlockComment = false;

    while (i < text.length) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        // Handle block comments
        if (!inComment && char === '*' && prevChar === '/') {
            inBlockComment = true;
            i++;
            continue;
        }
        if (inBlockComment && char === '/' && prevChar === '*') {
            inBlockComment = false;
            i++;
            continue;
        }
        if (inBlockComment) {
            i++;
            continue;
        }

        // Handle line comments
        if (char === '/' && text[i + 1] === '/') {
            inComment = true;
            i++;
            continue;
        }
        if (inComment && char === '\n') {
            inComment = false;
            i++;
            continue;
        }
        if (inComment) {
            i++;
            continue;
        }

        // Found start of double-quoted string (only these support interpolation)
        if (char === '"') {
            const stringStart = i;
            i++; // Move past opening quote

            // Scan the string looking for ${...}
            while (i < text.length && text[i] !== '"') {
                // Handle escape sequences
                if (text[i] === '\\' && i + 1 < text.length) {
                    i += 2; // Skip escaped character
                    continue;
                }

                // Found interpolation start
                if (text[i] === '$' && text[i + 1] === '{') {
                    const interpolationStart = i;
                    i += 2; // Move past ${

                    // Track brace depth for nested expressions
                    let braceDepth = 1;
                    let foundClose = false;

                    while (i < text.length && text[i] !== '"') {
                        if (text[i] === '{') {
                            braceDepth++;
                        } else if (text[i] === '}') {
                            braceDepth--;
                            if (braceDepth === 0) {
                                foundClose = true;
                                i++; // Move past closing }
                                break;
                            }
                        }
                        i++;
                    }

                    if (!foundClose) {
                        // Unclosed interpolation - either hit end of string or end of file
                        const startPos = document.positionAt(interpolationStart);
                        const endPos = document.positionAt(interpolationStart + 2);

                        diagnostics.push({
                            severity: DiagnosticSeverity.Error,
                            range: Range.create(startPos, endPos),
                            message: `Unclosed string interpolation '\${'`,
                            source: 'kite',
                        });
                    }
                    continue;
                }

                i++;
            }

            // Move past closing quote if found
            if (i < text.length && text[i] === '"') {
                i++;
            }
            continue;
        }

        // Skip single-quoted strings (no interpolation)
        if (char === "'") {
            i++; // Move past opening quote
            while (i < text.length && text[i] !== "'") {
                if (text[i] === '\\' && i + 1 < text.length) {
                    i += 2;
                    continue;
                }
                i++;
            }
            if (i < text.length) {
                i++; // Move past closing quote
            }
            continue;
        }

        i++;
    }

    return diagnostics;
}
