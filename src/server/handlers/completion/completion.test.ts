/**
 * Tests for completion handler.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItemKind, Position, Range } from 'vscode-languageserver/node';
import { handleCompletion, CompletionContext, isAfterEquals, isInsideNestedStructure } from '.';
import { Declaration, BlockContext } from '../../types';

// Helper to create a mock TextDocument
function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

// Helper to create position from offset
function positionFromOffset(text: string, offset: number): Position {
    const lines = text.substring(0, offset).split('\n');
    return Position.create(lines.length - 1, lines[lines.length - 1].length);
}

// Helper to create a mock context
function createContext(declarations: Declaration[] = []): CompletionContext {
    return {
        getDeclarations: () => declarations,
        findKiteFilesInWorkspace: () => [],
        getFileContent: () => null,
        findEnclosingBlock: () => null,
    };
}

describe('handleCompletion', () => {
    describe('top-level completions', () => {
        it('should provide keyword completions at top level', () => {
            const doc = createDocument('|');
            const position = Position.create(0, 0);
            const completions = handleCompletion(doc, position, createContext());

            const labels = completions.map(c => c.label);
            expect(labels).toContain('schema');
            expect(labels).toContain('resource');
            expect(labels).toContain('component');
            expect(labels).toContain('fun');
            expect(labels).toContain('var');
            expect(labels).toContain('import');
        });

        it('should provide type completions at top level', () => {
            const doc = createDocument('|');
            const position = Position.create(0, 0);
            const completions = handleCompletion(doc, position, createContext());

            const labels = completions.map(c => c.label);
            expect(labels).toContain('string');
            expect(labels).toContain('number');
            expect(labels).toContain('boolean');
            expect(labels).toContain('any');
        });

        it('should provide array type completions', () => {
            const doc = createDocument('|');
            const position = Position.create(0, 0);
            const completions = handleCompletion(doc, position, createContext());

            const labels = completions.map(c => c.label);
            expect(labels).toContain('string[]');
            expect(labels).toContain('number[]');
        });
    });

    describe('decorator completions', () => {
        it('should provide decorator completions after @', () => {
            const doc = createDocument('@');
            const position = Position.create(0, 1);
            const completions = handleCompletion(doc, position, createContext());

            // Should have decorator completions
            expect(completions.length).toBeGreaterThan(0);
            expect(completions[0].kind).toBe(CompletionItemKind.Event);
        });

        it('should provide decorator completions with partial name', () => {
            const doc = createDocument('@cl');
            const position = Position.create(0, 3);
            const completions = handleCompletion(doc, position, createContext());

            expect(completions.length).toBeGreaterThan(0);
        });

        it('should filter decorators for input context', () => {
            const text = `component MyComp {
    @|
    input string name
}`;
            const offset = text.indexOf('|');
            const doc = createDocument(text.replace('|', ''));
            const position = positionFromOffset(text.replace('|', ''), offset);
            const completions = handleCompletion(doc, position, createContext());

            const labels = completions.map(c => c.label);
            // Validation decorators apply to input
            expect(labels.some(l => l.startsWith('minValue'))).toBe(true);
            expect(labels.some(l => l.startsWith('maxValue'))).toBe(true);
            expect(labels.some(l => l.startsWith('nonEmpty'))).toBe(true);
            expect(labels.some(l => l.startsWith('sensitive'))).toBe(true);
            // Resource-only decorators should NOT appear
            expect(labels.some(l => l.startsWith('existing'))).toBe(false);
            expect(labels.some(l => l.startsWith('tags'))).toBe(false);
        });

        it('should filter decorators for resource context', () => {
            const text = `@|
resource S3.Bucket mybucket {}`;
            const offset = text.indexOf('|');
            const doc = createDocument(text.replace('|', ''));
            const position = positionFromOffset(text.replace('|', ''), offset);
            const completions = handleCompletion(doc, position, createContext());

            const labels = completions.map(c => c.label);
            // Resource decorators
            expect(labels.some(l => l.startsWith('existing'))).toBe(true);
            expect(labels.some(l => l.startsWith('tags'))).toBe(true);
            expect(labels.some(l => l.startsWith('provider'))).toBe(true);
            expect(labels.some(l => l.startsWith('dependsOn'))).toBe(true);
            expect(labels.some(l => l.startsWith('count'))).toBe(true);
            // Input-only decorators should NOT appear
            expect(labels.some(l => l.startsWith('nonEmpty'))).toBe(false);
            expect(labels.some(l => l.startsWith('unique'))).toBe(false);
        });

        it('should show description decorator for all contexts', () => {
            // Test for input context
            const inputText = `@|
input string name`;
            let offset = inputText.indexOf('|');
            let doc = createDocument(inputText.replace('|', ''));
            let position = positionFromOffset(inputText.replace('|', ''), offset);
            let completions = handleCompletion(doc, position, createContext());
            expect(completions.map(c => c.label).some(l => l.startsWith('description'))).toBe(true);

            // Test for resource context
            const resourceText = `@|
resource S3.Bucket mybucket {}`;
            offset = resourceText.indexOf('|');
            doc = createDocument(resourceText.replace('|', ''));
            position = positionFromOffset(resourceText.replace('|', ''), offset);
            completions = handleCompletion(doc, position, createContext());
            expect(completions.map(c => c.label).some(l => l.startsWith('description'))).toBe(true);

            // Test for schema context
            const schemaText = `@|
schema Config {}`;
            offset = schemaText.indexOf('|');
            doc = createDocument(schemaText.replace('|', ''));
            position = positionFromOffset(schemaText.replace('|', ''), offset);
            completions = handleCompletion(doc, position, createContext());
            expect(completions.map(c => c.label).some(l => l.startsWith('description'))).toBe(true);
        });
    });

    describe('schema body completions', () => {
        it('should provide type completions inside schema body', () => {
            const text = `schema Config {
    |
}`;
            const offset = text.indexOf('|');
            const doc = createDocument(text.replace('|', ''));
            const position = positionFromOffset(text.replace('|', ''), offset);
            const completions = handleCompletion(doc, position, createContext());

            const labels = completions.map(c => c.label);
            expect(labels).toContain('string');
            expect(labels).toContain('number');
            expect(labels).toContain('boolean');
        });

        it('should NOT provide keyword completions inside schema body', () => {
            const text = `schema Config {
    |
}`;
            const offset = text.indexOf('|');
            const doc = createDocument(text.replace('|', ''));
            const position = positionFromOffset(text.replace('|', ''), offset);
            const completions = handleCompletion(doc, position, createContext());

            const labels = completions.map(c => c.label);
            // Should not have IaC keywords inside schema
            expect(labels).not.toContain('resource');
            expect(labels).not.toContain('component');
            expect(labels).not.toContain('fun');
        });
    });

    describe('component definition completions', () => {
        it('should provide input/output keywords inside component definition', () => {
            const text = `component WebServer {
    |
}`;
            const offset = text.indexOf('|');
            const doc = createDocument(text.replace('|', ''));
            const position = positionFromOffset(text.replace('|', ''), offset);
            const completions = handleCompletion(doc, position, createContext());

            const labels = completions.map(c => c.label);
            expect(labels).toContain('input');
            expect(labels).toContain('output');
            expect(labels).toContain('var');
        });
    });

    describe('value context completions', () => {
        it('should provide boolean values after = in boolean context', () => {
            const text = `schema Config {
    boolean enabled = |
}`;
            const offset = text.indexOf('|');
            const doc = createDocument(text.replace('|', ''));
            const position = positionFromOffset(text.replace('|', ''), offset);
            const completions = handleCompletion(doc, position, createContext());

            const labels = completions.map(c => c.label);
            expect(labels).toContain('true');
            expect(labels).toContain('false');
        });
    });

    describe('declaration completions', () => {
        it('should include declared variables in completions', () => {
            const doc = createDocument('|');
            const declarations: Declaration[] = [
                {
                    name: 'myVar',
                    type: 'variable',
                    typeName: 'string',
                    range: Range.create(0, 0, 0, 5),
                    nameRange: Range.create(0, 0, 0, 5),
                    uri: 'file:///test.kite',
                },
            ];
            const ctx = createContext(declarations);
            const completions = handleCompletion(doc, Position.create(0, 0), ctx);

            const labels = completions.map(c => c.label);
            expect(labels).toContain('myVar');
        });

        it('should include declared functions in completions', () => {
            const doc = createDocument('|');
            const declarations: Declaration[] = [
                {
                    name: 'calculate',
                    type: 'function',
                    range: Range.create(0, 0, 0, 10),
                    nameRange: Range.create(0, 0, 0, 10),
                    uri: 'file:///test.kite',
                },
            ];
            const ctx = createContext(declarations);
            const completions = handleCompletion(doc, Position.create(0, 0), ctx);

            const labels = completions.map(c => c.label);
            expect(labels).toContain('calculate');
        });

        it('should filter scoped variables by position', () => {
            const doc = createDocument('var x = 1\n|');
            const declarations: Declaration[] = [
                {
                    name: 'localVar',
                    type: 'variable',
                    scopeStart: 100, // Out of range
                    scopeEnd: 200,
                    range: Range.create(0, 0, 0, 5),
                    nameRange: Range.create(0, 0, 0, 5),
                    uri: 'file:///test.kite',
                },
            ];
            const ctx = createContext(declarations);
            const completions = handleCompletion(doc, Position.create(1, 0), ctx);

            const labels = completions.map(c => c.label);
            expect(labels).not.toContain('localVar');
        });
    });
});

describe('isAfterEquals', () => {
    it('should return true when cursor is after =', () => {
        const text = 'name = ';
        expect(isAfterEquals(text, text.length)).toBe(true);
    });

    it('should return false when no equals on line', () => {
        const text = 'name';
        expect(isAfterEquals(text, text.length)).toBe(false);
    });

    it('should return false for == comparison', () => {
        const text = 'if (x == ';
        expect(isAfterEquals(text, text.length)).toBe(false);
    });

    it('should return false for != comparison', () => {
        const text = 'if (x != ';
        expect(isAfterEquals(text, text.length)).toBe(false);
    });

    it('should return false for <= comparison', () => {
        const text = 'if (x <= ';
        expect(isAfterEquals(text, text.length)).toBe(false);
    });

    it('should return false for >= comparison', () => {
        const text = 'if (x >= ';
        expect(isAfterEquals(text, text.length)).toBe(false);
    });
});

describe('isInsideNestedStructure', () => {
    it('should return false at depth 1', () => {
        const text = '{ name = ';
        expect(isInsideNestedStructure(text, 0, text.length)).toBe(false);
    });

    it('should return true inside nested braces', () => {
        const text = '{ config = { ';
        expect(isInsideNestedStructure(text, 0, text.length)).toBe(true);
    });

    it('should return true inside array', () => {
        const text = '{ items = [';
        expect(isInsideNestedStructure(text, 0, text.length)).toBe(true);
    });

    it('should return false after closing nested structure', () => {
        const text = '{ config = { } ';
        expect(isInsideNestedStructure(text, 0, text.length)).toBe(false);
    });
});

describe('property access completions', () => {
    it('should provide schema properties for resource dot access', () => {
        const text = `schema ServerConfig {
    string host
    number port
}

resource ServerConfig server {
    host = "localhost"
}

var x = server.|`;
        const offset = text.indexOf('|');
        const doc = createDocument(text.replace('|', ''));
        const position = positionFromOffset(text.replace('|', ''), offset);

        const declarations: Declaration[] = [
            {
                name: 'server',
                type: 'resource',
                schemaName: 'ServerConfig',
                range: Range.create(5, 0, 7, 1),
                nameRange: Range.create(5, 20, 5, 26),
                uri: 'file:///test.kite',
            },
        ];

        const ctx: CompletionContext = {
            getDeclarations: () => declarations,
            findKiteFilesInWorkspace: () => [],
            getFileContent: () => text.replace('|', ''),
            findEnclosingBlock: () => null,
        };

        const completions = handleCompletion(doc, position, ctx);
        const labels = completions.map(c => c.label);

        expect(labels).toContain('host');
        expect(labels).toContain('port');
    });

    it('should show set properties first with indicator for resource dot access', () => {
        const text = `schema ServerConfig {
    string host
    number port
}

resource ServerConfig server {
    host = "localhost"
}

var x = server.|`;
        const offset = text.indexOf('|');
        const doc = createDocument(text.replace('|', ''));
        const position = positionFromOffset(text.replace('|', ''), offset);

        const declarations: Declaration[] = [
            {
                name: 'server',
                type: 'resource',
                schemaName: 'ServerConfig',
                range: Range.create(5, 0, 7, 1),
                nameRange: Range.create(5, 20, 5, 26),
                uri: 'file:///test.kite',
            },
        ];

        const ctx: CompletionContext = {
            getDeclarations: () => declarations,
            findKiteFilesInWorkspace: () => [],
            getFileContent: () => text.replace('|', ''),
            findEnclosingBlock: () => null,
        };

        const completions = handleCompletion(doc, position, ctx);
        const hostCompletion = completions.find(c => c.label === 'host');

        // Set property should have indicator in detail
        expect(hostCompletion?.detail).toContain('(set)');
        // Set property should sort before unset
        expect(hostCompletion?.sortText).toBe('0host');
    });

    it('should provide outputs for component dot access', () => {
        const text = `component WebServer {
    input string name
    output string endpoint = "http://example.com"
    output number status = 200
}

component WebServer api {
    name = "api"
}

var url = api.|`;
        const offset = text.indexOf('|');
        const doc = createDocument(text.replace('|', ''));
        const position = positionFromOffset(text.replace('|', ''), offset);

        const declarations: Declaration[] = [
            {
                name: 'api',
                type: 'component',
                componentType: 'WebServer',
                range: Range.create(6, 0, 8, 1),
                nameRange: Range.create(6, 20, 6, 23),
                uri: 'file:///test.kite',
            },
        ];

        const ctx: CompletionContext = {
            getDeclarations: () => declarations,
            findKiteFilesInWorkspace: () => [],
            getFileContent: () => text.replace('|', ''),
            findEnclosingBlock: () => null,
        };

        const completions = handleCompletion(doc, position, ctx);
        const labels = completions.map(c => c.label);

        expect(labels).toContain('endpoint');
        expect(labels).toContain('status');

        const endpointCompletion = completions.find(c => c.label === 'endpoint');
        expect(endpointCompletion?.detail).toBe('output: string');
    });

    it('should return empty for unknown object dot access', () => {
        const text = `var x = unknown.|`;
        const offset = text.indexOf('|');
        const doc = createDocument(text.replace('|', ''));
        const position = positionFromOffset(text.replace('|', ''), offset);

        const completions = handleCompletion(doc, position, createContext());

        expect(completions).toHaveLength(0);
    });
});

describe('block body completions', () => {
    it('should provide schema properties inside resource body', () => {
        const text = `schema ServerConfig {
    string host
    number port
}

resource ServerConfig server {
    |
}`;
        const offset = text.indexOf('|');
        const cleanText = text.replace('|', '');
        const doc = createDocument(cleanText);
        const position = positionFromOffset(cleanText, offset);

        const blockStart = cleanText.indexOf('resource ServerConfig server {') + 'resource ServerConfig server {'.length - 1;
        const blockEnd = cleanText.lastIndexOf('}');

        const ctx: CompletionContext = {
            getDeclarations: () => [],
            findKiteFilesInWorkspace: () => [],
            getFileContent: () => cleanText,
            findEnclosingBlock: () => ({
                type: 'resource',
                name: 'server',
                typeName: 'ServerConfig',
                start: blockStart,
                end: blockEnd,
            }),
        };

        const completions = handleCompletion(doc, position, ctx);
        const labels = completions.map(c => c.label);

        expect(labels).toContain('host');
        expect(labels).toContain('port');

        // Check insertText includes ' = '
        const hostCompletion = completions.find(c => c.label === 'host');
        expect(hostCompletion?.insertText).toBe('host = ');
    });

    it('should filter already-set properties in resource body', () => {
        const text = `schema ServerConfig {
    string host
    number port
}

resource ServerConfig server {
    host = "localhost"
    |
}`;
        const offset = text.indexOf('|');
        const cleanText = text.replace('|', '');
        const doc = createDocument(cleanText);
        const position = positionFromOffset(cleanText, offset);

        const blockStart = cleanText.indexOf('resource ServerConfig server {') + 'resource ServerConfig server {'.length - 1;
        const blockEnd = cleanText.lastIndexOf('}');

        const ctx: CompletionContext = {
            getDeclarations: () => [],
            findKiteFilesInWorkspace: () => [],
            getFileContent: () => cleanText,
            findEnclosingBlock: () => ({
                type: 'resource',
                name: 'server',
                typeName: 'ServerConfig',
                start: blockStart,
                end: blockEnd,
            }),
        };

        const completions = handleCompletion(doc, position, ctx);
        const labels = completions.map(c => c.label);

        // host is already set, should not appear
        expect(labels).not.toContain('host');
        // port is not set, should appear
        expect(labels).toContain('port');
    });

    it('should provide input properties inside component instantiation body', () => {
        const text = `component WebServer {
    input string name
    input number replicas = 1
}

component WebServer api {
    |
}`;
        const offset = text.indexOf('|');
        const cleanText = text.replace('|', '');
        const doc = createDocument(cleanText);
        const position = positionFromOffset(cleanText, offset);

        const blockStart = cleanText.indexOf('component WebServer api {') + 'component WebServer api {'.length - 1;
        const blockEnd = cleanText.lastIndexOf('}');

        const ctx: CompletionContext = {
            getDeclarations: () => [],
            findKiteFilesInWorkspace: () => [],
            getFileContent: () => cleanText,
            findEnclosingBlock: () => ({
                type: 'component',
                name: 'api',
                typeName: 'WebServer',
                start: blockStart,
                end: blockEnd,
            }),
        };

        const completions = handleCompletion(doc, position, ctx);
        const labels = completions.map(c => c.label);

        expect(labels).toContain('name');
        expect(labels).toContain('replicas');
    });

    it('should return empty completions inside nested structure', () => {
        const text = `schema Config {
    object settings
}

resource Config myConfig {
    settings = {
        |
    }
}`;
        const offset = text.indexOf('|');
        const cleanText = text.replace('|', '');
        const doc = createDocument(cleanText);
        const position = positionFromOffset(cleanText, offset);

        const blockStart = cleanText.indexOf('resource Config myConfig {') + 'resource Config myConfig {'.length - 1;
        const blockEnd = cleanText.lastIndexOf('}');

        const ctx: CompletionContext = {
            getDeclarations: () => [],
            findKiteFilesInWorkspace: () => [],
            getFileContent: () => cleanText,
            findEnclosingBlock: () => ({
                type: 'resource',
                name: 'myConfig',
                typeName: 'Config',
                start: blockStart,
                end: blockEnd,
            }),
        };

        const completions = handleCompletion(doc, position, ctx);

        // Inside nested structure, should return empty (not schema properties)
        expect(completions).toHaveLength(0);
    });
});

describe('cross-file completions', () => {
    it('should provide schema properties from another file in resource body', () => {
        const currentFile = `resource ServerConfig server {
    |
}`;
        const schemaFile = `schema ServerConfig {
    string host
    number port
    boolean ssl = true
}`;
        const offset = currentFile.indexOf('|');
        const cleanText = currentFile.replace('|', '');
        const doc = createDocument(cleanText, 'file:///current.kite');
        const position = positionFromOffset(cleanText, offset);

        const blockStart = cleanText.indexOf('resource ServerConfig server {') + 'resource ServerConfig server {'.length - 1;
        const blockEnd = cleanText.lastIndexOf('}');

        const ctx: CompletionContext = {
            getDeclarations: () => [],
            findKiteFilesInWorkspace: () => ['/path/to/schema.kite'],
            getFileContent: (filePath: string) => {
                if (filePath === '/path/to/schema.kite') {
                    return schemaFile;
                }
                return cleanText;
            },
            findEnclosingBlock: () => ({
                type: 'resource',
                name: 'server',
                typeName: 'ServerConfig',
                start: blockStart,
                end: blockEnd,
            }),
        };

        const completions = handleCompletion(doc, position, ctx);
        const labels = completions.map(c => c.label);

        expect(labels).toContain('host');
        expect(labels).toContain('port');
        expect(labels).toContain('ssl');
    });

    it('should provide component inputs from another file in component instantiation', () => {
        const currentFile = `component WebServer api {
    |
}`;
        const componentFile = `component WebServer {
    input string name = "default"
    input number replicas = 1
    input boolean enabled = true
    output string endpoint
}`;
        const offset = currentFile.indexOf('|');
        const cleanText = currentFile.replace('|', '');
        const doc = createDocument(cleanText, 'file:///current.kite');
        const position = positionFromOffset(cleanText, offset);

        const blockStart = cleanText.indexOf('component WebServer api {') + 'component WebServer api {'.length - 1;
        const blockEnd = cleanText.lastIndexOf('}');

        const ctx: CompletionContext = {
            getDeclarations: () => [],
            findKiteFilesInWorkspace: () => ['/path/to/component.kite'],
            getFileContent: (filePath: string) => {
                if (filePath === '/path/to/component.kite') {
                    return componentFile;
                }
                return cleanText;
            },
            findEnclosingBlock: () => ({
                type: 'component',
                name: 'api',
                typeName: 'WebServer',
                start: blockStart,
                end: blockEnd,
            }),
        };

        const completions = handleCompletion(doc, position, ctx);
        const labels = completions.map(c => c.label);

        // Should show inputs, not outputs
        expect(labels).toContain('name');
        expect(labels).toContain('replicas');
        expect(labels).toContain('enabled');
        expect(labels).not.toContain('endpoint');
    });

    it('should provide outputs from cross-file component for dot access', () => {
        const currentFile = `component WebServer api {
    name = "api"
}

var url = api.|`;
        const componentFile = `component WebServer {
    input string name
    output string endpoint = "http://example.com"
    output number statusCode = 200
}`;
        const offset = currentFile.indexOf('|');
        const cleanText = currentFile.replace('|', '');
        const doc = createDocument(cleanText, 'file:///current.kite');
        const position = positionFromOffset(cleanText, offset);

        const declarations: Declaration[] = [
            {
                name: 'api',
                type: 'component',
                componentType: 'WebServer',
                range: Range.create(0, 0, 2, 1),
                nameRange: Range.create(0, 20, 0, 23),
                uri: 'file:///current.kite',
            },
        ];

        const ctx: CompletionContext = {
            getDeclarations: () => declarations,
            findKiteFilesInWorkspace: () => ['/path/to/component.kite'],
            getFileContent: (filePath: string) => {
                if (filePath === '/path/to/component.kite') {
                    return componentFile;
                }
                return cleanText;
            },
            findEnclosingBlock: () => null,
        };

        const completions = handleCompletion(doc, position, ctx);
        const labels = completions.map(c => c.label);

        // Should show outputs for dot access
        expect(labels).toContain('endpoint');
        expect(labels).toContain('statusCode');
        // Should NOT show inputs for dot access
        expect(labels).not.toContain('name');
    });

    it('should provide schema properties from cross-file for resource dot access', () => {
        const currentFile = `resource ServerConfig server {
    host = "localhost"
}

var h = server.|`;
        const schemaFile = `schema ServerConfig {
    string host
    number port
    boolean ssl
}`;
        const offset = currentFile.indexOf('|');
        const cleanText = currentFile.replace('|', '');
        const doc = createDocument(cleanText, 'file:///current.kite');
        const position = positionFromOffset(cleanText, offset);

        const declarations: Declaration[] = [
            {
                name: 'server',
                type: 'resource',
                schemaName: 'ServerConfig',
                range: Range.create(0, 0, 2, 1),
                nameRange: Range.create(0, 22, 0, 28),
                uri: 'file:///current.kite',
            },
        ];

        const ctx: CompletionContext = {
            getDeclarations: () => declarations,
            findKiteFilesInWorkspace: () => ['/path/to/schema.kite'],
            getFileContent: (filePath: string) => {
                if (filePath === '/path/to/schema.kite') {
                    return schemaFile;
                }
                return cleanText;
            },
            findEnclosingBlock: () => null,
        };

        const completions = handleCompletion(doc, position, ctx);
        const labels = completions.map(c => c.label);

        expect(labels).toContain('host');
        expect(labels).toContain('port');
        expect(labels).toContain('ssl');

        // host is set, should be marked as such
        const hostCompletion = completions.find(c => c.label === 'host');
        expect(hostCompletion?.detail).toContain('(set)');
    });
});

describe('context-aware value suggestions', () => {
    it('should provide boolean suggestions for boolean property value', () => {
        const text = `schema Config {
    boolean enabled
}

resource Config myConfig {
    enabled = |
}`;
        const offset = text.indexOf('|');
        const cleanText = text.replace('|', '');
        const doc = createDocument(cleanText);
        const position = positionFromOffset(cleanText, offset);

        const blockStart = cleanText.indexOf('resource Config myConfig {') + 'resource Config myConfig {'.length - 1;
        const blockEnd = cleanText.lastIndexOf('}');

        const ctx: CompletionContext = {
            getDeclarations: () => [],
            findKiteFilesInWorkspace: () => [],
            getFileContent: () => cleanText,
            findEnclosingBlock: () => ({
                type: 'resource',
                name: 'myConfig',
                typeName: 'Config',
                start: blockStart,
                end: blockEnd,
            }),
        };

        const completions = handleCompletion(doc, position, ctx);
        const labels = completions.map(c => c.label);

        expect(labels).toContain('true');
        expect(labels).toContain('false');
    });

    it('should provide port suggestions for port property', () => {
        const text = `schema Config {
    number port
}

resource Config myConfig {
    port = |
}`;
        const offset = text.indexOf('|');
        const cleanText = text.replace('|', '');
        const doc = createDocument(cleanText);
        const position = positionFromOffset(cleanText, offset);

        const blockStart = cleanText.indexOf('resource Config myConfig {') + 'resource Config myConfig {'.length - 1;
        const blockEnd = cleanText.lastIndexOf('}');

        const ctx: CompletionContext = {
            getDeclarations: () => [],
            findKiteFilesInWorkspace: () => [],
            getFileContent: () => cleanText,
            findEnclosingBlock: () => ({
                type: 'resource',
                name: 'myConfig',
                typeName: 'Config',
                start: blockStart,
                end: blockEnd,
            }),
        };

        const completions = handleCompletion(doc, position, ctx);
        const labels = completions.map(c => c.label);

        // Should have common port suggestions
        expect(labels).toContain('80');
        expect(labels).toContain('443');
        expect(labels).toContain('8080');
    });

    it('should provide region suggestions for region property', () => {
        const text = `schema Config {
    string region
}

resource Config myConfig {
    region = |
}`;
        const offset = text.indexOf('|');
        const cleanText = text.replace('|', '');
        const doc = createDocument(cleanText);
        const position = positionFromOffset(cleanText, offset);

        const blockStart = cleanText.indexOf('resource Config myConfig {') + 'resource Config myConfig {'.length - 1;
        const blockEnd = cleanText.lastIndexOf('}');

        const ctx: CompletionContext = {
            getDeclarations: () => [],
            findKiteFilesInWorkspace: () => [],
            getFileContent: () => cleanText,
            findEnclosingBlock: () => ({
                type: 'resource',
                name: 'myConfig',
                typeName: 'Config',
                start: blockStart,
                end: blockEnd,
            }),
        };

        const completions = handleCompletion(doc, position, ctx);
        const labels = completions.map(c => c.label);

        // Should have AWS region suggestions
        expect(labels).toContain('"us-east-1"');
        expect(labels).toContain('"eu-west-1"');
    });
});
