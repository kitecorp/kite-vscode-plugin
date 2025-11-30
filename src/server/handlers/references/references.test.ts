/**
 * Tests for references handler.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range, Position } from 'vscode-languageserver/node';
import { handleReferences, findAllReferences, ReferencesContext } from '.';
import { Declaration } from '../../types';

// Helper to create a mock TextDocument
function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

// Helper to create a mock context
function createContext(options: {
    files?: Record<string, string>;
    declarations?: Declaration[];
    documents?: Record<string, TextDocument>;
} = {}): ReferencesContext {
    const documents = options.documents || {};

    return {
        getDeclarations: () => options.declarations || [],
        findKiteFilesInWorkspace: () => Object.keys(options.files || {}),
        getFileContent: (path: string) => options.files?.[path] || null,
        getDocument: (uri: string) => documents[uri],
    };
}

describe('handleReferences', () => {
    it('should find references in single file', () => {
        const content = `var count = 1
var x = count + 1
var y = count * 2`;
        const doc = createDocument(content);
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        const locations = handleReferences(doc, 'count', 4, ctx);

        expect(locations.length).toBeGreaterThanOrEqual(3);
    });

    it('should return empty for non-existent symbol', () => {
        const doc = createDocument('var x = 1');
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        const locations = handleReferences(doc, 'nonExistent', 0, ctx);

        expect(locations).toHaveLength(0);
    });
});

describe('findAllReferences', () => {
    it('should find all references in current file', () => {
        const content = `var name = "test"
var greeting = "Hello, " + name
println(name)`;
        const doc = createDocument(content);
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        const locations = findAllReferences('name', 'file:///test.kite', 4, ctx);

        expect(locations.length).toBeGreaterThanOrEqual(3);
    });

    it('should not find references in comments', () => {
        const content = `var name = "test"
// name is used here
/* name in multi-line */
var x = name`;
        const doc = createDocument(content);
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        const locations = findAllReferences('name', 'file:///test.kite', 4, ctx);

        // Should find declaration and usage, not comments
        expect(locations).toHaveLength(2);
    });

    it('should respect scope for local variables', () => {
        const content = `fun outer() {
    var local = 1
    var x = local + 1
}
var local = 2`;
        const doc = createDocument(content);
        const declarations: Declaration[] = [{
            name: 'local',
            type: 'variable',
            scopeStart: 12,
            scopeEnd: 55,
            range: Range.create(1, 4, 1, 16),
            nameRange: Range.create(1, 8, 1, 13),
            uri: 'file:///test.kite',
        }];
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
            declarations,
        });

        // Position inside the function at the local variable
        const locations = findAllReferences('local', 'file:///test.kite', 20, ctx);

        // Should only find the scoped references, not the outer one
        expect(locations.length).toBeLessThanOrEqual(2);
    });

    it('should search other files for global symbols', () => {
        const currentContent = `import * from "other.kite"
var x = Config`;
        const otherContent = `schema Config { }
resource Config server { }`;

        const doc = createDocument(currentContent);
        const ctx = createContext({
            files: {
                '/test.kite': currentContent,
                '/other.kite': otherContent,
            },
            documents: { 'file:///test.kite': doc },
        });

        const locations = findAllReferences('Config', 'file:///test.kite', undefined, ctx);

        // Should find in both files
        expect(locations.length).toBeGreaterThan(1);
    });

    it('should not search other files for local variables', () => {
        const currentContent = `fun test() {
    var local = 1
}`;
        const otherContent = `var local = 2`;

        const doc = createDocument(currentContent);
        const declarations: Declaration[] = [{
            name: 'local',
            type: 'variable',
            scopeStart: 11,
            scopeEnd: 35,
            range: Range.create(1, 4, 1, 16),
            nameRange: Range.create(1, 8, 1, 13),
            uri: 'file:///test.kite',
        }];
        const ctx = createContext({
            files: {
                '/test.kite': currentContent,
                '/other.kite': otherContent,
            },
            documents: { 'file:///test.kite': doc },
            declarations,
        });

        const locations = findAllReferences('local', 'file:///test.kite', 20, ctx);

        // Should only find in current file (within scope)
        const otherFileLocations = locations.filter(l => l.uri.includes('other'));
        expect(otherFileLocations).toHaveLength(0);
    });

    it('should find function references', () => {
        const content = `fun calculate(x) { return x }
var result = calculate(10)
var other = calculate(20)`;
        const doc = createDocument(content);
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        const locations = findAllReferences('calculate', 'file:///test.kite', 4, ctx);

        expect(locations.length).toBeGreaterThanOrEqual(3);
    });

    it('should find schema references', () => {
        const content = `schema Config { }
resource Config server { }
var x = Config`;
        const doc = createDocument(content);
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        const locations = findAllReferences('Config', 'file:///test.kite', 7, ctx);

        expect(locations.length).toBeGreaterThanOrEqual(3);
    });
});
