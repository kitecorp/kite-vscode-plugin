/**
 * Tests for redundant boolean validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkRedundantBoolean } from './redundant-boolean';

describe('Redundant boolean validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    describe('x == true', () => {
        it('should suggest simplification for x == true', () => {
            const doc = createDoc(`
                if isValid == true {
                    process()
                }
            `);
            const diagnostics = checkRedundantBoolean(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'isValid'");
            expect(diagnostics[0].message).toContain('simplified');
        });

        it('should suggest simplification for true == x', () => {
            const doc = createDoc(`
                if true == isValid {
                    process()
                }
            `);
            const diagnostics = checkRedundantBoolean(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'isValid'");
        });
    });

    describe('x == false', () => {
        it('should suggest !x for x == false', () => {
            const doc = createDoc(`
                if isValid == false {
                    handleError()
                }
            `);
            const diagnostics = checkRedundantBoolean(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'!isValid'");
        });

        it('should suggest !x for false == x', () => {
            const doc = createDoc(`
                if false == isValid {
                    handleError()
                }
            `);
            const diagnostics = checkRedundantBoolean(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'!isValid'");
        });
    });

    describe('x != true', () => {
        it('should suggest !x for x != true', () => {
            const doc = createDoc(`
                if isValid != true {
                    handleError()
                }
            `);
            const diagnostics = checkRedundantBoolean(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'!isValid'");
        });
    });

    describe('x != false', () => {
        it('should suggest x for x != false', () => {
            const doc = createDoc(`
                if isValid != false {
                    process()
                }
            `);
            const diagnostics = checkRedundantBoolean(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'isValid'");
        });
    });

    describe('valid comparisons (no warning)', () => {
        it('should not report for true == true', () => {
            const doc = createDoc(`
                if true == true {
                    println("constant")
                }
            `);
            const diagnostics = checkRedundantBoolean(doc);

            // true == true is handled by constant-condition, not redundant-boolean
            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for x == y', () => {
            const doc = createDoc(`
                if a == b {
                    println("comparison")
                }
            `);
            const diagnostics = checkRedundantBoolean(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for x == 1', () => {
            const doc = createDoc(`
                if count == 1 {
                    println("one")
                }
            `);
            const diagnostics = checkRedundantBoolean(doc);

            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('edge cases', () => {
        it('should skip in comments', () => {
            const doc = createDoc(`
                // if x == true { }
            `);
            const diagnostics = checkRedundantBoolean(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should skip in strings', () => {
            const doc = createDoc(`
                var msg = "x == true"
            `);
            const diagnostics = checkRedundantBoolean(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should report multiple redundant booleans', () => {
            const doc = createDoc(`
                if a == true {
                    println("a")
                }
                if b == false {
                    println("b")
                }
            `);
            const diagnostics = checkRedundantBoolean(doc);

            expect(diagnostics).toHaveLength(2);
        });

        it('should handle while loop condition', () => {
            const doc = createDoc(`
                while running == true {
                    process()
                }
            `);
            const diagnostics = checkRedundantBoolean(doc);

            expect(diagnostics).toHaveLength(1);
        });
    });
});
