/**
 * Tests for validation handler.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity, Location, Range, Position } from 'vscode-languageserver/node';
import { validateDocument, ValidationContext } from '.';
import { ImportInfo } from '../../types';

// Helper to create a mock TextDocument
function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

// Helper to create a mock validation context
function createContext(options: {
    files?: Record<string, string>;
    declarations?: { name: string; type: 'schema' | 'resource' | 'component' | 'function' | 'variable' | 'input' | 'output' | 'type' | 'for' }[];
} = {}): ValidationContext {
    const diagnosticData = new Map<string, Map<string, any>>();

    return {
        getDeclarations: () => (options.declarations || []).map(d => ({
            ...d,
            range: Range.create(0, 0, 0, 0),
            nameRange: Range.create(0, 0, 0, 0),
            uri: 'file:///test.kite',
        })),
        findKiteFilesInWorkspace: () => Object.keys(options.files || {}),
        getFileContent: (path: string) => options.files?.[path] || null,
        getDiagnosticData: (uri: string) => {
            if (!diagnosticData.has(uri)) {
                diagnosticData.set(uri, new Map());
            }
            return diagnosticData.get(uri)!;
        },
        clearDiagnosticData: (uri: string) => {
            diagnosticData.delete(uri);
        },
        extractImports: (): ImportInfo[] => [],
        isSymbolImported: () => false,
        findSchemaDefinition: (text: string, name: string): Location | null => {
            if (text.includes(`schema ${name}`)) {
                return Location.create('file:///test.kite', Range.create(0, 0, 0, 0));
            }
            return null;
        },
        findComponentDefinition: (text: string, name: string): Location | null => {
            // Find component definition (not instantiation)
            const regex = new RegExp(`component\\s+${name}\\s*\\{`);
            if (regex.test(text)) {
                return Location.create('file:///test.kite', Range.create(0, 0, 0, 0));
            }
            return null;
        },
        findFunctionDefinition: (text: string, name: string): Location | null => {
            if (text.includes(`fun ${name}`)) {
                return Location.create('file:///test.kite', Range.create(0, 0, 0, 0));
            }
            return null;
        },
    };
}

describe('validateDocument', () => {
    describe('decorator validation', () => {
        it('should not report error for valid decorator without args', () => {
            const doc = createDocument(`@sensitive
input string apiKey`);
            const diagnostics = validateDocument(doc, createContext());

            const decoratorErrors = diagnostics.filter(d =>
                d.message.includes('@sensitive')
            );
            expect(decoratorErrors).toHaveLength(0);
        });

        it('should report error for decorator that expects no args but has args', () => {
            const doc = createDocument(`@sensitive("reason")
input string apiKey`);
            const diagnostics = validateDocument(doc, createContext());

            const decoratorErrors = diagnostics.filter(d =>
                d.message.includes('does not take arguments')
            );
            expect(decoratorErrors).toHaveLength(1);
        });

        it('should report error for number decorator with string arg', () => {
            const doc = createDocument(`@minValue("5")
input number count`);
            const diagnostics = validateDocument(doc, createContext());

            const typeErrors = diagnostics.filter(d =>
                d.message.includes('expects a number')
            );
            expect(typeErrors).toHaveLength(1);
        });

        it('should not report error for valid number decorator', () => {
            const doc = createDocument(`@minValue(5)
input number count`);
            const diagnostics = validateDocument(doc, createContext());

            const typeErrors = diagnostics.filter(d =>
                d.message.includes('@minValue')
            );
            expect(typeErrors).toHaveLength(0);
        });
    });

    describe('resource schema validation', () => {
        it('should not report error when schema exists in same file', () => {
            const doc = createDocument(`schema ServerConfig {
    string host
}

resource ServerConfig server {
    host = "localhost"
}`);
            const diagnostics = validateDocument(doc, createContext());

            const schemaErrors = diagnostics.filter(d =>
                d.message.includes("Cannot resolve schema") ||
                d.message.includes("is not imported")
            );
            expect(schemaErrors).toHaveLength(0);
        });

        it('should report error for undefined schema', () => {
            const doc = createDocument(`resource UnknownSchema server {
    host = "localhost"
}`);
            const diagnostics = validateDocument(doc, createContext());

            const schemaErrors = diagnostics.filter(d =>
                d.message.includes("Cannot resolve schema 'UnknownSchema'")
            );
            expect(schemaErrors).toHaveLength(1);
        });
    });

    describe('component type validation', () => {
        it('should not report error when component type exists in same file', () => {
            const doc = createDocument(`component WebServer {
    input string name
}

component WebServer api {
    name = "api"
}`);
            const diagnostics = validateDocument(doc, createContext());

            const componentErrors = diagnostics.filter(d =>
                d.message.includes("Cannot resolve component") ||
                d.message.includes("is not imported")
            );
            expect(componentErrors).toHaveLength(0);
        });

        it('should report error for undefined component type', () => {
            const doc = createDocument(`component UnknownComponent api {
    name = "api"
}`);
            const diagnostics = validateDocument(doc, createContext());

            const componentErrors = diagnostics.filter(d =>
                d.message.includes("Cannot resolve component 'UnknownComponent'")
            );
            expect(componentErrors).toHaveLength(1);
        });
    });

    describe('function call validation', () => {
        it('should not report error for defined function', () => {
            const doc = createDocument(`fun calculate(number x) number {
    return x * 2
}

var result = calculate(5)`);
            const ctx = createContext({
                declarations: [{ name: 'calculate', type: 'function' }],
            });
            const diagnostics = validateDocument(doc, ctx);

            const funcErrors = diagnostics.filter(d =>
                d.message.includes("Cannot resolve function 'calculate'")
            );
            expect(funcErrors).toHaveLength(0);
        });

        it('should not report error for builtin functions', () => {
            const doc = createDocument(`var x = println("hello")`);
            const diagnostics = validateDocument(doc, createContext());

            const funcErrors = diagnostics.filter(d =>
                d.message.includes("Cannot resolve function 'println'")
            );
            expect(funcErrors).toHaveLength(0);
        });

        it('should not report error for keywords that look like functions', () => {
            const doc = createDocument(`if (true) { }
while (true) { }
for (item in items) { }`);
            const diagnostics = validateDocument(doc, createContext());

            const keywordErrors = diagnostics.filter(d =>
                d.message.includes("Cannot resolve function 'if'") ||
                d.message.includes("Cannot resolve function 'while'") ||
                d.message.includes("Cannot resolve function 'for'")
            );
            expect(keywordErrors).toHaveLength(0);
        });
    });

    describe('duplicate name detection in components', () => {
        it('should report error for duplicate input names', () => {
            const doc = createDocument(`component WebServer {
    input string name
    input number name
}`);
            const diagnostics = validateDocument(doc, createContext());

            const duplicateErrors = diagnostics.filter(d =>
                d.message.includes("Duplicate name 'name'")
            );
            expect(duplicateErrors).toHaveLength(1);
        });

        it('should report error for duplicate variable names', () => {
            const doc = createDocument(`component WebServer {
    var count = 1
    var count = 2
}`);
            const diagnostics = validateDocument(doc, createContext());

            const duplicateErrors = diagnostics.filter(d =>
                d.message.includes("Duplicate name 'count'")
            );
            expect(duplicateErrors).toHaveLength(1);
        });

        it('should report error for input and output with same name', () => {
            const doc = createDocument(`component WebServer {
    input string value
    output string value
}`);
            const diagnostics = validateDocument(doc, createContext());

            const duplicateErrors = diagnostics.filter(d =>
                d.message.includes("Duplicate name 'value'")
            );
            expect(duplicateErrors).toHaveLength(1);
        });

        it('should not report error for different names', () => {
            const doc = createDocument(`component WebServer {
    input string name
    input number port
    output string endpoint
}`);
            const diagnostics = validateDocument(doc, createContext());

            const duplicateErrors = diagnostics.filter(d =>
                d.message.includes("Duplicate name")
            );
            expect(duplicateErrors).toHaveLength(0);
        });

        it('should not check duplicates in component instantiation', () => {
            // This is an instantiation, not definition
            const doc = createDocument(`component WebServer api {
    name = "api"
    name = "other"
}`);
            const diagnostics = validateDocument(doc, createContext());

            // The duplicate check only applies to definitions
            const duplicateErrors = diagnostics.filter(d =>
                d.message.includes("Duplicate name 'name'")
            );
            expect(duplicateErrors).toHaveLength(0);
        });
    });

    describe('comment handling', () => {
        it('should ignore declarations inside single-line comments', () => {
            const doc = createDocument(`// resource UnknownSchema server { }
schema Config { }`);
            const diagnostics = validateDocument(doc, createContext());

            const schemaErrors = diagnostics.filter(d =>
                d.message.includes("Cannot resolve schema")
            );
            expect(schemaErrors).toHaveLength(0);
        });

        it('should ignore declarations inside multi-line comments', () => {
            const doc = createDocument(`/*
resource UnknownSchema server { }
*/
schema Config { }`);
            const diagnostics = validateDocument(doc, createContext());

            const schemaErrors = diagnostics.filter(d =>
                d.message.includes("Cannot resolve schema")
            );
            expect(schemaErrors).toHaveLength(0);
        });
    });
});
