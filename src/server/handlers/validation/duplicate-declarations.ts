/**
 * Duplicate top-level declaration detection for the Kite language server.
 * Reports errors when schemas, components, functions, or types have duplicate names.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment } from '../../utils/text-utils';

interface DeclarationInfo {
    name: string;
    kind: 'schema' | 'component' | 'function' | 'type';
    offset: number;
    nameOffset: number;
    length: number;
}

/**
 * Check for duplicate top-level declaration names
 */
export function checkDuplicateDeclarations(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const declarations: DeclarationInfo[] = [];

    // Find all schemas: schema Name {
    const schemaRegex = /\bschema\s+(\w+)\s*\{/g;
    let match;
    while ((match = schemaRegex.exec(text)) !== null) {
        if (isInComment(text, match.index)) continue;
        const nameOffset = match.index + match[0].indexOf(match[1]);
        declarations.push({
            name: match[1],
            kind: 'schema',
            offset: match.index,
            nameOffset,
            length: match[1].length,
        });
    }

    // Find all component definitions: component Name { (single identifier before {)
    const componentRegex = /\bcomponent\s+(\w+)\s*\{/g;
    while ((match = componentRegex.exec(text)) !== null) {
        if (isInComment(text, match.index)) continue;
        // Make sure it's a definition (single name), not instantiation (Type name)
        const beforeBrace = text.substring(match.index, match.index + match[0].length - 1).trim();
        const parts = beforeBrace.split(/\s+/);
        if (parts.length === 2) { // "component Name"
            const nameOffset = match.index + match[0].indexOf(match[1]);
            declarations.push({
                name: match[1],
                kind: 'component',
                offset: match.index,
                nameOffset,
                length: match[1].length,
            });
        }
    }

    // Find all functions: fun name(
    const funcRegex = /\bfun\s+(\w+)\s*\(/g;
    while ((match = funcRegex.exec(text)) !== null) {
        if (isInComment(text, match.index)) continue;
        const nameOffset = match.index + match[0].indexOf(match[1]);
        declarations.push({
            name: match[1],
            kind: 'function',
            offset: match.index,
            nameOffset,
            length: match[1].length,
        });
    }

    // Find all type aliases: type Name =
    const typeRegex = /\btype\s+(\w+)\s*=/g;
    while ((match = typeRegex.exec(text)) !== null) {
        if (isInComment(text, match.index)) continue;
        const nameOffset = match.index + match[0].indexOf(match[1]);
        declarations.push({
            name: match[1],
            kind: 'type',
            offset: match.index,
            nameOffset,
            length: match[1].length,
        });
    }

    // Check for duplicates
    const seen = new Map<string, DeclarationInfo>();
    for (const decl of declarations) {
        const existing = seen.get(decl.name);
        if (existing) {
            const startPos = document.positionAt(decl.nameOffset);
            const endPos = document.positionAt(decl.nameOffset + decl.length);

            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: Range.create(startPos, endPos),
                message: `Duplicate ${decl.kind} '${decl.name}' (first defined as ${existing.kind})`,
                source: 'kite',
            });
        } else {
            seen.set(decl.name, decl);
        }
    }

    return diagnostics;
}
