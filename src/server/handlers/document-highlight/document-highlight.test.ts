/**
 * Tests for document highlight handler.
 */

import { describe, it, expect } from 'vitest';
import { DocumentHighlightKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { handleDocumentHighlight } from './index';

function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

describe('handleDocumentHighlight', () => {
    describe('variable highlights', () => {
        it('highlights all occurrences of a variable', () => {
            const doc = createDocument(`var count = 0
var result = count + 1
var doubled = count * 2`);

            // Position on first 'count' (declaration)
            const highlights = handleDocumentHighlight(doc, { line: 0, character: 4 });

            expect(highlights).toHaveLength(3);
            expect(highlights[0].kind).toBe(DocumentHighlightKind.Write); // declaration
            expect(highlights[1].kind).toBe(DocumentHighlightKind.Read);
            expect(highlights[2].kind).toBe(DocumentHighlightKind.Read);
        });

        it('highlights variable in string interpolation', () => {
            const doc = createDocument(`var name = "world"
var greeting = "Hello, \${name}!"`);

            const highlights = handleDocumentHighlight(doc, { line: 0, character: 4 });

            expect(highlights).toHaveLength(2);
        });

        it('highlights simple interpolation $var', () => {
            const doc = createDocument(`var name = "world"
var greeting = "Hello, $name!"`);

            const highlights = handleDocumentHighlight(doc, { line: 0, character: 4 });

            expect(highlights).toHaveLength(2);
        });
    });

    describe('function highlights', () => {
        it('highlights function declaration and calls', () => {
            const doc = createDocument(`fun calculate(number x) number {
    return x * 2
}
var result = calculate(5)`);

            const highlights = handleDocumentHighlight(doc, { line: 0, character: 4 });

            expect(highlights).toHaveLength(2);
            expect(highlights[0].kind).toBe(DocumentHighlightKind.Write); // declaration
            expect(highlights[1].kind).toBe(DocumentHighlightKind.Read); // call
        });

        it('highlights function parameters', () => {
            const doc = createDocument(`fun add(number a, number b) number {
    return a + b
}`);

            // Position on parameter 'a'
            const highlights = handleDocumentHighlight(doc, { line: 0, character: 15 });

            expect(highlights).toHaveLength(2);
        });
    });

    describe('schema highlights', () => {
        it('highlights schema name and usages', () => {
            const doc = createDocument(`schema Config {
    string name
}
resource Config server {
    name = "test"
}`);

            const highlights = handleDocumentHighlight(doc, { line: 0, character: 7 });

            expect(highlights).toHaveLength(2);
        });
    });

    describe('component highlights', () => {
        it('highlights component type and instances', () => {
            const doc = createDocument(`component Server {
    input string name
}
component Server api {
    name = "api"
}`);

            const highlights = handleDocumentHighlight(doc, { line: 0, character: 10 });

            expect(highlights).toHaveLength(2);
        });
    });

    describe('loop variable highlights', () => {
        it('highlights loop variable within scope', () => {
            const doc = createDocument(`var items = [1, 2, 3]
for item in items {
    var doubled = item * 2
}`);

            // Position on 'item' in loop declaration
            const highlights = handleDocumentHighlight(doc, { line: 1, character: 4 });

            expect(highlights).toHaveLength(2);
        });
    });

    describe('edge cases', () => {
        it('returns empty array for whitespace', () => {
            const doc = createDocument('var x = 1');
            const highlights = handleDocumentHighlight(doc, { line: 0, character: 3 });

            expect(highlights).toHaveLength(0);
        });

        it('returns empty array for empty document', () => {
            const doc = createDocument('');
            const highlights = handleDocumentHighlight(doc, { line: 0, character: 0 });

            expect(highlights).toHaveLength(0);
        });

        it('does not highlight keywords', () => {
            const doc = createDocument(`var x = 1
var y = 2`);

            // Position on 'var' keyword
            const highlights = handleDocumentHighlight(doc, { line: 0, character: 0 });

            // Should not highlight 'var' keyword occurrences as they're not symbols
            expect(highlights).toHaveLength(0);
        });

        it('does not match partial words', () => {
            const doc = createDocument(`var count = 0
var counter = 1`);

            const highlights = handleDocumentHighlight(doc, { line: 0, character: 4 });

            // Should only match 'count', not 'counter'
            expect(highlights).toHaveLength(1);
        });

        it('ignores occurrences in comments', () => {
            const doc = createDocument(`var count = 0
// count is a variable
var result = count + 1`);

            const highlights = handleDocumentHighlight(doc, { line: 0, character: 4 });

            // Should match declaration and usage, but not comment
            expect(highlights).toHaveLength(2);
        });

        it('ignores occurrences in strings (non-interpolation)', () => {
            const doc = createDocument(`var name = "test"
var message = 'name is a variable'
var result = name`);

            const highlights = handleDocumentHighlight(doc, { line: 0, character: 4 });

            // Should match declaration and usage, not inside single-quoted string
            expect(highlights).toHaveLength(2);
        });
    });

    describe('write vs read detection', () => {
        it('marks declaration as write', () => {
            const doc = createDocument(`var x = 1
var y = x`);

            const highlights = handleDocumentHighlight(doc, { line: 0, character: 4 });

            expect(highlights[0].kind).toBe(DocumentHighlightKind.Write);
            expect(highlights[1].kind).toBe(DocumentHighlightKind.Read);
        });

        it('marks assignment target as write', () => {
            const doc = createDocument(`var x = 1
x = 2
var y = x`);

            const highlights = handleDocumentHighlight(doc, { line: 0, character: 4 });

            expect(highlights).toHaveLength(3);
            expect(highlights[0].kind).toBe(DocumentHighlightKind.Write); // var x = 1
            expect(highlights[1].kind).toBe(DocumentHighlightKind.Write); // x = 2
            expect(highlights[2].kind).toBe(DocumentHighlightKind.Read);  // var y = x
        });

        it('marks compound assignment as write', () => {
            const doc = createDocument(`var x = 1
x += 2`);

            const highlights = handleDocumentHighlight(doc, { line: 0, character: 4 });

            expect(highlights).toHaveLength(2);
            expect(highlights[0].kind).toBe(DocumentHighlightKind.Write);
            expect(highlights[1].kind).toBe(DocumentHighlightKind.Write);
        });

        it('marks schema/component definition as write', () => {
            const doc = createDocument(`schema Config {
    string name
}
resource Config server {}`);

            const highlights = handleDocumentHighlight(doc, { line: 0, character: 7 });

            expect(highlights[0].kind).toBe(DocumentHighlightKind.Write); // definition
            expect(highlights[1].kind).toBe(DocumentHighlightKind.Read);  // usage
        });
    });
});
