/**
 * Tests for redundant condition validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkRedundantCondition } from './redundant-condition';

describe('Redundant condition validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    describe('redundant AND (&&)', () => {
        it('should report warning for x && x', () => {
            const doc = createDoc(`
                if x && x {
                    println("redundant")
                }
            `);
            const diagnostics = checkRedundantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'x && x'");
            expect(diagnostics[0].message).toContain("equivalent to 'x'");
        });

        it('should report warning for isValid && isValid', () => {
            const doc = createDoc(`
                if isValid && isValid {
                    process()
                }
            `);
            const diagnostics = checkRedundantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("isValid && isValid");
        });

        it('should not report for x && y', () => {
            const doc = createDoc(`
                if x && y {
                    println("different operands")
                }
            `);
            const diagnostics = checkRedundantCondition(doc);

            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('redundant OR (||)', () => {
        it('should report warning for x || x', () => {
            const doc = createDoc(`
                if x || x {
                    println("redundant")
                }
            `);
            const diagnostics = checkRedundantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'x || x'");
            expect(diagnostics[0].message).toContain("equivalent to 'x'");
        });

        it('should report warning for enabled || enabled', () => {
            const doc = createDoc(`
                while enabled || enabled {
                    process()
                }
            `);
            const diagnostics = checkRedundantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("enabled || enabled");
        });

        it('should not report for x || y', () => {
            const doc = createDoc(`
                if x || y {
                    println("different operands")
                }
            `);
            const diagnostics = checkRedundantCondition(doc);

            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('edge cases', () => {
        it('should skip in comments', () => {
            const doc = createDoc(`
                // if x && x { }
            `);
            const diagnostics = checkRedundantCondition(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should skip in strings', () => {
            const doc = createDoc(`
                var msg = "x && x"
            `);
            const diagnostics = checkRedundantCondition(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should report multiple redundant conditions', () => {
            const doc = createDoc(`
                if a && a {
                    println("first")
                }
                if b || b {
                    println("second")
                }
            `);
            const diagnostics = checkRedundantCondition(doc);

            expect(diagnostics).toHaveLength(2);
        });

        it('should handle redundant condition in expression', () => {
            const doc = createDoc(`
                var result = flag && flag
            `);
            const diagnostics = checkRedundantCondition(doc);

            expect(diagnostics).toHaveLength(1);
        });

        it('should not flag chained conditions with different operands', () => {
            const doc = createDoc(`
                if a && b && c {
                    println("all different")
                }
            `);
            const diagnostics = checkRedundantCondition(doc);

            expect(diagnostics).toHaveLength(0);
        });
    });
});
