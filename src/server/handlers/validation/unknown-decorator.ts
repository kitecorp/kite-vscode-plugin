/**
 * Unknown decorator detection for the Kite language server.
 * Reports warnings when using decorators that are not recognized.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DECORATORS } from '../../constants';
import { isInComment, isInString } from '../../utils/text-utils';

/** Set of known decorator names */
const KNOWN_DECORATORS = new Set(DECORATORS.map(d => d.name));

/**
 * Check for unknown decorator names
 */
export function checkUnknownDecorators(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match decorator usages: @name or @name(...)
    const decoratorRegex = /@(\w+)/g;

    let match;
    while ((match = decoratorRegex.exec(text)) !== null) {
        const offset = match.index;

        // Skip if in comment or string
        if (isInComment(text, offset)) continue;
        if (isInString(text, offset)) continue;

        const decoratorName = match[1];

        if (!KNOWN_DECORATORS.has(decoratorName)) {
            const startPos = document.positionAt(offset);
            const endPos = document.positionAt(offset + match[0].length);

            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: Range.create(startPos, endPos),
                message: `Unknown decorator '@${decoratorName}'`,
                source: 'kite',
            });
        }
    }

    return diagnostics;
}
