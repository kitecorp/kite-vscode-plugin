/**
 * Tests for useless expression validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkUselessExpression } from './useless-expression';

describe('Useless expression validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    describe('arithmetic expressions', () => {
        it('should report warning for x + 1 without assignment', () => {
            const doc = createDoc(`
fun test() {
    x + 1
}
            `);
            const diagnostics = checkUselessExpression(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('x + 1');
            expect(diagnostics[0].message).toContain('no effect');
        });

        it('should report warning for a - b without assignment', () => {
            const doc = createDoc(`
fun test() {
    a - b
}
            `);
            const diagnostics = checkUselessExpression(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('a - b');
        });

        it('should report warning for x * 2 without assignment', () => {
            const doc = createDoc(`
fun test() {
    x * 2
}
            `);
            const diagnostics = checkUselessExpression(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('x * 2');
        });

        it('should report warning for x / y without assignment', () => {
            const doc = createDoc(`
fun test() {
    x / y
}
            `);
            const diagnostics = checkUselessExpression(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('x / y');
        });

        it('should report warning for x % 2 without assignment', () => {
            const doc = createDoc(`
fun test() {
    x % 2
}
            `);
            const diagnostics = checkUselessExpression(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('x % 2');
        });
    });

    describe('valid expressions (no warning)', () => {
        it('should not report for assignment', () => {
            const doc = createDoc(`
fun test() {
    var result = x + 1
}
            `);
            const diagnostics = checkUselessExpression(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for compound assignment', () => {
            const doc = createDoc(`
fun test() {
    x += 1
}
            `);
            const diagnostics = checkUselessExpression(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for function call', () => {
            const doc = createDoc(`
fun test() {
    println("hello")
}
            `);
            const diagnostics = checkUselessExpression(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for return statement', () => {
            const doc = createDoc(`
fun test() number {
    return x + 1
}
            `);
            const diagnostics = checkUselessExpression(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for variable declaration', () => {
            const doc = createDoc(`
fun test() {
    var x = 5
}
            `);
            const diagnostics = checkUselessExpression(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for if condition', () => {
            const doc = createDoc(`
fun test() {
    if x > 0 {
        println("positive")
    }
}
            `);
            const diagnostics = checkUselessExpression(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for while condition', () => {
            const doc = createDoc(`
fun test() {
    while x > 0 {
        x = x - 1
    }
}
            `);
            const diagnostics = checkUselessExpression(doc);

            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('edge cases', () => {
        it('should skip comments', () => {
            const doc = createDoc(`
fun test() {
    // x + 1
}
            `);
            const diagnostics = checkUselessExpression(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should report multiple useless expressions', () => {
            const doc = createDoc(`
fun test() {
    a + b
    c * d
}
            `);
            const diagnostics = checkUselessExpression(doc);

            expect(diagnostics).toHaveLength(2);
        });

        it('should suggest assignment in message', () => {
            const doc = createDoc(`
fun test() {
    x + 1
}
            `);
            const diagnostics = checkUselessExpression(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('assign');
        });

        it('should handle numeric literals', () => {
            const doc = createDoc(`
fun test() {
    5 + 3
}
            `);
            const diagnostics = checkUselessExpression(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('5 + 3');
        });
    });
});
