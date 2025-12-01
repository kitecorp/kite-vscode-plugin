/**
 * Shared test utilities for Kite language server tests.
 * Import these helpers instead of duplicating them in each test file.
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range } from 'vscode-languageserver/node';
import { Declaration, BlockContext } from './types';
import { scanDocumentAST } from '../parser';
import { findEnclosingBlock } from './utils/text-utils';

/**
 * Create a mock TextDocument for testing.
 */
export function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

/**
 * Create a Position from line and character.
 */
export function pos(line: number, character: number): Position {
    return Position.create(line, character);
}

/**
 * Convert a text offset to a Position.
 */
export function positionFromOffset(text: string, offset: number): Position {
    const lines = text.substring(0, offset).split('\n');
    return Position.create(lines.length - 1, lines[lines.length - 1].length);
}

/**
 * Get offset from a cursor marker (|) in text.
 * Returns { cleanText, offset } where cleanText has the marker removed.
 */
export function parseCursor(text: string, marker = '|'): { cleanText: string; offset: number } {
    const offset = text.indexOf(marker);
    if (offset === -1) {
        throw new Error(`Cursor marker '${marker}' not found in text`);
    }
    const cleanText = text.replace(marker, '');
    return { cleanText, offset };
}

/**
 * Get position from a cursor marker (|) in text.
 * Returns { cleanText, position } where cleanText has the marker removed.
 */
export function parseCursorPosition(text: string, marker = '|'): { cleanText: string; position: Position } {
    const { cleanText, offset } = parseCursor(text, marker);
    const position = positionFromOffset(cleanText, offset);
    return { cleanText, position };
}

/**
 * Create a document and position from text with cursor marker.
 */
export function createDocumentWithCursor(
    text: string,
    uri = 'file:///test.kite',
    marker = '|'
): { document: TextDocument; position: Position; offset: number } {
    const { cleanText, offset } = parseCursor(text, marker);
    const position = positionFromOffset(cleanText, offset);
    const document = createDocument(cleanText, uri);
    return { document, position, offset };
}

/**
 * Scan document and return declarations.
 */
export function getDeclarations(document: TextDocument): Declaration[] {
    return scanDocumentAST(document);
}

/**
 * Create a Range from line/character coordinates.
 */
export function range(
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number
): Range {
    return Range.create(startLine, startChar, endLine, endChar);
}

/**
 * Base context options that most handlers need.
 */
export interface BaseContextOptions {
    files?: Record<string, string>;
    declarations?: Declaration[];
}

/**
 * Create a file content getter from a files map.
 */
export function createFileContentGetter(
    files: Record<string, string>,
    currentContent?: string
): (filePath: string) => string | null {
    return (filePath: string) => {
        // Check files map
        for (const [pattern, content] of Object.entries(files)) {
            if (filePath.includes(pattern) || filePath.endsWith(pattern)) {
                return content;
            }
        }
        // Return current content as fallback
        return currentContent ?? null;
    };
}

/**
 * Create a workspace file finder from a files map.
 */
export function createFileFinder(files: Record<string, string>): () => string[] {
    return () => Object.keys(files).map(f => `/project/${f}`);
}

/**
 * Create enclosing block finder.
 */
export function createBlockFinder(text: string): (t: string, offset: number) => BlockContext | null {
    return (t: string, offset: number) => findEnclosingBlock(t, offset);
}
