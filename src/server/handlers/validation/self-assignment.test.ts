/**
 * Tests for self-assignment validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkSelfAssignment } from './self-assignment';

describe('Self-assignment validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report warning for self-assignment', () => {
        const doc = createDoc(`
            var x = x
        `);
        const diagnostics = checkSelfAssignment(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Self-assignment: 'x' is assigned to itself");
    });

    it('should not report for normal assignment', () => {
        const doc = createDoc(`
            var x = 5
        `);
        const diagnostics = checkSelfAssignment(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for assignment from different variable', () => {
        const doc = createDoc(`
            var x = y
        `);
        const diagnostics = checkSelfAssignment(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report for reassignment to self', () => {
        const doc = createDoc(`
            var x = 5
            x = x
        `);
        const diagnostics = checkSelfAssignment(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should not report for compound assignment', () => {
        const doc = createDoc(`
            var x = 5
            x += x
        `);
        const diagnostics = checkSelfAssignment(doc);

        // x += x is not self-assignment, it's x = x + x
        expect(diagnostics).toHaveLength(0);
    });

    it('should skip in comments', () => {
        const doc = createDoc(`
            // var x = x
        `);
        const diagnostics = checkSelfAssignment(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should skip in strings', () => {
        const doc = createDoc(`
            var msg = "var x = x"
        `);
        const diagnostics = checkSelfAssignment(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report multiple self-assignments', () => {
        const doc = createDoc(`
            var x = x
            var y = y
        `);
        const diagnostics = checkSelfAssignment(doc);

        expect(diagnostics).toHaveLength(2);
    });

    it('should not report for property self-assignment (different context)', () => {
        const doc = createDoc(`
            config.name = config.name
        `);
        const diagnostics = checkSelfAssignment(doc);

        // This is property access, might be intentional
        expect(diagnostics).toHaveLength(0);
    });

    it('should handle typed variable declaration', () => {
        const doc = createDoc(`
            var number x = x
        `);
        const diagnostics = checkSelfAssignment(doc);

        expect(diagnostics).toHaveLength(1);
    });
});
