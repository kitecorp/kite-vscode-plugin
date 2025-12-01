/**
 * Tests for AST-based document scanner.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { scanDocumentAST } from './ast-scanner';

function createDocument(content: string): TextDocument {
    return TextDocument.create('file:///test.kite', 'kite', 1, content);
}

describe('scanDocumentAST', () => {
    describe('function declarations', () => {
        it('should extract function with no parameters', () => {
            const doc = createDocument('fun greet() { }');
            const decls = scanDocumentAST(doc);

            const func = decls.find(d => d.name === 'greet' && d.type === 'function');
            expect(func).toBeDefined();
            expect(func?.parameters).toEqual([]);
        });

        it('should extract function with parameters', () => {
            const doc = createDocument('fun add(number a, number b) number { return a + b }');
            const decls = scanDocumentAST(doc);

            const func = decls.find(d => d.name === 'add' && d.type === 'function');
            expect(func).toBeDefined();
            expect(func?.parameters).toHaveLength(2);
            expect(func?.parameters?.[0]).toEqual({ type: 'number', name: 'a' });
            expect(func?.parameters?.[1]).toEqual({ type: 'number', name: 'b' });
            expect(func?.returnType).toBe('number');
        });

        it('should extract function parameters as scoped variables', () => {
            const doc = createDocument('fun greet(string name) { var greeting = "Hello " }');
            const decls = scanDocumentAST(doc);

            // Should have function declaration
            const func = decls.find(d => d.name === 'greet' && d.type === 'function');
            expect(func).toBeDefined();

            // Should have parameter as scoped variable
            const param = decls.find(d => d.name === 'name' && d.type === 'variable');
            expect(param).toBeDefined();
            expect(param?.scopeStart).toBeDefined();
            expect(param?.scopeEnd).toBeDefined();
        });
    });

    describe('schema declarations', () => {
        it('should extract schema declaration', () => {
            const doc = createDocument('schema ServerConfig { string host }');
            const decls = scanDocumentAST(doc);

            const schema = decls.find(d => d.name === 'ServerConfig' && d.type === 'schema');
            expect(schema).toBeDefined();
        });
    });

    describe('resource declarations', () => {
        it('should extract resource with schema type', () => {
            const doc = createDocument('resource ServerConfig webServer { host = "localhost" }');
            const decls = scanDocumentAST(doc);

            const resource = decls.find(d => d.name === 'webServer' && d.type === 'resource');
            expect(resource).toBeDefined();
            expect(resource?.schemaName).toBe('ServerConfig');
        });
    });

    describe('component declarations', () => {
        it('should extract component definition', () => {
            const doc = createDocument('component WebServer { input string name = "default" }');
            const decls = scanDocumentAST(doc);

            const comp = decls.find(d => d.name === 'WebServer' && d.type === 'component');
            expect(comp).toBeDefined();
        });

        it('should extract component instantiation', () => {
            const doc = createDocument('component WebServer api { name = "api-server" }');
            const decls = scanDocumentAST(doc);

            const comp = decls.find(d => d.name === 'api' && d.type === 'component');
            expect(comp).toBeDefined();
            expect(comp?.componentType).toBe('WebServer');
        });

        it('should extract inputs inside component definition', () => {
            const doc = createDocument('component MyComponent { input string name = "test" }');
            const decls = scanDocumentAST(doc);

            const input = decls.find(d => d.name === 'name' && d.type === 'input');
            expect(input).toBeDefined();
            expect(input?.typeName).toBe('string');
        });

        it('should extract outputs inside component definition', () => {
            const doc = createDocument('component MyComponent { output string endpoint = "http://localhost" }');
            const decls = scanDocumentAST(doc);

            const output = decls.find(d => d.name === 'endpoint' && d.type === 'output');
            expect(output).toBeDefined();
            expect(output?.typeName).toBe('string');
        });
    });

    describe('variable declarations', () => {
        it('should extract variable with type annotation', () => {
            const doc = createDocument('var string message = "hello"');
            const decls = scanDocumentAST(doc);

            const variable = decls.find(d => d.name === 'message' && d.type === 'variable');
            expect(variable).toBeDefined();
            expect(variable?.typeName).toBe('string');
        });

        it('should extract variable without type annotation', () => {
            const doc = createDocument('var count = 42');
            const decls = scanDocumentAST(doc);

            const variable = decls.find(d => d.name === 'count' && d.type === 'variable');
            expect(variable).toBeDefined();
        });
    });

    describe('type declarations', () => {
        it('should extract type alias', () => {
            const doc = createDocument('type Region = "us-east-1" | "us-west-2"');
            const decls = scanDocumentAST(doc);

            const typeDecl = decls.find(d => d.name === 'Region' && d.type === 'type');
            expect(typeDecl).toBeDefined();
        });
    });

    describe('for loop variables', () => {
        it('should extract for loop variable', () => {
            const doc = createDocument('for item in items { var x = item }');
            const decls = scanDocumentAST(doc);

            const forVar = decls.find(d => d.name === 'item' && d.type === 'for');
            expect(forVar).toBeDefined();
            expect(forVar?.scopeStart).toBeDefined();
        });
    });

    describe('complex documents', () => {
        it('should handle multiple declarations', () => {
            const doc = createDocument(`
schema Config {
    string name
    number port
}

type Environment = "dev" | "prod"

resource Config server {
    name = "main"
    port = 8080
}

fun getPort(Config cfg) number {
    return cfg.port
}

component WebApp {
    input string env = "dev"
    output string url = "http://localhost"

    resource Config internal {
        name = "internal"
        port = 3000
    }
}
`);
            const decls = scanDocumentAST(doc);

            // Check we found all the expected declarations
            expect(decls.find(d => d.name === 'Config' && d.type === 'schema')).toBeDefined();
            expect(decls.find(d => d.name === 'Environment' && d.type === 'type')).toBeDefined();
            expect(decls.find(d => d.name === 'server' && d.type === 'resource')).toBeDefined();
            expect(decls.find(d => d.name === 'getPort' && d.type === 'function')).toBeDefined();
            expect(decls.find(d => d.name === 'WebApp' && d.type === 'component')).toBeDefined();
            expect(decls.find(d => d.name === 'env' && d.type === 'input')).toBeDefined();
            expect(decls.find(d => d.name === 'url' && d.type === 'output')).toBeDefined();
            expect(decls.find(d => d.name === 'internal' && d.type === 'resource')).toBeDefined();
        });

        it('should handle documents with syntax errors gracefully', () => {
            const doc = createDocument(`
schema Valid {
    string name
}

// Missing closing brace
fun broken(
`);
            // Should not throw, should extract what it can
            const decls = scanDocumentAST(doc);

            // Should still get the schema
            expect(decls.find(d => d.name === 'Valid' && d.type === 'schema')).toBeDefined();
        });
    });

    describe('import declarations', () => {
        it('should extract single named import', () => {
            const doc = createDocument('import DatabaseConfig from "simple.kite"');
            const decls = scanDocumentAST(doc);

            const importDecl = decls.find(d => d.name === 'DatabaseConfig' && d.type === 'import');
            expect(importDecl).toBeDefined();
            expect(importDecl?.importPath).toBe('simple.kite');
            expect(importDecl?.documentation).toBe('Imported from `simple.kite`');
        });

        it('should extract multiple named imports', () => {
            const doc = createDocument('import formatName, CommonConfig from "common.kite"');
            const decls = scanDocumentAST(doc);

            const formatNameDecl = decls.find(d => d.name === 'formatName' && d.type === 'import');
            expect(formatNameDecl).toBeDefined();
            expect(formatNameDecl?.importPath).toBe('common.kite');

            const commonConfigDecl = decls.find(d => d.name === 'CommonConfig' && d.type === 'import');
            expect(commonConfigDecl).toBeDefined();
            expect(commonConfigDecl?.importPath).toBe('common.kite');
        });

        it('should not extract declarations for wildcard imports', () => {
            const doc = createDocument('import * from "utils.kite"');
            const decls = scanDocumentAST(doc);

            // Wildcard imports don't create declarations (we'd need to resolve the file)
            const imports = decls.filter(d => d.type === 'import');
            expect(imports).toHaveLength(0);
        });

        it('should handle imports with other declarations', () => {
            const doc = createDocument(`
import DatabaseConfig from "simple.kite"

schema LocalConfig {
    string name
}

resource DatabaseConfig db {
    host = "localhost"
}
`);
            const decls = scanDocumentAST(doc);

            expect(decls.find(d => d.name === 'DatabaseConfig' && d.type === 'import')).toBeDefined();
            expect(decls.find(d => d.name === 'LocalConfig' && d.type === 'schema')).toBeDefined();
            expect(decls.find(d => d.name === 'db' && d.type === 'resource')).toBeDefined();
        });
    });
});
