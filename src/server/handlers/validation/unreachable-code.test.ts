/**
 * Tests for unreachable code detection
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkUnreachableCode } from './unreachable-code';

describe('Unreachable code validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report warning for code after return', () => {
        const doc = createDoc(`
            fun calculate() number {
                return 42
                var x = 10
            }
        `);
        const diagnostics = checkUnreachableCode(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('Unreachable code after return statement');
    });

    it('should not report when return is last statement', () => {
        const doc = createDoc(`
            fun calculate() number {
                var x = 10
                return x * 2
            }
        `);
        const diagnostics = checkUnreachableCode(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for empty function after return', () => {
        const doc = createDoc(`
            fun calculate() number {
                return 42
            }
        `);
        const diagnostics = checkUnreachableCode(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report when only comments after return', () => {
        const doc = createDoc(`
            fun calculate() number {
                return 42
                // this is fine
            }
        `);
        const diagnostics = checkUnreachableCode(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report for multiple statements after return', () => {
        const doc = createDoc(`
            fun process() number {
                return 1
                var a = 2
                var b = 3
            }
        `);
        const diagnostics = checkUnreachableCode(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should skip function definitions in comments', () => {
        const doc = createDoc(`
            // fun calculate() number {
            //     return 42
            //     var x = 10
            // }
        `);
        const diagnostics = checkUnreachableCode(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should handle function without return type', () => {
        const doc = createDoc(`
            fun process() {
                return
                var x = 10
            }
        `);
        const diagnostics = checkUnreachableCode(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should report for multiple functions with unreachable code', () => {
        const doc = createDoc(`
            fun first() number {
                return 1
                var a = 2
            }
            fun second() number {
                return 2
                var b = 3
            }
        `);
        const diagnostics = checkUnreachableCode(doc);

        expect(diagnostics).toHaveLength(2);
    });

    it('should not be affected by return in strings', () => {
        const doc = createDoc(`
            fun getMessage() string {
                var msg = "return value"
                return msg
            }
        `);
        const diagnostics = checkUnreachableCode(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not flag code in nested blocks after return in outer', () => {
        const doc = createDoc(`
            fun calculate(boolean flag) number {
                if flag {
                    return 1
                }
                return 0
            }
        `);
        const diagnostics = checkUnreachableCode(doc);

        expect(diagnostics).toHaveLength(0);
    });
});
