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

interface VariableInfo {
    name: string;
    kind: 'parameter' | 'variable';
    offset: number;
    length: number;
    functionOffset: number; // Track which function this belongs to
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

    // Check for duplicates in top-level declarations
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

    // Check for duplicate variables and parameters within functions
    const functionRegex = /\bfun\s+(\w+)\s*\(([^)]*)\)\s*(?:\w+)?\s*\{/g;
    let funcMatch;
    while ((funcMatch = functionRegex.exec(text)) !== null) {
        if (isInComment(text, funcMatch.index)) continue;

        const funcStart = funcMatch.index;
        const paramsStr = funcMatch[2].trim();
        const variables: VariableInfo[] = [];

        // Extract parameters
        if (paramsStr) {
            const params = paramsStr.split(',').map(p => p.trim()).filter(p => p);
            for (const param of params) {
                const paramMatch = param.match(/^(\w+)(\[\])?\s+(\w+)$/);
                if (paramMatch) {
                    const paramName = paramMatch[3];
                    const paramStartInParams = paramsStr.indexOf(param);
                    const nameStartInParam = param.lastIndexOf(paramName);
                    const nameOffset = funcStart + funcMatch[0].indexOf('(') + 1 + paramStartInParams + nameStartInParam;

                    variables.push({
                        name: paramName,
                        kind: 'parameter',
                        offset: nameOffset,
                        length: paramName.length,
                        functionOffset: funcStart,
                    });
                }
            }
        }

        // Find the function body
        const braceStart = funcMatch.index + funcMatch[0].indexOf('{');
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        const braceEnd = pos;
        const bodyText = text.substring(braceStart + 1, braceEnd - 1);
        const bodyOffset = braceStart + 1;

        // Extract variable declarations (only at function level, not nested blocks)
        // Match: var [type] name =
        const varRegex = /\bvar\s+(?:(\w+)(\[\])?\s+)?(\w+)\s*=/g;
        let varMatch;
        while ((varMatch = varRegex.exec(bodyText)) !== null) {
            const varName = varMatch[3];
            const nameOffset = bodyOffset + varMatch.index + varMatch[0].lastIndexOf(varName);

            variables.push({
                name: varName,
                kind: 'variable',
                offset: nameOffset,
                length: varName.length,
                functionOffset: funcStart,
            });
        }

        // Check for duplicates within this function
        const seenInFunction = new Map<string, VariableInfo>();
        for (const variable of variables) {
            const existing = seenInFunction.get(variable.name);
            if (existing) {
                const startPos = document.positionAt(variable.offset);
                const endPos = document.positionAt(variable.offset + variable.length);

                let message: string;
                if (existing.kind === 'parameter' && variable.kind === 'variable') {
                    message = `Variable '${variable.name}' is already declared as parameter`;
                } else if (existing.kind === 'variable' && variable.kind === 'variable') {
                    message = `Duplicate variable '${variable.name}'`;
                } else {
                    message = `Duplicate declaration '${variable.name}'`;
                }

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: Range.create(startPos, endPos),
                    message,
                    source: 'kite',
                });
            } else {
                seenInFunction.set(variable.name, variable);
            }
        }
    }

    return diagnostics;
}
