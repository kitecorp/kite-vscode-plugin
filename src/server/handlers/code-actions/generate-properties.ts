/**
 * Generate missing properties code action for the Kite language server.
 * Provides quick fix to add required properties to resources and components.
 */

import {
    CodeAction,
    CodeActionKind,
    TextEdit,
    Range,
    Position,
    Diagnostic,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Data attached to missing property diagnostics
 */
export interface MissingPropertyData {
    type: 'missing-property';
    propertyName: string;
    propertyType: string;
    instanceType: 'resource' | 'component';
    braceOffset: number;
}

/**
 * Check if diagnostic data is missing property data
 */
export function isMissingPropertyData(data: unknown): data is MissingPropertyData {
    return (
        typeof data === 'object' &&
        data !== null &&
        'type' in data &&
        (data as MissingPropertyData).type === 'missing-property'
    );
}

/**
 * Get placeholder value for a given type
 */
function getPlaceholderValue(typeName: string): string {
    const normalizedType = typeName.toLowerCase();

    // Handle array types
    if (normalizedType.endsWith('[]')) {
        return '[]';
    }

    switch (normalizedType) {
        case 'string':
            return '""';
        case 'number':
            return '0';
        case 'boolean':
            return 'false';
        case 'object':
        case 'any':
            return '{}';
        default:
            // Custom types (schemas) - use null as placeholder
            return 'null';
    }
}

/**
 * Create a code action to generate missing properties
 */
export function createGenerateMissingPropertiesAction(
    document: TextDocument,
    diagnostics: Diagnostic[]
): CodeAction | null {
    // Filter diagnostics with missing property data
    const missingPropertyDiagnostics = diagnostics.filter(d => isMissingPropertyData(d.data));

    if (missingPropertyDiagnostics.length === 0) {
        return null;
    }

    // Group by brace offset (same resource/component instance)
    const byInstance = new Map<number, { diagnostic: Diagnostic; data: MissingPropertyData }[]>();

    for (const diagnostic of missingPropertyDiagnostics) {
        const data = diagnostic.data as MissingPropertyData;
        const key = data.braceOffset;

        if (!byInstance.has(key)) {
            byInstance.set(key, []);
        }
        byInstance.get(key)!.push({ diagnostic, data });
    }

    // For simplicity, handle the first instance group
    // (In practice, code actions are usually requested for a specific range)
    const firstGroup = byInstance.values().next().value;
    if (!firstGroup || firstGroup.length === 0) {
        return null;
    }

    const text = document.getText();
    const braceOffset = firstGroup[0].data.braceOffset;

    // Find insertion position (after opening brace, on a new line)
    // Look for the position right after the opening brace
    let insertOffset = braceOffset + 1;

    // Skip whitespace and newline after opening brace
    while (insertOffset < text.length && (text[insertOffset] === ' ' || text[insertOffset] === '\t')) {
        insertOffset++;
    }
    if (text[insertOffset] === '\n') {
        insertOffset++;
    }

    // Detect indentation from the context
    const lineStart = text.lastIndexOf('\n', braceOffset) + 1;
    const lineText = text.substring(lineStart, braceOffset);
    const baseIndent = lineText.match(/^(\s*)/)?.[1] || '';
    const propertyIndent = baseIndent + '    '; // Add 4 spaces for property indentation

    // Build property assignments
    const propertyLines: string[] = [];
    for (const { data } of firstGroup) {
        const placeholder = getPlaceholderValue(data.propertyType);
        propertyLines.push(`${propertyIndent}${data.propertyName} = ${placeholder}`);
    }

    // Create the insertion text
    const insertText = propertyLines.join('\n') + '\n';

    // Create the edit
    const insertPos = document.positionAt(insertOffset);

    // Create title based on number of properties
    const propertyCount = firstGroup.length;
    const title = propertyCount === 1
        ? `Add missing property '${firstGroup[0].data.propertyName}'`
        : `Add ${propertyCount} missing properties`;

    return {
        title,
        kind: CodeActionKind.QuickFix,
        diagnostics: firstGroup.map(g => g.diagnostic),
        isPreferred: true,
        edit: {
            changes: {
                [document.uri]: [
                    TextEdit.insert(insertPos, insertText)
                ]
            }
        }
    };
}
