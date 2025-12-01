/**
 * Duplicate decorator detection for the Kite language server.
 * Reports errors when the same decorator is applied multiple times to one declaration.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment } from '../../utils/text-utils';

/**
 * Check for duplicate decorators on the same declaration
 */
export function checkDuplicateDecorators(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Find declarations that can have decorators
    // Decorators appear on lines before: schema, component, resource, fun, input, output, var
    const declarationRegex = /^[ \t]*(?:@\w+(?:\([^)]*\))?[ \t]*\n)*[ \t]*(schema|component|resource|fun|input|output|var)\b/gm;

    let match;
    while ((match = declarationRegex.exec(text)) !== null) {
        const blockStart = match.index;
        const blockText = match[0];

        // Skip if in comment
        if (isInComment(text, blockStart)) continue;

        // Find all decorators in this block
        const decoratorRegex = /@(\w+)/g;
        const seenDecorators = new Map<string, number>(); // name -> first offset

        let decoratorMatch;
        while ((decoratorMatch = decoratorRegex.exec(blockText)) !== null) {
            const decoratorName = decoratorMatch[1];
            const decoratorOffset = blockStart + decoratorMatch.index;

            if (seenDecorators.has(decoratorName)) {
                const startPos = document.positionAt(decoratorOffset);
                const endPos = document.positionAt(decoratorOffset + decoratorMatch[0].length);

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: Range.create(startPos, endPos),
                    message: `Duplicate decorator '@${decoratorName}'`,
                    source: 'kite',
                });
            } else {
                seenDecorators.set(decoratorName, decoratorOffset);
            }
        }
    }

    return diagnostics;
}
