/**
 * Tests for auto-import completions
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItemKind } from 'vscode-languageserver/node';
import { getAutoImportCompletions } from './auto-import-completions';
import { CompletionContext } from './types';

describe('Auto-import completions', () => {
    const createMockContext = (files: Record<string, string>): CompletionContext => ({
        getDeclarations: () => [],
        findKiteFilesInWorkspace: () => Object.keys(files),
        getFileContent: (path) => files[path] || null,
        findEnclosingBlock: () => null,
    });

    describe('getAutoImportCompletions', () => {
        it('should suggest schemas from other files', () => {
            const files = {
                '/project/current.kite': '',
                '/project/common.kite': `
                    schema DatabaseConfig {
                        string host
                        number port
                    }
                `,
            };
            const ctx = createMockContext(files);
            const doc = TextDocument.create('file:///project/current.kite', 'kite', 1, '');

            const completions = getAutoImportCompletions(
                doc.getText(),
                doc.uri,
                new Set(),
                ctx
            );

            expect(completions).toHaveLength(1);
            expect(completions[0].label).toBe('DatabaseConfig');
            expect(completions[0].kind).toBe(CompletionItemKind.Struct);
            expect(completions[0].detail).toContain('schema');
            expect(completions[0].detail).toContain('auto-import');
            expect(completions[0].additionalTextEdits).toHaveLength(1);
            expect(completions[0].additionalTextEdits![0].newText).toContain('import DatabaseConfig from');
        });

        it('should suggest components from other files', () => {
            const files = {
                '/project/current.kite': '',
                '/project/server.kite': `
                    component WebServer {
                        input string name
                        output string endpoint
                    }
                `,
            };
            const ctx = createMockContext(files);
            const doc = TextDocument.create('file:///project/current.kite', 'kite', 1, '');

            const completions = getAutoImportCompletions(
                doc.getText(),
                doc.uri,
                new Set(),
                ctx
            );

            expect(completions).toHaveLength(1);
            expect(completions[0].label).toBe('WebServer');
            expect(completions[0].kind).toBe(CompletionItemKind.Module);
            expect(completions[0].detail).toContain('component');
        });

        it('should suggest functions from other files', () => {
            const files = {
                '/project/current.kite': '',
                '/project/utils.kite': `
                    fun calculateCost(number items) number {
                        return items * 10
                    }
                `,
            };
            const ctx = createMockContext(files);
            const doc = TextDocument.create('file:///project/current.kite', 'kite', 1, '');

            const completions = getAutoImportCompletions(
                doc.getText(),
                doc.uri,
                new Set(),
                ctx
            );

            expect(completions).toHaveLength(1);
            expect(completions[0].label).toBe('calculateCost');
            expect(completions[0].kind).toBe(CompletionItemKind.Function);
        });

        it('should suggest type aliases from other files', () => {
            const files = {
                '/project/current.kite': '',
                '/project/types.kite': `
                    type Region = "us-east-1" | "us-west-2"
                `,
            };
            const ctx = createMockContext(files);
            const doc = TextDocument.create('file:///project/current.kite', 'kite', 1, '');

            const completions = getAutoImportCompletions(
                doc.getText(),
                doc.uri,
                new Set(),
                ctx
            );

            expect(completions).toHaveLength(1);
            expect(completions[0].label).toBe('Region');
            expect(completions[0].kind).toBe(CompletionItemKind.TypeParameter);
        });

        it('should not suggest already imported symbols', () => {
            const files = {
                '/project/current.kite': '',
                '/project/common.kite': `
                    schema DatabaseConfig {
                        string host
                    }
                `,
            };
            const ctx = createMockContext(files);
            const text = 'import DatabaseConfig from "common.kite"\n';

            const completions = getAutoImportCompletions(
                text,
                'file:///project/current.kite',
                new Set(),
                ctx
            );

            expect(completions).toHaveLength(0);
        });

        it('should not suggest locally declared symbols', () => {
            const files = {
                '/project/current.kite': '',
                '/project/common.kite': `
                    schema DatabaseConfig {
                        string host
                    }
                `,
            };
            const ctx = createMockContext(files);
            const localNames = new Set(['DatabaseConfig']);

            const completions = getAutoImportCompletions(
                '',
                'file:///project/current.kite',
                localNames,
                ctx
            );

            expect(completions).toHaveLength(0);
        });

        it('should suggest multiple symbols from multiple files', () => {
            const files = {
                '/project/current.kite': '',
                '/project/common.kite': `
                    schema DatabaseConfig {
                        string host
                    }
                    schema ServerConfig {
                        number port
                    }
                `,
                '/project/server.kite': `
                    component WebServer {
                        input string name
                    }
                `,
            };
            const ctx = createMockContext(files);

            const completions = getAutoImportCompletions(
                '',
                'file:///project/current.kite',
                new Set(),
                ctx
            );

            expect(completions).toHaveLength(3);
            const labels = completions.map(c => c.label);
            expect(labels).toContain('DatabaseConfig');
            expect(labels).toContain('ServerConfig');
            expect(labels).toContain('WebServer');
        });

        it('should not suggest symbols from current file', () => {
            const files = {
                '/project/current.kite': `
                    schema LocalSchema {
                        string name
                    }
                `,
            };
            const ctx = createMockContext(files);

            const completions = getAutoImportCompletions(
                files['/project/current.kite'],
                'file:///project/current.kite',
                new Set(),
                ctx
            );

            expect(completions).toHaveLength(0);
        });

        it('should insert import after last existing import', () => {
            const files = {
                '/project/current.kite': '',
                '/project/common.kite': `
                    schema NewSchema {
                        string name
                    }
                `,
            };
            const ctx = createMockContext(files);
            const text = `import Existing from "other.kite"

schema LocalSchema {
}`;

            const completions = getAutoImportCompletions(
                text,
                'file:///project/current.kite',
                new Set(),
                ctx
            );

            expect(completions).toHaveLength(1);
            // Should insert at line 1 (after the existing import on line 0)
            expect(completions[0].additionalTextEdits![0].range.start.line).toBe(1);
        });

        it('should insert import at line 0 when no existing imports', () => {
            const files = {
                '/project/current.kite': '',
                '/project/common.kite': `
                    schema NewSchema {
                        string name
                    }
                `,
            };
            const ctx = createMockContext(files);
            const text = `schema LocalSchema {
}`;

            const completions = getAutoImportCompletions(
                text,
                'file:///project/current.kite',
                new Set(),
                ctx
            );

            expect(completions).toHaveLength(1);
            expect(completions[0].additionalTextEdits![0].range.start.line).toBe(0);
        });

        it('should have lower sort priority than local symbols', () => {
            const files = {
                '/project/current.kite': '',
                '/project/common.kite': `
                    schema RemoteSchema {}
                `,
            };
            const ctx = createMockContext(files);

            const completions = getAutoImportCompletions(
                '',
                'file:///project/current.kite',
                new Set(),
                ctx
            );

            expect(completions).toHaveLength(1);
            // Sort text starts with 'z' for low priority
            expect(completions[0].sortText).toBe('zRemoteSchema');
        });

        it('should avoid duplicate suggestions for same symbol name', () => {
            const files = {
                '/project/current.kite': '',
                '/project/file1.kite': `
                    schema Config {}
                `,
                '/project/file2.kite': `
                    schema Config {}
                `,
            };
            const ctx = createMockContext(files);

            const completions = getAutoImportCompletions(
                '',
                'file:///project/current.kite',
                new Set(),
                ctx
            );

            // Should only have one Config suggestion (first one found)
            expect(completions.filter(c => c.label === 'Config')).toHaveLength(1);
        });
    });
});
