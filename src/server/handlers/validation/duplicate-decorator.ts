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
    const lines = text.split('\n');

    // Find declarations that can have decorators
    const declarationKeywords = ['schema', 'component', 'resource', 'fun', 'input', 'output', 'var'];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Check if this line starts a declaration (possibly after decorators on same line)
        const lineWithoutDecorators = line.replace(/@\w+(?:\([^)]*\))?\s*/g, '');
        const startsDeclaration = declarationKeywords.some(
            kw => lineWithoutDecorators.startsWith(kw + ' ') || lineWithoutDecorators.startsWith(kw + '\t')
        );

        if (!startsDeclaration) continue;

        // Calculate line offset
        const lineOffset = lines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
        if (isInComment(text, lineOffset)) continue;

        // Collect all decorators for this declaration
        // Look at current line and preceding lines that are decorators
        const decoratorPositions: { name: string; offset: number; length: number }[] = [];

        // Check decorators on same line (before the declaration keyword)
        const sameLineDecoratorRegex = /@(\w+)(?:\([^)]*\))?/g;
        let sameLineMatch;
        const currentLineStart = lineOffset;
        while ((sameLineMatch = sameLineDecoratorRegex.exec(lines[i])) !== null) {
            // Stop if we've reached the declaration keyword
            const matchEnd = sameLineMatch.index + sameLineMatch[0].length;
            if (matchEnd > lines[i].indexOf(lineWithoutDecorators.split(/\s/)[0])) break;

            decoratorPositions.push({
                name: sameLineMatch[1],
                offset: currentLineStart + sameLineMatch.index,
                length: sameLineMatch[0].length,
            });
        }

        // Look backward for decorator lines
        let j = i - 1;
        while (j >= 0) {
            const prevLine = lines[j].trim();
            // Stop if empty line or not a decorator line
            if (!prevLine || !prevLine.startsWith('@')) break;

            const prevLineOffset = lines.slice(0, j).join('\n').length + (j > 0 ? 1 : 0);
            const decoratorRegex = /@(\w+)(?:\([^)]*\))?/g;
            let decoratorMatch;

            while ((decoratorMatch = decoratorRegex.exec(lines[j])) !== null) {
                decoratorPositions.push({
                    name: decoratorMatch[1],
                    offset: prevLineOffset + decoratorMatch.index,
                    length: decoratorMatch[0].length,
                });
            }
            j--;
        }

        // Find duplicates
        const seenDecorators = new Map<string, boolean>();
        for (const dec of decoratorPositions) {
            if (seenDecorators.has(dec.name)) {
                const startPos = document.positionAt(dec.offset);
                const endPos = document.positionAt(dec.offset + dec.length);

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: Range.create(startPos, endPos),
                    message: `Duplicate decorator '@${dec.name}'`,
                    source: 'kite',
                });
            } else {
                seenDecorators.set(dec.name, true);
            }
        }
    }

    return diagnostics;
}
