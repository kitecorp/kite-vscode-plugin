/**
 * Tests for too many parameters validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkTooManyParameters } from './too-many-parameters';

describe('Too many parameters validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report warning for function with 6 parameters', () => {
        const doc = createDoc(`
            fun process(number a, number b, number c, number d, number e, number f) {
                return a + b + c + d + e + f
            }
        `);
        const diagnostics = checkTooManyParameters(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('6 parameters');
        expect(diagnostics[0].message).toContain('process');
    });

    it('should report warning for function with 7 parameters', () => {
        const doc = createDoc(`
            fun calculate(number a, string b, boolean c, number d, string e, boolean f, any g) number {
                return 42
            }
        `);
        const diagnostics = checkTooManyParameters(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('7 parameters');
    });

    it('should not report for function with 5 parameters', () => {
        const doc = createDoc(`
            fun process(number a, number b, number c, number d, number e) {
                return a + b + c + d + e
            }
        `);
        const diagnostics = checkTooManyParameters(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for function with 3 parameters', () => {
        const doc = createDoc(`
            fun calculate(number x, number y, number z) number {
                return x + y + z
            }
        `);
        const diagnostics = checkTooManyParameters(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for function with no parameters', () => {
        const doc = createDoc(`
            fun init() {
                println("initialized")
            }
        `);
        const diagnostics = checkTooManyParameters(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for function with 1 parameter', () => {
        const doc = createDoc(`
            fun process(number x) number {
                return x * 2
            }
        `);
        const diagnostics = checkTooManyParameters(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should skip functions in comments', () => {
        const doc = createDoc(`
            // fun process(number a, number b, number c, number d, number e, number f) { }
        `);
        const diagnostics = checkTooManyParameters(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report multiple functions with too many parameters', () => {
        const doc = createDoc(`
            fun func1(number a, number b, number c, number d, number e, number f) { }
            fun func2(number a, number b, number c, number d, number e, number f, number g) { }
        `);
        const diagnostics = checkTooManyParameters(doc);

        expect(diagnostics).toHaveLength(2);
    });

    it('should handle functions with array type parameters', () => {
        const doc = createDoc(`
            fun process(string[] a, number[] b, boolean[] c, any[] d, object[] e, string[] f) { }
        `);
        const diagnostics = checkTooManyParameters(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('6 parameters');
    });

    it('should suggest using a schema for grouping', () => {
        const doc = createDoc(`
            fun process(number a, number b, number c, number d, number e, number f) { }
        `);
        const diagnostics = checkTooManyParameters(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('schema');
    });
});
