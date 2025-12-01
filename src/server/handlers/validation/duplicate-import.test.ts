/**
 * Tests for duplicate import validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkDuplicateImport } from './duplicate-import';

describe('Duplicate import validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report warning for duplicate import', () => {
        const doc = createDoc(`
            import * from "common.kite"
            import * from "common.kite"
        `);
        const diagnostics = checkDuplicateImport(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('Duplicate import');
        expect(diagnostics[0].message).toContain('common.kite');
    });

    it('should not report for different imports', () => {
        const doc = createDoc(`
            import * from "common.kite"
            import * from "utils.kite"
        `);
        const diagnostics = checkDuplicateImport(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report warning for same file with different extensions', () => {
        const doc = createDoc(`
            import * from "common"
            import * from "common.kite"
        `);
        const diagnostics = checkDuplicateImport(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should report warning for same file with ./ prefix', () => {
        const doc = createDoc(`
            import * from "common.kite"
            import * from "./common.kite"
        `);
        const diagnostics = checkDuplicateImport(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should handle named imports', () => {
        const doc = createDoc(`
            import { foo } from "utils.kite"
            import { bar } from "utils.kite"
        `);
        const diagnostics = checkDuplicateImport(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should report multiple duplicates', () => {
        const doc = createDoc(`
            import * from "a.kite"
            import * from "b.kite"
            import * from "a.kite"
            import * from "b.kite"
        `);
        const diagnostics = checkDuplicateImport(doc);

        expect(diagnostics).toHaveLength(2);
    });

    it('should skip imports in comments', () => {
        const doc = createDoc(`
            import * from "common.kite"
            // import * from "common.kite"
        `);
        const diagnostics = checkDuplicateImport(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should skip imports in block comments', () => {
        const doc = createDoc(`
            import * from "common.kite"
            /* import * from "common.kite" */
        `);
        const diagnostics = checkDuplicateImport(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should handle case-insensitive paths', () => {
        const doc = createDoc(`
            import * from "Common.kite"
            import * from "common.kite"
        `);
        const diagnostics = checkDuplicateImport(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should reference first import line in message', () => {
        const doc = createDoc(`import * from "common.kite"
import * from "common.kite"`);
        const diagnostics = checkDuplicateImport(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('line 1');
    });

    it('should handle package-style imports', () => {
        const doc = createDoc(`
            import * from "aws.Database"
            import * from "aws.Database"
        `);
        const diagnostics = checkDuplicateImport(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should not flag different paths in same package', () => {
        const doc = createDoc(`
            import * from "aws.Database"
            import * from "aws.Storage"
        `);
        const diagnostics = checkDuplicateImport(doc);

        expect(diagnostics).toHaveLength(0);
    });
});
