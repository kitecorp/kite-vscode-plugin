/**
 * Tests for constant condition validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkConstantCondition } from './constant-condition';

describe('Constant condition validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    describe('boolean literals', () => {
        it('should report warning for if true', () => {
            const doc = createDoc(`
                if true {
                    println("always")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('always true');
        });

        it('should report warning for if false', () => {
            const doc = createDoc(`
                if false {
                    println("never")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('always false');
        });

        it('should report warning for while true', () => {
            const doc = createDoc(`
                while true {
                    process()
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('always true');
        });

        it('should report warning for while false', () => {
            const doc = createDoc(`
                while false {
                    process()
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('always false');
        });
    });

    describe('numeric comparisons', () => {
        it('should report warning for 1 == 1', () => {
            const doc = createDoc(`
                if 1 == 1 {
                    println("always")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('always true');
        });

        it('should report warning for 1 == 2', () => {
            const doc = createDoc(`
                if 1 == 2 {
                    println("never")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('always false');
        });

        it('should report warning for 5 > 3', () => {
            const doc = createDoc(`
                if 5 > 3 {
                    println("always")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('always true');
        });

        it('should report warning for 3 > 5', () => {
            const doc = createDoc(`
                if 3 > 5 {
                    println("never")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('always false');
        });

        it('should handle floating point comparisons', () => {
            const doc = createDoc(`
                if 1.5 == 1.5 {
                    println("always")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('always true');
        });
    });

    describe('string comparisons', () => {
        it('should report warning for same strings', () => {
            const doc = createDoc(`
                if "test" == "test" {
                    println("always")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('always true');
        });

        it('should report warning for different strings', () => {
            const doc = createDoc(`
                if "foo" == "bar" {
                    println("never")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('always false');
        });
    });

    describe('boolean comparisons', () => {
        it('should report warning for true == true', () => {
            const doc = createDoc(`
                if true == true {
                    println("always")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('always true');
        });

        it('should report warning for true == false', () => {
            const doc = createDoc(`
                if true == false {
                    println("never")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('always false');
        });
    });

    describe('negation', () => {
        it('should report warning for !true', () => {
            const doc = createDoc(`
                if !true {
                    println("never")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('always false');
        });

        it('should report warning for !false', () => {
            const doc = createDoc(`
                if !false {
                    println("always")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('always true');
        });
    });

    describe('logical operators', () => {
        it('should report warning for true || x', () => {
            const doc = createDoc(`
                if true || condition {
                    println("always")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('always true');
        });

        it('should report warning for false && x', () => {
            const doc = createDoc(`
                if false && condition {
                    println("never")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('always false');
        });
    });

    describe('non-constant conditions', () => {
        it('should not report for variable conditions', () => {
            const doc = createDoc(`
                if x {
                    println("maybe")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for variable comparisons', () => {
            const doc = createDoc(`
                if x == y {
                    println("maybe")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for function calls', () => {
            const doc = createDoc(`
                if isValid() {
                    println("maybe")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('edge cases', () => {
        it('should skip in comments', () => {
            const doc = createDoc(`
                // if true { }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should report multiple constant conditions', () => {
            const doc = createDoc(`
                if true {
                    println("a")
                }
                if false {
                    println("b")
                }
            `);
            const diagnostics = checkConstantCondition(doc);

            expect(diagnostics).toHaveLength(2);
        });
    });
});
