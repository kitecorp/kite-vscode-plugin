/**
 * Tests for Find Implementations handler
 * Finds all resources using a schema or components instantiating a component type
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver/node';
import { handleImplementation, ImplementationContext } from './index';

function createDocument(content: string, uri = 'file:///workspace/test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

function createContext(files: Map<string, string> = new Map()): ImplementationContext {
    return {
        findKiteFilesInWorkspace: () => Array.from(files.keys()),
        getFileContent: (path) => files.get(path) || null,
    };
}

describe('Find Implementations', () => {
    describe('Schema implementations', () => {
        it('should find resources using a schema', () => {
            const doc = createDocument(`schema ServerConfig {
    string host
    number port
}

resource ServerConfig web {
    host = "localhost"
    port = 8080
}

resource ServerConfig api {
    host = "api.example.com"
    port = 3000
}`);
            const ctx = createContext();

            // Click on "ServerConfig" in schema definition
            const result = handleImplementation(doc, Position.create(0, 10), ctx);

            expect(result).toHaveLength(2);
            expect(result[0].range.start.line).toBe(5);  // web resource
            expect(result[1].range.start.line).toBe(10); // api resource
        });

        it('should return empty array when schema has no implementations', () => {
            const doc = createDocument(`schema UnusedConfig {
    string name
}`);
            const ctx = createContext();

            const result = handleImplementation(doc, Position.create(0, 10), ctx);

            expect(result).toHaveLength(0);
        });

        it('should find resource by clicking on schema name in body', () => {
            const doc = createDocument(`schema Config {
    string name
}

resource Config server {
    name = "test"
}`);
            const ctx = createContext();

            // Click on "Config" text anywhere in the schema definition
            const result = handleImplementation(doc, Position.create(0, 8), ctx);

            expect(result).toHaveLength(1);
            expect(result[0].range.start.line).toBe(4);
        });
    });

    describe('Component implementations', () => {
        it('should find component instantiations', () => {
            const doc = createDocument(`component WebServer {
    input string name = "default"
    output string endpoint = "http://localhost"
}

component WebServer api {
    name = "payments"
}

component WebServer frontend {
    name = "ui"
}`);
            const ctx = createContext();

            // Click on "WebServer" in component definition
            const result = handleImplementation(doc, Position.create(0, 14), ctx);

            expect(result).toHaveLength(2);
            expect(result[0].range.start.line).toBe(5);  // api instantiation
            expect(result[1].range.start.line).toBe(9);  // frontend instantiation
        });

        it('should not include component definition itself', () => {
            const doc = createDocument(`component Database {
    input string name = "db"
}

component Database users {
    name = "users"
}`);
            const ctx = createContext();

            const result = handleImplementation(doc, Position.create(0, 14), ctx);

            expect(result).toHaveLength(1);
            // Should only return the instantiation, not the definition
            expect(result[0].range.start.line).toBe(4);
        });

        it('should return empty array when component has no instantiations', () => {
            const doc = createDocument(`component UnusedComponent {
    input string name = "default"
}`);
            const ctx = createContext();

            const result = handleImplementation(doc, Position.create(0, 14), ctx);

            expect(result).toHaveLength(0);
        });
    });

    describe('Cross-file implementations', () => {
        it('should find resources using schema from another file', () => {
            const schemaContent = `schema Config {
    string name
}`;
            const mainContent = `import * from "schema.kite"

resource Config server1 {
    name = "test1"
}

resource Config server2 {
    name = "test2"
}`;

            const files = new Map([
                ['/workspace/schema.kite', schemaContent],
                ['/workspace/main.kite', mainContent],
            ]);

            const schemaDoc = createDocument(schemaContent, 'file:///workspace/schema.kite');
            const ctx = createContext(files);

            // Click on schema definition
            const result = handleImplementation(schemaDoc, Position.create(0, 10), ctx);

            expect(result).toHaveLength(2);
            expect(result[0].uri).toContain('main.kite');
            expect(result[1].uri).toContain('main.kite');
        });

        it('should find component instantiations from another file', () => {
            const componentContent = `component WebServer {
    input number port = 80
}`;
            const mainContent = `import * from "components.kite"

component WebServer api {
    port = 8080
}`;

            const files = new Map([
                ['/workspace/components.kite', componentContent],
                ['/workspace/main.kite', mainContent],
            ]);

            const componentDoc = createDocument(componentContent, 'file:///workspace/components.kite');
            const ctx = createContext(files);

            const result = handleImplementation(componentDoc, Position.create(0, 14), ctx);

            expect(result).toHaveLength(1);
            expect(result[0].uri).toContain('main.kite');
        });

        it('should find implementations across multiple files', () => {
            const schemaContent = `schema Database {
    string host
}`;
            const file1Content = `import * from "schema.kite"

resource Database prod {
    host = "prod.db.com"
}`;
            const file2Content = `import * from "schema.kite"

resource Database dev {
    host = "localhost"
}`;

            const files = new Map([
                ['/workspace/schema.kite', schemaContent],
                ['/workspace/prod.kite', file1Content],
                ['/workspace/dev.kite', file2Content],
            ]);

            const schemaDoc = createDocument(schemaContent, 'file:///workspace/schema.kite');
            const ctx = createContext(files);

            const result = handleImplementation(schemaDoc, Position.create(0, 10), ctx);

            expect(result).toHaveLength(2);
        });
    });

    describe('Edge cases', () => {
        it('should return empty array for position not on a schema/component', () => {
            const doc = createDocument(`var x = 123`);
            const ctx = createContext();

            const result = handleImplementation(doc, Position.create(0, 5), ctx);

            expect(result).toHaveLength(0);
        });

        it('should return empty array for empty document', () => {
            const doc = createDocument('');
            const ctx = createContext();

            const result = handleImplementation(doc, Position.create(0, 0), ctx);

            expect(result).toHaveLength(0);
        });

        it('should return empty array when cursor is on keyword', () => {
            const doc = createDocument(`schema Config {}`);
            const ctx = createContext();

            // Click on "schema" keyword
            const result = handleImplementation(doc, Position.create(0, 2), ctx);

            expect(result).toHaveLength(0);
        });

        it('should return empty array when cursor is on resource instance', () => {
            const doc = createDocument(`schema Config {
    string name
}

resource Config server {
    name = "test"
}`);
            const ctx = createContext();

            // Click on "server" (instance name, not type)
            const result = handleImplementation(doc, Position.create(4, 18), ctx);

            expect(result).toHaveLength(0);
        });

        it('should handle schema with dotted name', () => {
            const doc = createDocument(`schema AWS.S3.Bucket {
    string name
}

resource AWS.S3.Bucket mybucket {
    name = "test"
}`);
            const ctx = createContext();

            // Click on schema name
            const result = handleImplementation(doc, Position.create(0, 12), ctx);

            expect(result).toHaveLength(1);
            expect(result[0].range.start.line).toBe(4);
        });
    });

    describe('Mixed schema and component', () => {
        it('should distinguish between schema and component with same name', () => {
            const doc = createDocument(`schema Config {
    string name
}

component Config {
    input string value = "default"
}

resource Config res {
    name = "resource"
}

component Config inst {
    value = "component"
}`);
            const ctx = createContext();

            // Click on schema Config - should find resource
            const schemaResult = handleImplementation(doc, Position.create(0, 10), ctx);
            expect(schemaResult).toHaveLength(1);
            expect(schemaResult[0].range.start.line).toBe(8); // resource

            // Click on component Config - should find component instance
            const componentResult = handleImplementation(doc, Position.create(4, 14), ctx);
            expect(componentResult).toHaveLength(1);
            expect(componentResult[0].range.start.line).toBe(12); // component instance
        });
    });
});
