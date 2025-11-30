/**
 * Shared test utilities for rename handler tests.
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range } from 'vscode-languageserver/node';
import { RenameContext } from './rename';
import { Declaration } from '../types';

/**
 * Create a mock TextDocument for testing.
 */
export function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

/**
 * Create a mock RenameContext for testing.
 */
export function createContext(options: {
    files?: Record<string, string>;
    declarations?: Declaration[];
    documents?: Record<string, TextDocument>;
} = {}): RenameContext {
    const documents = options.documents || {};

    return {
        getDeclarations: () => options.declarations || [],
        findKiteFilesInWorkspace: () => Object.keys(options.files || {}),
        getFileContent: (path: string) => options.files?.[path] || null,
        getDocument: (uri: string) => documents[uri],
        refreshDiagnostics: () => {},
    };
}

/**
 * Apply text edits to content and return the result.
 * Handles edits in reverse order to avoid offset issues.
 */
export function applyEdits(content: string, edits: { range: Range; newText: string }[]): string {
    // Sort edits in reverse order by start position
    const sortedEdits = [...edits].sort((a, b) => {
        if (b.range.start.line !== a.range.start.line) {
            return b.range.start.line - a.range.start.line;
        }
        return b.range.start.character - a.range.start.character;
    });

    const lines = content.split('\n');
    for (const edit of sortedEdits) {
        const startLine = edit.range.start.line;
        const endLine = edit.range.end.line;
        const startChar = edit.range.start.character;
        const endChar = edit.range.end.character;

        if (startLine === endLine) {
            // Single line edit
            const line = lines[startLine];
            lines[startLine] = line.substring(0, startChar) + edit.newText + line.substring(endChar);
        } else {
            // Multi-line edit
            const startLineText = lines[startLine].substring(0, startChar);
            const endLineText = lines[endLine].substring(endChar);
            lines.splice(startLine, endLine - startLine + 1, startLineText + edit.newText + endLineText);
        }
    }
    return lines.join('\n');
}
