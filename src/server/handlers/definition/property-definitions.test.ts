/**
 * Tests for property-definitions.ts - property definition lookup.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    findSchemaPropertyLocation,
    findComponentInputLocation,
    findPropertyInChain,
} from './property-definitions';

function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

describe('findSchemaPropertyLocation', () => {
    describe('basic property lookup', () => {
        it('finds property in schema', () => {
            const text = `schema ServerConfig {
    string host
    number port
}`;
            const result = findSchemaPropertyLocation(text, 'ServerConfig', 'host', '/test.kite');
            expect(result).not.toBeNull();
            expect(result?.range.start.line).toBe(1);
        });

        it('finds second property in schema', () => {
            const text = `schema ServerConfig {
    string host
    number port
}`;
            const result = findSchemaPropertyLocation(text, 'ServerConfig', 'port', '/test.kite');
            expect(result).not.toBeNull();
            expect(result?.range.start.line).toBe(2);
        });

        it('returns null for non-existent property', () => {
            const text = `schema ServerConfig {
    string host
}`;
            const result = findSchemaPropertyLocation(text, 'ServerConfig', 'port', '/test.kite');
            expect(result).toBeNull();
        });

        it('returns null for non-existent schema', () => {
            const text = `schema ServerConfig {
    string host
}`;
            const result = findSchemaPropertyLocation(text, 'OtherSchema', 'host', '/test.kite');
            expect(result).toBeNull();
        });
    });

    describe('property with default value', () => {
        it('finds property with default', () => {
            const text = `schema Config {
    number port = 8080
}`;
            const result = findSchemaPropertyLocation(text, 'Config', 'port', '/test.kite');
            expect(result).not.toBeNull();
        });
    });

    describe('array types', () => {
        it('finds array property', () => {
            const text = `schema Config {
    string[] tags
}`;
            const result = findSchemaPropertyLocation(text, 'Config', 'tags', '/test.kite');
            expect(result).not.toBeNull();
        });
    });

    describe('URI handling', () => {
        it('handles file:// URI', () => {
            const text = `schema Config { string name }`;
            const result = findSchemaPropertyLocation(text, 'Config', 'name', 'file:///test.kite');
            expect(result).not.toBeNull();
            expect(result?.uri).toBe('file:///test.kite');
        });

        it('converts file path to URI', () => {
            const text = `schema Config { string name }`;
            const result = findSchemaPropertyLocation(text, 'Config', 'name', '/project/test.kite');
            expect(result).not.toBeNull();
            expect(result?.uri).toContain('file://');
        });
    });

    describe('multiple schemas', () => {
        it('finds property in correct schema', () => {
            const text = `schema A {
    string name
}
schema B {
    string name
}`;
            const result = findSchemaPropertyLocation(text, 'B', 'name', '/test.kite');
            expect(result).not.toBeNull();
            expect(result?.range.start.line).toBe(4);
        });
    });
});

describe('findComponentInputLocation', () => {
    describe('basic input lookup', () => {
        it('finds input in component', () => {
            const text = `component WebServer {
    input string name
    input number port
}`;
            const result = findComponentInputLocation(text, 'WebServer', 'name', '/test.kite');
            expect(result).not.toBeNull();
            expect(result?.range.start.line).toBe(1);
        });

        it('finds second input', () => {
            const text = `component WebServer {
    input string name
    input number port
}`;
            const result = findComponentInputLocation(text, 'WebServer', 'port', '/test.kite');
            expect(result).not.toBeNull();
            expect(result?.range.start.line).toBe(2);
        });

        it('returns null for non-existent input', () => {
            const text = `component WebServer {
    input string name
}`;
            const result = findComponentInputLocation(text, 'WebServer', 'port', '/test.kite');
            expect(result).toBeNull();
        });

        it('returns null for non-existent component', () => {
            const text = `component WebServer {
    input string name
}`;
            const result = findComponentInputLocation(text, 'Database', 'name', '/test.kite');
            expect(result).toBeNull();
        });
    });

    describe('input with default value', () => {
        it('finds input with default', () => {
            const text = `component Server {
    input number replicas = 3
}`;
            const result = findComponentInputLocation(text, 'Server', 'replicas', '/test.kite');
            expect(result).not.toBeNull();
        });
    });

    describe('does not find outputs', () => {
        it('returns null for output (only finds inputs)', () => {
            const text = `component Server {
    input string name
    output string endpoint
}`;
            // findComponentInputLocation specifically finds inputs
            const result = findComponentInputLocation(text, 'Server', 'endpoint', '/test.kite');
            expect(result).toBeNull();
        });
    });

    describe('multiple components', () => {
        it('finds input in correct component', () => {
            const text = `component A {
    input string name
}
component B {
    input string name
}`;
            const result = findComponentInputLocation(text, 'B', 'name', '/test.kite');
            expect(result).not.toBeNull();
            expect(result?.range.start.line).toBe(4);
        });
    });
});

describe('findPropertyInChain', () => {
    describe('simple property chain', () => {
        it('finds property in resource', () => {
            const text = `resource Config server {
    host = "localhost"
}
var h = server.host`;
            const doc = createDocument(text);
            const result = findPropertyInChain(doc, text, ['server', 'host']);
            expect(result).not.toBeNull();
        });

        it('returns null for non-existent property', () => {
            const text = `resource Config server {
    host = "localhost"
}`;
            const doc = createDocument(text);
            const result = findPropertyInChain(doc, text, ['server', 'port']);
            expect(result).toBeNull();
        });

        it('returns null for non-existent declaration', () => {
            const text = `resource Config server {
    host = "localhost"
}`;
            const doc = createDocument(text);
            const result = findPropertyInChain(doc, text, ['client', 'host']);
            expect(result).toBeNull();
        });
    });

    describe('nested property chain', () => {
        it('finds nested property', () => {
            const text = `resource Config server {
    config = {
        nested = "value"
    }
}`;
            const doc = createDocument(text);
            const result = findPropertyInChain(doc, text, ['server', 'config', 'nested']);
            expect(result).not.toBeNull();
        });

        it('finds deeply nested property', () => {
            const text = `resource Config server {
    a = {
        b = {
            c = "deep"
        }
    }
}`;
            const doc = createDocument(text);
            const result = findPropertyInChain(doc, text, ['server', 'a', 'b', 'c']);
            expect(result).not.toBeNull();
        });

        it('returns null if intermediate property is not object', () => {
            const text = `resource Config server {
    host = "localhost"
}`;
            const doc = createDocument(text);
            // host is a string, not an object, so host.nested doesn't exist
            const result = findPropertyInChain(doc, text, ['server', 'host', 'nested']);
            expect(result).toBeNull();
        });
    });

    describe('component instances', () => {
        it('finds property in component instance', () => {
            const text = `component WebServer api {
    name = "api-server"
}
var n = api.name`;
            const doc = createDocument(text);
            const result = findPropertyInChain(doc, text, ['api', 'name']);
            expect(result).not.toBeNull();
        });
    });

    describe('edge cases', () => {
        it('returns null for chain with less than 2 elements', () => {
            const text = 'var x = 1';
            const doc = createDocument(text);
            const result = findPropertyInChain(doc, text, ['x']);
            expect(result).toBeNull();
        });

        it('returns null for empty chain', () => {
            const text = 'var x = 1';
            const doc = createDocument(text);
            const result = findPropertyInChain(doc, text, []);
            expect(result).toBeNull();
        });

        it('handles dotted type names in declaration', () => {
            const text = `resource AWS.S3.Bucket bucket {
    name = "my-bucket"
}`;
            const doc = createDocument(text);
            const result = findPropertyInChain(doc, text, ['bucket', 'name']);
            expect(result).not.toBeNull();
        });
    });
});
