/**
 * Tests for unused function validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkUnusedFunctions } from './unused-function';
import { DiagnosticTag } from 'vscode-languageserver/node';

describe('Unused function validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report warning for unused function', () => {
        const doc = createDoc(`
            fun helper() number {
                return 42
            }
        `);
        const diagnostics = checkUnusedFunctions(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Function 'helper' is declared but never called");
        expect(diagnostics[0].tags).toContain(DiagnosticTag.Unnecessary);
    });

    it('should not report for used function', () => {
        const doc = createDoc(`
            fun helper() number {
                return 42
            }

            var result = helper()
        `);
        const diagnostics = checkUnusedFunctions(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for function called in another function', () => {
        const doc = createDoc(`
            fun helper() number {
                return 42
            }

            fun main() {
                var x = helper()
            }
        `);
        const diagnostics = checkUnusedFunctions(doc);

        // helper is used in main, but main is unused
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Function 'main'");
    });

    it('should not report for recursive function', () => {
        const doc = createDoc(`
            fun factorial(number n) number {
                if n <= 1 {
                    return 1
                }
                return n * factorial(n - 1)
            }
        `);
        const diagnostics = checkUnusedFunctions(doc);

        // Recursive call counts as a use
        expect(diagnostics).toHaveLength(0);
    });

    it('should handle multiple functions', () => {
        const doc = createDoc(`
            fun used() number {
                return 1
            }

            fun unused1() number {
                return 2
            }

            fun unused2() number {
                return 3
            }

            var x = used()
        `);
        const diagnostics = checkUnusedFunctions(doc);

        expect(diagnostics).toHaveLength(2);
        expect(diagnostics.some(d => d.message.includes("'unused1'"))).toBe(true);
        expect(diagnostics.some(d => d.message.includes("'unused2'"))).toBe(true);
    });

    it('should not report for function used in string interpolation', () => {
        const doc = createDoc(`
            fun getName() string {
                return "test"
            }

            var msg = "Hello \${getName()}"
        `);
        const diagnostics = checkUnusedFunctions(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should skip function definitions in comments', () => {
        const doc = createDoc(`
            // fun commented() {}
        `);
        const diagnostics = checkUnusedFunctions(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not count function name in comment as usage', () => {
        const doc = createDoc(`
            fun helper() number {
                return 42
            }

            // Call helper() here
        `);
        const diagnostics = checkUnusedFunctions(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should not count function name in string as usage', () => {
        const doc = createDoc(`
            fun helper() number {
                return 42
            }

            var msg = "helper()"
        `);
        const diagnostics = checkUnusedFunctions(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should not report for function used as callback', () => {
        const doc = createDoc(`
            fun callback() {
                println("called")
            }

            var fn = callback
        `);
        const diagnostics = checkUnusedFunctions(doc);

        // Function reference without call still counts as usage
        expect(diagnostics).toHaveLength(0);
    });

    it('should handle function with no parameters', () => {
        const doc = createDoc(`
            fun noParams() {
                println("hello")
            }
        `);
        const diagnostics = checkUnusedFunctions(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should handle function with return type', () => {
        const doc = createDoc(`
            fun withReturn() string {
                return "hello"
            }
        `);
        const diagnostics = checkUnusedFunctions(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should not report for mutually recursive functions', () => {
        const doc = createDoc(`
            fun isEven(number n) boolean {
                if n == 0 {
                    return true
                }
                return isOdd(n - 1)
            }

            fun isOdd(number n) boolean {
                if n == 0 {
                    return false
                }
                return isEven(n - 1)
            }
        `);
        const diagnostics = checkUnusedFunctions(doc);

        // Both functions call each other
        expect(diagnostics).toHaveLength(0);
    });
});
