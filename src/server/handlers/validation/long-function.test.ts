/**
 * Tests for long function validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkLongFunction } from './long-function';

describe('Long function validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    // Helper to generate lines
    const generateLines = (count: number, prefix: string = '    var x') => {
        return Array.from({ length: count }, (_, i) => `${prefix}${i} = ${i}`).join('\n');
    };

    it('should report warning for function with 51 lines', () => {
        const doc = createDoc(`
fun longFunction() {
${generateLines(51)}
}
        `);
        const diagnostics = checkLongFunction(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('longFunction');
        expect(diagnostics[0].message).toContain('lines long');
    });

    it('should not report for function with 50 lines', () => {
        const doc = createDoc(`
fun okFunction() {
${generateLines(48)}
}
        `);
        const diagnostics = checkLongFunction(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for short function', () => {
        const doc = createDoc(`
fun shortFunction() {
    var x = 1
    var y = 2
    return x + y
}
        `);
        const diagnostics = checkLongFunction(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not count empty lines', () => {
        const doc = createDoc(`
fun functionWithEmptyLines() {
${generateLines(30)}

    // lots of empty lines below





${generateLines(15, '    var y')}
}
        `);
        const diagnostics = checkLongFunction(doc);

        // 30 + 15 = 45 actual lines (plus braces), should be under 50
        expect(diagnostics).toHaveLength(0);
    });

    it('should not count comment-only lines', () => {
        const doc = createDoc(`
fun functionWithComments() {
${generateLines(30)}
    // comment 1
    // comment 2
    // comment 3
    // comment 4
    // comment 5
${generateLines(15, '    var y')}
}
        `);
        const diagnostics = checkLongFunction(doc);

        // 30 + 15 = 45 actual lines, comments don't count
        expect(diagnostics).toHaveLength(0);
    });

    it('should report multiple long functions', () => {
        const doc = createDoc(`
fun longFunc1() {
${generateLines(55)}
}

fun longFunc2() {
${generateLines(60)}
}
        `);
        const diagnostics = checkLongFunction(doc);

        expect(diagnostics).toHaveLength(2);
    });

    it('should handle function with return type', () => {
        const doc = createDoc(`
fun longFunction() number {
${generateLines(55)}
    return 42
}
        `);
        const diagnostics = checkLongFunction(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should handle function with parameters', () => {
        const doc = createDoc(`
fun longFunction(number a, string b) number {
${generateLines(55)}
    return a
}
        `);
        const diagnostics = checkLongFunction(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should skip functions in comments', () => {
        const doc = createDoc(`
// fun longFunction() {
// ${generateLines(55)}
// }
        `);
        const diagnostics = checkLongFunction(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should include line count in message', () => {
        const doc = createDoc(`
fun veryLongFunction() {
${generateLines(75)}
}
        `);
        const diagnostics = checkLongFunction(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toMatch(/\d+ lines long/);
    });

    it('should suggest max recommended lines', () => {
        const doc = createDoc(`
fun longFunction() {
${generateLines(55)}
}
        `);
        const diagnostics = checkLongFunction(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('50 lines');
    });
});
