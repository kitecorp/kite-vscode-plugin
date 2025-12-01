/**
 * Tests for division by zero validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkDivisionByZero } from './division-by-zero';

describe('Division by zero validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report warning for division by literal zero', () => {
        const doc = createDoc(`
            var x = 10 / 0
        `);
        const diagnostics = checkDivisionByZero(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('Division by zero');
    });

    it('should report warning for modulo by literal zero', () => {
        const doc = createDoc(`
            var x = 10 % 0
        `);
        const diagnostics = checkDivisionByZero(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('Modulo by zero');
    });

    it('should not report for division by non-zero', () => {
        const doc = createDoc(`
            var x = 10 / 2
        `);
        const diagnostics = checkDivisionByZero(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for division by variable', () => {
        const doc = createDoc(`
            var y = 5
            var x = 10 / y
        `);
        const diagnostics = checkDivisionByZero(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report for division by 0.0', () => {
        const doc = createDoc(`
            var x = 10 / 0.0
        `);
        const diagnostics = checkDivisionByZero(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should skip division in comments', () => {
        const doc = createDoc(`
            // var x = 10 / 0
        `);
        const diagnostics = checkDivisionByZero(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should skip division in strings', () => {
        const doc = createDoc(`
            var x = "10 / 0"
        `);
        const diagnostics = checkDivisionByZero(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report multiple divisions by zero', () => {
        const doc = createDoc(`
            var x = 10 / 0
            var y = 20 / 0
        `);
        const diagnostics = checkDivisionByZero(doc);

        expect(diagnostics).toHaveLength(2);
    });

    it('should handle division in expressions', () => {
        const doc = createDoc(`
            var x = (a + b) / 0
        `);
        const diagnostics = checkDivisionByZero(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should handle /= operator with zero', () => {
        const doc = createDoc(`
            var x = 10
            x /= 0
        `);
        const diagnostics = checkDivisionByZero(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should not report for division by negative number', () => {
        const doc = createDoc(`
            var x = 10 / -5
        `);
        const diagnostics = checkDivisionByZero(doc);

        expect(diagnostics).toHaveLength(0);
    });
});
