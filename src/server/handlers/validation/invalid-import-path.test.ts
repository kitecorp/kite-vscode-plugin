/**
 * Tests for invalid import path validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkInvalidImportPaths } from './invalid-import-path';
import { URI } from 'vscode-uri';

describe('Invalid import path validation', () => {
    // Helper to create a document with a specific file path
    const createDoc = (content: string, filePath: string = '/Users/test/project/test.kite') =>
        TextDocument.create(URI.file(filePath).toString(), 'kite', 1, content);

    // Mock context that simulates workspace files
    const createContext = (existingFiles: string[]) => ({
        findKiteFilesInWorkspace: () => existingFiles,
        getFileContent: (path: string) => existingFiles.includes(path) ? 'schema Test {}' : null,
    });

    it('should report error for non-existent import file', () => {
        const doc = createDoc(`
            import * from "nonexistent.kite"
        `);
        const ctx = createContext(['/Users/test/project/test.kite']);
        const diagnostics = checkInvalidImportPaths(doc, ctx);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Cannot find file 'nonexistent.kite'");
    });

    it('should not report for existing import file', () => {
        const doc = createDoc(`
            import * from "common.kite"
        `);
        const ctx = createContext([
            '/Users/test/project/test.kite',
            '/Users/test/project/common.kite'
        ]);
        const diagnostics = checkInvalidImportPaths(doc, ctx);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for existing relative import', () => {
        const doc = createDoc(`
            import Config from "./utils/config.kite"
        `);
        const ctx = createContext([
            '/Users/test/project/test.kite',
            '/Users/test/project/utils/config.kite'
        ]);
        const diagnostics = checkInvalidImportPaths(doc, ctx);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report error for non-existent relative import', () => {
        const doc = createDoc(`
            import Config from "./missing/file.kite"
        `);
        const ctx = createContext(['/Users/test/project/test.kite']);
        const diagnostics = checkInvalidImportPaths(doc, ctx);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Cannot find file");
    });

    it('should not report for package-style import that exists', () => {
        const doc = createDoc(`
            import * from "aws.Database"
        `);
        const ctx = createContext([
            '/Users/test/project/test.kite',
            '/Users/test/project/aws/Database.kite'
        ]);
        const diagnostics = checkInvalidImportPaths(doc, ctx);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report error for package-style import that does not exist', () => {
        const doc = createDoc(`
            import * from "aws.NonExistent"
        `);
        const ctx = createContext(['/Users/test/project/test.kite']);
        const diagnostics = checkInvalidImportPaths(doc, ctx);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Cannot find file 'aws.NonExistent'");
    });

    it('should skip imports in comments', () => {
        const doc = createDoc(`
            // import * from "nonexistent.kite"
        `);
        const ctx = createContext(['/Users/test/project/test.kite']);
        const diagnostics = checkInvalidImportPaths(doc, ctx);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report multiple invalid imports', () => {
        const doc = createDoc(`
            import * from "missing1.kite"
            import Config from "missing2.kite"
        `);
        const ctx = createContext(['/Users/test/project/test.kite']);
        const diagnostics = checkInvalidImportPaths(doc, ctx);

        expect(diagnostics).toHaveLength(2);
    });

    it('should handle named imports', () => {
        const doc = createDoc(`
            import Config, Database from "nonexistent.kite"
        `);
        const ctx = createContext(['/Users/test/project/test.kite']);
        const diagnostics = checkInvalidImportPaths(doc, ctx);

        expect(diagnostics).toHaveLength(1);
    });

    it('should handle parent directory imports that exist', () => {
        const doc = createDoc(`
            import * from "../common.kite"
        `, '/Users/test/project/sub/test.kite');
        const ctx = createContext([
            '/Users/test/project/sub/test.kite',
            '/Users/test/project/common.kite'
        ]);
        const diagnostics = checkInvalidImportPaths(doc, ctx);

        expect(diagnostics).toHaveLength(0);
    });

    it('should handle file without extension in workspace list', () => {
        const doc = createDoc(`
            import * from "common.kite"
        `);
        // Workspace file has full path
        const ctx = createContext([
            '/Users/test/project/test.kite',
            '/Users/test/project/common.kite'
        ]);
        const diagnostics = checkInvalidImportPaths(doc, ctx);

        expect(diagnostics).toHaveLength(0);
    });
});
