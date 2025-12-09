/**
 * Validation for indexed resource access.
 *
 * Checks that:
 * - Indexed access is only used on indexed resources
 * - Index type matches (numeric for @count/ranges, string for array loops)
 * - Numeric indices are within bounds (when known)
 * - String keys are valid (when known)
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Declaration } from '../../types';
import {
    parseIndexedAccess,
    validateIndexedAccess,
    isIndexedResource,
    IndexedAccessInfo,
} from '../../utils/indexed-resources';

/**
 * Check for invalid indexed resource access.
 *
 * @param document The document to check
 * @param declarations Declarations from the document
 * @returns Array of diagnostics
 */
export function checkIndexedAccess(
    document: TextDocument,
    declarations: Declaration[]
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Find all indexed access patterns: identifier[index]
    // Matches: name[0], name[123], name["key"], name['key']
    const indexedAccessRegex = /\b(\w+)\[(\d+|"[^"]*"|'[^']*')\]/g;
    let match;

    while ((match = indexedAccessRegex.exec(text)) !== null) {
        const baseName = match[1];
        const indexStr = match[2];
        const fullMatch = match[0];
        const matchStart = match.index;

        // Skip if inside a comment
        if (isInComment(text, matchStart)) continue;

        // Skip if inside a string
        if (isInString(text, matchStart)) continue;

        // Find the declaration
        const decl = declarations.find(d => d.name === baseName);
        if (!decl) {
            // Unknown identifier - handled by undefined-symbols check
            continue;
        }

        // Determine the index type and value
        let accessInfo: IndexedAccessInfo;
        if (/^\d+$/.test(indexStr)) {
            accessInfo = {
                baseName,
                indexType: 'numeric',
                numericIndex: parseInt(indexStr, 10),
                fullText: fullMatch,
            };
        } else {
            // String key - remove quotes
            const key = indexStr.slice(1, -1);
            accessInfo = {
                baseName,
                indexType: 'string',
                stringKey: key,
                fullText: fullMatch,
            };
        }

        // Validate the indexed access
        const error = validateIndexedAccess(accessInfo, decl);
        if (error) {
            const startPos = document.positionAt(matchStart);
            const endPos = document.positionAt(matchStart + fullMatch.length);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: Range.create(startPos, endPos),
                message: error,
                source: 'kite'
            });
        }
    }

    return diagnostics;
}

/**
 * Check if offset is inside a comment
 */
function isInComment(text: string, offset: number): boolean {
    // Check for line comment
    const lineStart = text.lastIndexOf('\n', offset) + 1;
    const lineUpToOffset = text.substring(lineStart, offset);
    if (lineUpToOffset.includes('//')) {
        return true;
    }

    // Check for block comment
    const beforeOffset = text.substring(0, offset);
    const lastBlockStart = beforeOffset.lastIndexOf('/*');
    if (lastBlockStart !== -1) {
        const lastBlockEnd = beforeOffset.lastIndexOf('*/');
        if (lastBlockEnd < lastBlockStart) {
            return true;
        }
    }

    return false;
}

/**
 * Check if offset is inside a string literal
 */
function isInString(text: string, offset: number): boolean {
    // Simple check: count unescaped quotes before offset
    let inDouble = false;
    let inSingle = false;
    let i = 0;

    while (i < offset) {
        const char = text[i];
        if (char === '\\' && i + 1 < offset) {
            // Skip escaped character
            i += 2;
            continue;
        }
        if (char === '"' && !inSingle) {
            inDouble = !inDouble;
        } else if (char === "'" && !inDouble) {
            inSingle = !inSingle;
        }
        i++;
    }

    return inDouble || inSingle;
}
