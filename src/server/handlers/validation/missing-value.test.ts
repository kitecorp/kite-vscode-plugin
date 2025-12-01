/**
 * Tests for missing value validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkMissingValues } from './missing-value';

describe('Missing value validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    describe('checkMissingValues', () => {
        it('should report error for var with missing value', () => {
            const doc = createDoc('var x =');
            const diagnostics = checkMissingValues(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toBe("Missing value after '='");
        });

        it('should report error for var with type and missing value', () => {
            const doc = createDoc('var string name =');
            const diagnostics = checkMissingValues(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toBe("Missing value after '='");
        });

        it('should report error for input with missing default', () => {
            const doc = createDoc(`
                component Test {
                    input string name =
                }
            `);
            const diagnostics = checkMissingValues(doc);

            expect(diagnostics).toHaveLength(1);
        });

        it('should report error for output with missing value', () => {
            const doc = createDoc(`
                component Test {
                    output string result =
                }
            `);
            const diagnostics = checkMissingValues(doc);

            expect(diagnostics).toHaveLength(1);
        });

        it('should report error for resource property with missing value', () => {
            const doc = createDoc(`
                resource Config db {
                    name =
                }
            `);
            const diagnostics = checkMissingValues(doc);

            expect(diagnostics).toHaveLength(1);
        });

        it('should report error for schema property with missing default', () => {
            const doc = createDoc(`
                schema Config {
                    string name =
                }
            `);
            const diagnostics = checkMissingValues(doc);

            expect(diagnostics).toHaveLength(1);
        });

        it('should not report error for complete assignment', () => {
            const doc = createDoc('var x = 5');
            const diagnostics = checkMissingValues(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report error for string assignment', () => {
            const doc = createDoc('var name = "hello"');
            const diagnostics = checkMissingValues(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report error for boolean assignment', () => {
            const doc = createDoc('var flag = true');
            const diagnostics = checkMissingValues(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report error for comparison operators', () => {
            const doc = createDoc(`
                if x == 5 {
                }
                if y != 10 {
                }
                if z >= 0 {
                }
                if a <= 100 {
                }
            `);
            const diagnostics = checkMissingValues(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report error for compound assignment', () => {
            const doc = createDoc(`
                x += 5
                y -= 10
                z *= 2
                a /= 3
            `);
            const diagnostics = checkMissingValues(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report error for = in comments', () => {
            const doc = createDoc('// var x =');
            const diagnostics = checkMissingValues(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report error for = in strings', () => {
            const doc = createDoc('var x = "a = b"');
            const diagnostics = checkMissingValues(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should report error when only comment after =', () => {
            const doc = createDoc('var x = // todo');
            const diagnostics = checkMissingValues(doc);

            expect(diagnostics).toHaveLength(1);
        });

        it('should report multiple errors for multiple missing values', () => {
            const doc = createDoc(`
                var x =
                var y =
                var z = 5
            `);
            const diagnostics = checkMissingValues(doc);

            expect(diagnostics).toHaveLength(2);
        });
    });
});
