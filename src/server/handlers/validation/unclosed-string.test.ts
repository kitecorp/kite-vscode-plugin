/**
 * Tests for unclosed string validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkUnclosedStrings } from './unclosed-string';

describe('Unclosed string validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report error for unclosed double-quoted string', () => {
        const doc = createDoc(`
            var x = "hello
        `);
        const diagnostics = checkUnclosedStrings(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toBe('Unclosed string literal');
    });

    it('should report error for unclosed single-quoted string', () => {
        const doc = createDoc(`
            var x = 'hello
        `);
        const diagnostics = checkUnclosedStrings(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toBe('Unclosed string literal');
    });

    it('should not report for properly closed strings', () => {
        const doc = createDoc(`
            var x = "hello"
            var y = 'world'
        `);
        const diagnostics = checkUnclosedStrings(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should handle escaped quotes', () => {
        const doc = createDoc(`
            var x = "hello \\"world\\""
        `);
        const diagnostics = checkUnclosedStrings(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for strings in comments', () => {
        const doc = createDoc(`
            // var x = "hello
        `);
        const diagnostics = checkUnclosedStrings(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report error when quotes accidentally match across lines', () => {
        const doc = createDoc(`
            var x = "hello
            var y = "world
        `);
        const diagnostics = checkUnclosedStrings(doc);

        // With multiline strings, the first " is closed by the second "
        // This creates a malformed but "technically closed" string
        // The actual syntax error will be caught by the parser, not this validator
        expect(diagnostics).toHaveLength(0);
    });

    it('should report truly unclosed string', () => {
        const doc = createDoc(`
            var x = "This string is never closed
        `);
        const diagnostics = checkUnclosedStrings(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should handle multiline content correctly', () => {
        const doc = createDoc(`
            var x = "proper string"
            var y = "another one"
        `);
        const diagnostics = checkUnclosedStrings(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should handle properly closed multiline strings', () => {
        const doc = createDoc(`
            var message = "This is
            a multiline
            string"
        `);
        const diagnostics = checkUnclosedStrings(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should handle multiline strings with interpolation', () => {
        const doc = createDoc(`
            var name = "World"
            var message = "Hello
            \${name}
            Welcome"
        `);
        const diagnostics = checkUnclosedStrings(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should handle empty strings', () => {
        const doc = createDoc(`
            var x = ""
            var y = ''
        `);
        const diagnostics = checkUnclosedStrings(doc);

        expect(diagnostics).toHaveLength(0);
    });
});
