/**
 * Tests for loop-variables.ts - loop variable definition lookup.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { findListComprehensionVariable } from './loop-variables';

function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

describe('findListComprehensionVariable', () => {
    describe('basic list comprehension', () => {
        it('finds loop variable declaration from usage', () => {
            const text = '[for x in items: x * 2]';
            const doc = createDocument(text);
            const offset = 17; // on 'x' usage
            const result = findListComprehensionVariable(doc, text, offset, 'x');
            expect(result).not.toBeNull();
            expect(result?.range.start.character).toBe(5); // 'x' in 'for x'
        });

        it('returns null when cursor is on declaration', () => {
            const text = '[for x in items: x * 2]';
            const doc = createDocument(text);
            const offset = 5; // on 'x' declaration
            const result = findListComprehensionVariable(doc, text, offset, 'x');
            expect(result).toBeNull();
        });

        it('returns null for non-loop variable', () => {
            const text = '[for x in items: x * 2]';
            const doc = createDocument(text);
            const offset = 10; // on 'i' in items
            const result = findListComprehensionVariable(doc, text, offset, 'items');
            expect(result).toBeNull();
        });
    });

    describe('with filter clause', () => {
        it('finds variable in filter expression', () => {
            const text = '[for x in items: if x > 10 { x }]';
            const doc = createDocument(text);
            const offset = 20; // on 'x' in 'x > 10'
            const result = findListComprehensionVariable(doc, text, offset, 'x');
            expect(result).not.toBeNull();
        });

        it('finds variable in body after filter', () => {
            const text = '[for x in items: if x > 10 { x }]';
            const doc = createDocument(text);
            const offset = 29; // on 'x' in body
            const result = findListComprehensionVariable(doc, text, offset, 'x');
            expect(result).not.toBeNull();
        });
    });

    describe('nested comprehensions', () => {
        it('finds correct variable in inner comprehension', () => {
            const text = '[[for y in row: y] for row in matrix]';
            const doc = createDocument(text);
            // Find 'y' usage inside inner comprehension
            const offset = 16; // on 'y' usage
            const result = findListComprehensionVariable(doc, text, offset, 'y');
            expect(result).not.toBeNull();
        });
    });

    describe('variable names', () => {
        it('handles single-letter variable', () => {
            const text = '[for i in range: i]';
            const doc = createDocument(text);
            const offset = 17; // on 'i' usage
            const result = findListComprehensionVariable(doc, text, offset, 'i');
            expect(result).not.toBeNull();
        });

        it('handles longer variable name', () => {
            const text = '[for item in items: item.name]';
            const doc = createDocument(text);
            const offset = 20; // on 'item' usage
            const result = findListComprehensionVariable(doc, text, offset, 'item');
            expect(result).not.toBeNull();
        });

        it('handles underscore in variable name', () => {
            const text = '[for my_item in items: my_item]';
            const doc = createDocument(text);
            const offset = 23; // on 'my_item' usage
            const result = findListComprehensionVariable(doc, text, offset, 'my_item');
            expect(result).not.toBeNull();
        });
    });

    describe('edge cases', () => {
        it('returns null outside brackets', () => {
            const text = 'var x = 1';
            const doc = createDocument(text);
            const result = findListComprehensionVariable(doc, text, 4, 'x');
            expect(result).toBeNull();
        });

        it('returns null for regular array', () => {
            const text = '[1, 2, x]';
            const doc = createDocument(text);
            const result = findListComprehensionVariable(doc, text, 7, 'x');
            expect(result).toBeNull();
        });

        it('returns null when word does not match loop var', () => {
            const text = '[for x in items: y * 2]';
            const doc = createDocument(text);
            const offset = 17; // on 'y'
            const result = findListComprehensionVariable(doc, text, offset, 'y');
            expect(result).toBeNull();
        });

        it('handles whitespace variations', () => {
            const text = '[  for   x   in   items  :   x  ]';
            const doc = createDocument(text);
            const offset = 29; // on 'x' usage
            const result = findListComprehensionVariable(doc, text, offset, 'x');
            expect(result).not.toBeNull();
        });
    });

    describe('multiple usages', () => {
        it('finds declaration for any usage', () => {
            const text = '[for x in items: x + x + x]';
            const doc = createDocument(text);

            // First usage
            let result = findListComprehensionVariable(doc, text, 17, 'x');
            expect(result).not.toBeNull();

            // Second usage
            result = findListComprehensionVariable(doc, text, 21, 'x');
            expect(result).not.toBeNull();

            // Third usage
            result = findListComprehensionVariable(doc, text, 25, 'x');
            expect(result).not.toBeNull();
        });
    });
});
