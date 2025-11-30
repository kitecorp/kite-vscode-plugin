/**
 * Tests for hover handler.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { MarkupKind, Position, Range } from 'vscode-languageserver/node';
import { handleHover } from '.';
import { Declaration } from '../../types';

// Helper to create a mock TextDocument
function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

describe('handleHover', () => {
    describe('keyword hover', () => {
        it('should show hover for keyword', () => {
            const doc = createDocument('resource Config server { }');
            const hover = handleHover(doc, Position.create(0, 2), []);

            expect(hover).not.toBeNull();
            expect(hover?.contents).toHaveProperty('kind', MarkupKind.Markdown);
            expect((hover?.contents as { value: string }).value).toContain('**keyword**');
            expect((hover?.contents as { value: string }).value).toContain('resource');
        });

        it('should show hover for various keywords', () => {
            const keywords = ['schema', 'component', 'fun', 'var', 'if', 'for', 'while', 'return'];

            for (const keyword of keywords) {
                const doc = createDocument(keyword);
                const hover = handleHover(doc, Position.create(0, 0), []);

                expect(hover).not.toBeNull();
                expect((hover?.contents as { value: string }).value).toContain('**keyword**');
            }
        });
    });

    describe('type hover', () => {
        it('should show hover for built-in type', () => {
            const doc = createDocument('string name');
            const hover = handleHover(doc, Position.create(0, 2), []);

            expect(hover).not.toBeNull();
            expect((hover?.contents as { value: string }).value).toContain('**type**');
            expect((hover?.contents as { value: string }).value).toContain('string');
        });

        it('should show hover for various types', () => {
            const types = ['string', 'number', 'boolean', 'any', 'object', 'void'];

            for (const type of types) {
                const doc = createDocument(type);
                const hover = handleHover(doc, Position.create(0, 0), []);

                expect(hover).not.toBeNull();
                expect((hover?.contents as { value: string }).value).toContain('**type**');
            }
        });
    });

    describe('declaration hover', () => {
        it('should show hover for variable declaration', () => {
            const doc = createDocument('var myVar = "hello"');
            const declarations: Declaration[] = [{
                name: 'myVar',
                type: 'variable',
                typeName: 'string',
                range: Range.create(0, 4, 0, 9),
                nameRange: Range.create(0, 4, 0, 9),
                uri: 'file:///test.kite',
            }];
            const hover = handleHover(doc, Position.create(0, 5), declarations);

            expect(hover).not.toBeNull();
            expect((hover?.contents as { value: string }).value).toContain('**variable**');
            expect((hover?.contents as { value: string }).value).toContain('myVar');
            expect((hover?.contents as { value: string }).value).toContain('Type: `string`');
        });

        it('should show hover for resource with schema', () => {
            const doc = createDocument('resource Config server { }');
            const declarations: Declaration[] = [{
                name: 'server',
                type: 'resource',
                schemaName: 'Config',
                range: Range.create(0, 0, 0, 26),
                nameRange: Range.create(0, 16, 0, 22),
                uri: 'file:///test.kite',
            }];
            const hover = handleHover(doc, Position.create(0, 18), declarations);

            expect(hover).not.toBeNull();
            expect((hover?.contents as { value: string }).value).toContain('**resource**');
            expect((hover?.contents as { value: string }).value).toContain('Schema: `Config`');
        });

        it('should show hover for component instance with type', () => {
            const doc = createDocument('component WebServer api { }');
            const declarations: Declaration[] = [{
                name: 'api',
                type: 'component',
                componentType: 'WebServer',
                range: Range.create(0, 0, 0, 27),
                nameRange: Range.create(0, 20, 0, 23),
                uri: 'file:///test.kite',
            }];
            const hover = handleHover(doc, Position.create(0, 21), declarations);

            expect(hover).not.toBeNull();
            expect((hover?.contents as { value: string }).value).toContain('**component**');
            expect((hover?.contents as { value: string }).value).toContain('Component Type: `WebServer`');
        });

        it('should show documentation when available', () => {
            const doc = createDocument('var config = {}');
            const declarations: Declaration[] = [{
                name: 'config',
                type: 'variable',
                documentation: 'This is the main configuration object',
                range: Range.create(0, 4, 0, 10),
                nameRange: Range.create(0, 4, 0, 10),
                uri: 'file:///test.kite',
            }];
            const hover = handleHover(doc, Position.create(0, 6), declarations);

            expect(hover).not.toBeNull();
            expect((hover?.contents as { value: string }).value).toContain('This is the main configuration object');
        });

        it('should show hover for function declaration', () => {
            const doc = createDocument('fun calculate() { }');
            const declarations: Declaration[] = [{
                name: 'calculate',
                type: 'function',
                range: Range.create(0, 0, 0, 19),
                nameRange: Range.create(0, 4, 0, 13),
                uri: 'file:///test.kite',
            }];
            const hover = handleHover(doc, Position.create(0, 6), declarations);

            expect(hover).not.toBeNull();
            expect((hover?.contents as { value: string }).value).toContain('**function**');
            expect((hover?.contents as { value: string }).value).toContain('calculate');
        });
    });

    describe('no hover', () => {
        it('should return null for unknown identifier', () => {
            const doc = createDocument('unknownSymbol');
            const hover = handleHover(doc, Position.create(0, 5), []);

            expect(hover).toBeNull();
        });

        it('should return null for empty position', () => {
            const doc = createDocument('   ');
            const hover = handleHover(doc, Position.create(0, 1), []);

            expect(hover).toBeNull();
        });

        it('should return null for whitespace', () => {
            const doc = createDocument('var  x = 1');
            const hover = handleHover(doc, Position.create(0, 4), []); // On space between var and x

            expect(hover).toBeNull();
        });
    });
});
