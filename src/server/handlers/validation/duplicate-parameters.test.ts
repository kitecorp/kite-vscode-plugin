/**
 * Tests for duplicate parameter validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkDuplicateParameters } from './duplicate-parameters';

describe('Duplicate parameter validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report error for duplicate parameter names', () => {
        const doc = createDoc('fun test(string x, number x) {}');
        const diagnostics = checkDuplicateParameters(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toBe("Duplicate parameter 'x'");
    });

    it('should report multiple errors for multiple duplicates', () => {
        const doc = createDoc('fun test(string a, number a, boolean b, string b) {}');
        const diagnostics = checkDuplicateParameters(doc);

        expect(diagnostics).toHaveLength(2);
    });

    it('should not report error for unique parameter names', () => {
        const doc = createDoc('fun test(string x, number y, boolean z) {}');
        const diagnostics = checkDuplicateParameters(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report error for single parameter', () => {
        const doc = createDoc('fun test(string x) {}');
        const diagnostics = checkDuplicateParameters(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report error for no parameters', () => {
        const doc = createDoc('fun test() {}');
        const diagnostics = checkDuplicateParameters(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should handle array type parameters', () => {
        const doc = createDoc('fun test(string[] items, number[] items) {}');
        const diagnostics = checkDuplicateParameters(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toBe("Duplicate parameter 'items'");
    });

    it('should skip functions in comments', () => {
        const doc = createDoc('// fun test(string x, number x) {}');
        const diagnostics = checkDuplicateParameters(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should check multiple functions independently', () => {
        const doc = createDoc(`
            fun foo(string x) {}
            fun bar(string x) {}
        `);
        const diagnostics = checkDuplicateParameters(doc);

        expect(diagnostics).toHaveLength(0);
    });
});
