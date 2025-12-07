/**
 * Tests for inlay hints handler.
 */

import { describe, it, expect } from 'vitest';
import { createDocument, createInlayHintContext } from '../../test-utils';
import { InlayHintKind, Range, Position } from 'vscode-languageserver/node';
import {
    handleInlayHints,
    extractSchemaPropertyTypes,
    extractSchemaPropertyTypesForCompletion,
    extractComponentInputTypes,
    InlayHintContext,
} from '.';
import { Declaration } from '../../types';

// Alias for convenience
const createContext = (files: Record<string, string> = {}) => createInlayHintContext({ files });

// Helper to create a function declaration with parameters
function createFunctionDecl(name: string, params: { type: string; name: string }[]): Declaration {
    return {
        name,
        type: 'function',
        parameters: params,
        range: Range.create(Position.create(0, 0), Position.create(0, 0)),
        nameRange: Range.create(Position.create(0, 0), Position.create(0, 0)),
        uri: 'file:///test.kite',
    };
}

describe('handleInlayHints', () => {
    describe('var type inference', () => {
        it('should show type hint for string literal', () => {
            const doc = createDocument('var name = "hello"');
            const hints = handleInlayHints(doc, [], createContext());

            expect(hints).toHaveLength(1);
            expect(hints[0].label).toBe(': string');
            expect(hints[0].kind).toBe(InlayHintKind.Type);
        });

        it('should show type hint for number literal', () => {
            const doc = createDocument('var count = 42');
            const hints = handleInlayHints(doc, [], createContext());

            expect(hints).toHaveLength(1);
            expect(hints[0].label).toBe(': number');
        });

        it('should show type hint for boolean literal true', () => {
            const doc = createDocument('var enabled = true');
            const hints = handleInlayHints(doc, [], createContext());

            expect(hints).toHaveLength(1);
            expect(hints[0].label).toBe(': boolean');
        });

        it('should show type hint for boolean literal false', () => {
            const doc = createDocument('var disabled = false');
            const hints = handleInlayHints(doc, [], createContext());

            expect(hints).toHaveLength(1);
            expect(hints[0].label).toBe(': boolean');
        });

        it('should show type hint for null literal', () => {
            const doc = createDocument('var empty = null');
            const hints = handleInlayHints(doc, [], createContext());

            expect(hints).toHaveLength(1);
            expect(hints[0].label).toBe(': null');
        });

        it('should show type hint for array literal', () => {
            const doc = createDocument('var items = [1, 2, 3]');
            const hints = handleInlayHints(doc, [], createContext());

            expect(hints).toHaveLength(1);
            expect(hints[0].label).toBe(': array');
        });

        it('should show type hint for object literal', () => {
            const doc = createDocument('var config = { key: "value" }');
            const hints = handleInlayHints(doc, [], createContext());

            expect(hints).toHaveLength(1);
            expect(hints[0].label).toBe(': object');
        });

        it('should show type hint for negative number', () => {
            const doc = createDocument('var offset = -10');
            const hints = handleInlayHints(doc, [], createContext());

            expect(hints).toHaveLength(1);
            expect(hints[0].label).toBe(': number');
        });

        it('should NOT show hint for var with explicit type', () => {
            const doc = createDocument('var string name = "hello"');
            const hints = handleInlayHints(doc, [], createContext());

            expect(hints).toHaveLength(0);
        });

        it('should NOT show hint for var with array type', () => {
            const doc = createDocument('var string[] names = ["a", "b"]');
            const hints = handleInlayHints(doc, [], createContext());

            expect(hints).toHaveLength(0);
        });

        it('should handle multiple var declarations', () => {
            const doc = createDocument(`var a = 1
var b = "two"
var c = true`);
            const hints = handleInlayHints(doc, [], createContext());

            expect(hints).toHaveLength(3);
            expect(hints[0].label).toBe(': number');
            expect(hints[1].label).toBe(': string');
            expect(hints[2].label).toBe(': boolean');
        });
    });

    describe('function parameter hints', () => {
        it('should show parameter hints for function call', () => {
            const doc = createDocument('calculate(10, 20)');
            const declarations = [
                createFunctionDecl('calculate', [
                    { type: 'number', name: 'x' },
                    { type: 'number', name: 'y' },
                ]),
            ];
            const hints = handleInlayHints(doc, declarations, createContext());

            expect(hints).toHaveLength(2);
            expect(hints[0].label).toBe('x:');
            expect(hints[0].kind).toBe(InlayHintKind.Parameter);
            expect(hints[1].label).toBe('y:');
        });

        it('should NOT show hint for keyword-like function names', () => {
            const doc = createDocument('if (condition) { }');
            const hints = handleInlayHints(doc, [], createContext());

            // Should not create parameter hints for 'if'
            const paramHints = hints.filter(h => h.kind === InlayHintKind.Parameter);
            expect(paramHints).toHaveLength(0);
        });

        it('should NOT show hint for function declarations', () => {
            const doc = createDocument('fun calculate(number x) { }');
            const hints = handleInlayHints(doc, [], createContext());

            const paramHints = hints.filter(h => h.kind === InlayHintKind.Parameter);
            expect(paramHints).toHaveLength(0);
        });

        it('should NOT show hint when argument name matches parameter name', () => {
            const doc = createDocument('calculate(x)');
            const declarations = [
                createFunctionDecl('calculate', [{ type: 'number', name: 'x' }]),
            ];
            const hints = handleInlayHints(doc, declarations, createContext());

            const paramHints = hints.filter(h => h.kind === InlayHintKind.Parameter);
            expect(paramHints).toHaveLength(0);
        });

        it('should NOT show hint for named arguments', () => {
            const doc = createDocument('calculate(x: 10)');
            const declarations = [
                createFunctionDecl('calculate', [{ type: 'number', name: 'x' }]),
            ];
            const hints = handleInlayHints(doc, declarations, createContext());

            const paramHints = hints.filter(h => h.kind === InlayHintKind.Parameter);
            expect(paramHints).toHaveLength(0);
        });
    });

    describe('resource property type hints', () => {
        it('should show type hints for resource properties', () => {
            const doc = createDocument(`schema Config {
    string host
    number port
}

resource Config server {
    host = "localhost"
    port = 8080
}`);
            const hints = handleInlayHints(doc, [], createContext());

            // Should have hints for host and port properties
            const typeHints = hints.filter(h => h.kind === InlayHintKind.Type);
            expect(typeHints.length).toBeGreaterThanOrEqual(2);

            const labels = typeHints.map(h => h.label);
            expect(labels).toContain(': string');
            expect(labels).toContain(': number');
        });
    });

    describe('component property type hints', () => {
        it('should show type hints for component instance properties', () => {
            const doc = createDocument(`component WebServer {
    input string name
    input number replicas
}

component WebServer api {
    name = "api"
    replicas = 3
}`);
            const hints = handleInlayHints(doc, [], createContext());

            const typeHints = hints.filter(h => h.kind === InlayHintKind.Type);
            expect(typeHints.length).toBeGreaterThanOrEqual(2);

            const labels = typeHints.map(h => h.label);
            expect(labels).toContain(': string');
            expect(labels).toContain(': number');
        });
    });
});

describe('extractSchemaPropertyTypes', () => {
    it('should extract property types from schema', () => {
        const text = `schema Config {
    string host
    number port
    boolean ssl
}`;
        const ctx = createContext();
        const types = extractSchemaPropertyTypes(text, 'Config', ctx);

        expect(types).toEqual({
            host: 'string',
            port: 'number',
            ssl: 'boolean',
        });
    });

    it('should handle dotted schema names', () => {
        const text = `schema Instance {
    string id
}`;
        const ctx = createContext();
        const types = extractSchemaPropertyTypes(text, 'VM.Instance', ctx);

        expect(types).toEqual({
            id: 'string',
        });
    });

    it('should return empty object for non-existent schema', () => {
        const text = `schema Other { }`;
        const ctx = createContext();
        const types = extractSchemaPropertyTypes(text, 'Config', ctx);

        expect(types).toEqual({});
    });

    it('should search cross-file for schema', () => {
        const currentText = `resource Config server { }`;
        const otherFile = `schema Config {
    string host
}`;
        const ctx = createContext({
            '/other.kite': otherFile,
        });
        const types = extractSchemaPropertyTypes(currentText, 'Config', ctx);

        expect(types).toEqual({
            host: 'string',
        });
    });
});

describe('extractComponentInputTypes', () => {
    it('should extract input types from component definition', () => {
        const text = `component WebServer {
    input string name
    input number replicas
    input boolean enabled
}`;
        const ctx = createContext();
        const types = extractComponentInputTypes(text, 'WebServer', ctx);

        expect(types).toEqual({
            name: 'string',
            replicas: 'number',
            enabled: 'boolean',
        });
    });

    it('should return empty object for non-existent component', () => {
        const text = `component Other { }`;
        const ctx = createContext();
        const types = extractComponentInputTypes(text, 'WebServer', ctx);

        expect(types).toEqual({});
    });

    it('should search cross-file for component', () => {
        const currentText = `component WebServer api { }`;
        const otherFile = `component WebServer {
    input string name
}`;
        const ctx = createContext({
            '/other.kite': otherFile,
        });
        const types = extractComponentInputTypes(currentText, 'WebServer', ctx);

        expect(types).toEqual({
            name: 'string',
        });
    });

    it('should handle array types', () => {
        const text = `component WebServer {
    input string[] tags
}`;
        const ctx = createContext();
        const types = extractComponentInputTypes(text, 'WebServer', ctx);

        expect(types).toEqual({
            tags: 'string[]',
        });
    });
});

describe('extractSchemaPropertyTypesForCompletion', () => {
    it('should exclude @cloud properties from completions', () => {
        const text = `schema Config {
    string name
    @cloud string arn
    number port
    @cloud string id
}`;
        const ctx = createContext();
        const types = extractSchemaPropertyTypesForCompletion(text, 'Config', ctx);

        // Should NOT include arn or id (they are @cloud)
        expect(types).toEqual({
            name: 'string',
            port: 'number',
        });
    });

    it('should include all properties when no @cloud properties exist', () => {
        const text = `schema Config {
    string name
    number port
    boolean ssl
}`;
        const ctx = createContext();
        const types = extractSchemaPropertyTypesForCompletion(text, 'Config', ctx);

        expect(types).toEqual({
            name: 'string',
            port: 'number',
            ssl: 'boolean',
        });
    });

    it('should handle @cloud with arguments', () => {
        const text = `schema Config {
    string name
    @cloud(importable) string id
    @cloud(importable=true) string arn
}`;
        const ctx = createContext();
        const types = extractSchemaPropertyTypesForCompletion(text, 'Config', ctx);

        // Should NOT include id or arn
        expect(types).toEqual({
            name: 'string',
        });
    });

    it('should return empty object when all properties are @cloud', () => {
        const text = `schema Config {
    @cloud string arn
    @cloud string id
}`;
        const ctx = createContext();
        const types = extractSchemaPropertyTypesForCompletion(text, 'Config', ctx);

        expect(types).toEqual({});
    });

    it('should work cross-file', () => {
        const currentText = `resource Config server { }`;
        const otherFile = `schema Config {
    string name
    @cloud string arn
}`;
        const ctx = createContext({
            '/other.kite': otherFile,
        });
        const types = extractSchemaPropertyTypesForCompletion(currentText, 'Config', ctx);

        // Should NOT include arn
        expect(types).toEqual({
            name: 'string',
        });
    });
});
