/**
 * Tests for basic rename operations.
 */

import { describe, it, expect } from 'vitest';
import { Position } from 'vscode-languageserver/node';
import { handleRename } from './rename';
import { createDocument, createContext } from './rename-test-utils';

describe('handleRename - basic', () => {
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
