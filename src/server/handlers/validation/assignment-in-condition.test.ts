/**
 * Tests for assignment in condition validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkAssignmentInCondition } from './assignment-in-condition';

describe('Assignment in condition validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report warning for assignment in if condition', () => {
        const doc = createDoc(`
            if x = 5 {
                println("x")
            }
        `);
        const diagnostics = checkAssignmentInCondition(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('Assignment in condition');
        expect(diagnostics[0].message).toContain('==');
    });

    it('should report warning for assignment in while condition', () => {
        const doc = createDoc(`
            while x = true {
                process()
            }
        `);
        const diagnostics = checkAssignmentInCondition(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('Assignment in condition');
    });

    it('should not report for comparison in if', () => {
        const doc = createDoc(`
            if x == 5 {
                println("x")
            }
        `);
        const diagnostics = checkAssignmentInCondition(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for comparison in while', () => {
        const doc = createDoc(`
            while x == true {
                process()
            }
        `);
        const diagnostics = checkAssignmentInCondition(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for != comparison', () => {
        const doc = createDoc(`
            if x != 5 {
                println("x")
            }
        `);
        const diagnostics = checkAssignmentInCondition(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for <= comparison', () => {
        const doc = createDoc(`
            if x <= 5 {
                println("x")
            }
        `);
        const diagnostics = checkAssignmentInCondition(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for >= comparison', () => {
        const doc = createDoc(`
            if x >= 5 {
                println("x")
            }
        `);
        const diagnostics = checkAssignmentInCondition(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should skip in comments', () => {
        const doc = createDoc(`
            // if x = 5 { }
        `);
        const diagnostics = checkAssignmentInCondition(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should skip in strings', () => {
        const doc = createDoc(`
            var msg = "if x = 5 { }"
        `);
        const diagnostics = checkAssignmentInCondition(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report multiple assignments', () => {
        const doc = createDoc(`
            if x = 5 {
                println("x")
            }
            while y = true {
                process()
            }
        `);
        const diagnostics = checkAssignmentInCondition(doc);

        expect(diagnostics).toHaveLength(2);
    });

    it('should handle if with parentheses', () => {
        const doc = createDoc(`
            if (x = 5) {
                println("x")
            }
        `);
        const diagnostics = checkAssignmentInCondition(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should not report for += in condition', () => {
        const doc = createDoc(`
            if x += 5 {
                println("x")
            }
        `);
        const diagnostics = checkAssignmentInCondition(doc);

        // Compound assignment is less likely to be a mistake
        expect(diagnostics).toHaveLength(0);
    });

    it('should handle complex conditions with assignment', () => {
        const doc = createDoc(`
            if x = getValue() {
                println("x")
            }
        `);
        const diagnostics = checkAssignmentInCondition(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should not report for boolean variable condition', () => {
        const doc = createDoc(`
            if isReady {
                process()
            }
        `);
        const diagnostics = checkAssignmentInCondition(doc);

        expect(diagnostics).toHaveLength(0);
    });
});
