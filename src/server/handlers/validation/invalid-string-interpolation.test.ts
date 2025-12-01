/**
 * Tests for invalid string interpolation validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkInvalidStringInterpolation } from './invalid-string-interpolation';

describe('Invalid string interpolation validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report error for unclosed ${', () => {
        const doc = createDoc(`
            var x = "Hello \${name"
        `);
        const diagnostics = checkInvalidStringInterpolation(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('Unclosed string interpolation');
    });

    it('should not report for valid interpolation', () => {
        const doc = createDoc(`
            var x = "Hello \${name}"
        `);
        const diagnostics = checkInvalidStringInterpolation(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for simple $var interpolation', () => {
        const doc = createDoc(`
            var x = "Hello $name"
        `);
        const diagnostics = checkInvalidStringInterpolation(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report error for nested unclosed ${', () => {
        const doc = createDoc(`
            var x = "Value: \${obj.prop"
        `);
        const diagnostics = checkInvalidStringInterpolation(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should not report for escaped $', () => {
        const doc = createDoc(`
            var x = "Price: \\$100"
        `);
        const diagnostics = checkInvalidStringInterpolation(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for single-quoted strings', () => {
        const doc = createDoc(`
            var x = 'Hello \${name'
        `);
        const diagnostics = checkInvalidStringInterpolation(doc);

        // Single-quoted strings don't have interpolation
        expect(diagnostics).toHaveLength(0);
    });

    it('should handle multiple strings on same line', () => {
        const doc = createDoc(`
            var x = "Valid \${a}" + "Invalid \${b"
        `);
        const diagnostics = checkInvalidStringInterpolation(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should report multiple unclosed interpolations', () => {
        const doc = createDoc(`
            var x = "Hello \${name"
            var y = "World \${value"
        `);
        const diagnostics = checkInvalidStringInterpolation(doc);

        expect(diagnostics).toHaveLength(2);
    });

    it('should handle nested braces in interpolation', () => {
        const doc = createDoc(`
            var x = "Result: \${obj.method()}"
        `);
        const diagnostics = checkInvalidStringInterpolation(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report error when } is missing but string closes', () => {
        const doc = createDoc(`
            var x = "Start \${name end"
        `);
        const diagnostics = checkInvalidStringInterpolation(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should skip strings in comments', () => {
        const doc = createDoc(`
            // var x = "Hello \${name"
        `);
        const diagnostics = checkInvalidStringInterpolation(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should handle empty interpolation', () => {
        const doc = createDoc(`
            var x = "Hello \${}"
        `);
        const diagnostics = checkInvalidStringInterpolation(doc);

        // Empty interpolation is valid syntactically, even if semantically wrong
        expect(diagnostics).toHaveLength(0);
    });

    it('should handle interpolation with nested object access', () => {
        const doc = createDoc(`
            var x = "Value: \${a.b.c}"
        `);
        const diagnostics = checkInvalidStringInterpolation(doc);

        expect(diagnostics).toHaveLength(0);
    });
});
