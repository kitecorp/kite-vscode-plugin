/**
 * Sort Imports code action for the Kite language server.
 * Alphabetically sorts import statements by path.
 */

import {
    CodeAction,
    CodeActionKind,
    TextEdit,
    Range,
    Position,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Result of sorting imports
 */
export interface SortImportsResult {
    /** The sorted imports as a string */
    newText: string;
    /** The range to replace */
    range: Range;
}

/**
 * Parsed import information
 */
interface ParsedImport {
    /** Full original import line */
    fullLine: string;
    /** Import path (the string in quotes) */
    path: string;
    /** Line number in document */
    lineNumber: number;
    /** Start offset in document */
    startOffset: number;
    /** End offset in document */
    endOffset: number;
}

/**
 * Parse all import statements from document
 * Only returns contiguous imports from the beginning of the file
 */
function parseImports(document: TextDocument): ParsedImport[] {
    const text = document.getText();
    const lines = text.split('\n');
    const imports: ParsedImport[] = [];

    let offset = 0;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        const trimmedLine = line.trim();

        // Match import statements: import ... from "path" or import ... from 'path'
        const importMatch = trimmedLine.match(/^import\s+.+\s+from\s+["']([^"']+)["']$/);

        if (importMatch) {
            imports.push({
                fullLine: trimmedLine,
                path: importMatch[1],
                lineNumber: lineNum,
                startOffset: offset,
                endOffset: offset + line.length,
            });
        } else if (trimmedLine !== '' && !trimmedLine.startsWith('//')) {
            // Stop at first non-import, non-empty, non-comment line
            break;
        }

        offset += line.length + 1; // +1 for newline
    }

    return imports;
}

/**
 * Sort imports alphabetically by path (case-insensitive)
 * Returns null if no sorting needed or no imports found
 */
export function sortImports(document: TextDocument): SortImportsResult | null {
    const imports = parseImports(document);

    // Need at least 2 imports to sort
    if (imports.length < 2) {
        return null;
    }

    // Sort imports by path (case-insensitive)
    const sortedImports = [...imports].sort((a, b) =>
        a.path.toLowerCase().localeCompare(b.path.toLowerCase())
    );

    // Check if already sorted (compare paths in order)
    const isSorted = imports.every((imp, i) => imp.path === sortedImports[i].path);
    if (isSorted) {
        return null;
    }

    // Calculate the range covering all imports (from first to last import line)
    const firstImport = imports[0];
    const lastImport = imports[imports.length - 1];

    const startPos = Position.create(firstImport.lineNumber, 0);
    const endPos = Position.create(lastImport.lineNumber, lastImport.fullLine.length);

    // Build sorted import text
    const sortedText = sortedImports.map(imp => imp.fullLine).join('\n');

    return {
        newText: sortedText,
        range: Range.create(startPos, endPos),
    };
}

/**
 * Create a code action for sorting imports
 * Returns null if imports are already sorted or no imports exist
 */
export function createSortImportsAction(document: TextDocument): CodeAction | null {
    const sortResult = sortImports(document);

    if (!sortResult) {
        return null;
    }

    const edit = TextEdit.replace(sortResult.range, sortResult.newText);

    return {
        title: 'Sort imports',
        kind: CodeActionKind.SourceOrganizeImports,
        edit: {
            changes: {
                [document.uri]: [edit],
            },
        },
    };
}
