/**
 * Reserved name validation for the Kite language server.
 * Reports errors when keywords or type names are used as property/variable names.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment } from '../../utils/text-utils';

/** Built-in types that cannot be used as names */
const BUILTIN_TYPES = new Set([
    'string', 'number', 'boolean', 'any', 'object', 'void', 'null',
]);

/** Keywords that cannot be used as names */
const KEYWORDS = new Set([
    'if', 'else', 'for', 'while', 'in', 'return',
    'var', 'fun', 'schema', 'component', 'resource',
    'input', 'output', 'type', 'import', 'from', 'init', 'this',
    'true', 'false',
]);

/** All reserved names */
const RESERVED_NAMES = new Set([...BUILTIN_TYPES, ...KEYWORDS]);

/**
 * Check for reserved names used as property/variable names
 */
export function checkReservedNames(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Check schema property names: type NAME inside schema { }
    checkSchemaPropertyNames(text, document, diagnostics);

    // Check component input/output names: input type NAME, output type NAME
    checkComponentIONames(text, document, diagnostics);

    return diagnostics;
}

/**
 * Check schema property names for reserved words
 */
function checkSchemaPropertyNames(text: string, document: TextDocument, diagnostics: Diagnostic[]): void {
    // Find schema bodies
    const schemaRegex = /\bschema\s+[\w.]+\s*\{/g;
    let schemaMatch;

    while ((schemaMatch = schemaRegex.exec(text)) !== null) {
        if (isInComment(text, schemaMatch.index)) continue;

        const braceStart = schemaMatch.index + schemaMatch[0].length - 1;
        const braceEnd = findMatchingBrace(text, braceStart);
        if (braceEnd === -1) continue;

        const bodyText = text.substring(braceStart + 1, braceEnd);
        const bodyOffset = braceStart + 1;

        // Find property definitions: type name or type[] name
        const propRegex = /\b(?:string|number|boolean|any|object|void|[A-Z]\w*)(\[\])?\s+(\w+)/g;
        let propMatch;

        while ((propMatch = propRegex.exec(bodyText)) !== null) {
            // Skip if this match is inside a comment
            const matchAbsoluteOffset = bodyOffset + propMatch.index;
            if (isInComment(text, matchAbsoluteOffset)) continue;

            const propName = propMatch[2];
            const nameOffset = bodyOffset + propMatch.index + propMatch[0].lastIndexOf(propName);

            if (RESERVED_NAMES.has(propName)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: Range.create(
                        document.positionAt(nameOffset),
                        document.positionAt(nameOffset + propName.length)
                    ),
                    message: `'${propName}' is a reserved word and cannot be used as a property name`,
                    source: 'kite'
                });
            }
        }
    }
}

/**
 * Check component input/output names for reserved words
 */
function checkComponentIONames(text: string, document: TextDocument, diagnostics: Diagnostic[]): void {
    // Find component definition bodies (not instantiations)
    const compRegex = /\bcomponent\s+(\w+)\s*\{/g;
    let compMatch;

    while ((compMatch = compRegex.exec(text)) !== null) {
        if (isInComment(text, compMatch.index)) continue;

        // Check if this is a definition (not instantiation)
        const beforeBrace = text.substring(compMatch.index, compMatch.index + compMatch[0].length - 1).trim();
        const parts = beforeBrace.split(/\s+/);
        if (parts.length !== 2) continue; // Instantiation has 3+ parts

        const braceStart = compMatch.index + compMatch[0].length - 1;
        const braceEnd = findMatchingBrace(text, braceStart);
        if (braceEnd === -1) continue;

        const bodyText = text.substring(braceStart + 1, braceEnd);
        const bodyOffset = braceStart + 1;

        // Find input/output declarations: input type name, output type name
        const ioRegex = /\b(input|output)\s+(?:string|number|boolean|any|object|void|\w+)(\[\])?\s+(\w+)/g;
        let ioMatch;

        while ((ioMatch = ioRegex.exec(bodyText)) !== null) {
            // Skip if this match is inside a comment
            const matchAbsoluteOffset = bodyOffset + ioMatch.index;
            if (isInComment(text, matchAbsoluteOffset)) continue;

            const ioName = ioMatch[3];
            const nameOffset = bodyOffset + ioMatch.index + ioMatch[0].lastIndexOf(ioName);

            if (RESERVED_NAMES.has(ioName)) {
                const ioType = ioMatch[1]; // 'input' or 'output'
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: Range.create(
                        document.positionAt(nameOffset),
                        document.positionAt(nameOffset + ioName.length)
                    ),
                    message: `'${ioName}' is a reserved word and cannot be used as an ${ioType} name`,
                    source: 'kite'
                });
            }
        }
    }
}

/**
 * Find matching closing brace
 */
function findMatchingBrace(text: string, startPos: number): number {
    if (text[startPos] !== '{') return -1;

    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = startPos; i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        if ((char === '"' || char === "'") && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
            continue;
        }

        if (inString) continue;

        if (char === '{') depth++;
        else if (char === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }

    return -1;
}
