/**
 * Tests for Add Missing Imports code action
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createAddMissingImportsAction, createAddMissingImportsSourceAction } from './add-missing-imports';
import { ImportSuggestion } from '../../types';

function createDocument(content: string): TextDocument {
    return TextDocument.create('file:///test.kite', 'kite', 1, content);
}

describe('createAddMissingImportsAction', () => {
    describe('single import', () => {
        it('should add single missing import', () => {
            const doc = createDocument(`schema Test {
    string name
}`);
            const suggestions: ImportSuggestion[] = [
                { symbolName: 'Config', importPath: 'common.kite', filePath: '/common.kite' }
            ];

            const action = createAddMissingImportsAction(doc, suggestions);

            expect(action).not.toBeNull();
            expect(action!.title).toBe('Add missing import');
            expect(action!.edit?.changes).toBeDefined();

            const edits = action!.edit!.changes!['file:///test.kite'];
            expect(edits).toHaveLength(1);
            expect(edits[0].newText).toBe('import Config from "common.kite"\n');
        });
    });

    describe('multiple imports from same file', () => {
        it('should group imports from same file', () => {
            const doc = createDocument(`schema Test {}`);
            const suggestions: ImportSuggestion[] = [
                { symbolName: 'Config', importPath: 'common.kite', filePath: '/common.kite' },
                { symbolName: 'Utils', importPath: 'common.kite', filePath: '/common.kite' },
            ];

            const action = createAddMissingImportsAction(doc, suggestions);

            expect(action).not.toBeNull();
            expect(action!.title).toBe('Add 2 missing imports');

            const edits = action!.edit!.changes!['file:///test.kite'];
            expect(edits).toHaveLength(1);
            // Symbols should be sorted alphabetically
            expect(edits[0].newText).toBe('import Config, Utils from "common.kite"\n');
        });

        it('should sort symbols alphabetically', () => {
            const doc = createDocument(`schema Test {}`);
            const suggestions: ImportSuggestion[] = [
                { symbolName: 'Zebra', importPath: 'common.kite', filePath: '/common.kite' },
                { symbolName: 'Alpha', importPath: 'common.kite', filePath: '/common.kite' },
                { symbolName: 'Beta', importPath: 'common.kite', filePath: '/common.kite' },
            ];

            const action = createAddMissingImportsAction(doc, suggestions);

            const edits = action!.edit!.changes!['file:///test.kite'];
            expect(edits[0].newText).toBe('import Alpha, Beta, Zebra from "common.kite"\n');
        });
    });

    describe('multiple imports from different files', () => {
        it('should create separate imports for different files', () => {
            const doc = createDocument(`schema Test {}`);
            const suggestions: ImportSuggestion[] = [
                { symbolName: 'Config', importPath: 'config.kite', filePath: '/config.kite' },
                { symbolName: 'Utils', importPath: 'utils.kite', filePath: '/utils.kite' },
            ];

            const action = createAddMissingImportsAction(doc, suggestions);

            expect(action).not.toBeNull();
            expect(action!.title).toBe('Add 2 missing imports');

            const edits = action!.edit!.changes!['file:///test.kite'];
            expect(edits).toHaveLength(2);
        });
    });

    describe('existing imports', () => {
        it('should add to existing import from same file', () => {
            const doc = createDocument(`import Config from "common.kite"

schema Test {}`);
            const suggestions: ImportSuggestion[] = [
                { symbolName: 'Utils', importPath: 'common.kite', filePath: '/common.kite' },
            ];

            const action = createAddMissingImportsAction(doc, suggestions);

            expect(action).not.toBeNull();
            const edits = action!.edit!.changes!['file:///test.kite'];
            expect(edits).toHaveLength(1);
            // Should replace existing import with merged one
            expect(edits[0].newText).toBe('import Config, Utils from "common.kite"');
        });

        it('should not duplicate already imported symbols', () => {
            const doc = createDocument(`import Config, Utils from "common.kite"

schema Test {}`);
            const suggestions: ImportSuggestion[] = [
                { symbolName: 'Config', importPath: 'common.kite', filePath: '/common.kite' },
            ];

            const action = createAddMissingImportsAction(doc, suggestions);

            // Nothing to add - already imported
            expect(action).toBeNull();
        });

        it('should skip files with wildcard imports', () => {
            const doc = createDocument(`import * from "common.kite"

schema Test {}`);
            const suggestions: ImportSuggestion[] = [
                { symbolName: 'Config', importPath: 'common.kite', filePath: '/common.kite' },
            ];

            const action = createAddMissingImportsAction(doc, suggestions);

            // Wildcard already covers this
            expect(action).toBeNull();
        });

        it('should insert after existing imports', () => {
            const doc = createDocument(`import Existing from "existing.kite"

schema Test {}`);
            const suggestions: ImportSuggestion[] = [
                { symbolName: 'Config', importPath: 'config.kite', filePath: '/config.kite' },
            ];

            const action = createAddMissingImportsAction(doc, suggestions);

            expect(action).not.toBeNull();
            const edits = action!.edit!.changes!['file:///test.kite'];
            // Should insert at line 1 (after existing import)
            expect(edits[0].range.start.line).toBe(1);
        });
    });

    describe('edge cases', () => {
        it('should return null for empty suggestions', () => {
            const doc = createDocument(`schema Test {}`);
            const action = createAddMissingImportsAction(doc, []);

            expect(action).toBeNull();
        });

        it('should deduplicate duplicate suggestions', () => {
            const doc = createDocument(`schema Test {}`);
            const suggestions: ImportSuggestion[] = [
                { symbolName: 'Config', importPath: 'common.kite', filePath: '/common.kite' },
                { symbolName: 'Config', importPath: 'common.kite', filePath: '/common.kite' },
            ];

            const action = createAddMissingImportsAction(doc, suggestions);

            expect(action).not.toBeNull();
            expect(action!.title).toBe('Add missing import'); // singular
            const edits = action!.edit!.changes!['file:///test.kite'];
            expect(edits[0].newText).toBe('import Config from "common.kite"\n');
        });
    });
});

describe('createAddMissingImportsSourceAction', () => {
    it('should create source action with correct kind', () => {
        const doc = createDocument(`schema Test {}`);
        const suggestions: ImportSuggestion[] = [
            { symbolName: 'Config', importPath: 'common.kite', filePath: '/common.kite' },
        ];

        const action = createAddMissingImportsSourceAction(doc, suggestions);

        expect(action).not.toBeNull();
        expect(action!.title).toBe('Add all missing imports');
        expect(action!.kind).toBe('source.fixAll');
    });

    it('should return null when no imports needed', () => {
        const doc = createDocument(`schema Test {}`);
        const action = createAddMissingImportsSourceAction(doc, []);

        expect(action).toBeNull();
    });
});
