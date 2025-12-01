/**
 * Tests for implicit any validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { checkImplicitAny } from './implicit-any';

describe('Implicit any validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    describe('function call assignments', () => {
        it('should report hint for var assigned from function call', () => {
            const doc = createDoc(`
                var result = getData()
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'result'");
            expect(diagnostics[0].message).toContain('implicit');
            expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Hint);
        });

        it('should report hint for var assigned from method call', () => {
            const doc = createDoc(`
                var value = obj.getValue()
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'value'");
        });
    });

    describe('variable reference assignments', () => {
        it('should report hint for var assigned from another variable', () => {
            const doc = createDoc(`
                var copy = original
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'copy'");
        });

        it('should report hint for var assigned from property access', () => {
            const doc = createDoc(`
                var name = config.name
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(1);
        });
    });

    describe('inferable types (no hint)', () => {
        it('should not report for string literal', () => {
            const doc = createDoc(`
                var name = "hello"
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for number literal', () => {
            const doc = createDoc(`
                var count = 42
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for boolean literal', () => {
            const doc = createDoc(`
                var flag = true
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for null literal', () => {
            const doc = createDoc(`
                var nothing = null
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for array literal', () => {
            const doc = createDoc(`
                var items = [1, 2, 3]
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for object literal', () => {
            const doc = createDoc(`
                var config = { name: "test" }
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for simple arithmetic', () => {
            const doc = createDoc(`
                var sum = 1 + 2
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('explicit type annotations (no hint)', () => {
        it('should not report for var with explicit type', () => {
            const doc = createDoc(`
                var string name = getValue()
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for var with array type', () => {
            const doc = createDoc(`
                var string[] items = getItems()
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('edge cases', () => {
        it('should skip in comments', () => {
            const doc = createDoc(`
                // var x = getData()
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should report multiple implicit any', () => {
            const doc = createDoc(`
                var a = getData()
                var b = getMore()
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(2);
        });

        it('should use Hint severity', () => {
            const doc = createDoc(`
                var x = unknown
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Hint);
        });

        it('should suggest adding type annotation', () => {
            const doc = createDoc(`
                var x = getValue()
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('type');
        });

        it('should handle decimal numbers', () => {
            const doc = createDoc(`
                var pi = 3.14
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should handle negative numbers', () => {
            const doc = createDoc(`
                var negative = -5
            `);
            const diagnostics = checkImplicitAny(doc);

            expect(diagnostics).toHaveLength(0);
        });
    });
});
