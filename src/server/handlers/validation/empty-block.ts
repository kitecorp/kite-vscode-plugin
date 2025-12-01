/**
 * Empty block detection for the Kite language server.
 * Reports warnings for empty schema, component, or function bodies.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment } from '../../utils/text-utils';

/**
 * Check for empty block bodies
 */
export function checkEmptyBlocks(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Find schema definitions: schema Name { }
    checkEmptyDefinitions(text, document, diagnostics, /\bschema\s+(\w+)\s*\{/g, 'schema');

    // Find component definitions: component Name { } (single identifier)
    const componentRegex = /\bcomponent\s+(\w+)\s*\{/g;
    let match;
    while ((match = componentRegex.exec(text)) !== null) {
        if (isInComment(text, match.index)) continue;

        // Make sure it's a definition, not instantiation
        const beforeBrace = text.substring(match.index, match.index + match[0].length - 1).trim();
        const parts = beforeBrace.split(/\s+/);
        if (parts.length !== 2) continue; // Skip instantiations

        const braceStart = match.index + match[0].length - 1;
        const braceEnd = findMatchingBrace(text, braceStart);
        if (braceEnd === -1) continue;

        const bodyContent = text.substring(braceStart + 1, braceEnd).trim();
        // Remove comments from body content
        const withoutComments = bodyContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();

        if (withoutComments === '') {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(braceEnd + 1);

            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: Range.create(startPos, endPos),
                message: `Empty component '${match[1]}'`,
                source: 'kite',
            });
        }
    }

    // Find function definitions: fun name() { }
    checkEmptyDefinitions(text, document, diagnostics, /\bfun\s+(\w+)\s*\([^)]*\)(?:\s*\w+)?\s*\{/g, 'function');

    return diagnostics;
}

/**
 * Check for empty definitions of a specific type
 */
function checkEmptyDefinitions(
    text: string,
    document: TextDocument,
    diagnostics: Diagnostic[],
    regex: RegExp,
    kind: string
): void {
    let match;
    while ((match = regex.exec(text)) !== null) {
        if (isInComment(text, match.index)) continue;

        const braceStart = match.index + match[0].length - 1;
        const braceEnd = findMatchingBrace(text, braceStart);
        if (braceEnd === -1) continue;

        const bodyContent = text.substring(braceStart + 1, braceEnd).trim();
        // Remove comments from body content
        const withoutComments = bodyContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();

        if (withoutComments === '') {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(braceEnd + 1);

            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: Range.create(startPos, endPos),
                message: `Empty ${kind} '${match[1]}'`,
                source: 'kite',
            });
        }
    }
}

/**
 * Find the matching closing brace
 */
function findMatchingBrace(text: string, start: number): number {
    if (text[start] !== '{') return -1;

    let depth = 1;
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inBlockComment = false;

    for (let i = start + 1; i < text.length; i++) {
        const char = text[i];
        const prevChar = text[i - 1];

        // Handle block comments
        if (!inString && !inComment && char === '*' && prevChar === '/') {
            inBlockComment = true;
            continue;
        }
        if (inBlockComment && char === '/' && prevChar === '*') {
            inBlockComment = false;
            continue;
        }
        if (inBlockComment) continue;

        // Handle line comments
        if (!inString && char === '/' && text[i + 1] === '/') {
            inComment = true;
            continue;
        }
        if (inComment && char === '\n') {
            inComment = false;
            continue;
        }
        if (inComment) continue;

        // Handle strings
        if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
            continue;
        }
        if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
            continue;
        }
        if (inString) continue;

        // Count braces
        if (char === '{') depth++;
        if (char === '}') depth--;

        if (depth === 0) return i;
    }

    return -1;
}
