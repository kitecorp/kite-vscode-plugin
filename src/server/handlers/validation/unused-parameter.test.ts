/**
 * Tests for unused parameter validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticTag } from 'vscode-languageserver/node';
import { checkUnusedParameter } from './unused-parameter';

describe('Unused parameter validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report warning for unused parameter', () => {
        const doc = createDoc(`
fun calculate(number x) number {
    return 42
}
        `);
        const diagnostics = checkUnusedParameter(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("'x'");
        expect(diagnostics[0].message).toContain('never used');
    });

    it('should not report for used parameter', () => {
        const doc = createDoc(`
fun calculate(number x) number {
    return x * 2
}
        `);
        const diagnostics = checkUnusedParameter(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for parameter starting with underscore', () => {
        const doc = createDoc(`
fun callback(number _unused) {
    println("ignoring parameter")
}
        `);
        const diagnostics = checkUnusedParameter(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report multiple unused parameters', () => {
        const doc = createDoc(`
fun process(number a, string b, boolean c) {
    println("ignoring all")
}
        `);
        const diagnostics = checkUnusedParameter(doc);

        expect(diagnostics).toHaveLength(3);
    });

    it('should report only unused parameters', () => {
        const doc = createDoc(`
fun process(number a, string b, boolean c) {
    println(b)
}
        `);
        const diagnostics = checkUnusedParameter(doc);

        expect(diagnostics).toHaveLength(2);
        expect(diagnostics.some(d => d.message.includes("'a'"))).toBe(true);
        expect(diagnostics.some(d => d.message.includes("'c'"))).toBe(true);
    });

    it('should detect usage in nested blocks', () => {
        const doc = createDoc(`
fun process(number x) {
    if true {
        println(x)
    }
}
        `);
        const diagnostics = checkUnusedParameter(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should detect usage in string interpolation', () => {
        const doc = createDoc(`
fun greet(string name) {
    var msg = "Hello, " + name + "!"
}
        `);
        const diagnostics = checkUnusedParameter(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not count usage in comments', () => {
        const doc = createDoc(`
fun process(number x) {
    // x is not used here
    return 42
}
        `);
        const diagnostics = checkUnusedParameter(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should not count usage in strings', () => {
        const doc = createDoc(`
fun process(number x) {
    println("x is the parameter name")
}
        `);
        const diagnostics = checkUnusedParameter(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should handle array type parameters', () => {
        const doc = createDoc(`
fun process(string[] items) {
    return 42
}
        `);
        const diagnostics = checkUnusedParameter(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("'items'");
    });

    it('should have Unnecessary tag', () => {
        const doc = createDoc(`
fun test(number unused) {
    return 0
}
        `);
        const diagnostics = checkUnusedParameter(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].tags).toContain(DiagnosticTag.Unnecessary);
    });

    it('should suggest prefix with underscore', () => {
        const doc = createDoc(`
fun test(number unused) {
    return 0
}
        `);
        const diagnostics = checkUnusedParameter(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("'_'");
    });

    it('should handle function with return type', () => {
        const doc = createDoc(`
fun calculate(number x, number y) number {
    return 42
}
        `);
        const diagnostics = checkUnusedParameter(doc);

        expect(diagnostics).toHaveLength(2);
    });

    it('should not report for function with no parameters', () => {
        const doc = createDoc(`
fun noParams() {
    return 42
}
        `);
        const diagnostics = checkUnusedParameter(doc);

        expect(diagnostics).toHaveLength(0);
    });
});
