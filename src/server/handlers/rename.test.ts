/**
 * Tests for rename handler.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range } from 'vscode-languageserver/node';
import { handlePrepareRename, handleRename, RenameContext } from './rename';
import { Declaration } from '../types';

// Helper to create a mock TextDocument
function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

// Helper to create a mock context
function createContext(options: {
    files?: Record<string, string>;
    declarations?: Declaration[];
    documents?: Record<string, TextDocument>;
} = {}): RenameContext {
    const documents = options.documents || {};

    return {
        getDeclarations: () => options.declarations || [],
        findKiteFilesInWorkspace: () => Object.keys(options.files || {}),
        getFileContent: (path: string) => options.files?.[path] || null,
        getDocument: (uri: string) => documents[uri],
        refreshDiagnostics: () => {},
    };
}

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

describe('handleRename', () => {
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

// Helper to apply text edits and return the result
function applyEdits(content: string, edits: { range: Range; newText: string }[]): string {
    // Sort edits in reverse order by start position to avoid offset issues
    const sortedEdits = [...edits].sort((a, b) => {
        if (b.range.start.line !== a.range.start.line) {
            return b.range.start.line - a.range.start.line;
        }
        return b.range.start.character - a.range.start.character;
    });

    const lines = content.split('\n');
    for (const edit of sortedEdits) {
        const startLine = edit.range.start.line;
        const endLine = edit.range.end.line;
        const startChar = edit.range.start.character;
        const endChar = edit.range.end.character;

        if (startLine === endLine) {
            // Single line edit
            const line = lines[startLine];
            lines[startLine] = line.substring(0, startChar) + edit.newText + line.substring(endChar);
        } else {
            // Multi-line edit (not needed for simple renames but included for completeness)
            const startLineText = lines[startLine].substring(0, startChar);
            const endLineText = lines[endLine].substring(endChar);
            lines.splice(startLine, endLine - startLine + 1, startLineText + edit.newText + endLineText);
        }
    }
    return lines.join('\n');
}

describe('handleRename - cross-file', () => {
    it('should rename schema definition and usages across files', () => {
        // File 1: schema definition
        const schemaFile = `schema Config {
    string host
    number port
}`;
        // File 2: resource using the schema
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

        // Rename 'Config' from the schema definition
        const result = handleRename(schemaDoc, Position.create(0, 8), 'Settings', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes).toBeDefined();

        // Validate schema file edits
        const schemaEdits = result?.changes?.['file:///schema.kite'];
        expect(schemaEdits).toBeDefined();
        expect(schemaEdits!.length).toBe(1);
        expect(schemaEdits![0].newText).toBe('Settings');

        // Apply edits and verify result
        const newSchemaFile = applyEdits(schemaFile, schemaEdits!);
        expect(newSchemaFile).toContain('schema Settings {');
        expect(newSchemaFile).not.toContain('schema Config');

        // Validate main file edits
        const mainEdits = result?.changes?.['file:///main.kite'];
        expect(mainEdits).toBeDefined();
        expect(mainEdits!.length).toBe(1);
        expect(mainEdits![0].newText).toBe('Settings');

        // Apply edits and verify result
        const newMainFile = applyEdits(resourceFile, mainEdits!);
        expect(newMainFile).toContain('resource Settings server');
        expect(newMainFile).not.toContain('resource Config');
    });

    it('should rename component definition and instantiations across files', () => {
        // File 1: component definition
        const componentFile = `component WebServer {
    input string name = "default"
    output string url = "http://localhost"
}`;
        // File 2: component instantiation
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

        // Rename 'WebServer' from the component definition
        const result = handleRename(componentDoc, Position.create(0, 12), 'HttpServer', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes).toBeDefined();

        // Validate component file edits
        const componentEdits = result?.changes?.['file:///component.kite'];
        expect(componentEdits).toBeDefined();
        expect(componentEdits!.length).toBe(1);
        expect(componentEdits![0].newText).toBe('HttpServer');

        const newComponentFile = applyEdits(componentFile, componentEdits!);
        expect(newComponentFile).toContain('component HttpServer {');

        // Validate main file edits
        const mainEdits = result?.changes?.['file:///main.kite'];
        expect(mainEdits).toBeDefined();
        expect(mainEdits!.length).toBe(1);
        expect(mainEdits![0].newText).toBe('HttpServer');

        const newMainFile = applyEdits(mainFile, mainEdits!);
        expect(newMainFile).toContain('component HttpServer api');
        expect(newMainFile).not.toContain('WebServer');
    });

    it('should rename function definition and calls across files', () => {
        // File 1: function definition
        const utilsFile = `fun calculateTotal(number price, number qty) number {
    return price * qty
}`;
        // File 2: function usage
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

        // Rename 'calculateTotal' from the function definition
        const result = handleRename(utilsDoc, Position.create(0, 6), 'computeTotal', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes).toBeDefined();

        // Validate utils file edits
        const utilsEdits = result?.changes?.['file:///utils.kite'];
        expect(utilsEdits).toBeDefined();
        expect(utilsEdits!.length).toBe(1);
        expect(utilsEdits![0].newText).toBe('computeTotal');

        const newUtilsFile = applyEdits(utilsFile, utilsEdits!);
        expect(newUtilsFile).toContain('fun computeTotal(');
        expect(newUtilsFile).not.toContain('calculateTotal');

        // Validate main file edits
        const mainEdits = result?.changes?.['file:///main.kite'];
        expect(mainEdits).toBeDefined();
        expect(mainEdits!.length).toBe(1);
        expect(mainEdits![0].newText).toBe('computeTotal');

        const newMainFile = applyEdits(mainFile, mainEdits!);
        expect(newMainFile).toContain('computeTotal(10, 5)');
        expect(newMainFile).not.toContain('calculateTotal');
    });

    it('should rename component input and update instantiation properties', () => {
        // File 1: component with input
        const componentFile = `component Database {
    input string connectionString = "localhost"
    output boolean connected = true
}`;
        // File 2: component instantiation setting the input
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

        // Rename 'connectionString' from the input declaration
        const result = handleRename(componentDoc, Position.create(1, 20), 'dbUrl', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes).toBeDefined();

        // Validate component file edits
        const componentEdits = result?.changes?.['file:///database.kite'];
        expect(componentEdits).toBeDefined();
        expect(componentEdits!.every(e => e.newText === 'dbUrl')).toBe(true);

        const newComponentFile = applyEdits(componentFile, componentEdits!);
        expect(newComponentFile).toContain('input string dbUrl');
        expect(newComponentFile).not.toContain('connectionString');

        // Validate main file edits
        const mainEdits = result?.changes?.['file:///main.kite'];
        expect(mainEdits).toBeDefined();
        expect(mainEdits!.every(e => e.newText === 'dbUrl')).toBe(true);

        const newMainFile = applyEdits(mainFile, mainEdits!);
        expect(newMainFile).toContain('dbUrl = "postgres://localhost:5432"');
        expect(newMainFile).not.toContain('connectionString');
    });

    it('should rename from reference location, not just definition', () => {
        // File 1: schema definition
        const schemaFile = `schema User {
    string name
}`;
        // File 2: uses the schema
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

        // Rename 'User' from the usage in main.kite (not the definition)
        const result = handleRename(mainDoc, Position.create(2, 11), 'Account', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes).toBeDefined();

        // Validate schema file edits
        const schemaEdits = result?.changes?.['file:///schema.kite'];
        expect(schemaEdits).toBeDefined();
        expect(schemaEdits![0].newText).toBe('Account');

        const newSchemaFile = applyEdits(schemaFile, schemaEdits!);
        expect(newSchemaFile).toContain('schema Account {');

        // Validate main file edits
        const mainEdits = result?.changes?.['file:///main.kite'];
        expect(mainEdits).toBeDefined();
        expect(mainEdits![0].newText).toBe('Account');

        const newMainFile = applyEdits(mainFile, mainEdits!);
        expect(newMainFile).toContain('resource Account admin');
    });

    it('should NOT rename local variables across files', () => {
        // File 1: has a local variable 'count'
        const file1 = `fun process() {
    var count = 0
    return count
}`;
        // File 2: has a different local variable also named 'count'
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

        // Rename 'count' in file1 - should only affect file1
        const result = handleRename(doc1, Position.create(1, 10), 'total', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes).toBeDefined();

        // Validate file1 edits
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
        // File 1: type definition
        const typesFile = `type Environment = "dev" | "staging" | "prod"`;
        // File 2: uses the type
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

        // Rename 'Environment' from the type definition
        const result = handleRename(typesDoc, Position.create(0, 6), 'Stage', ctx);

        expect(result).not.toBeNull();
        expect(result?.changes).toBeDefined();

        // Validate types file edits
        const typesEdits = result?.changes?.['file:///types.kite'];
        expect(typesEdits).toBeDefined();
        expect(typesEdits![0].newText).toBe('Stage');

        const newTypesFile = applyEdits(typesFile, typesEdits!);
        expect(newTypesFile).toContain('type Stage =');
        expect(newTypesFile).not.toContain('Environment');

        // Validate main file edits
        const mainEdits = result?.changes?.['file:///main.kite'];
        expect(mainEdits).toBeDefined();
        expect(mainEdits![0].newText).toBe('Stage');

        const newMainFile = applyEdits(mainFile, mainEdits!);
        expect(newMainFile).toContain('var env Stage =');
        expect(newMainFile).not.toContain('Environment');
    });
});
