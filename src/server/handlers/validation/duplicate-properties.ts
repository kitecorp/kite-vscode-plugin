/**
 * Duplicate property detection for the Kite language server.
 * Reports errors when property names are duplicated in schemas or resources.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment } from '../../utils/text-utils';

/**
 * Check for duplicate property names in schemas and resources.
 */
export function checkDuplicateProperties(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Check schema definitions
    checkSchemaProperties(text, document, diagnostics);

    // Check resource instances
    checkResourceProperties(text, document, diagnostics);

    // Check component instances
    checkComponentInstanceProperties(text, document, diagnostics);

    return diagnostics;
}

/**
 * Check for duplicate property names in schema definitions.
 */
function checkSchemaProperties(text: string, document: TextDocument, diagnostics: Diagnostic[]): void {
    const schemaRegex = /\bschema\s+([\w.]+)\s*\{/g;
    let schemaMatch;

    while ((schemaMatch = schemaRegex.exec(text)) !== null) {
        if (isInComment(text, schemaMatch.index)) continue;

        const schemaName = schemaMatch[1];
        const braceStart = schemaMatch.index + schemaMatch[0].length - 1;
        const braceEnd = findMatchingBrace(text, braceStart);

        if (braceEnd === -1) continue;

        const bodyText = text.substring(braceStart + 1, braceEnd);
        const bodyOffset = braceStart + 1;

        // Find property definitions: type name or type[] name
        const propRegex = /\b(?:string|number|boolean|any|object|void|[A-Z]\w*)(?:\[\])?\s+(\w+)/g;
        let propMatch;

        const seenProperties = new Map<string, number>(); // name -> first occurrence offset

        while ((propMatch = propRegex.exec(bodyText)) !== null) {
            const propName = propMatch[1];
            const propNameOffset = bodyOffset + propMatch.index + propMatch[0].lastIndexOf(propName);

            if (seenProperties.has(propName)) {
                // Duplicate found - report error on second occurrence
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: Range.create(
                        document.positionAt(propNameOffset),
                        document.positionAt(propNameOffset + propName.length)
                    ),
                    message: `Duplicate property '${propName}' in schema '${schemaName}'`,
                    source: 'kite'
                });
            } else {
                seenProperties.set(propName, propNameOffset);
            }
        }
    }
}

/**
 * Check for duplicate property assignments in resource instances.
 */
function checkResourceProperties(text: string, document: TextDocument, diagnostics: Diagnostic[]): void {
    const resourceRegex = /\bresource\s+[\w.]+\s+\w+\s*\{/g;
    let resourceMatch;

    while ((resourceMatch = resourceRegex.exec(text)) !== null) {
        if (isInComment(text, resourceMatch.index)) continue;

        const braceStart = resourceMatch.index + resourceMatch[0].length - 1;
        const braceEnd = findMatchingBrace(text, braceStart);

        if (braceEnd === -1) continue;

        const bodyText = text.substring(braceStart + 1, braceEnd);
        const bodyOffset = braceStart + 1;

        checkPropertyAssignments(bodyText, bodyOffset, document, diagnostics);
    }
}

/**
 * Check for duplicate property assignments in component instances.
 */
function checkComponentInstanceProperties(text: string, document: TextDocument, diagnostics: Diagnostic[]): void {
    // Match component instantiation: component TypeName instanceName {
    const compRegex = /\bcomponent\s+(\w+)\s+(\w+)\s*\{/g;
    let compMatch;

    while ((compMatch = compRegex.exec(text)) !== null) {
        if (isInComment(text, compMatch.index)) continue;

        // Check if this is an instantiation (has instance name) not a definition
        // Definition: component Name { input/output/var... }
        // Instantiation: component TypeName instanceName { prop = value... }
        const braceStart = compMatch.index + compMatch[0].length - 1;
        const braceEnd = findMatchingBrace(text, braceStart);

        if (braceEnd === -1) continue;

        const bodyText = text.substring(braceStart + 1, braceEnd);

        // If body contains 'input' or 'output' keywords, it's a definition not instantiation
        if (/\b(input|output)\s+\w+/.test(bodyText)) continue;

        const bodyOffset = braceStart + 1;
        checkPropertyAssignments(bodyText, bodyOffset, document, diagnostics);
    }
}

/**
 * Check for duplicate property assignments in a body.
 */
function checkPropertyAssignments(
    bodyText: string,
    bodyOffset: number,
    document: TextDocument,
    diagnostics: Diagnostic[]
): void {
    // Match property assignments: name = value
    const assignRegex = /\b(\w+)\s*=/g;
    let assignMatch;

    const seenProperties = new Map<string, number>();

    while ((assignMatch = assignRegex.exec(bodyText)) !== null) {
        const propName = assignMatch[1];
        const propNameOffset = bodyOffset + assignMatch.index;

        if (seenProperties.has(propName)) {
            // Duplicate found
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: Range.create(
                    document.positionAt(propNameOffset),
                    document.positionAt(propNameOffset + propName.length)
                ),
                message: `Duplicate property '${propName}' assignment`,
                source: 'kite'
            });
        } else {
            seenProperties.set(propName, propNameOffset);
        }
    }
}

/**
 * Find matching closing brace for an opening brace.
 */
function findMatchingBrace(text: string, startPos: number): number {
    if (text[startPos] !== '{') return -1;

    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = startPos; i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        // Handle string literals
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

        if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }

    return -1;
}
