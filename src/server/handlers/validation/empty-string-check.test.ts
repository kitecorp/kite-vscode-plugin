/**
 * Tests for empty string check validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { checkEmptyStringCheck } from './empty-string-check';

describe('Empty string check validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    describe('equality with empty string', () => {
        it('should suggest len() for str == ""', () => {
            const doc = createDoc(`
                if name == "" {
                    println("empty")
                }
            `);
            const diagnostics = checkEmptyStringCheck(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('len(name) == 0');
            expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Hint);
        });

        it('should suggest len() for "" == str', () => {
            const doc = createDoc(`
                if "" == value {
                    println("empty")
                }
            `);
            const diagnostics = checkEmptyStringCheck(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('len(value) == 0');
        });
    });

    describe('inequality with empty string', () => {
        it('should suggest len() for str != ""', () => {
            const doc = createDoc(`
                if name != "" {
                    println("not empty")
                }
            `);
            const diagnostics = checkEmptyStringCheck(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('len(name) != 0');
        });

        it('should suggest len() for "" != str', () => {
            const doc = createDoc(`
                if "" != value {
                    println("not empty")
                }
            `);
            const diagnostics = checkEmptyStringCheck(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('len(value) != 0');
        });
    });

    describe('non-empty string comparisons (no hint)', () => {
        it('should not report for non-empty string comparison', () => {
            const doc = createDoc(`
                if name == "hello" {
                    println("is hello")
                }
            `);
            const diagnostics = checkEmptyStringCheck(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report for variable comparison', () => {
            const doc = createDoc(`
                if name == otherName {
                    println("equal")
                }
            `);
            const diagnostics = checkEmptyStringCheck(doc);

            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('edge cases', () => {
        it('should skip in comments', () => {
            const doc = createDoc(`
                // if name == "" { }
            `);
            const diagnostics = checkEmptyStringCheck(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should report multiple empty string checks', () => {
            const doc = createDoc(`
                if name == "" {
                    println("a")
                }
                if value != "" {
                    println("b")
                }
            `);
            const diagnostics = checkEmptyStringCheck(doc);

            expect(diagnostics).toHaveLength(2);
        });

        it('should handle while loop condition', () => {
            const doc = createDoc(`
                while input == "" {
                    input = readline()
                }
            `);
            const diagnostics = checkEmptyStringCheck(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('len(input) == 0');
        });

        it('should handle assignment context', () => {
            const doc = createDoc(`
                var isEmpty = str == ""
            `);
            const diagnostics = checkEmptyStringCheck(doc);

            expect(diagnostics).toHaveLength(1);
        });

        it('should use Hint severity', () => {
            const doc = createDoc(`
                if x == "" { }
            `);
            const diagnostics = checkEmptyStringCheck(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Hint);
        });
    });
});
