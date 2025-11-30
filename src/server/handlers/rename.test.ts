/**
 * Tests for rename handler.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range } from 'vscode-languageserver/node';
import { handlePrepareRename, handleRename, RenameContext } from './rename';
import { Declaration } from '../types';

// Helper to create a mock TextDocument
function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

// Helper to create a mock context
function createContext(options: {
    files?: Record<string, string>;
    declarations?: Declaration[];
    documents?: Record<string, TextDocument>;
} = {}): RenameContext {
    const documents = options.documents || {};

    return {
        getDeclarations: () => options.declarations || [],
        findKiteFilesInWorkspace: () => Object.keys(options.files || {}),
        getFileContent: (path: string) => options.files?.[path] || null,
        getDocument: (uri: string) => documents[uri],
        refreshDiagnostics: () => {},
    };
}

describe('handlePrepareRename', () => {
    it('should return range and placeholder for valid identifier', () => {
        const doc = createDocument('var myVariable = 1');
        const result = handlePrepareRename(doc, Position.create(0, 6));

        expect(result).not.toBeNull();
        expect(result?.placeholder).toBe('myVariable');
        expect(result?.range.start.character).toBe(4);
        expect(result?.range.end.character).toBe(14);
    });

    it('should return null for keywords', () => {
        const keywords = ['var', 'fun', 'schema', 'component', 'resource', 'if', 'for', 'while', 'return'];

        for (const keyword of keywords) {
            const doc = createDocument(keyword);
            const result = handlePrepareRename(doc, Position.create(0, 1));
            expect(result).toBeNull();
        }
    });

    it('should return null for built-in types', () => {
        const types = ['string', 'number', 'boolean', 'any', 'object', 'void'];

        for (const type of types) {
            const doc = createDocument(type);
            const result = handlePrepareRename(doc, Position.create(0, 1));
            expect(result).toBeNull();
        }
    });

    it('should return null for decorator names', () => {
        const doc = createDocument('@description("test")');
        const result = handlePrepareRename(doc, Position.create(0, 5));

        expect(result).toBeNull();
    });

    it('should return null inside string', () => {
        const doc = createDocument('var x = "myVariable"');
        const result = handlePrepareRename(doc, Position.create(0, 12));

        expect(result).toBeNull();
    });

    it('should return null inside comment', () => {
        const doc = createDocument('// myVariable comment');
        const result = handlePrepareRename(doc, Position.create(0, 5));

        expect(result).toBeNull();
    });

    it('should return null for whitespace', () => {
        const doc = createDocument('var x = 1');
        const result = handlePrepareRename(doc, Position.create(0, 3));

        expect(result).toBeNull();
    });

    it('should handle identifier at start of file', () => {
        const doc = createDocument('myVariable = 1');
        const result = handlePrepareRename(doc, Position.create(0, 2));

        expect(result).not.toBeNull();
        expect(result?.placeholder).toBe('myVariable');
    });

    it('should handle identifier at end of line', () => {
        const doc = createDocument('var x = myVariable');
        const result = handlePrepareRename(doc, Position.create(0, 12));

        expect(result).not.toBeNull();
        expect(result?.placeholder).toBe('myVariable');
    });
});

describe('handleRename', () => {
    it('should rename variable in single file', () => {
        const content = `var count = 1
var x = count + 1`;
        const doc = createDocument(content);
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        const result = handleRename(doc, Position.create(0, 6), 'total', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes).toBeDefined();
        expect(result?.changes?.['file:///test.kite']).toBeDefined();
        expect(result?.changes?.['file:///test.kite'].length).toBeGreaterThanOrEqual(2);
    });

    it('should return null for invalid new name', () => {
        const doc = createDocument('var count = 1');
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        // Invalid identifier (starts with number)
        const result = handleRename(doc, Position.create(0, 6), '123invalid', ctx);

        expect(result).toBeNull();
    });

    it('should return null when renaming to keyword', () => {
        const doc = createDocument('var count = 1');
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        const result = handleRename(doc, Position.create(0, 6), 'var', ctx);

        expect(result).toBeNull();
    });

    it('should return null when renaming to built-in type', () => {
        const doc = createDocument('var count = 1');
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        const result = handleRename(doc, Position.create(0, 6), 'string', ctx);

        expect(result).toBeNull();
    });

    it('should trim whitespace from new name', () => {
        const content = `var count = 1
var x = count`;
        const doc = createDocument(content);
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        const result = handleRename(doc, Position.create(0, 6), '  total  ', ctx);

        expect(result).not.toBeNull();
        // All edits should use trimmed name
        for (const edit of result?.changes?.['file:///test.kite'] || []) {
            expect(edit.newText).toBe('total');
        }
    });

    it('should return null when no word at position', () => {
        const doc = createDocument('var  x = 1');
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        // Position 4 is on the space between 'var' and 'x'
        const result = handleRename(doc, Position.create(0, 4), 'newName', ctx);

        expect(result).toBeNull();
    });

    it('should allow valid identifier names', () => {
        const doc = createDocument('var x = 1');
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        const validNames = ['_private', 'camelCase', 'PascalCase', 'with_underscore', 'a1b2c3'];

        for (const name of validNames) {
            const result = handleRename(doc, Position.create(0, 4), name, ctx);
            expect(result).not.toBeNull();
        }
    });

    it('should reject invalid identifier names', () => {
        const doc = createDocument('var x = 1');
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        const invalidNames = ['123start', 'has-dash', 'has space', 'has.dot', ''];

        for (const name of invalidNames) {
            const result = handleRename(doc, Position.create(0, 4), name, ctx);
            expect(result).toBeNull();
        }
    });

    it('should rename function and its calls', () => {
        const content = `fun calculate(x) { return x }
var result = calculate(10)`;
        const doc = createDocument(content);
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        const result = handleRename(doc, Position.create(0, 6), 'compute', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes?.['file:///test.kite'].length).toBeGreaterThanOrEqual(2);
    });

    it('should rename schema and its usages', () => {
        const content = `schema Config { }
resource Config server { }`;
        const doc = createDocument(content);
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        const result = handleRename(doc, Position.create(0, 8), 'Settings', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes?.['file:///test.kite'].length).toBeGreaterThanOrEqual(2);
    });
});
