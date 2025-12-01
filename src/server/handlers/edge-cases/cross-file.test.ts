/**
 * Edge case tests for cross-file scenarios.
 * Tests that handlers gracefully handle missing files, circular imports,
 * invalid paths, and other multi-file edge cases.
 */

import { describe, it, expect } from 'vitest';
import { createDocument } from '../../test-utils';
import { TextDocument } from 'vscode-languageserver-textdocument';

// Import handlers
import { handleCompletion, CompletionContext } from '../completion';
import { handleDocumentSymbol } from '../document-symbols';
import { handleHover } from '../hover';
import { Declaration } from '../../types';

// Import utilities for testing imports
import { extractImports, isSymbolImported } from '../../utils/import-utils';
function createCompletionContext(overrides: Partial<CompletionContext> = {}): CompletionContext {
    return {
        getDeclarations: () => [],
        findKiteFilesInWorkspace: () => [],
        getFileContent: () => null,
        findEnclosingBlock: () => null,
        ...overrides,
    };
}

describe('Cross-File Edge Cases', () => {
    describe('Missing files', () => {
        it('handles import of non-existent file', () => {
            const doc = createDocument('import * from "nonexistent.kite"\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles multiple imports with some missing', () => {
            const doc = createDocument(`
import * from "exists.kite"
import * from "missing1.kite"
import * from "missing2.kite"
var x = 1
`);
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles completion when imported file is missing', () => {
            const doc = createDocument('import * from "missing.kite"\nvar x = ');
            const ctx = createCompletionContext({
                findKiteFilesInWorkspace: () => [],
                getFileContent: () => null,
            });
            const result = handleCompletion(doc, { line: 1, character: 8 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles hover when imported symbol file is missing', () => {
            const doc = createDocument('import { Config } from "missing.kite"\nresource Config server {}');
            const result = handleHover(doc, { line: 1, character: 10 }, []);
            expect(result === null || result !== undefined).toBe(true);
        });

        it('handles reference to symbol from missing file', () => {
            const doc = createDocument(`
import { ServerConfig } from "missing.kite"
resource ServerConfig server {
    host = "localhost"
}
`);
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Circular imports', () => {
        it('handles self-import', () => {
            const doc = createDocument('import * from "main.kite"\nvar x = 1', 'file:///project/main.kite');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles completion with self-import', () => {
            const doc = createDocument('import * from "main.kite"\nvar x = ', 'file:///project/main.kite');
            const ctx = createCompletionContext({
                findKiteFilesInWorkspace: () => ['/project/main.kite'],
                getFileContent: (path) => {
                    if (path === '/project/main.kite') {
                        return 'import * from "main.kite"\nvar x = 1';
                    }
                    return null;
                },
            });
            const result = handleCompletion(doc, { line: 1, character: 8 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles two-file circular import (A imports B, B imports A)', () => {
            const fileA = 'import * from "b.kite"\nvar fromA = 1';
            const fileB = 'import * from "a.kite"\nvar fromB = 2';

            const doc = createDocument(fileA, 'file:///project/a.kite');
            const ctx = createCompletionContext({
                findKiteFilesInWorkspace: () => ['/project/a.kite', '/project/b.kite'],
                getFileContent: (path) => {
                    if (path.includes('a.kite')) return fileA;
                    if (path.includes('b.kite')) return fileB;
                    return null;
                },
            });
            const result = handleCompletion(doc, { line: 1, character: 12 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles three-file circular import (A → B → C → A)', () => {
            const fileA = 'import * from "b.kite"\nvar fromA = 1';
            const fileB = 'import * from "c.kite"\nvar fromB = 2';
            const fileC = 'import * from "a.kite"\nvar fromC = 3';

            const doc = createDocument(fileA, 'file:///project/a.kite');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles diamond dependency pattern', () => {
            // A imports B and C, both B and C import D
            const doc = createDocument(`
import * from "b.kite"
import * from "c.kite"
var x = 1
`);
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Invalid file paths', () => {
        it('handles empty import path', () => {
            const doc = createDocument('import * from ""\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles import with only whitespace in path', () => {
            const doc = createDocument('import * from "   "\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles import with special characters in path', () => {
            const doc = createDocument('import * from "file<>:\\"?*.kite"\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles import with path traversal', () => {
            const doc = createDocument('import * from "../../../etc/passwd"\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles import with absolute path', () => {
            const doc = createDocument('import * from "/absolute/path/file.kite"\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles import with Windows-style path', () => {
            const doc = createDocument('import * from "C:\\Users\\file.kite"\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles import with URL-like path', () => {
            const doc = createDocument('import * from "https://example.com/file.kite"\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles import with Unicode in path', () => {
            const doc = createDocument('import * from "文件.kite"\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles import with dots in filename', () => {
            const doc = createDocument('import * from "file.test.kite"\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles import without .kite extension', () => {
            const doc = createDocument('import * from "common"\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles package-style import path', () => {
            const doc = createDocument('import * from "aws.S3.Bucket"\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Empty workspace scenarios', () => {
        it('handles completion in empty workspace', () => {
            const doc = createDocument('var x = ');
            const ctx = createCompletionContext({
                findKiteFilesInWorkspace: () => [],
                getFileContent: () => null,
            });
            const result = handleCompletion(doc, { line: 0, character: 8 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles hover in empty workspace', () => {
            const doc = createDocument('var x = 1');
            const result = handleHover(doc, { line: 0, character: 4 }, []);
            expect(result === null || result !== undefined).toBe(true);
        });

        it('handles document symbols in empty workspace', () => {
            const doc = createDocument('var x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(0);
        });
    });

    describe('Workspace with invalid files', () => {
        it('handles workspace where all other files are invalid', () => {
            const doc = createDocument('import * from "invalid.kite"\nvar x = ');
            const ctx = createCompletionContext({
                findKiteFilesInWorkspace: () => ['/project/invalid.kite'],
                getFileContent: () => '{{{{invalid syntax that will fail parsing',
            });
            const result = handleCompletion(doc, { line: 1, character: 8 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles mix of valid and invalid files in workspace', () => {
            const doc = createDocument('import * from "other.kite"\nvar x = ');
            const ctx = createCompletionContext({
                findKiteFilesInWorkspace: () => ['/project/valid.kite', '/project/invalid.kite'],
                getFileContent: (path) => {
                    if (path.includes('valid')) return 'var validVar = 1';
                    if (path.includes('invalid')) return '{{{broken';
                    return null;
                },
            });
            const result = handleCompletion(doc, { line: 1, character: 8 }, ctx);
            expect(result).toBeDefined();
        });
    });

    describe('Import statement edge cases', () => {
        it('handles incomplete import statement', () => {
            const doc = createDocument('import\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles import without from keyword', () => {
            const doc = createDocument('import * "file.kite"\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles import without path', () => {
            const doc = createDocument('import * from\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles import with unclosed string', () => {
            const doc = createDocument('import * from "unclosed\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles named import with missing braces', () => {
            const doc = createDocument('import Config from "file.kite"\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles named import with empty braces', () => {
            const doc = createDocument('import { } from "file.kite"\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles named import with trailing comma', () => {
            const doc = createDocument('import { Config, } from "file.kite"\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles duplicate imports of same file', () => {
            const doc = createDocument(`
import * from "common.kite"
import * from "common.kite"
var x = 1
`);
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles duplicate named imports', () => {
            const doc = createDocument(`
import { Config } from "file.kite"
import { Config } from "file.kite"
var x = 1
`);
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles wildcard and named import from same file', () => {
            const doc = createDocument(`
import * from "common.kite"
import { Config } from "common.kite"
var x = 1
`);
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Files with same name in different directories', () => {
        it('handles imports from files with same name', () => {
            const doc = createDocument(`
import * from "utils/config.kite"
import * from "lib/config.kite"
var x = 1
`);
            const ctx = createCompletionContext({
                findKiteFilesInWorkspace: () => [
                    '/project/utils/config.kite',
                    '/project/lib/config.kite',
                ],
                getFileContent: (path) => {
                    if (path.includes('utils')) return 'var utilsConfig = 1';
                    if (path.includes('lib')) return 'var libConfig = 2';
                    return null;
                },
            });
            const result = handleCompletion(doc, { line: 3, character: 8 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles completion with ambiguous file references', () => {
            const doc = createDocument('import * from "config.kite"\nvar x = ');
            const ctx = createCompletionContext({
                findKiteFilesInWorkspace: () => [
                    '/project/a/config.kite',
                    '/project/b/config.kite',
                    '/project/c/config.kite',
                ],
                getFileContent: () => 'var someVar = 1',
            });
            const result = handleCompletion(doc, { line: 1, character: 8 }, ctx);
            expect(result).toBeDefined();
        });
    });

    describe('getFileContent returning various values', () => {
        it('handles getFileContent returning null', () => {
            const doc = createDocument('import * from "file.kite"\nvar x = ');
            const ctx = createCompletionContext({
                findKiteFilesInWorkspace: () => ['/project/file.kite'],
                getFileContent: () => null,
            });
            const result = handleCompletion(doc, { line: 1, character: 8 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles getFileContent returning empty string', () => {
            const doc = createDocument('import * from "empty.kite"\nvar x = ');
            const ctx = createCompletionContext({
                findKiteFilesInWorkspace: () => ['/project/empty.kite'],
                getFileContent: () => '',
            });
            const result = handleCompletion(doc, { line: 1, character: 8 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles getFileContent returning whitespace only', () => {
            const doc = createDocument('import * from "whitespace.kite"\nvar x = ');
            const ctx = createCompletionContext({
                findKiteFilesInWorkspace: () => ['/project/whitespace.kite'],
                getFileContent: () => '   \n\t\n   ',
            });
            const result = handleCompletion(doc, { line: 1, character: 8 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles getFileContent returning comments only', () => {
            const doc = createDocument('import * from "comments.kite"\nvar x = ');
            const ctx = createCompletionContext({
                findKiteFilesInWorkspace: () => ['/project/comments.kite'],
                getFileContent: () => '// just comments\n/* block comment */',
            });
            const result = handleCompletion(doc, { line: 1, character: 8 }, ctx);
            expect(result).toBeDefined();
        });
    });

    describe('extractImports utility edge cases', () => {
        it('extracts imports from empty file', () => {
            const imports = extractImports('');
            expect(imports).toEqual([]);
        });

        it('extracts imports when no imports exist', () => {
            const imports = extractImports('var x = 1\nvar y = 2');
            expect(imports).toEqual([]);
        });

        it('extracts wildcard import', () => {
            const imports = extractImports('import * from "common.kite"');
            expect(imports.length).toBe(1);
            expect(imports[0].path).toBe('common.kite');
            expect(imports[0].symbols).toEqual([]);
        });

        it('extracts named import', () => {
            // Kite uses "import Symbol from path" syntax without braces
            const imports = extractImports('import Config from "types.kite"');
            expect(imports.length).toBe(1);
            expect(imports[0].symbols).toContain('Config');
        });

        it('extracts multiple named imports', () => {
            // Kite uses "import Symbol1, Symbol2 from path" syntax without braces
            const imports = extractImports('import Config, Server, Database from "types.kite"');
            expect(imports.length).toBe(1);
            expect(imports[0].symbols).toContain('Config');
            expect(imports[0].symbols).toContain('Server');
            expect(imports[0].symbols).toContain('Database');
        });

        it('extracts multiple import statements', () => {
            const imports = extractImports(`
import * from "common.kite"
import Config from "types.kite"
import Server from "server.kite"
`);
            expect(imports.length).toBe(3);
        });

        it('handles imports with single quotes', () => {
            const imports = extractImports("import * from 'common.kite'");
            expect(imports.length).toBe(1);
            expect(imports[0].path).toBe('common.kite');
        });

        it('handles malformed import gracefully', () => {
            const imports = extractImports('import from\nimport * from');
            expect(imports).toBeDefined();
        });
    });

    describe('isSymbolImported utility edge cases', () => {
        it('returns false for empty imports', () => {
            const result = isSymbolImported([], 'Config', '/other/file.kite', '/current/file.kite');
            expect(result).toBe(false);
        });

        it('returns true for wildcard import from correct file', () => {
            const imports = [{ path: 'types.kite', symbols: [] }];
            const result = isSymbolImported(imports, 'Config', '/project/types.kite', '/project/main.kite');
            expect(result).toBe(true);
        });

        it('returns true for named import of the symbol', () => {
            const imports = [{ path: 'types.kite', symbols: ['Config', 'Server'] }];
            const result = isSymbolImported(imports, 'Config', '/project/types.kite', '/project/main.kite');
            expect(result).toBe(true);
        });

        it('returns false for named import not containing the symbol', () => {
            const imports = [{ path: 'types.kite', symbols: ['Server', 'Database'] }];
            const result = isSymbolImported(imports, 'Config', '/project/types.kite', '/project/main.kite');
            expect(result).toBe(false);
        });

        it('handles relative path resolution', () => {
            const imports = [{ path: './utils/helpers.kite', symbols: [] }];
            const result = isSymbolImported(imports, 'Helper', '/project/utils/helpers.kite', '/project/main.kite');
            expect(result).toBe(true);
        });

        it('handles parent directory path resolution', () => {
            const imports = [{ path: '../common.kite', symbols: [] }];
            const result = isSymbolImported(imports, 'Config', '/project/common.kite', '/project/src/main.kite');
            expect(result).toBe(true);
        });
    });

    describe('Cross-file declarations', () => {
        it('handles declarations from multiple files', () => {
            const doc = createDocument(`
import * from "a.kite"
import * from "b.kite"
var local = 1
`);
            const declarations: Declaration[] = [
                {
                    name: 'fromA',
                    type: 'variable',
                    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
                    nameRange: { start: { line: 0, character: 4 }, end: { line: 0, character: 9 } },
                    uri: 'file:///project/a.kite',
                },
                {
                    name: 'fromB',
                    type: 'variable',
                    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
                    nameRange: { start: { line: 0, character: 4 }, end: { line: 0, character: 9 } },
                    uri: 'file:///project/b.kite',
                },
            ];
            const result = handleHover(doc, { line: 3, character: 4 }, declarations);
            expect(result === null || result !== undefined).toBe(true);
        });
    });

    describe('File path normalization', () => {
        it('handles paths with double slashes', () => {
            const doc = createDocument('import * from "path//to//file.kite"\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles paths with mixed separators', () => {
            const doc = createDocument('import * from "path/to\\file.kite"\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles paths with dot segments', () => {
            const doc = createDocument('import * from "./path/./to/../file.kite"\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });
});
