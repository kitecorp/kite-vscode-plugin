/**
 * Tests for negated comparison validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { checkNegatedComparison } from './negated-comparison';

describe('Negated comparison validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    describe('equality operators', () => {
        it('should suggest x != y for !(x == y)', () => {
            const doc = createDoc(`
                if !(x == y) {
                    println("not equal")
                }
            `);
            const diagnostics = checkNegatedComparison(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('x != y');
            expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Hint);
        });

        it('should suggest x == y for !(x != y)', () => {
            const doc = createDoc(`
                if !(x != y) {
                    println("equal")
                }
            `);
            const diagnostics = checkNegatedComparison(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('x == y');
        });
    });

    describe('relational operators', () => {
        it('should suggest x <= y for !(x > y)', () => {
            const doc = createDoc(`
                if !(a > b) {
                    println("not greater")
                }
            `);
            const diagnostics = checkNegatedComparison(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('a <= b');
        });

        it('should suggest x >= y for !(x < y)', () => {
            const doc = createDoc(`
                if !(a < b) {
                    println("not less")
                }
            `);
            const diagnostics = checkNegatedComparison(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('a >= b');
        });

        it('should suggest x > y for !(x <= y)', () => {
            const doc = createDoc(`
                if !(a <= b) {
                    println("greater")
                }
            `);
            const diagnostics = checkNegatedComparison(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('a > b');
        });

        it('should suggest x < y for !(x >= y)', () => {
            const doc = createDoc(`
                if !(a >= b) {
                    println("less")
                }
            `);
            const diagnostics = checkNegatedComparison(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('a < b');
        });
    });

    describe('complex expressions', () => {
        it('should handle expressions with numbers', () => {
            const doc = createDoc(`
                if !(count == 0) {
                    process()
                }
            `);
            const diagnostics = checkNegatedComparison(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('count != 0');
        });

        it('should handle expressions with strings', () => {
            const doc = createDoc(`
                if !(name == "test") {
                    process()
                }
            `);
            const diagnostics = checkNegatedComparison(doc);

            expect(diagnostics).toHaveLength(1);
        });
    });

    describe('non-negated comparisons (no hint)', () => {
        it('should not report for simple comparison', () => {
            const doc = createDoc(`
                if x == y {
                    println("equal")
                }
            `);
            const diagnostics = checkNegatedComparison(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for simple negation', () => {
            const doc = createDoc(`
                if !flag {
                    println("not flag")
                }
            `);
            const diagnostics = checkNegatedComparison(doc);

            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('edge cases', () => {
        it('should skip in comments', () => {
            const doc = createDoc(`
                // if !(x == y) { }
            `);
            const diagnostics = checkNegatedComparison(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should skip in strings', () => {
            const doc = createDoc(`
                var msg = "!(x == y)"
            `);
            const diagnostics = checkNegatedComparison(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should report multiple negated comparisons', () => {
            const doc = createDoc(`
                if !(a == b) {
                    println("a")
                }
                if !(c > d) {
                    println("b")
                }
            `);
            const diagnostics = checkNegatedComparison(doc);

            expect(diagnostics).toHaveLength(2);
        });

        it('should handle while loop condition', () => {
            const doc = createDoc(`
                while !(done == true) {
                    process()
                }
            `);
            const diagnostics = checkNegatedComparison(doc);

            expect(diagnostics).toHaveLength(1);
        });

        it('should use Hint severity', () => {
            const doc = createDoc(`
                if !(x == y) { }
            `);
            const diagnostics = checkNegatedComparison(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Hint);
        });
    });
});
