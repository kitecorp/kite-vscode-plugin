/**
 * Rename handler for the Kite language server.
 * Provides rename symbol functionality with scope-aware reference finding.
 */

import {
    Range,
    TextEdit,
    WorkspaceEdit,
    Position,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment } from '../rename-utils';
import { KEYWORDS, TYPES } from '../constants';
import { getWordAtPosition } from '../utils/text-utils';
import { findAllReferences, ReferencesContext } from './references';

/**
 * Context interface for dependency injection into rename handler.
 */
export interface RenameContext {
    /** Get document by URI */
    getDocument: (uri: string) => TextDocument | undefined;
    /** Get declarations for a document */
    getDeclarations: (uri: string) => import('../types').Declaration[] | undefined;
    /** Find all .kite files in the workspace */
    findKiteFilesInWorkspace: () => string[];
    /** Get file content by path */
    getFileContent: (filePath: string, currentDocUri?: string) => string | null;
    /** Callback to refresh diagnostics after rename */
    refreshDiagnostics: () => void;
}

/**
 * Prepare rename result type
 */
export type PrepareRenameResult = { range: Range; placeholder: string } | null;

/**
 * Handle prepare rename request - validates if symbol can be renamed
 * and returns the range of the symbol.
 */
export function handlePrepareRename(
    document: TextDocument,
    position: Position
): PrepareRenameResult {
    const word = getWordAtPosition(document, position);
    if (!word) return null;

    // Don't allow renaming keywords
    if (KEYWORDS.includes(word)) {
        return null;
    }

    // Don't allow renaming built-in types
    if (TYPES.includes(word)) {
        return null;
    }

    // Don't allow renaming decorator names (check if cursor is after @)
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Find word boundaries to get the exact range
    let start = offset;
    let end = offset;
    while (start > 0 && /\w/.test(text[start - 1])) {
        start--;
    }
    while (end < text.length && /\w/.test(text[end])) {
        end++;
    }

    // Check if this is a decorator name (preceded by @)
    if (start > 0 && text[start - 1] === '@') {
        return null;
    }

    // Check if this is inside a string (basic check)
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const lineText = text.substring(lineStart, start);
    const doubleQuotes = (lineText.match(/"/g) || []).length;
    const singleQuotes = (lineText.match(/'/g) || []).length;
    if (doubleQuotes % 2 !== 0 || singleQuotes % 2 !== 0) {
        return null;
    }

    // Check if in a comment
    if (isInComment(text, start)) {
        return null;
    }

    // Return the range and placeholder
    const startPos = document.positionAt(start);
    const endPos = document.positionAt(end);

    return {
        range: Range.create(startPos, endPos),
        placeholder: word
    };
}

/**
 * Handle rename request - performs the actual rename operation.
 */
export function handleRename(
    document: TextDocument,
    position: Position,
    newName: string,
    ctx: RenameContext
): WorkspaceEdit | null {
    const word = getWordAtPosition(document, position);
    if (!word) return null;

    // Validate the new name
    const trimmedName = newName.trim();

    // Check that new name is a valid identifier
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedName)) {
        return null;
    }

    // Don't allow renaming to a keyword
    if (KEYWORDS.includes(trimmedName)) {
        return null;
    }

    // Don't allow renaming to a built-in type
    if (TYPES.includes(trimmedName)) {
        return null;
    }

    // Find all references (scope-aware)
    const cursorOffset = document.offsetAt(position);
    const refsCtx: ReferencesContext = {
        getDocument: ctx.getDocument,
        getDeclarations: ctx.getDeclarations,
        findKiteFilesInWorkspace: ctx.findKiteFilesInWorkspace,
        getFileContent: ctx.getFileContent,
    };
    const locations = findAllReferences(word, document.uri, cursorOffset, refsCtx);

    if (locations.length === 0) {
        return null;
    }

    // Group edits by document URI
    const changes: { [uri: string]: TextEdit[] } = {};

    for (const location of locations) {
        if (!changes[location.uri]) {
            changes[location.uri] = [];
        }
        changes[location.uri].push(TextEdit.replace(location.range, trimmedName));
    }

    // Schedule a refresh of diagnostics for all open documents after the rename is applied
    // This ensures cross-file references are properly validated after the rename
    setTimeout(() => {
        ctx.refreshDiagnostics();
    }, 100);

    return { changes };
}
