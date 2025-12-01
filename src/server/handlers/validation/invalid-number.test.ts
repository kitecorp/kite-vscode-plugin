/**
 * Tests for invalid number literal validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkInvalidNumbers } from './invalid-number';

describe('Invalid number validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report error for multiple decimal points', () => {
        const doc = createDoc(`
            var x = 1.2.3
        `);
        const diagnostics = checkInvalidNumbers(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Invalid number literal '1.2.3'");
    });

    it('should report error for trailing decimal point', () => {
        const doc = createDoc(`
            var x = 123.
        `);
        const diagnostics = checkInvalidNumbers(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('trailing decimal point');
    });

    it('should not report for valid integers', () => {
        const doc = createDoc(`
            var x = 123
            var y = 0
            var z = 999999
        `);
        const diagnostics = checkInvalidNumbers(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for valid decimals', () => {
        const doc = createDoc(`
            var x = 12.34
            var y = 0.5
            var z = 100.00
        `);
        const diagnostics = checkInvalidNumbers(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for numbers in comments', () => {
        const doc = createDoc(`
            // var x = 1.2.3
        `);
        const diagnostics = checkInvalidNumbers(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for numbers in strings', () => {
        const doc = createDoc(`
            var x = "1.2.3"
        `);
        const diagnostics = checkInvalidNumbers(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for property access like num.toString', () => {
        const doc = createDoc(`
            var x = 123.toString()
        `);
        const diagnostics = checkInvalidNumbers(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report multiple invalid numbers', () => {
        const doc = createDoc(`
            var x = 1.2.3
            var y = 4.5.6
        `);
        const diagnostics = checkInvalidNumbers(doc);

        expect(diagnostics).toHaveLength(2);
    });
});
