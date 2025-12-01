/**
 * Tests for Go to Type Definition handler
 * Navigates from a variable/resource to its type definition (schema/component)
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver/node';
import { handleTypeDefinition, TypeDefinitionContext } from './index';

function createDocument(content: string, uri = 'file:///workspace/test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

function createContext(files: Map<string, string> = new Map()): TypeDefinitionContext {
    return {
        findKiteFilesInWorkspace: () => Array.from(files.keys()),
        getFileContent: (path) => files.get(path) || null,
    };
}

describe('Go to Type Definition', () => {
    describe('Resource instances', () => {
        it('should navigate from resource instance to schema definition', () => {
            const doc = createDocument(`schema ServerConfig {
    string host
    number port
}

resource ServerConfig web {
    host = "localhost"
    port = 8080
}`);
            const ctx = createContext();

            // Click on "web" (instance name)
            const result = handleTypeDefinition(doc, Position.create(5, 24), ctx);

            expect(result).not.toBeNull();
            expect(result?.range.start.line).toBe(0); // Schema definition
        });

        it('should navigate from resource schema name to schema definition', () => {
            const doc = createDocument(`schema Config {
    string name
}

resource Config server {
    name = "test"
}`);
            const ctx = createContext();

            // Click on "Config" in resource declaration
            const result = handleTypeDefinition(doc, Position.create(4, 12), ctx);

            expect(result).not.toBeNull();
            expect(result?.range.start.line).toBe(0);
        });
    });

    describe('Component instances', () => {
        it('should navigate from component instance to component definition', () => {
            const doc = createDocument(`component WebServer {
    input string name = "default"
    output string endpoint = "http://localhost"
}

component WebServer api {
    name = "payments"
}`);
            const ctx = createContext();

            // Click on "api" (instance name) - line 5 starts with "component WebServer api {"
            // "api" is at characters 20-22
            const result = handleTypeDefinition(doc, Position.create(5, 21), ctx);

            expect(result).not.toBeNull();
            expect(result?.range.start.line).toBe(0); // Component definition
        });

        it('should navigate from component type name', () => {
            const doc = createDocument(`component Database {
    input string name = "db"
}

component Database myDb {
    name = "users"
}`);
            const ctx = createContext();

            // Click on "Database" in instantiation
            const result = handleTypeDefinition(doc, Position.create(4, 14), ctx);

            expect(result).not.toBeNull();
            expect(result?.range.start.line).toBe(0);
        });
    });

    describe('Typed variables', () => {
        it('should navigate from typed variable to schema', () => {
            const doc = createDocument(`schema User {
    string name
    number age
}

var User currentUser = { name: "John", age: 30 }`);
            const ctx = createContext();

            // Click on "currentUser"
            const result = handleTypeDefinition(doc, Position.create(5, 15), ctx);

            expect(result).not.toBeNull();
            expect(result?.range.start.line).toBe(0); // User schema
        });

        it('should return null for built-in type variable', () => {
            const doc = createDocument(`var string name = "John"`);
            const ctx = createContext();

            // Click on "name" - type is built-in string
            const result = handleTypeDefinition(doc, Position.create(0, 15), ctx);

            // Built-in types have no type definition
            expect(result).toBeNull();
        });
    });

    describe('Cross-file type definitions', () => {
        it('should find schema in another file', () => {
            const mainContent = `import * from "types.kite"

resource Config server {
    name = "test"
}`;
            const typesContent = `schema Config {
    string name
}`;

            const files = new Map([
                ['/workspace/main.kite', mainContent],
                ['/workspace/types.kite', typesContent],
            ]);

            const mainDoc = createDocument(mainContent, 'file:///workspace/main.kite');
            const ctx = createContext(files);

            // Click on "server"
            const result = handleTypeDefinition(mainDoc, Position.create(2, 20), ctx);

            expect(result).not.toBeNull();
            expect(result?.uri).toContain('types.kite');
        });

        it('should find component in another file', () => {
            const mainContent = `import * from "components.kite"

component WebServer api {
    port = 8080
}`;
            const componentsContent = `component WebServer {
    input number port = 80
}`;

            const files = new Map([
                ['/workspace/main.kite', mainContent],
                ['/workspace/components.kite', componentsContent],
            ]);

            const mainDoc = createDocument(mainContent, 'file:///workspace/main.kite');
            const ctx = createContext(files);

            // Click on "api" - line 2 is "component WebServer api {"
            // "api" is at characters 20-22
            const result = handleTypeDefinition(mainDoc, Position.create(2, 21), ctx);

            expect(result).not.toBeNull();
            expect(result?.uri).toContain('components.kite');
        });
    });

    describe('Edge cases', () => {
        it('should return null for position not on a type reference', () => {
            const doc = createDocument(`var x = 123`);
            const ctx = createContext();

            // Click on "123" - just a number
            const result = handleTypeDefinition(doc, Position.create(0, 9), ctx);

            expect(result).toBeNull();
        });

        it('should return null for empty document', () => {
            const doc = createDocument('');
            const ctx = createContext();

            const result = handleTypeDefinition(doc, Position.create(0, 0), ctx);

            expect(result).toBeNull();
        });

        it('should return null for keywords', () => {
            const doc = createDocument(`schema Config {}`);
            const ctx = createContext();

            // Click on "schema" keyword
            const result = handleTypeDefinition(doc, Position.create(0, 2), ctx);

            expect(result).toBeNull();
        });

        it('should return null for undefined type', () => {
            const doc = createDocument(`resource UndefinedType server {}`);
            const ctx = createContext();

            // Schema doesn't exist
            const result = handleTypeDefinition(doc, Position.create(0, 25), ctx);

            expect(result).toBeNull();
        });
    });

    describe('Input/Output declarations', () => {
        it('should navigate from input type to schema', () => {
            const doc = createDocument(`schema DatabaseConfig {
    string host
}

component Server {
    input DatabaseConfig db = { host: "localhost" }
}`);
            const ctx = createContext();

            // Click on "db" - line 5 is "    input DatabaseConfig db = { host: "localhost" }"
            // "db" starts at character 25
            const result = handleTypeDefinition(doc, Position.create(5, 26), ctx);

            expect(result).not.toBeNull();
            expect(result?.range.start.line).toBe(0);
        });
    });
});
