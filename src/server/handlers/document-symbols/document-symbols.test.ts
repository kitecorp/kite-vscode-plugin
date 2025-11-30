/**
 * Tests for document symbols handler.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolKind } from 'vscode-languageserver/node';
import { handleDocumentSymbol } from '.';

// Helper to create a mock TextDocument
function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

describe('handleDocumentSymbol', () => {
    describe('schema symbols', () => {
        it('should extract schema symbol', () => {
            const doc = createDocument(`schema Config {
    string host
    number port
}`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols).toHaveLength(1);
            expect(symbols[0].name).toBe('Config');
            expect(symbols[0].kind).toBe(SymbolKind.Struct);
            expect(symbols[0].detail).toBe('schema');
        });

        it('should extract schema properties as children', () => {
            const doc = createDocument(`schema Config {
    string host
    number port
}`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols[0].children).toHaveLength(2);
            expect(symbols[0].children?.[0].name).toBe('host');
            expect(symbols[0].children?.[0].kind).toBe(SymbolKind.Property);
            expect(symbols[0].children?.[0].detail).toBe('string');
            expect(symbols[0].children?.[1].name).toBe('port');
            expect(symbols[0].children?.[1].detail).toBe('number');
        });
    });

    describe('component symbols', () => {
        it('should extract component definition', () => {
            const doc = createDocument(`component WebServer {
    input string name
    output string endpoint
}`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols).toHaveLength(1);
            expect(symbols[0].name).toBe('WebServer');
            expect(symbols[0].kind).toBe(SymbolKind.Class);
            expect(symbols[0].detail).toBe('component');
        });

        it('should extract inputs and outputs as children', () => {
            const doc = createDocument(`component WebServer {
    input string name
    output string endpoint
}`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols[0].children).toHaveLength(2);
            expect(symbols[0].children?.[0].name).toBe('name');
            expect(symbols[0].children?.[0].detail).toBe('input: string');
            expect(symbols[0].children?.[1].name).toBe('endpoint');
            expect(symbols[0].children?.[1].detail).toBe('output: string');
        });

        it('should extract component instantiation', () => {
            const doc = createDocument(`component WebServer api {
    name = "api"
}`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols).toHaveLength(1);
            expect(symbols[0].name).toBe('api');
            expect(symbols[0].kind).toBe(SymbolKind.Object);
            expect(symbols[0].detail).toBe('component: WebServer');
        });
    });

    describe('resource symbols', () => {
        it('should extract resource declaration', () => {
            const doc = createDocument(`resource Config server {
    host = "localhost"
}`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols).toHaveLength(1);
            expect(symbols[0].name).toBe('server');
            expect(symbols[0].kind).toBe(SymbolKind.Object);
            expect(symbols[0].detail).toBe('resource: Config');
        });
    });

    describe('function symbols', () => {
        it('should extract function declaration', () => {
            const doc = createDocument(`fun calculate(number x, number y) number {
    return x + y
}`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols).toHaveLength(1);
            expect(symbols[0].name).toBe('calculate');
            expect(symbols[0].kind).toBe(SymbolKind.Function);
            expect(symbols[0].detail).toContain('number x');
            expect(symbols[0].detail).toContain('number y');
            expect(symbols[0].detail).toContain('→ number');
        });

        it('should handle function with no parameters', () => {
            const doc = createDocument(`fun getData() any {
    return null
}`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols[0].detail).toBe('() → any');
        });

        it('should handle function with no return type', () => {
            const doc = createDocument(`fun doSomething() {
    println("done")
}`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols[0].detail).toBe('() → void');
        });
    });

    describe('type symbols', () => {
        it('should extract type declaration', () => {
            const doc = createDocument(`type Region = "us-east-1" | "us-west-2"`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols).toHaveLength(1);
            expect(symbols[0].name).toBe('Region');
            expect(symbols[0].kind).toBe(SymbolKind.TypeParameter);
            expect(symbols[0].detail).toBe('type alias');
        });
    });

    describe('variable symbols', () => {
        it('should extract variable declaration', () => {
            const doc = createDocument(`var count = 42`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols).toHaveLength(1);
            expect(symbols[0].name).toBe('count');
            expect(symbols[0].kind).toBe(SymbolKind.Variable);
        });

        it('should extract variable with explicit type', () => {
            const doc = createDocument(`var string name = "test"`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols[0].detail).toBe('string');
        });

        it('should extract multiple variables', () => {
            const doc = createDocument(`var a = 1, b = 2, c = 3`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols).toHaveLength(3);
            expect(symbols.map(s => s.name)).toEqual(['a', 'b', 'c']);
        });
    });

    describe('input/output symbols', () => {
        it('should extract top-level input', () => {
            const doc = createDocument(`input string apiKey`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols).toHaveLength(1);
            expect(symbols[0].name).toBe('apiKey');
            expect(symbols[0].kind).toBe(SymbolKind.Property);
            expect(symbols[0].detail).toBe('input: string');
        });

        it('should extract top-level output', () => {
            const doc = createDocument(`output string endpoint`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols).toHaveLength(1);
            expect(symbols[0].name).toBe('endpoint');
            expect(symbols[0].kind).toBe(SymbolKind.Event);
            expect(symbols[0].detail).toBe('output: string');
        });
    });

    describe('mixed declarations', () => {
        it('should extract all declaration types', () => {
            const doc = createDocument(`schema Config { string host }
component WebServer { input string name }
resource Config server { }
fun process() { }
type Region = "us-east-1"
var count = 1`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols.length).toBeGreaterThanOrEqual(6);

            const kinds = symbols.map(s => s.kind);
            expect(kinds).toContain(SymbolKind.Struct);    // schema
            expect(kinds).toContain(SymbolKind.Class);     // component
            expect(kinds).toContain(SymbolKind.Object);    // resource
            expect(kinds).toContain(SymbolKind.Function);  // function
            expect(kinds).toContain(SymbolKind.TypeParameter); // type
            expect(kinds).toContain(SymbolKind.Variable);  // var
        });
    });

    describe('edge cases', () => {
        it('should handle empty file', () => {
            const doc = createDocument('');
            const symbols = handleDocumentSymbol(doc);

            expect(symbols).toHaveLength(0);
        });

        it('should handle file with only comments', () => {
            const doc = createDocument(`// This is a comment
/* Multi-line
   comment */`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols).toHaveLength(0);
        });

        it('should handle file with imports only', () => {
            const doc = createDocument(`import * from "other.kite"`);
            const symbols = handleDocumentSymbol(doc);

            expect(symbols).toHaveLength(0);
        });
    });
});
