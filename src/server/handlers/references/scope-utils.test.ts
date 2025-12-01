/**
 * Tests for scope-utils.ts - string literal and scope detection utilities.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createDocument } from '../../test-utils';
import {
    isInStringLiteral,
    isInInterpolation,
    findReferencesInScope,
} from './scope-utils';

describe('isInStringLiteral', () => {
    describe('double-quoted strings', () => {
        it('returns false before string', () => {
            const text = 'var x = "hello"';
            expect(isInStringLiteral(text, 4)).toBe(false); // 'x'
        });

        it('returns true inside string', () => {
            const text = 'var x = "hello"';
            expect(isInStringLiteral(text, 10)).toBe(true); // 'e' in hello
        });

        it('returns false after string', () => {
            const text = 'var x = "hello" + y';
            expect(isInStringLiteral(text, 18)).toBe(false); // 'y'
        });

        it('returns false at opening quote', () => {
            const text = 'var x = "hello"';
            expect(isInStringLiteral(text, 8)).toBe(false); // opening quote
        });
    });

    describe('single-quoted strings', () => {
        it('returns true inside single-quoted string', () => {
            const text = "var x = 'hello'";
            expect(isInStringLiteral(text, 10)).toBe(true);
        });

        it('returns false after single-quoted string', () => {
            const text = "var x = 'hello' + y";
            expect(isInStringLiteral(text, 18)).toBe(false);
        });
    });

    describe('escaped quotes', () => {
        it('handles escaped double quote inside string', () => {
            const text = 'var x = "say \\"hi\\""';
            expect(isInStringLiteral(text, 15)).toBe(true); // inside after escaped quote
        });

        it('handles escaped single quote inside string', () => {
            const text = "var x = 'it\\'s ok'";
            expect(isInStringLiteral(text, 14)).toBe(true);
        });
    });

    describe('multiple strings', () => {
        it('correctly tracks multiple strings', () => {
            const text = '"a" + "b"';
            expect(isInStringLiteral(text, 1)).toBe(true);  // inside first
            expect(isInStringLiteral(text, 4)).toBe(false); // between
            expect(isInStringLiteral(text, 7)).toBe(true);  // inside second
        });

        it('handles adjacent strings', () => {
            const text = '"a""b"';
            expect(isInStringLiteral(text, 1)).toBe(true);  // in first
            expect(isInStringLiteral(text, 3)).toBe(false); // between (at closing of first)
            expect(isInStringLiteral(text, 4)).toBe(true);  // in second
        });
    });

    describe('mixed quote types', () => {
        it('handles double quote inside single-quoted string', () => {
            const text = "'say \"hi\"'";
            expect(isInStringLiteral(text, 5)).toBe(true); // at the "
        });

        it('handles single quote inside double-quoted string', () => {
            const text = '"it\'s fine"';
            expect(isInStringLiteral(text, 4)).toBe(true); // at the '
        });
    });

    describe('edge cases', () => {
        it('returns false for empty text', () => {
            expect(isInStringLiteral('', 0)).toBe(false);
        });

        it('returns false for offset 0', () => {
            const text = '"hello"';
            expect(isInStringLiteral(text, 0)).toBe(false);
        });

        it('handles unclosed string', () => {
            const text = 'var x = "unclosed';
            expect(isInStringLiteral(text, 15)).toBe(true);
        });
    });
});

describe('isInInterpolation', () => {
    describe('basic interpolation', () => {
        it('returns true inside ${...}', () => {
            const text = '"hello ${name}"';
            expect(isInInterpolation(text, 10)).toBe(true); // 'n' in name
        });

        it('returns false outside interpolation but in string', () => {
            const text = '"hello ${name}"';
            expect(isInInterpolation(text, 3)).toBe(false); // 'l' in hello
        });

        it('returns false after interpolation closes', () => {
            const text = '"hello ${name} world"';
            expect(isInInterpolation(text, 16)).toBe(false); // 'w' in world
        });
    });

    describe('nested interpolation', () => {
        it('handles nested braces in interpolation', () => {
            const text = '"value: ${obj.get()}"';
            expect(isInInterpolation(text, 12)).toBe(true); // inside the call
        });
    });

    describe('single-quoted strings', () => {
        it('returns false for ${} in single-quoted string', () => {
            // Single-quoted strings don't support interpolation in Kite
            const text = "'hello ${name}'";
            expect(isInInterpolation(text, 10)).toBe(false);
        });
    });

    describe('multiple interpolations', () => {
        it('handles multiple interpolations in one string', () => {
            const text = '"${a} and ${b}"';
            expect(isInInterpolation(text, 3)).toBe(true);   // in first
            expect(isInInterpolation(text, 6)).toBe(false);  // between
            expect(isInInterpolation(text, 12)).toBe(true);  // in second
        });
    });

    describe('edge cases', () => {
        it('returns false for empty text', () => {
            expect(isInInterpolation('', 0)).toBe(false);
        });

        it('returns false outside string', () => {
            const text = 'var x = ${y}';
            expect(isInInterpolation(text, 10)).toBe(false);
        });

        it('handles $ without {', () => {
            const text = '"$name"';
            expect(isInInterpolation(text, 3)).toBe(false);
        });
    });
});

describe('findReferencesInScope', () => {
    const docUri = 'file:///test.kite';

    it('finds simple word references', () => {
        const text = 'var x = 1\nvar y = x + x';
        const doc = createDocument(text);
        const refs = findReferencesInScope(text, 'x', 0, text.length, docUri, doc);
        expect(refs).toHaveLength(3); // declaration + 2 usages
    });

    it('respects scope boundaries', () => {
        const text = 'x = 1\n---\nx = 2';
        const doc = createDocument(text);
        const refs = findReferencesInScope(text, 'x', 0, 5, docUri, doc);
        expect(refs).toHaveLength(1); // only first x
    });

    it('skips references in comments', () => {
        const text = 'var x = 1 // x is a variable\nvar y = x';
        const doc = createDocument(text);
        const refs = findReferencesInScope(text, 'x', 0, text.length, docUri, doc);
        expect(refs).toHaveLength(2); // declaration + usage, not comment
    });

    it('skips references in plain strings', () => {
        const text = 'var x = 1\nvar s = "x is cool"\nvar y = x';
        const doc = createDocument(text);
        const refs = findReferencesInScope(text, 'x', 0, text.length, docUri, doc);
        expect(refs).toHaveLength(2); // declaration + y = x, not string
    });

    it('includes references in string interpolation', () => {
        const text = 'var x = 1\nvar s = "value: ${x}"';
        const doc = createDocument(text);
        const refs = findReferencesInScope(text, 'x', 0, text.length, docUri, doc);
        expect(refs).toHaveLength(2); // declaration + interpolation
    });

    it('works without document (uses offsetToPosition)', () => {
        const text = 'var x = 1\nvar y = x';
        const refs = findReferencesInScope(text, 'x', 0, text.length, docUri, undefined);
        expect(refs).toHaveLength(2);
        expect(refs[0].range.start.line).toBe(0);
        expect(refs[1].range.start.line).toBe(1);
    });

    it('returns empty array for no matches', () => {
        const text = 'var a = 1\nvar b = 2';
        const doc = createDocument(text);
        const refs = findReferencesInScope(text, 'x', 0, text.length, docUri, doc);
        expect(refs).toHaveLength(0);
    });

    it('handles word boundaries correctly', () => {
        const text = 'var count = 1\nvar counter = count';
        const doc = createDocument(text);
        const refs = findReferencesInScope(text, 'count', 0, text.length, docUri, doc);
        expect(refs).toHaveLength(2); // not 'counter'
    });

    it('handles special regex characters in word', () => {
        // This is an edge case - identifiers shouldn't have special chars
        // but the function should handle it gracefully
        const text = 'var x = 1';
        const doc = createDocument(text);
        const refs = findReferencesInScope(text, 'x.y', 0, text.length, docUri, doc);
        expect(refs).toHaveLength(0);
    });
});
