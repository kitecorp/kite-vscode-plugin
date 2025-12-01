/**
 * Tests for Code Lens handler
 * Code Lens shows "X references" above declarations
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { handleCodeLens, CodeLensContext } from './index';

function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

function createContext(files: Map<string, string> = new Map()): CodeLensContext {
    return {
        findKiteFilesInWorkspace: () => Array.from(files.keys()),
        getFileContent: (path) => files.get(path) || null,
    };
}

describe('Code Lens', () => {
    describe('Schema declarations', () => {
        it('should show reference count for schema with references', () => {
            const content = `schema ServerConfig {
    string host
}

resource ServerConfig webServer {
    host = "localhost"
}

resource ServerConfig dbServer {
    host = "db.example.com"
}`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            const schemaLens = result.find(lens =>
                lens.range.start.line === 0 && lens.command?.title.includes('references')
            );
            expect(schemaLens).toBeDefined();
            expect(schemaLens?.command?.title).toBe('2 references');
        });

        it('should show 0 references for unused schema', () => {
            const content = `schema UnusedConfig {
    string name
}`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            const schemaLens = result.find(lens =>
                lens.range.start.line === 0
            );
            expect(schemaLens).toBeDefined();
            expect(schemaLens?.command?.title).toBe('0 references');
        });

        it('should not count schema definition as reference', () => {
            const content = `schema Config {
    string name
}`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            const schemaLens = result.find(lens => lens.range.start.line === 0);
            expect(schemaLens?.command?.title).toBe('0 references');
        });
    });

    describe('Component declarations', () => {
        it('should show reference count for component definition', () => {
            const content = `component WebServer {
    input string name
    output string endpoint
}

component WebServer api {
    name = "api"
}

component WebServer frontend {
    name = "frontend"
}`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            const componentLens = result.find(lens =>
                lens.range.start.line === 0 && lens.command?.title.includes('references')
            );
            expect(componentLens).toBeDefined();
            expect(componentLens?.command?.title).toBe('2 references');
        });

        it('should show 0 references for unused component', () => {
            const content = `component UnusedComponent {
    input string name
}`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            const lens = result.find(lens => lens.range.start.line === 0);
            expect(lens?.command?.title).toBe('0 references');
        });
    });

    describe('Function declarations', () => {
        it('should show reference count for function', () => {
            const content = `fun calculate(number x) number {
    return x * 2
}

var a = calculate(5)
var b = calculate(10)
var c = calculate(15)`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            const funcLens = result.find(lens =>
                lens.range.start.line === 0 && lens.command?.title.includes('references')
            );
            expect(funcLens).toBeDefined();
            expect(funcLens?.command?.title).toBe('3 references');
        });

        it('should show 0 references for unused function', () => {
            const content = `fun unusedFunc() number {
    return 42
}`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            const lens = result.find(lens => lens.range.start.line === 0);
            expect(lens?.command?.title).toBe('0 references');
        });
    });

    describe('Variable declarations', () => {
        it('should show reference count for variable', () => {
            const content = `var baseUrl = "https://api.example.com"
var endpoint1 = baseUrl + "/users"
var endpoint2 = baseUrl + "/products"`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            const varLens = result.find(lens =>
                lens.range.start.line === 0 && lens.command?.title.includes('references')
            );
            expect(varLens).toBeDefined();
            expect(varLens?.command?.title).toBe('2 references');
        });

        it('should show 0 references for unused variable', () => {
            const content = `var unusedVar = "test"`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            const lens = result.find(lens => lens.range.start.line === 0);
            expect(lens?.command?.title).toBe('0 references');
        });
    });

    describe('Resource declarations', () => {
        it('should show reference count for resource', () => {
            const content = `schema Config {
    string host
}

resource Config server {
    host = "localhost"
}

var serverHost = server.host`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            // Note: use 'reference' to match both singular and plural

            // Find the resource lens (line 4) - resource instance 'server'
            const resourceLens = result.find(lens =>
                lens.range.start.line === 4 && lens.command?.title.includes('reference')
            );
            expect(resourceLens).toBeDefined();
            expect(resourceLens?.command?.title).toBe('1 reference');
        });
    });

    describe('Type alias declarations', () => {
        it('should show reference count for type alias', () => {
            // Kite syntax: var Type name = value
            const content = `type Region = "us-east-1" | "us-west-2"

var Region r1 = "us-east-1"
var Region r2 = "us-west-2"`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            const typeLens = result.find(lens =>
                lens.range.start.line === 0 && lens.command?.title.includes('references')
            );
            expect(typeLens).toBeDefined();
            expect(typeLens?.command?.title).toBe('2 references');
        });
    });

    describe('Multiple declarations', () => {
        it('should show code lens for all declarations', () => {
            const content = `schema Config {
    string name
}

component Server {
    input string name
}

fun helper() string {
    return "help"
}

var constant = "value"`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            // Should have 4 code lenses (schema, component, function, variable)
            expect(result.length).toBe(4);
        });
    });

    describe('Cross-file references', () => {
        it('should count references from other files', () => {
            const mainContent = `schema SharedConfig {
    string name
}`;
            const otherContent = `import SharedConfig from "main.kite"

resource SharedConfig myConfig {
    name = "test"
}`;
            // Use file paths (not URIs) for the context
            const files = new Map([
                ['/workspace/main.kite', mainContent],
                ['/workspace/other.kite', otherContent],
            ]);

            const doc = createDocument(mainContent, 'file:///workspace/main.kite');
            const ctx = createContext(files);
            const result = handleCodeLens(doc, ctx);

            const schemaLens = result.find(lens => lens.range.start.line === 0);
            // 2 references: import statement + resource type
            expect(schemaLens?.command?.title).toBe('2 references');
        });
    });

    describe('Singular vs plural', () => {
        it('should use singular "reference" for 1', () => {
            const content = `var x = 1
var y = x`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            const lens = result.find(lens => lens.range.start.line === 0);
            expect(lens?.command?.title).toBe('1 reference');
        });

        it('should use plural "references" for 0', () => {
            const content = `var unused = 1`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            const lens = result.find(lens => lens.range.start.line === 0);
            expect(lens?.command?.title).toBe('0 references');
        });

        it('should use plural "references" for 2+', () => {
            const content = `var x = 1
var a = x
var b = x`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            const lens = result.find(lens => lens.range.start.line === 0);
            expect(lens?.command?.title).toBe('2 references');
        });
    });

    describe('Code lens command', () => {
        it('should include command to show references', () => {
            const content = `schema Config {
    string name
}`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            const lens = result[0];
            expect(lens.command).toBeDefined();
            expect(lens.command?.command).toBe('editor.action.showReferences');
            expect(lens.command?.arguments).toBeDefined();
        });
    });

    describe('Input/Output declarations in components', () => {
        it('should show code lens for inputs used within component', () => {
            const content = `component Server {
    input string name = "default"
    output string endpoint = "http://\${name}.example.com"
}`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            // Should have lens for component
            const componentLens = result.find(lens => lens.range.start.line === 0);
            expect(componentLens).toBeDefined();
        });
    });

    describe('Decorators on declarations', () => {
        it('should place code lens on declaration line, not decorator', () => {
            const content = `@description("A server config")
@tags(["infra"])
schema ServerConfig {
    string host
}`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            // Code lens should be on line 2 (schema line), not line 0 (decorator)
            const lens = result.find(lens => lens.command?.title.includes('references'));
            expect(lens?.range.start.line).toBe(2);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty document', () => {
            const doc = createDocument('');
            const result = handleCodeLens(doc, createContext());
            expect(result).toEqual([]);
        });

        it('should handle document with only comments', () => {
            const content = `// Just a comment
/* Block comment */`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());
            expect(result).toEqual([]);
        });

        it('should not count references inside comments', () => {
            const content = `schema Config {
    string name
}

// Config is mentioned in this comment
/* Also mentioned here: Config */`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            const lens = result.find(lens => lens.range.start.line === 0);
            expect(lens?.command?.title).toBe('0 references');
        });

        it('should not count references inside strings', () => {
            const content = `schema Config {
    string name
}

var description = "Config is the name of our schema"`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            const lens = result.find(lens => lens.range.start.line === 0);
            expect(lens?.command?.title).toBe('0 references');
        });

        it('should handle string interpolation references', () => {
            const content = `var name = "test"
var greeting = "Hello \${name}!"`;
            const doc = createDocument(content);
            const result = handleCodeLens(doc, createContext());

            const lens = result.find(lens => lens.range.start.line === 0);
            expect(lens?.command?.title).toBe('1 reference');
        });
    });
});
