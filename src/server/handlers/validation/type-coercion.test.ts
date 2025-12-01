/**
 * Tests for type coercion validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkTypeCoercion } from './type-coercion';

describe('Type coercion validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    describe('number vs string', () => {
        it('should report warning for number == string', () => {
            const doc = createDoc(`
                if 5 == "5" {
                    println("coercion")
                }
            `);
            const diagnostics = checkTypeCoercion(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('number');
            expect(diagnostics[0].message).toContain('string');
        });

        it('should report warning for string == number', () => {
            const doc = createDoc(`
                if "10" == 10 {
                    println("coercion")
                }
            `);
            const diagnostics = checkTypeCoercion(doc);

            expect(diagnostics).toHaveLength(1);
        });

        it('should report warning for number != string', () => {
            const doc = createDoc(`
                if 5 != "5" {
                    println("coercion")
                }
            `);
            const diagnostics = checkTypeCoercion(doc);

            expect(diagnostics).toHaveLength(1);
        });
    });

    describe('boolean vs other types', () => {
        it('should report warning for boolean == number', () => {
            const doc = createDoc(`
                if true == 1 {
                    println("coercion")
                }
            `);
            const diagnostics = checkTypeCoercion(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('boolean');
            expect(diagnostics[0].message).toContain('number');
        });

        it('should report warning for boolean == string', () => {
            const doc = createDoc(`
                if false == "false" {
                    println("coercion")
                }
            `);
            const diagnostics = checkTypeCoercion(doc);

            expect(diagnostics).toHaveLength(1);
        });
    });

    describe('null comparisons', () => {
        it('should report warning for null == number', () => {
            const doc = createDoc(`
                if null == 0 {
                    println("coercion")
                }
            `);
            const diagnostics = checkTypeCoercion(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('null');
            expect(diagnostics[0].message).toContain('number');
        });

        it('should report warning for null == string', () => {
            const doc = createDoc(`
                if null == "" {
                    println("coercion")
                }
            `);
            const diagnostics = checkTypeCoercion(doc);

            expect(diagnostics).toHaveLength(1);
        });
    });

    describe('same type comparisons (no warning)', () => {
        it('should not report for number == number', () => {
            const doc = createDoc(`
                if 5 == 10 {
                    println("ok")
                }
            `);
            const diagnostics = checkTypeCoercion(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for string == string', () => {
            const doc = createDoc(`
                if "hello" == "world" {
                    println("ok")
                }
            `);
            const diagnostics = checkTypeCoercion(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for boolean == boolean', () => {
            const doc = createDoc(`
                if true == false {
                    println("ok")
                }
            `);
            const diagnostics = checkTypeCoercion(doc);

            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('variable comparisons (no warning)', () => {
        it('should not report for variable == number', () => {
            const doc = createDoc(`
                if x == 5 {
                    println("unknown type")
                }
            `);
            const diagnostics = checkTypeCoercion(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for variable == variable', () => {
            const doc = createDoc(`
                if x == y {
                    println("unknown types")
                }
            `);
            const diagnostics = checkTypeCoercion(doc);

            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('edge cases', () => {
        it('should skip in comments', () => {
            const doc = createDoc(`
                // if 5 == "5" { }
            `);
            const diagnostics = checkTypeCoercion(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should skip in strings', () => {
            const doc = createDoc(`
                var msg = "5 == true"
            `);
            const diagnostics = checkTypeCoercion(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should report multiple type coercions', () => {
            const doc = createDoc(`
                if 5 == "5" {
                    println("a")
                }
                if true == 1 {
                    println("b")
                }
            `);
            const diagnostics = checkTypeCoercion(doc);

            expect(diagnostics).toHaveLength(2);
        });

        it('should handle decimal numbers', () => {
            const doc = createDoc(`
                if 3.14 == "pi" {
                    println("coercion")
                }
            `);
            const diagnostics = checkTypeCoercion(doc);

            expect(diagnostics).toHaveLength(1);
        });
    });
});
