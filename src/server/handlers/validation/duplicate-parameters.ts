/**
 * Duplicate parameter detection for the Kite language server.
 * Reports errors when function parameters have duplicate names.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment } from '../../utils/text-utils';

/**
 * Check for duplicate parameter names in function declarations
 */
export function checkDuplicateParameters(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match function declarations: fun name(params) or fun name(params) returnType
    const funcRegex = /\bfun\s+(\w+)\s*\(([^)]*)\)/g;

    let match;
    while ((match = funcRegex.exec(text)) !== null) {
        const funcStart = match.index;

        // Skip if in comment
        if (isInComment(text, funcStart)) continue;

        const paramsStr = match[2].trim();
        if (!paramsStr) continue; // No parameters

        // Parse parameters: type name, type name, ...
        const params = paramsStr.split(',').map(p => p.trim()).filter(p => p);
        const seenNames = new Map<string, number>(); // name -> first occurrence offset

        for (const param of params) {
            // Parameter format: type name or type[] name
            const paramMatch = param.match(/^(\w+)(\[\])?\s+(\w+)$/);
            if (!paramMatch) continue;

            const paramName = paramMatch[3];

            // Find the position of this parameter name in the original text
            const paramStartInParams = paramsStr.indexOf(param);
            const nameStartInParam = param.lastIndexOf(paramName);
            const nameOffset = funcStart + match[0].indexOf('(') + 1 + paramStartInParams + nameStartInParam;

            if (seenNames.has(paramName)) {
                const startPos = document.positionAt(nameOffset);
                const endPos = document.positionAt(nameOffset + paramName.length);

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: Range.create(startPos, endPos),
                    message: `Duplicate parameter '${paramName}'`,
                    source: 'kite',
                });
            } else {
                seenNames.set(paramName, nameOffset);
            }
        }
    }

    return diagnostics;
}
