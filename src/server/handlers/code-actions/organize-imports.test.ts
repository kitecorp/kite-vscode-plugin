/**
 * Tests for Organize Imports code action
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { organizeImports, createOrganizeImportsAction } from './organize-imports';

function createDocument(content: string): TextDocument {
    return TextDocument.create('file:///test.kite', 'kite', 1, content);
}

describe('organizeImports', () => {
    describe('sorting', () => {
        it('should sort imports alphabetically by path', () => {
            const doc = createDocument(`import Config from "config.kite"
import Auth from "auth.kite"
import Utils from "utils.kite"

schema Test {}`);
            const result = organizeImports(doc);

            expect(result).not.toBeNull();
            expect(result!.newText).toBe(
                `import Auth from "auth.kite"
import Config from "config.kite"
import Utils from "utils.kite"`
            );
        });

        it('should be case-insensitive when sorting', () => {
            const doc = createDocument(`import Config from "Config.kite"
import auth from "auth.kite"
import Utils from "Utils.kite"

schema Test {}`);
            const result = organizeImports(doc);

            expect(result).not.toBeNull();
            expect(result!.newText).toBe(
                `import auth from "auth.kite"
import Config from "Config.kite"
import Utils from "Utils.kite"`
            );
        });

        it('should return null if already sorted', () => {
            const doc = createDocument(`import Auth from "auth.kite"
import Config from "config.kite"
import Utils from "utils.kite"

schema Test {}`);
            const result = organizeImports(doc);

            expect(result).toBeNull();
        });
    });

    describe('merging', () => {
        it('should merge imports from the same file', () => {
            const doc = createDocument(`import Config from "common.kite"
import Utils from "common.kite"

schema Test {}`);
            const result = organizeImports(doc);

            expect(result).not.toBeNull();
            expect(result!.newText).toBe(`import Config, Utils from "common.kite"`);
        });

        it('should merge and sort symbols within import', () => {
            const doc = createDocument(`import Utils from "common.kite"
import Config from "common.kite"
import Auth from "common.kite"

schema Test {}`);
            const result = organizeImports(doc);

            expect(result).not.toBeNull();
            expect(result!.newText).toBe(`import Auth, Config, Utils from "common.kite"`);
        });

        it('should handle multiple symbols in original imports', () => {
            const doc = createDocument(`import A, B from "common.kite"
import C, D from "common.kite"

schema Test {}`);
            const result = organizeImports(doc);

            expect(result).not.toBeNull();
            expect(result!.newText).toBe(`import A, B, C, D from "common.kite"`);
        });

        it('should deduplicate symbols', () => {
            const doc = createDocument(`import Config from "common.kite"
import Config, Utils from "common.kite"

schema Test {}`);
            const result = organizeImports(doc);

            expect(result).not.toBeNull();
            expect(result!.newText).toBe(`import Config, Utils from "common.kite"`);
        });

        it('should keep wildcard import when merging with named import', () => {
            const doc = createDocument(`import Config from "common.kite"
import * from "common.kite"

schema Test {}`);
            const result = organizeImports(doc);

            expect(result).not.toBeNull();
            expect(result!.newText).toBe(`import * from "common.kite"`);
        });
    });

    describe('merge and sort combined', () => {
        it('should merge and sort imports', () => {
            const doc = createDocument(`import Z from "z.kite"
import B from "a.kite"
import A from "a.kite"
import Y from "z.kite"

schema Test {}`);
            const result = organizeImports(doc);

            expect(result).not.toBeNull();
            expect(result!.newText).toBe(
                `import A, B from "a.kite"
import Y, Z from "z.kite"`
            );
        });
    });

    describe('unused symbols removal', () => {
        it('should remove unused symbols when provided', () => {
            const doc = createDocument(`import Config, Unused from "common.kite"

schema Test {}`);
            const unusedSymbols = new Set(['Unused']);
            const result = organizeImports(doc, unusedSymbols);

            expect(result).not.toBeNull();
            expect(result!.newText).toBe(`import Config from "common.kite"`);
        });

        it('should remove entire import if all symbols unused', () => {
            const doc = createDocument(`import Unused1, Unused2 from "unused.kite"
import Config from "config.kite"

schema Test {}`);
            const unusedSymbols = new Set(['Unused1', 'Unused2']);
            const result = organizeImports(doc, unusedSymbols);

            expect(result).not.toBeNull();
            expect(result!.newText).toBe(`import Config from "config.kite"`);
        });

        it('should not remove wildcard imports even if symbols unused', () => {
            const doc = createDocument(`import * from "common.kite"

schema Test {}`);
            const unusedSymbols = new Set(['Config']);
            const result = organizeImports(doc, unusedSymbols);

            // No change because wildcard imports are kept
            expect(result).toBeNull();
        });
    });

    describe('edge cases', () => {
        it('should return null for empty document', () => {
            const doc = createDocument('');
            const result = organizeImports(doc);

            expect(result).toBeNull();
        });

        it('should return null for document with no imports', () => {
            const doc = createDocument(`schema Test {
    string name
}`);
            const result = organizeImports(doc);

            expect(result).toBeNull();
        });

        it('should handle single import', () => {
            const doc = createDocument(`import Config from "config.kite"

schema Test {}`);
            const result = organizeImports(doc);

            // Single import, already organized
            expect(result).toBeNull();
        });

        it('should skip comments and continue parsing imports', () => {
            // Comments are skipped, imports continue to be parsed
            const doc = createDocument(`import Config from "config.kite"
// This is a comment
import Auth from "auth.kite"

schema Test {}`);
            const result = organizeImports(doc);

            // Both imports parsed (comments skipped), sorted alphabetically
            expect(result).not.toBeNull();
            expect(result!.newText).toBe(
                `import Auth from "auth.kite"
import Config from "config.kite"`
            );
        });

        it('should handle imports with single quotes', () => {
            const doc = createDocument(`import Config from 'config.kite'
import Auth from 'auth.kite'

schema Test {}`);
            const result = organizeImports(doc);

            expect(result).not.toBeNull();
            // Output uses double quotes consistently
            expect(result!.newText).toBe(
                `import Auth from "auth.kite"
import Config from "config.kite"`
            );
        });
    });
});

describe('createOrganizeImportsAction', () => {
    it('should create action when imports can be organized', () => {
        const doc = createDocument(`import B from "b.kite"
import A from "a.kite"

schema Test {}`);
        const action = createOrganizeImportsAction(doc);

        expect(action).not.toBeNull();
        expect(action!.title).toBe('Organize imports');
        expect(action!.kind).toBe('source.organizeImports');
    });

    it('should return null when imports already organized', () => {
        const doc = createDocument(`import A from "a.kite"
import B from "b.kite"

schema Test {}`);
        const action = createOrganizeImportsAction(doc);

        expect(action).toBeNull();
    });
});
