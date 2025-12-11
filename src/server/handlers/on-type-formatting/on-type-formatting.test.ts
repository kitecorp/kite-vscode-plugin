/**
 * Tests for On Type Formatting handler
 * Auto-formats code as you type
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver/node';
import { handleOnTypeFormatting, FormattingOptions } from './index';

function createDocument(content: string): TextDocument {
    return TextDocument.create('file:///test.kite', 'kite', 1, content);
}

const defaultOptions: FormattingOptions = {
    tabSize: 4,
    insertSpaces: true,
};

describe('On Type Formatting', () => {
    describe('Newline after opening brace', () => {
        it('should indent after schema opening brace', () => {
            // User typed Enter after {
            const doc = createDocument(`schema Config {
`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(1, 0),
                '\n',
                defaultOptions
            );

            expect(edits.length).toBeGreaterThanOrEqual(1);
            expect(edits[0].newText).toBe('    '); // 4 spaces indent
            expect(edits[0].range.start.line).toBe(1);
        });

        it('should indent after resource opening brace', () => {
            const doc = createDocument(`resource ServerConfig web {
`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(1, 0),
                '\n',
                defaultOptions
            );

            expect(edits.length).toBeGreaterThanOrEqual(1);
            expect(edits[0].newText).toBe('    ');
        });

        it('should indent after component opening brace', () => {
            const doc = createDocument(`component WebServer {
`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(1, 0),
                '\n',
                defaultOptions
            );

            expect(edits.length).toBeGreaterThanOrEqual(1);
            expect(edits[0].newText).toBe('    ');
        });

        it('should indent after function opening brace', () => {
            const doc = createDocument(`fun calculate() {
`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(1, 0),
                '\n',
                defaultOptions
            );

            expect(edits.length).toBeGreaterThanOrEqual(1);
            expect(edits[0].newText).toBe('    ');
        });

        it('should indent after if opening brace', () => {
            const doc = createDocument(`if condition {
`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(1, 0),
                '\n',
                defaultOptions
            );

            expect(edits.length).toBeGreaterThanOrEqual(1);
            expect(edits[0].newText).toBe('    ');
        });

        it('should indent after for loop opening brace', () => {
            const doc = createDocument(`for item in items {
`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(1, 0),
                '\n',
                defaultOptions
            );

            expect(edits.length).toBeGreaterThanOrEqual(1);
            expect(edits[0].newText).toBe('    ');
        });

        it('should use tabs when insertSpaces is false', () => {
            const doc = createDocument(`schema Config {
`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(1, 0),
                '\n',
                { tabSize: 4, insertSpaces: false }
            );

            expect(edits.length).toBeGreaterThanOrEqual(1);
            expect(edits[0].newText).toBe('\t');
        });
    });

    describe('Nested indentation', () => {
        it('should add double indent for nested block', () => {
            const doc = createDocument(`schema Config {
    fun process() {
`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(2, 0),
                '\n',
                defaultOptions
            );

            expect(edits.length).toBeGreaterThanOrEqual(1);
            expect(edits[0].newText).toBe('        '); // 8 spaces
        });

        it('should maintain indent level for subsequent lines', () => {
            const doc = createDocument(`schema Config {
    string name
`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(2, 0),
                '\n',
                defaultOptions
            );

            expect(edits).toHaveLength(1);
            expect(edits[0].newText).toBe('    '); // Same as previous line
        });
    });

    describe('Closing brace formatting', () => {
        it('should reduce indent for closing brace', () => {
            const doc = createDocument(`schema Config {
    string name
    }`);
            // Position is right after the }
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(2, 5), // After "    }"
                '}',
                defaultOptions
            );

            expect(edits).toHaveLength(1);
            // Should remove the extra indent before }
            expect(edits[0].range.start.character).toBe(0);
            expect(edits[0].range.end.character).toBe(4); // Remove 4 spaces
            expect(edits[0].newText).toBe(''); // No indent for closing brace at top level
        });

        it('should maintain proper indent for nested closing brace', () => {
            const doc = createDocument(`schema Config {
    fun process() {
        var x = 1
        }
}`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(3, 9), // After "        }"
                '}',
                defaultOptions
            );

            expect(edits).toHaveLength(1);
            // Should have 4 spaces, not 8
            expect(edits[0].newText).toBe('    ');
        });
    });

    describe('Edge cases', () => {
        it('should return empty for unsupported character', () => {
            const doc = createDocument(`var x = 1`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(0, 9),
                '1',
                defaultOptions
            );

            expect(edits).toHaveLength(0);
        });

        it('should handle empty document', () => {
            const doc = createDocument('');
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(0, 0),
                '\n',
                defaultOptions
            );

            expect(edits).toHaveLength(0);
        });

        it('should not indent after { in string', () => {
            const doc = createDocument(`var msg = "hello {
`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(1, 0),
                '\n',
                defaultOptions
            );

            // Should not indent because { is inside a string
            expect(edits).toHaveLength(0);
        });

        it('should handle line with only whitespace', () => {
            const doc = createDocument(`schema Config {

}`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(1, 4), // After whitespace
                '\n',
                defaultOptions
            );

            expect(edits.length).toBeGreaterThanOrEqual(1);
            expect(edits[0].newText).toBe('    ');
        });
    });

    describe('Auto-close brace', () => {
        it('should auto-insert closing brace after Enter on line ending with {', () => {
            // User typed { then Enter - brace is not closed yet
            const doc = createDocument(`schema Config {
`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(1, 0),
                '\n',
                defaultOptions
            );

            // Should have 2 edits: indent + closing brace
            expect(edits).toHaveLength(2);
            expect(edits[0].newText).toBe('    '); // Indent for cursor line
            expect(edits[1].newText).toBe('\n}'); // Closing brace on next line
        });

        it('should not auto-insert closing brace if already closed', () => {
            // Brace is already closed
            const doc = createDocument(`schema Config {
}
`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(1, 0),
                '\n',
                defaultOptions
            );

            // Should only have indent, no extra closing brace
            expect(edits.length).toBeLessThanOrEqual(1);
        });

        it('should auto-insert closing brace with proper indent for nested blocks', () => {
            const doc = createDocument(`schema Config {
    fun process() {
`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(2, 0),
                '\n',
                defaultOptions
            );

            expect(edits).toHaveLength(2);
            expect(edits[0].newText).toBe('        '); // Double indent for cursor
            expect(edits[1].newText).toBe('\n    }'); // Closing brace with single indent
        });

        it('should not auto-insert closing brace when { is inside string', () => {
            const doc = createDocument(`var msg = "hello {
`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(1, 0),
                '\n',
                defaultOptions
            );

            // Should not insert closing brace because { is inside string
            expect(edits.every(e => !e.newText.includes('}'))).toBe(true);
        });
    });

    describe('Custom tab size', () => {
        it('should respect tabSize of 2', () => {
            const doc = createDocument(`schema Config {
`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(1, 0),
                '\n',
                { tabSize: 2, insertSpaces: true }
            );

            expect(edits.length).toBeGreaterThanOrEqual(1);
            expect(edits[0].newText).toBe('  '); // 2 spaces
        });

        it('should respect tabSize of 8', () => {
            const doc = createDocument(`schema Config {
`);
            const edits = handleOnTypeFormatting(
                doc,
                Position.create(1, 0),
                '\n',
                { tabSize: 8, insertSpaces: true }
            );

            expect(edits.length).toBeGreaterThanOrEqual(1);
            expect(edits[0].newText).toBe('        '); // 8 spaces
        });
    });
});
