/**
 * Tests for Document Links handler
 * Makes import paths clickable in the editor
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { handleDocumentLinks, DocumentLinksContext } from './index';

function createDocument(content: string, uri = 'file:///workspace/test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

function createContext(files: string[] = []): DocumentLinksContext {
    return {
        findKiteFilesInWorkspace: () => files,
        resolveImportPath: (importPath: string, currentDir: string) => {
            // Simple mock: just join current dir with import path
            if (importPath.startsWith('./') || importPath.startsWith('../')) {
                return `${currentDir}/${importPath.replace(/^\.\//, '')}`;
            } else if (importPath.endsWith('.kite')) {
                return `${currentDir}/${importPath}`;
            } else {
                // Package-style: aws.Database -> aws/Database.kite
                return `${currentDir}/${importPath.replace(/\./g, '/')}.kite`;
            }
        },
    };
}

describe('Document Links', () => {
    describe('Wildcard imports', () => {
        it('should create link for wildcard import path', () => {
            const doc = createDocument(`import * from "common.kite"`);
            const ctx = createContext(['/workspace/common.kite']);
            const links = handleDocumentLinks(doc, ctx);

            expect(links).toHaveLength(1);
            expect(links[0].target).toContain('common.kite');
        });

        it('should position link on the path only, not the whole import', () => {
            const doc = createDocument(`import * from "common.kite"`);
            const ctx = createContext(['/workspace/common.kite']);
            const links = handleDocumentLinks(doc, ctx);

            expect(links).toHaveLength(1);
            // Link should be on "common.kite" (inside quotes)
            expect(links[0].range.start.line).toBe(0);
            expect(links[0].range.start.character).toBe(15); // After opening quote
            expect(links[0].range.end.character).toBe(26); // Before closing quote
        });

        it('should handle single-quoted imports', () => {
            const doc = createDocument(`import * from 'common.kite'`);
            const ctx = createContext(['/workspace/common.kite']);
            const links = handleDocumentLinks(doc, ctx);

            expect(links).toHaveLength(1);
            expect(links[0].target).toContain('common.kite');
        });
    });

    describe('Named imports', () => {
        it('should create link for named import', () => {
            const doc = createDocument(`import Config from "database.kite"`);
            const ctx = createContext(['/workspace/database.kite']);
            const links = handleDocumentLinks(doc, ctx);

            expect(links).toHaveLength(1);
            expect(links[0].target).toContain('database.kite');
        });

        it('should create link for multiple named imports', () => {
            const doc = createDocument(`import Config, Settings from "database.kite"`);
            const ctx = createContext(['/workspace/database.kite']);
            const links = handleDocumentLinks(doc, ctx);

            expect(links).toHaveLength(1);
            expect(links[0].target).toContain('database.kite');
        });
    });

    describe('Package-style imports', () => {
        it('should create link for package-style import', () => {
            const doc = createDocument(`import * from "aws.DatabaseConfig"`);
            const ctx = createContext(['/workspace/aws/DatabaseConfig.kite']);
            const links = handleDocumentLinks(doc, ctx);

            expect(links).toHaveLength(1);
            expect(links[0].target).toContain('DatabaseConfig.kite');
        });

        it('should create link for nested package path', () => {
            const doc = createDocument(`import * from "cloud.aws.services.Lambda"`);
            const ctx = createContext(['/workspace/cloud/aws/services/Lambda.kite']);
            const links = handleDocumentLinks(doc, ctx);

            expect(links).toHaveLength(1);
            expect(links[0].target).toContain('Lambda.kite');
        });
    });

    describe('Relative imports', () => {
        it('should create link for relative import with ./', () => {
            const doc = createDocument(`import * from "./utils.kite"`);
            const ctx = createContext(['/workspace/utils.kite']);
            const links = handleDocumentLinks(doc, ctx);

            expect(links).toHaveLength(1);
        });

        it('should create link for relative import with ../', () => {
            const doc = createDocument(`import * from "../common.kite"`, 'file:///workspace/sub/test.kite');
            const ctx = createContext(['/workspace/common.kite']);
            const links = handleDocumentLinks(doc, ctx);

            expect(links).toHaveLength(1);
        });
    });

    describe('Multiple imports', () => {
        it('should create links for all imports in document', () => {
            const doc = createDocument(`import * from "common.kite"
import Config from "database.kite"
import Server from "server.kite"`);
            const ctx = createContext([
                '/workspace/common.kite',
                '/workspace/database.kite',
                '/workspace/server.kite',
            ]);
            const links = handleDocumentLinks(doc, ctx);

            expect(links).toHaveLength(3);
            expect(links[0].range.start.line).toBe(0);
            expect(links[1].range.start.line).toBe(1);
            expect(links[2].range.start.line).toBe(2);
        });

        it('should position each link correctly', () => {
            const doc = createDocument(`import * from "a.kite"
import * from "longer-name.kite"`);
            const ctx = createContext([
                '/workspace/a.kite',
                '/workspace/longer-name.kite',
            ]);
            const links = handleDocumentLinks(doc, ctx);

            expect(links).toHaveLength(2);
            // First link: "a.kite" (6 chars)
            expect(links[0].range.start.character).toBe(15);
            expect(links[0].range.end.character).toBe(21);
            // Second link: "longer-name.kite" (16 chars)
            expect(links[1].range.start.character).toBe(15);
            expect(links[1].range.end.character).toBe(31);
        });
    });

    describe('Edge cases', () => {
        it('should return empty array for document with no imports', () => {
            const doc = createDocument(`schema Config {
    string name
}`);
            const ctx = createContext();
            const links = handleDocumentLinks(doc, ctx);

            expect(links).toHaveLength(0);
        });

        it('should return empty array for empty document', () => {
            const doc = createDocument('');
            const ctx = createContext();
            const links = handleDocumentLinks(doc, ctx);

            expect(links).toHaveLength(0);
        });

        it('should handle imports with spaces around path', () => {
            const doc = createDocument(`import * from  "common.kite"`);
            const ctx = createContext(['/workspace/common.kite']);
            const links = handleDocumentLinks(doc, ctx);

            expect(links).toHaveLength(1);
        });

        it('should not create link for string that looks like import', () => {
            const doc = createDocument(`var msg = "import * from common.kite"`);
            const ctx = createContext(['/workspace/common.kite']);
            const links = handleDocumentLinks(doc, ctx);

            expect(links).toHaveLength(0);
        });

        it('should handle import on last line without newline', () => {
            const doc = createDocument(`import * from "common.kite"`);
            const ctx = createContext(['/workspace/common.kite']);
            const links = handleDocumentLinks(doc, ctx);

            expect(links).toHaveLength(1);
        });
    });

    describe('Link tooltip', () => {
        it('should include tooltip with file path', () => {
            const doc = createDocument(`import * from "common.kite"`);
            const ctx = createContext(['/workspace/common.kite']);
            const links = handleDocumentLinks(doc, ctx);

            expect(links).toHaveLength(1);
            expect(links[0].tooltip).toBeDefined();
            expect(links[0].tooltip).toContain('common.kite');
        });
    });
});
