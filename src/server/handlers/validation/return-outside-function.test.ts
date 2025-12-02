/**
 * Tests for return outside function validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkReturnOutsideFunction } from './return-outside-function';

describe('Return outside function validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report error for return at top level', () => {
        const doc = createDoc(`
            return 42
        `);
        const diagnostics = checkReturnOutsideFunction(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("'return' statement outside of function");
    });

    it('should not report for return inside function', () => {
        const doc = createDoc(`
            fun calculate() number {
                return 42
            }
        `);
        const diagnostics = checkReturnOutsideFunction(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for return inside nested function', () => {
        const doc = createDoc(`
            fun outer() {
                fun inner() number {
                    return 1
                }
            }
        `);
        const diagnostics = checkReturnOutsideFunction(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report error for return in schema body', () => {
        const doc = createDoc(`
            schema Config {
                return 42
            }
        `);
        const diagnostics = checkReturnOutsideFunction(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("'return' statement outside of function");
    });

    it('should report error for return in component body (not in function)', () => {
        const doc = createDoc(`
            component Server {
                input string name
                return name
            }
        `);
        const diagnostics = checkReturnOutsideFunction(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should not report for return inside init block', () => {
        const doc = createDoc(`
            component Server {
                init {
                    return
                }
            }
        `);
        const diagnostics = checkReturnOutsideFunction(doc);

        // init is like a function, so return is allowed
        expect(diagnostics).toHaveLength(0);
    });

    it('should skip return in comments', () => {
        const doc = createDoc(`
            // return 42
        `);
        const diagnostics = checkReturnOutsideFunction(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should skip return in strings', () => {
        const doc = createDoc(`
            var x = "return 42"
        `);
        const diagnostics = checkReturnOutsideFunction(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report multiple returns outside function', () => {
        const doc = createDoc(`
            return 1
            return 2
        `);
        const diagnostics = checkReturnOutsideFunction(doc);

        expect(diagnostics).toHaveLength(2);
    });

    it('should handle return without value', () => {
        const doc = createDoc(`
            return
        `);
        const diagnostics = checkReturnOutsideFunction(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should not report for return in if block inside function', () => {
        const doc = createDoc(`
            fun check(boolean flag) number {
                if flag {
                    return 1
                }
                return 0
            }
        `);
        const diagnostics = checkReturnOutsideFunction(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report for return in if block outside function', () => {
        const doc = createDoc(`
            if true {
                return 1
            }
        `);
        const diagnostics = checkReturnOutsideFunction(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should not report for return in for loop inside function', () => {
        const doc = createDoc(`
            fun findFirst(number[] items) number {
                for item in items {
                    return item
                }
                return 0
            }
        `);
        const diagnostics = checkReturnOutsideFunction(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should handle function with array return type', () => {
        const doc = createDoc(`
            fun getNumbers() number[] {
                return [1, 2, 3]
            }
        `);
        const diagnostics = checkReturnOutsideFunction(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should handle function with string[] return type', () => {
        const doc = createDoc(`
            fun getNames() string[] {
                return ["Alice", "Bob"]
            }
        `);
        const diagnostics = checkReturnOutsideFunction(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should handle function with array return type and variable', () => {
        const doc = createDoc(`
            fun calculate() number[] {
                var result = 42
                return [result]
            }
        `);
        const diagnostics = checkReturnOutsideFunction(doc);

        expect(diagnostics).toHaveLength(0);
    });
});
