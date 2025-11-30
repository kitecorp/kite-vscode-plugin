/**
 * Tests for prepareRename handler.
 */

import { describe, it, expect } from 'vitest';
import { Position } from 'vscode-languageserver/node';
import { handlePrepareRename } from '.';
import { createDocument } from './test-utils';

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
