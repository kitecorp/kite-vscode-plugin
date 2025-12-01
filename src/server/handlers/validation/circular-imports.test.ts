/**
 * Tests for circular import detection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkCircularImports, CircularImportContext } from './circular-imports';

function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

describe('checkCircularImports', () => {
    let mockContext: CircularImportContext;

    beforeEach(() => {
        mockContext = {
            getFileContent: vi.fn(),
            findKiteFilesInWorkspace: vi.fn().mockReturnValue([]),
        };
    });

    describe('Direct circular imports', () => {
        it('should detect direct circular import between two files', () => {
            // file A imports B, file B imports A
            const fileAContent = `import * from "b.kite"
var x = 1`;
            const fileBContent = `import * from "a.kite"
var y = 2`;

            const doc = createDocument(fileAContent, 'file:///a.kite');
            mockContext.getFileContent = vi.fn((path: string) => {
                if (path.includes('b.kite')) return fileBContent;
                if (path.includes('a.kite')) return fileAContent;
                return null;
            });
            mockContext.findKiteFilesInWorkspace = vi.fn().mockReturnValue([
                '/a.kite',
                '/b.kite',
            ]);

            const diagnostics = checkCircularImports(doc, mockContext);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message.toLowerCase()).toContain('circular');
            expect(diagnostics[0].message).toContain('b.kite');
        });

        it('should not report circular import for non-circular case', () => {
            const fileAContent = `import * from "b.kite"
var x = 1`;
            const fileBContent = `var y = 2`;

            const doc = createDocument(fileAContent, 'file:///a.kite');
            mockContext.getFileContent = vi.fn((path: string) => {
                if (path.includes('b.kite')) return fileBContent;
                if (path.includes('a.kite')) return fileAContent;
                return null;
            });
            mockContext.findKiteFilesInWorkspace = vi.fn().mockReturnValue([
                '/a.kite',
                '/b.kite',
            ]);

            const diagnostics = checkCircularImports(doc, mockContext);

            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('Indirect circular imports', () => {
        it('should detect circular import through intermediate file (A -> B -> C -> A)', () => {
            const fileAContent = `import * from "b.kite"`;
            const fileBContent = `import * from "c.kite"`;
            const fileCContent = `import * from "a.kite"`;

            const doc = createDocument(fileAContent, 'file:///a.kite');
            mockContext.getFileContent = vi.fn((path: string) => {
                if (path.includes('a.kite')) return fileAContent;
                if (path.includes('b.kite')) return fileBContent;
                if (path.includes('c.kite')) return fileCContent;
                return null;
            });
            mockContext.findKiteFilesInWorkspace = vi.fn().mockReturnValue([
                '/a.kite',
                '/b.kite',
                '/c.kite',
            ]);

            const diagnostics = checkCircularImports(doc, mockContext);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message.toLowerCase()).toContain('circular');
        });

        it('should include chain in error message', () => {
            const fileAContent = `import * from "b.kite"`;
            const fileBContent = `import * from "c.kite"`;
            const fileCContent = `import * from "a.kite"`;

            const doc = createDocument(fileAContent, 'file:///a.kite');
            mockContext.getFileContent = vi.fn((path: string) => {
                if (path.includes('a.kite')) return fileAContent;
                if (path.includes('b.kite')) return fileBContent;
                if (path.includes('c.kite')) return fileCContent;
                return null;
            });
            mockContext.findKiteFilesInWorkspace = vi.fn().mockReturnValue([
                '/a.kite',
                '/b.kite',
                '/c.kite',
            ]);

            const diagnostics = checkCircularImports(doc, mockContext);

            expect(diagnostics).toHaveLength(1);
            // Message should show the chain
            expect(diagnostics[0].message).toMatch(/a\.kite.*b\.kite.*c\.kite/i);
        });
    });

    describe('Named imports', () => {
        it('should detect circular import with named imports', () => {
            const fileAContent = `import Foo from "b.kite"`;
            const fileBContent = `import Bar from "a.kite"`;

            const doc = createDocument(fileAContent, 'file:///a.kite');
            mockContext.getFileContent = vi.fn((path: string) => {
                if (path.includes('b.kite')) return fileBContent;
                if (path.includes('a.kite')) return fileAContent;
                return null;
            });
            mockContext.findKiteFilesInWorkspace = vi.fn().mockReturnValue([
                '/a.kite',
                '/b.kite',
            ]);

            const diagnostics = checkCircularImports(doc, mockContext);

            expect(diagnostics).toHaveLength(1);
        });

        it('should detect circular import with multiple named imports', () => {
            const fileAContent = `import Foo, Bar from "b.kite"`;
            const fileBContent = `import Baz from "a.kite"`;

            const doc = createDocument(fileAContent, 'file:///a.kite');
            mockContext.getFileContent = vi.fn((path: string) => {
                if (path.includes('b.kite')) return fileBContent;
                if (path.includes('a.kite')) return fileAContent;
                return null;
            });
            mockContext.findKiteFilesInWorkspace = vi.fn().mockReturnValue([
                '/a.kite',
                '/b.kite',
            ]);

            const diagnostics = checkCircularImports(doc, mockContext);

            expect(diagnostics).toHaveLength(1);
        });
    });

    describe('Multiple imports', () => {
        it('should report one diagnostic per circular import line', () => {
            // File A has two imports, both create circular dependencies
            const fileAContent = `import * from "b.kite"
import * from "c.kite"`;
            const fileBContent = `import * from "a.kite"`;
            const fileCContent = `import * from "a.kite"`;

            const doc = createDocument(fileAContent, 'file:///a.kite');
            mockContext.getFileContent = vi.fn((path: string) => {
                if (path.includes('a.kite')) return fileAContent;
                if (path.includes('b.kite')) return fileBContent;
                if (path.includes('c.kite')) return fileCContent;
                return null;
            });
            mockContext.findKiteFilesInWorkspace = vi.fn().mockReturnValue([
                '/a.kite',
                '/b.kite',
                '/c.kite',
            ]);

            const diagnostics = checkCircularImports(doc, mockContext);

            expect(diagnostics).toHaveLength(2);
        });
    });

    describe('Self import', () => {
        it('should detect self-import as circular', () => {
            const fileAContent = `import * from "a.kite"`;

            const doc = createDocument(fileAContent, 'file:///a.kite');
            mockContext.getFileContent = vi.fn((path: string) => {
                if (path.includes('a.kite')) return fileAContent;
                return null;
            });
            mockContext.findKiteFilesInWorkspace = vi.fn().mockReturnValue(['/a.kite']);

            const diagnostics = checkCircularImports(doc, mockContext);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('self');
        });
    });

    describe('Edge cases', () => {
        it('should handle file with no imports', () => {
            const doc = createDocument(`var x = 1`, 'file:///a.kite');
            mockContext.findKiteFilesInWorkspace = vi.fn().mockReturnValue(['/a.kite']);

            const diagnostics = checkCircularImports(doc, mockContext);

            expect(diagnostics).toHaveLength(0);
        });

        it('should handle import to non-existent file', () => {
            const fileAContent = `import * from "nonexistent.kite"`;

            const doc = createDocument(fileAContent, 'file:///a.kite');
            mockContext.getFileContent = vi.fn().mockReturnValue(null);
            mockContext.findKiteFilesInWorkspace = vi.fn().mockReturnValue(['/a.kite']);

            const diagnostics = checkCircularImports(doc, mockContext);

            // No circular dependency error - the import error is handled elsewhere
            expect(diagnostics).toHaveLength(0);
        });

        it('should handle imports in comments', () => {
            const fileAContent = `// import * from "b.kite"
var x = 1`;

            const doc = createDocument(fileAContent, 'file:///a.kite');
            mockContext.findKiteFilesInWorkspace = vi.fn().mockReturnValue(['/a.kite']);

            const diagnostics = checkCircularImports(doc, mockContext);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not error on package-style imports when no circular dependency exists', () => {
            // Package-style import without circular dependency
            const testContent = `import * from "aws.Database"`;
            const awsDatabaseContent = `var x = 1`;

            const doc = createDocument(testContent, 'file:///project/test.kite');
            mockContext.getFileContent = vi.fn((path: string) => {
                if (path.includes('test.kite')) return testContent;
                if (path.includes('aws/Database.kite')) return awsDatabaseContent;
                return null;
            });
            mockContext.findKiteFilesInWorkspace = vi.fn().mockReturnValue([
                '/project/test.kite',
                '/project/aws/Database.kite',
            ]);

            const diagnostics = checkCircularImports(doc, mockContext);

            // No circular dependency - should have no diagnostics
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('Diagnostic position', () => {
        it('should highlight the import statement', () => {
            const fileAContent = `var before = 1
import * from "b.kite"
var after = 2`;
            const fileBContent = `import * from "a.kite"`;

            const doc = createDocument(fileAContent, 'file:///a.kite');
            mockContext.getFileContent = vi.fn((path: string) => {
                if (path.includes('b.kite')) return fileBContent;
                if (path.includes('a.kite')) return fileAContent;
                return null;
            });
            mockContext.findKiteFilesInWorkspace = vi.fn().mockReturnValue([
                '/a.kite',
                '/b.kite',
            ]);

            const diagnostics = checkCircularImports(doc, mockContext);

            expect(diagnostics).toHaveLength(1);
            // Should be on line 1 (0-indexed)
            expect(diagnostics[0].range.start.line).toBe(1);
        });
    });
});
