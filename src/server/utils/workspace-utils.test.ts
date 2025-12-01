/**
 * Tests for workspace-utils.ts utility functions.
 */

import { describe, it, expect } from 'vitest';
import { findSymbolInWorkspace, findSymbolInAllWorkspaceFiles, WorkspaceContext } from './workspace-utils';

/**
 * Create a mock workspace context for testing.
 */
function createMockContext(files: Record<string, string>): WorkspaceContext {
    return {
        findKiteFilesInWorkspace: () => Object.keys(files),
        getFileContent: (filePath: string) => files[filePath] || null,
    };
}

describe('findSymbolInWorkspace', () => {
    describe('basic searching', () => {
        it('finds symbol in workspace file', () => {
            const files = {
                '/project/main.kite': 'resource Server {}',
                '/project/types.kite': 'schema Config { string name }',
            };
            const ctx = createMockContext(files);
            const currentFile = '/project/main.kite';

            const result = findSymbolInWorkspace(ctx, currentFile, 'file:///project/main.kite',
                (content) => content.includes('schema Config') ? 'found' : null
            );

            expect(result.result).toBe('found');
            expect(result.filePath).toBe('/project/types.kite');
        });

        it('returns null when symbol not found', () => {
            const files = {
                '/project/main.kite': 'resource Server {}',
                '/project/types.kite': 'schema Other { string name }',
            };
            const ctx = createMockContext(files);
            const currentFile = '/project/main.kite';

            const result = findSymbolInWorkspace(ctx, currentFile, 'file:///project/main.kite',
                (content) => content.includes('schema Config') ? 'found' : null
            );

            expect(result.result).toBeNull();
            expect(result.filePath).toBeNull();
        });

        it('skips current file', () => {
            const files = {
                '/project/main.kite': 'schema Config { string name }',
                '/project/types.kite': 'resource Server {}',
            };
            const ctx = createMockContext(files);
            const currentFile = '/project/main.kite';

            const result = findSymbolInWorkspace(ctx, currentFile, 'file:///project/main.kite',
                (content) => content.includes('schema Config') ? 'found' : null
            );

            // Should not find it because main.kite is skipped
            expect(result.result).toBeNull();
            expect(result.filePath).toBeNull();
        });
    });

    describe('finder function', () => {
        it('passes file content and path to finder', () => {
            const files = {
                '/project/main.kite': 'resource Server {}',
                '/project/types.kite': 'schema Config { string name }',
            };
            const ctx = createMockContext(files);
            const currentFile = '/project/main.kite';

            const capturedArgs: { content: string; path: string }[] = [];

            findSymbolInWorkspace(ctx, currentFile, 'file:///project/main.kite',
                (content, path) => {
                    capturedArgs.push({ content, path });
                    return null;
                }
            );

            expect(capturedArgs).toHaveLength(1);
            expect(capturedArgs[0].path).toBe('/project/types.kite');
            expect(capturedArgs[0].content).toBe('schema Config { string name }');
        });

        it('returns the exact value from finder', () => {
            const files = {
                '/project/main.kite': '',
                '/project/types.kite': 'schema Config {}',
            };
            const ctx = createMockContext(files);

            const result = findSymbolInWorkspace(ctx, '/project/main.kite', '',
                () => ({ line: 5, column: 10 })
            );

            expect(result.result).toEqual({ line: 5, column: 10 });
        });

        it('stops searching after first match', () => {
            const files = {
                '/project/main.kite': '',
                '/project/a.kite': 'schema Config {}',
                '/project/b.kite': 'schema Config {}',
            };
            const ctx = createMockContext(files);
            let callCount = 0;

            const result = findSymbolInWorkspace(ctx, '/project/main.kite', '',
                () => {
                    callCount++;
                    return 'found';
                }
            );

            expect(result.result).toBe('found');
            expect(callCount).toBe(1);
        });
    });

    describe('empty workspace', () => {
        it('returns null for empty workspace', () => {
            const ctx = createMockContext({});

            const result = findSymbolInWorkspace(ctx, '/project/main.kite', '',
                () => 'found'
            );

            expect(result.result).toBeNull();
            expect(result.filePath).toBeNull();
        });

        it('returns null when only current file exists', () => {
            const files = {
                '/project/main.kite': 'schema Config {}',
            };
            const ctx = createMockContext(files);

            const result = findSymbolInWorkspace(ctx, '/project/main.kite', '',
                () => 'found'
            );

            expect(result.result).toBeNull();
            expect(result.filePath).toBeNull();
        });
    });

    describe('file content access', () => {
        it('skips files with null content', () => {
            const ctx: WorkspaceContext = {
                findKiteFilesInWorkspace: () => ['/project/a.kite', '/project/b.kite'],
                getFileContent: (path) => path === '/project/b.kite' ? 'schema Config {}' : null,
            };

            const result = findSymbolInWorkspace(ctx, '/project/main.kite', '',
                (content) => content.includes('schema') ? 'found' : null
            );

            expect(result.result).toBe('found');
            expect(result.filePath).toBe('/project/b.kite');
        });
    });
});

describe('findSymbolInAllWorkspaceFiles', () => {
    describe('basic searching', () => {
        it('searches all files including current', () => {
            const files = {
                '/project/main.kite': 'schema Config {}',
                '/project/types.kite': 'resource Server {}',
            };
            const ctx = createMockContext(files);

            const result = findSymbolInAllWorkspaceFiles(ctx, 'file:///project/main.kite',
                (content) => content.includes('schema Config') ? 'found' : null
            );

            expect(result.result).toBe('found');
            expect(result.filePath).toBe('/project/main.kite');
        });

        it('finds symbol in any file', () => {
            const files = {
                '/project/main.kite': 'resource Server {}',
                '/project/types.kite': 'schema Config {}',
            };
            const ctx = createMockContext(files);

            const result = findSymbolInAllWorkspaceFiles(ctx, '',
                (content) => content.includes('schema Config') ? 'found' : null
            );

            expect(result.result).toBe('found');
            expect(result.filePath).toBe('/project/types.kite');
        });

        it('returns null when not found in any file', () => {
            const files = {
                '/project/main.kite': 'resource Server {}',
                '/project/types.kite': 'var x = 1',
            };
            const ctx = createMockContext(files);

            const result = findSymbolInAllWorkspaceFiles(ctx, '',
                (content) => content.includes('schema') ? 'found' : null
            );

            expect(result.result).toBeNull();
            expect(result.filePath).toBeNull();
        });
    });

    describe('empty workspace', () => {
        it('returns null for empty workspace', () => {
            const ctx = createMockContext({});

            const result = findSymbolInAllWorkspaceFiles(ctx, '', () => 'found');

            expect(result.result).toBeNull();
            expect(result.filePath).toBeNull();
        });
    });

    describe('multiple matches', () => {
        it('returns first match found', () => {
            const files = {
                '/project/a.kite': 'schema Config {}',
                '/project/b.kite': 'schema Config {}',
            };
            const ctx = createMockContext(files);
            const foundPaths: string[] = [];

            const result = findSymbolInAllWorkspaceFiles(ctx, '',
                (content, path) => {
                    foundPaths.push(path);
                    return content.includes('schema') ? path : null;
                }
            );

            expect(result.result).toBe('/project/a.kite');
            expect(foundPaths).toHaveLength(1);
        });
    });
});
