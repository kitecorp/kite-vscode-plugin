/**
 * Tests for missing return statement validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkMissingReturn } from './missing-return';

describe('Missing return statement validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report error for function with return type but no return', () => {
        const doc = createDoc(`
            fun calculate(number x) number {
                var result = x * 2
            }
        `);
        const diagnostics = checkMissingReturn(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Function 'calculate' has return type 'number' but no return statement");
    });

    it('should not report for function with return statement', () => {
        const doc = createDoc(`
            fun calculate(number x) number {
                return x * 2
            }
        `);
        const diagnostics = checkMissingReturn(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for void function without return', () => {
        const doc = createDoc(`
            fun logMessage(string msg) void {
                println(msg)
            }
        `);
        const diagnostics = checkMissingReturn(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for function without return type', () => {
        const doc = createDoc(`
            fun logMessage(string msg) {
                println(msg)
            }
        `);
        const diagnostics = checkMissingReturn(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not be confused by return in nested function', () => {
        const doc = createDoc(`
            fun outer(number x) number {
                fun inner() number {
                    return 1
                }
            }
        `);
        const diagnostics = checkMissingReturn(doc);

        // outer has no return (inner's return doesn't count)
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Function 'outer'");
    });

    it('should not report when return is in string literal', () => {
        const doc = createDoc(`
            fun getMessage() string {
                return "please return the item"
            }
        `);
        const diagnostics = checkMissingReturn(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report when return is commented out but another exists', () => {
        const doc = createDoc(`
            fun calculate(number x) number {
                // return x * 3
                return x * 2
            }
        `);
        const diagnostics = checkMissingReturn(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report error when only return is in comment', () => {
        const doc = createDoc(`
            fun calculate(number x) number {
                // return x * 2
                var y = x
            }
        `);
        const diagnostics = checkMissingReturn(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("no return statement");
    });

    it('should skip function definitions in comments', () => {
        const doc = createDoc(`
            // fun calculate(number x) number {}
        `);
        const diagnostics = checkMissingReturn(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report multiple functions missing return', () => {
        const doc = createDoc(`
            fun add(number a, number b) number {
                var sum = a + b
            }
            fun multiply(number a, number b) number {
                var product = a * b
            }
        `);
        const diagnostics = checkMissingReturn(doc);

        expect(diagnostics).toHaveLength(2);
    });

    it('should handle string return type', () => {
        const doc = createDoc(`
            fun getName() string {
                var name = "test"
            }
        `);
        const diagnostics = checkMissingReturn(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("return type 'string'");
    });

    it('should handle boolean return type', () => {
        const doc = createDoc(`
            fun isValid() boolean {
                var valid = true
            }
        `);
        const diagnostics = checkMissingReturn(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("return type 'boolean'");
    });
});
