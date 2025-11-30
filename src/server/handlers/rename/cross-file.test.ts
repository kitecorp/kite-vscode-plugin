/**
 * Tests for cross-file rename operations.
 */

import { describe, it, expect } from 'vitest';
import { Position, Range } from 'vscode-languageserver/node';
import { handleRename } from '.';
import { createDocument, createContext, applyEdits } from './test-utils';

describe('handleRename - cross-file', () => {
    it('should rename schema definition and usages across files', () => {
        const schemaFile = `schema Config {
    string host
    number port
}`;
        const resourceFile = `import * from "schema.kite"

resource Config server {
    host = "localhost"
    port = 8080
}`;
        const schemaDoc = createDocument(schemaFile, 'file:///schema.kite');
        const resourceDoc = createDocument(resourceFile, 'file:///main.kite');

        const ctx = createContext({
            files: {
                '/schema.kite': schemaFile,
                '/main.kite': resourceFile,
            },
            documents: {
                'file:///schema.kite': schemaDoc,
                'file:///main.kite': resourceDoc,
            },
        });

        const result = handleRename(schemaDoc, Position.create(0, 8), 'Settings', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes).toBeDefined();

        const schemaEdits = result?.changes?.['file:///schema.kite'];
        expect(schemaEdits).toBeDefined();
        expect(schemaEdits!.length).toBe(1);
        expect(schemaEdits![0].newText).toBe('Settings');

        const newSchemaFile = applyEdits(schemaFile, schemaEdits!);
        expect(newSchemaFile).toContain('schema Settings {');
        expect(newSchemaFile).not.toContain('schema Config');

        const mainEdits = result?.changes?.['file:///main.kite'];
        expect(mainEdits).toBeDefined();
        expect(mainEdits!.length).toBe(1);
        expect(mainEdits![0].newText).toBe('Settings');

        const newMainFile = applyEdits(resourceFile, mainEdits!);
        expect(newMainFile).toContain('resource Settings server');
        expect(newMainFile).not.toContain('resource Config');
    });

    it('should rename component definition and instantiations across files', () => {
        const componentFile = `component WebServer {
    input string name = "default"
    output string url = "http://localhost"
}`;
        const mainFile = `import * from "component.kite"

component WebServer api {
    name = "api-server"
}

var endpoint = api.url`;
        const componentDoc = createDocument(componentFile, 'file:///component.kite');
        const mainDoc = createDocument(mainFile, 'file:///main.kite');

        const ctx = createContext({
            files: {
                '/component.kite': componentFile,
                '/main.kite': mainFile,
            },
            documents: {
                'file:///component.kite': componentDoc,
                'file:///main.kite': mainDoc,
            },
        });

        const result = handleRename(componentDoc, Position.create(0, 12), 'HttpServer', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes).toBeDefined();

        const componentEdits = result?.changes?.['file:///component.kite'];
        expect(componentEdits).toBeDefined();
        expect(componentEdits!.length).toBe(1);
        expect(componentEdits![0].newText).toBe('HttpServer');

        const newComponentFile = applyEdits(componentFile, componentEdits!);
        expect(newComponentFile).toContain('component HttpServer {');

        const mainEdits = result?.changes?.['file:///main.kite'];
        expect(mainEdits).toBeDefined();
        expect(mainEdits!.length).toBe(1);
        expect(mainEdits![0].newText).toBe('HttpServer');

        const newMainFile = applyEdits(mainFile, mainEdits!);
        expect(newMainFile).toContain('component HttpServer api');
        expect(newMainFile).not.toContain('WebServer');
    });

    it('should rename function definition and calls across files', () => {
        const utilsFile = `fun calculateTotal(number price, number qty) number {
    return price * qty
}`;
        const mainFile = `import * from "utils.kite"

var total = calculateTotal(10, 5)`;
        const utilsDoc = createDocument(utilsFile, 'file:///utils.kite');
        const mainDoc = createDocument(mainFile, 'file:///main.kite');

        const ctx = createContext({
            files: {
                '/utils.kite': utilsFile,
                '/main.kite': mainFile,
            },
            documents: {
                'file:///utils.kite': utilsDoc,
                'file:///main.kite': mainDoc,
            },
        });

        const result = handleRename(utilsDoc, Position.create(0, 6), 'computeTotal', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes).toBeDefined();

        const utilsEdits = result?.changes?.['file:///utils.kite'];
        expect(utilsEdits).toBeDefined();
        expect(utilsEdits!.length).toBe(1);
        expect(utilsEdits![0].newText).toBe('computeTotal');

        const newUtilsFile = applyEdits(utilsFile, utilsEdits!);
        expect(newUtilsFile).toContain('fun computeTotal(');
        expect(newUtilsFile).not.toContain('calculateTotal');

        const mainEdits = result?.changes?.['file:///main.kite'];
        expect(mainEdits).toBeDefined();
        expect(mainEdits!.length).toBe(1);
        expect(mainEdits![0].newText).toBe('computeTotal');

        const newMainFile = applyEdits(mainFile, mainEdits!);
        expect(newMainFile).toContain('computeTotal(10, 5)');
        expect(newMainFile).not.toContain('calculateTotal');
    });

    it('should rename component input and update instantiation properties', () => {
        const componentFile = `component Database {
    input string connectionString = "localhost"
    output boolean connected = true
}`;
        const mainFile = `import * from "database.kite"

component Database db {
    connectionString = "postgres://localhost:5432"
}`;
        const componentDoc = createDocument(componentFile, 'file:///database.kite');
        const mainDoc = createDocument(mainFile, 'file:///main.kite');

        const ctx = createContext({
            files: {
                '/database.kite': componentFile,
                '/main.kite': mainFile,
            },
            documents: {
                'file:///database.kite': componentDoc,
                'file:///main.kite': mainDoc,
            },
            declarations: [
                {
                    name: 'connectionString',
                    type: 'input',
                    typeName: 'string',
                    nameRange: Range.create(Position.create(1, 17), Position.create(1, 33)),
                    range: Range.create(Position.create(1, 4), Position.create(1, 45)),
                    uri: 'file:///database.kite',
                    scopeStart: componentFile.indexOf('{'),
                    scopeEnd: componentFile.lastIndexOf('}'),
                },
            ],
        });

        const result = handleRename(componentDoc, Position.create(1, 20), 'dbUrl', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes).toBeDefined();

        const componentEdits = result?.changes?.['file:///database.kite'];
        expect(componentEdits).toBeDefined();
        expect(componentEdits!.every(e => e.newText === 'dbUrl')).toBe(true);

        const newComponentFile = applyEdits(componentFile, componentEdits!);
        expect(newComponentFile).toContain('input string dbUrl');
        expect(newComponentFile).not.toContain('connectionString');

        const mainEdits = result?.changes?.['file:///main.kite'];
        expect(mainEdits).toBeDefined();
        expect(mainEdits!.every(e => e.newText === 'dbUrl')).toBe(true);

        const newMainFile = applyEdits(mainFile, mainEdits!);
        expect(newMainFile).toContain('dbUrl = "postgres://localhost:5432"');
        expect(newMainFile).not.toContain('connectionString');
    });

    it('should rename from reference location, not just definition', () => {
        const schemaFile = `schema User {
    string name
}`;
        const mainFile = `import * from "schema.kite"

resource User admin {
    name = "Admin"
}`;
        const schemaDoc = createDocument(schemaFile, 'file:///schema.kite');
        const mainDoc = createDocument(mainFile, 'file:///main.kite');

        const ctx = createContext({
            files: {
                '/schema.kite': schemaFile,
                '/main.kite': mainFile,
            },
            documents: {
                'file:///schema.kite': schemaDoc,
                'file:///main.kite': mainDoc,
            },
        });

        const result = handleRename(mainDoc, Position.create(2, 11), 'Account', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes).toBeDefined();

        const schemaEdits = result?.changes?.['file:///schema.kite'];
        expect(schemaEdits).toBeDefined();
        expect(schemaEdits![0].newText).toBe('Account');

        const newSchemaFile = applyEdits(schemaFile, schemaEdits!);
        expect(newSchemaFile).toContain('schema Account {');

        const mainEdits = result?.changes?.['file:///main.kite'];
        expect(mainEdits).toBeDefined();
        expect(mainEdits![0].newText).toBe('Account');

        const newMainFile = applyEdits(mainFile, mainEdits!);
        expect(newMainFile).toContain('resource Account admin');
    });

    it('should NOT rename local variables across files', () => {
        const file1 = `fun process() {
    var count = 0
    return count
}`;
        const file2 = `fun other() {
    var count = 10
    return count
}`;
        const doc1 = createDocument(file1, 'file:///file1.kite');
        const doc2 = createDocument(file2, 'file:///file2.kite');

        const ctx = createContext({
            files: {
                '/file1.kite': file1,
                '/file2.kite': file2,
            },
            documents: {
                'file:///file1.kite': doc1,
                'file:///file2.kite': doc2,
            },
            declarations: [
                {
                    name: 'count',
                    type: 'variable',
                    typeName: 'number',
                    nameRange: Range.create(Position.create(1, 8), Position.create(1, 13)),
                    range: Range.create(Position.create(1, 4), Position.create(1, 17)),
                    uri: 'file:///file1.kite',
                    scopeStart: file1.indexOf('{'),
                    scopeEnd: file1.lastIndexOf('}'),
                },
            ],
        });

        const result = handleRename(doc1, Position.create(1, 10), 'total', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes).toBeDefined();

        const file1Edits = result?.changes?.['file:///file1.kite'];
        expect(file1Edits).toBeDefined();
        expect(file1Edits!.every(e => e.newText === 'total')).toBe(true);

        const newFile1 = applyEdits(file1, file1Edits!);
        expect(newFile1).toContain('var total = 0');
        expect(newFile1).toContain('return total');
        expect(newFile1).not.toContain('count');

        // Should NOT have any changes in file2
        expect(result?.changes?.['file:///file2.kite']).toBeUndefined();

        // Verify file2 would still have its own 'count' variable
        expect(file2).toContain('var count = 10');
    });

    it('should handle renaming type aliases across files', () => {
        const typesFile = `type Environment = "dev" | "staging" | "prod"`;
        const mainFile = `import * from "types.kite"

var env Environment = "prod"`;
        const typesDoc = createDocument(typesFile, 'file:///types.kite');
        const mainDoc = createDocument(mainFile, 'file:///main.kite');

        const ctx = createContext({
            files: {
                '/types.kite': typesFile,
                '/main.kite': mainFile,
            },
            documents: {
                'file:///types.kite': typesDoc,
                'file:///main.kite': mainDoc,
            },
        });

        const result = handleRename(typesDoc, Position.create(0, 6), 'Stage', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes).toBeDefined();

        const typesEdits = result?.changes?.['file:///types.kite'];
        expect(typesEdits).toBeDefined();
        expect(typesEdits![0].newText).toBe('Stage');

        const newTypesFile = applyEdits(typesFile, typesEdits!);
        expect(newTypesFile).toContain('type Stage =');
        expect(newTypesFile).not.toContain('Environment');

        const mainEdits = result?.changes?.['file:///main.kite'];
        expect(mainEdits).toBeDefined();
        expect(mainEdits![0].newText).toBe('Stage');

        const newMainFile = applyEdits(mainFile, mainEdits!);
        expect(newMainFile).toContain('var env Stage =');
        expect(newMainFile).not.toContain('Environment');
    });

    it('should NOT rename variables inside string interpolation', () => {
        const content = `var name = "World"
var greeting = "Hello, \${name}!"`;
        const doc = createDocument(content);
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        const result = handleRename(doc, Position.create(0, 6), 'person', ctx);

        expect(result).not.toBeNull();
        const edits = result?.changes?.['file:///test.kite'];
        expect(edits).toBeDefined();

        const newContent = applyEdits(content, edits!);
        expect(newContent).toContain('var person = "World"');
    });

    it('should rename schema property and usages in resources', () => {
        const schemaFile = `schema ServerConfig {
    string hostname
    number port = 8080
}`;
        const mainFile = `import * from "schema.kite"

resource ServerConfig web {
    hostname = "localhost"
    port = 3000
}

var url = web.hostname`;
        const schemaDoc = createDocument(schemaFile, 'file:///schema.kite');
        const mainDoc = createDocument(mainFile, 'file:///main.kite');

        const ctx = createContext({
            files: {
                '/schema.kite': schemaFile,
                '/main.kite': mainFile,
            },
            documents: {
                'file:///schema.kite': schemaDoc,
                'file:///main.kite': mainDoc,
            },
        });

        const result = handleRename(schemaDoc, Position.create(1, 12), 'host', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes).toBeDefined();

        const schemaEdits = result?.changes?.['file:///schema.kite'];
        expect(schemaEdits).toBeDefined();

        const newSchemaFile = applyEdits(schemaFile, schemaEdits!);
        expect(newSchemaFile).toContain('string host');
        expect(newSchemaFile).not.toContain('hostname');

        const mainEdits = result?.changes?.['file:///main.kite'];
        expect(mainEdits).toBeDefined();

        const newMainFile = applyEdits(mainFile, mainEdits!);
        expect(newMainFile).toContain('host = "localhost"');
        expect(newMainFile).toContain('web.host');
        expect(newMainFile).not.toContain('hostname');
    });

    it('should handle multiple references in the same file', () => {
        const content = `schema Config { }

resource Config server1 { }
resource Config server2 { }
resource Config server3 { }`;
        const doc = createDocument(content);
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        const result = handleRename(doc, Position.create(0, 8), 'Settings', ctx);

        expect(result).not.toBeNull();
        const edits = result?.changes?.['file:///test.kite'];
        expect(edits).toBeDefined();

        // Should have 4 edits: 1 definition + 3 usages
        expect(edits!.length).toBe(4);
        expect(edits!.every(e => e.newText === 'Settings')).toBe(true);

        const newContent = applyEdits(content, edits!);
        expect(newContent).toContain('schema Settings {');
        expect(newContent).toContain('resource Settings server1');
        expect(newContent).toContain('resource Settings server2');
        expect(newContent).toContain('resource Settings server3');
        expect(newContent).not.toContain('Config');
    });
});
