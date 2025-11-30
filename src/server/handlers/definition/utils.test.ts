/**
 * Tests for definition/utils.ts - utility functions for definition lookup.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    getPropertyAccessContext,
    findEnclosingBrackets,
    findPropertyInRange,
} from './utils';

function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

describe('getPropertyAccessContext', () => {
    describe('simple property access', () => {
        it('returns chain for object.property', () => {
            const text = 'var x = server.host';
            const offset = 15; // on 'h' in host
            const ctx = getPropertyAccessContext(text, offset, 'host');
            expect(ctx).not.toBeNull();
            expect(ctx?.chain).toEqual(['server', 'host']);
            expect(ctx?.propertyName).toBe('host');
        });

        it('returns null for single identifier', () => {
            const text = 'var x = server';
            const offset = 10; // on 'r' in server
            const ctx = getPropertyAccessContext(text, offset, 'server');
            expect(ctx).toBeNull();
        });
    });

    describe('deep property access', () => {
        it('returns full chain for a.b.c', () => {
            const text = 'var x = obj.config.host';
            const offset = 20; // on 'h' in host
            const ctx = getPropertyAccessContext(text, offset, 'host');
            expect(ctx).not.toBeNull();
            expect(ctx?.chain).toEqual(['obj', 'config', 'host']);
        });

        it('returns full chain for a.b.c.d', () => {
            const text = 'var x = a.b.c.d';
            const offset = 14; // on 'd'
            const ctx = getPropertyAccessContext(text, offset, 'd');
            expect(ctx).not.toBeNull();
            expect(ctx?.chain).toEqual(['a', 'b', 'c', 'd']);
        });
    });

    describe('whitespace handling', () => {
        it('handles spaces around dots', () => {
            const text = 'var x = obj . prop';
            const offset = 15; // on 'p' in prop
            const ctx = getPropertyAccessContext(text, offset, 'prop');
            expect(ctx).not.toBeNull();
            expect(ctx?.chain).toEqual(['obj', 'prop']);
        });

        it('handles newlines in property chain', () => {
            const text = 'var x = obj\n  .prop';
            const offset = 16; // on 'p' in prop
            const ctx = getPropertyAccessContext(text, offset, 'prop');
            expect(ctx).not.toBeNull();
            expect(ctx?.chain).toEqual(['obj', 'prop']);
        });
    });

    describe('cursor position', () => {
        it('works with cursor at start of property', () => {
            const text = 'server.host';
            const offset = 7; // at 'h'
            const ctx = getPropertyAccessContext(text, offset, 'host');
            expect(ctx).not.toBeNull();
            expect(ctx?.chain).toEqual(['server', 'host']);
        });

        it('works with cursor in middle of property', () => {
            const text = 'server.host';
            const offset = 9; // at 's' in host
            const ctx = getPropertyAccessContext(text, offset, 'host');
            expect(ctx).not.toBeNull();
        });
    });

    describe('edge cases', () => {
        it('returns null for empty text', () => {
            const ctx = getPropertyAccessContext('', 0, '');
            expect(ctx).toBeNull();
        });

        it('handles underscores in identifiers', () => {
            const text = 'my_obj.my_prop';
            const offset = 8; // on 'm' in my_prop
            const ctx = getPropertyAccessContext(text, offset, 'my_prop');
            expect(ctx).not.toBeNull();
            expect(ctx?.chain).toEqual(['my_obj', 'my_prop']);
        });

        it('handles numbers in identifiers', () => {
            const text = 'obj1.prop2';
            const offset = 6; // on 'p' in prop2
            const ctx = getPropertyAccessContext(text, offset, 'prop2');
            expect(ctx).not.toBeNull();
            expect(ctx?.chain).toEqual(['obj1', 'prop2']);
        });
    });
});

describe('findEnclosingBrackets', () => {
    describe('simple brackets', () => {
        it('finds enclosing brackets', () => {
            const text = '[a, b, c]';
            const offset = 4; // on 'b'
            const result = findEnclosingBrackets(text, offset);
            expect(result).not.toBeNull();
            expect(result?.start).toBe(0);
            expect(result?.end).toBe(8);
        });

        it('returns null when not inside brackets', () => {
            const text = 'var x = 1';
            const result = findEnclosingBrackets(text, 4);
            expect(result).toBeNull();
        });
    });

    describe('nested brackets', () => {
        it('finds innermost enclosing brackets', () => {
            const text = '[[inner]]';
            const offset = 3; // on 'n' in inner
            const result = findEnclosingBrackets(text, offset);
            expect(result).not.toBeNull();
            expect(result?.start).toBe(1);
            expect(result?.end).toBe(7);
        });

        it('handles deeply nested brackets', () => {
            const text = '[[[deep]]]';
            const offset = 4; // on 'e' in deep
            const result = findEnclosingBrackets(text, offset);
            expect(result).not.toBeNull();
            expect(result?.start).toBe(2);
            expect(result?.end).toBe(7);
        });
    });

    describe('list comprehension', () => {
        it('finds brackets for list comprehension', () => {
            const text = '[for x in items: x * 2]';
            const offset = 17; // on 'x' usage
            const result = findEnclosingBrackets(text, offset);
            expect(result).not.toBeNull();
            expect(result?.start).toBe(0);
            expect(result?.end).toBe(22);
        });

        it('handles nested array in list comprehension', () => {
            const text = '[for x in [1,2]: x]';
            const offset = 17; // on 'x' usage
            const result = findEnclosingBrackets(text, offset);
            expect(result).not.toBeNull();
            expect(result?.start).toBe(0);
        });
    });

    describe('edge cases', () => {
        it('returns null for empty text', () => {
            const result = findEnclosingBrackets('', 0);
            expect(result).toBeNull();
        });

        it('returns null for unclosed bracket', () => {
            const text = '[unclosed';
            const result = findEnclosingBrackets(text, 3);
            expect(result).toBeNull();
        });

        it('finds brackets when offset is on opening bracket', () => {
            const text = '[a]';
            const result = findEnclosingBrackets(text, 0);
            // Walking backwards from 0 doesn't find '[', but walking forward does
            // The function starts walking backwards, finds nothing, but the forward walk still works
            // Actually the function finds the bracket at position 0 when depth is 0
            expect(result).not.toBeNull();
            expect(result?.start).toBe(0);
            expect(result?.end).toBe(2);
        });

        it('handles multiple separate brackets', () => {
            const text = '[a] [b]';
            const offset = 5; // on 'b'
            const result = findEnclosingBrackets(text, offset);
            expect(result).not.toBeNull();
            expect(result?.start).toBe(4);
            expect(result?.end).toBe(6);
        });
    });
});

describe('findPropertyInRange', () => {
    describe('simple property assignment', () => {
        it('finds property with = assignment', () => {
            const text = 'resource Config c {\n    name = "test"\n}';
            const doc = createDocument(text);
            const result = findPropertyInRange(doc, text, 19, 37, 'name');
            expect(result).not.toBeNull();
            expect(result?.location).toBeDefined();
        });

        it('finds property with : assignment', () => {
            const text = 'resource Config c {\n    name: "test"\n}';
            const doc = createDocument(text);
            const result = findPropertyInRange(doc, text, 19, 37, 'name');
            expect(result).not.toBeNull();
        });

        it('returns null for non-existent property', () => {
            const text = 'resource Config c {\n    name = "test"\n}';
            const doc = createDocument(text);
            const result = findPropertyInRange(doc, text, 19, 37, 'host');
            expect(result).toBeNull();
        });
    });

    describe('nested object values', () => {
        it('returns value range for object literal', () => {
            const text = 'resource C c {\n    config = {\n        inner = 1\n    }\n}';
            const doc = createDocument(text);
            const result = findPropertyInRange(doc, text, 14, 54, 'config');
            expect(result).not.toBeNull();
            expect(result?.valueStart).toBeDefined();
            expect(result?.valueEnd).toBeDefined();
        });
    });

    describe('input/output declarations', () => {
        it('finds input declaration', () => {
            const text = 'component C {\n    input string name\n}';
            const doc = createDocument(text);
            const result = findPropertyInRange(doc, text, 13, 35, 'name');
            expect(result).not.toBeNull();
        });

        it('finds output declaration', () => {
            const text = 'component C {\n    output string endpoint\n}';
            const doc = createDocument(text);
            const result = findPropertyInRange(doc, text, 13, 40, 'endpoint');
            expect(result).not.toBeNull();
        });
    });

    describe('edge cases', () => {
        it('handles property at start of range', () => {
            const text = 'name = "test"';
            const doc = createDocument(text);
            const result = findPropertyInRange(doc, text, 0, text.length, 'name');
            expect(result).not.toBeNull();
        });

        it('handles multiple properties', () => {
            const text = '{\n    a = 1\n    b = 2\n}';
            const doc = createDocument(text);
            const resultA = findPropertyInRange(doc, text, 1, 22, 'a');
            const resultB = findPropertyInRange(doc, text, 1, 22, 'b');
            expect(resultA).not.toBeNull();
            expect(resultB).not.toBeNull();
        });

        it('respects range boundaries', () => {
            const text = 'a = 1\nb = 2';
            const doc = createDocument(text);
            // Only search first line
            const result = findPropertyInRange(doc, text, 0, 5, 'b');
            expect(result).toBeNull();
        });
    });
});
