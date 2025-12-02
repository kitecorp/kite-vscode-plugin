/**
 * Tests for duplicate top-level declaration validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkDuplicateDeclarations } from './duplicate-declarations';

describe('Duplicate declarations validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report error for duplicate schema names', () => {
        const doc = createDoc(`
            schema Config {}
            schema Config {}
        `);
        const diagnostics = checkDuplicateDeclarations(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Duplicate schema 'Config'");
    });

    it('should report error for duplicate component names', () => {
        const doc = createDoc(`
            component Server {}
            component Server {}
        `);
        const diagnostics = checkDuplicateDeclarations(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Duplicate component 'Server'");
    });

    it('should report error for duplicate function names', () => {
        const doc = createDoc(`
            fun calculate() {}
            fun calculate() {}
        `);
        const diagnostics = checkDuplicateDeclarations(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Duplicate function 'calculate'");
    });

    it('should report error for duplicate type names', () => {
        const doc = createDoc(`
            type Status = "active" | "inactive"
            type Status = "on" | "off"
        `);
        const diagnostics = checkDuplicateDeclarations(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Duplicate type 'Status'");
    });

    it('should report error when different kinds share same name', () => {
        const doc = createDoc(`
            schema Config {}
            fun Config() {}
        `);
        const diagnostics = checkDuplicateDeclarations(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('first defined as schema');
    });

    it('should not report error for unique names', () => {
        const doc = createDoc(`
            schema Config {}
            schema Database {}
            fun calculate() {}
        `);
        const diagnostics = checkDuplicateDeclarations(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should skip declarations in comments', () => {
        const doc = createDoc(`
            schema Config {}
            // schema Config {}
        `);
        const diagnostics = checkDuplicateDeclarations(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report error when variable has same name as parameter', () => {
        const doc = createDoc(`
            fun calculate(number x) {
                var x = 12
                return x
            }
        `);
        const diagnostics = checkDuplicateDeclarations(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("'x' is already declared as parameter");
    });

    it('should report error for duplicate variables in same scope', () => {
        const doc = createDoc(`
            fun test() {
                var y = 10
                var y = 20
                return y
            }
        `);
        const diagnostics = checkDuplicateDeclarations(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Duplicate variable 'y'");
    });

    it('should allow variable with same name in different functions', () => {
        const doc = createDoc(`
            fun test1() {
                var x = 10
                return x
            }
            fun test2() {
                var x = 20
                return x
            }
        `);
        const diagnostics = checkDuplicateDeclarations(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report multiple errors for parameter and duplicates', () => {
        const doc = createDoc(`
            fun test(number x) {
                var x = 10
                var x = 20
                return x
            }
        `);
        const diagnostics = checkDuplicateDeclarations(doc);

        expect(diagnostics.length).toBeGreaterThanOrEqual(1);
        expect(diagnostics[0].message).toContain("'x'");
    });
});
