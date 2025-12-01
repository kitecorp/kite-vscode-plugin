/**
 * Variable shadowing detection for the Kite language server.
 * Reports warnings when an inner variable shadows an outer variable.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment } from '../../utils/text-utils';

interface VariableDecl {
    name: string;
    offset: number;
    length: number;
    depth: number;
}

/**
 * Check for variable shadowing
 */
export function checkVariableShadowing(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Find all variable declarations with their scope depth
    const variables: VariableDecl[] = [];

    // Track brace depth
    let depth = 0;
    let i = 0;
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inBlockComment = false;

    while (i < text.length) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        // Handle comments
        if (!inString && !inComment && char === '*' && prevChar === '/') {
            inBlockComment = true;
            i++;
            continue;
        }
        if (inBlockComment && char === '/' && prevChar === '*') {
            inBlockComment = false;
            i++;
            continue;
        }
        if (inBlockComment) { i++; continue; }

        if (!inString && char === '/' && text[i + 1] === '/') {
            inComment = true;
            i++;
            continue;
        }
        if (inComment && char === '\n') {
            inComment = false;
            i++;
            continue;
        }
        if (inComment) { i++; continue; }

        // Handle strings
        if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
            i++;
            continue;
        }
        if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
            i++;
            continue;
        }
        if (inString) { i++; continue; }

        // Track depth
        if (char === '{') depth++;
        if (char === '}') depth--;

        // Look for variable declarations: var name or var type name
        if (text.substring(i).match(/^\bvar\s/)) {
            const varMatch = text.substring(i).match(/^\bvar\s+(?:(\w+)\s+)?(\w+)\s*=/);
            if (varMatch) {
                const varName = varMatch[2];
                const nameOffset = i + varMatch[0].lastIndexOf(varName);

                variables.push({
                    name: varName,
                    offset: nameOffset,
                    length: varName.length,
                    depth,
                });
            }
        }

        // Look for for loop variables: for item in or for (item in
        if (text.substring(i).match(/^\bfor\s*\(?\s*(\w+)\s+in\b/)) {
            const forMatch = text.substring(i).match(/^\bfor\s*\(?\s*(\w+)\s+in\b/);
            if (forMatch) {
                const loopVar = forMatch[1];
                const nameOffset = i + forMatch[0].indexOf(loopVar);

                variables.push({
                    name: loopVar,
                    offset: nameOffset,
                    length: loopVar.length,
                    depth: depth + 1, // Loop var is inside the loop block
                });
            }
        }

        // Look for function parameters
        if (text.substring(i).match(/^\bfun\s+\w+\s*\(/)) {
            const funcMatch = text.substring(i).match(/^\bfun\s+\w+\s*\(([^)]*)\)/);
            if (funcMatch && funcMatch[1]) {
                const params = funcMatch[1].split(',');
                for (const param of params) {
                    const paramMatch = param.trim().match(/^(\w+)(?:\[\])?\s+(\w+)$/);
                    if (paramMatch) {
                        const paramName = paramMatch[2];
                        const paramOffset = i + funcMatch[0].indexOf(paramName);

                        variables.push({
                            name: paramName,
                            offset: paramOffset,
                            length: paramName.length,
                            depth: depth + 1, // Function params are inside function
                        });
                    }
                }
            }
        }

        i++;
    }

    // Check for shadowing: later declarations at higher depth shadow earlier ones
    for (let j = 0; j < variables.length; j++) {
        const current = variables[j];

        // Check if any earlier variable with same name at lower depth
        for (let k = 0; k < j; k++) {
            const earlier = variables[k];

            if (earlier.name === current.name && current.depth > earlier.depth) {
                const startPos = document.positionAt(current.offset);
                const endPos = document.positionAt(current.offset + current.length);

                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: Range.create(startPos, endPos),
                    message: `Variable '${current.name}' shadows outer variable`,
                    source: 'kite',
                });
                break; // Only report once per variable
            }
        }
    }

    return diagnostics;
}
