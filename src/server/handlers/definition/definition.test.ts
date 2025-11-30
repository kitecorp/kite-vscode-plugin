/**
 * Tests for definition handler.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Location } from 'vscode-languageserver/node';
import {
    findSchemaDefinition,
    findFunctionDefinition,
    findComponentDefinition,
    handleDefinition,
    DefinitionContext,
} from '.';
import { Declaration, ImportInfo, BlockContext } from '../../types';
import { findEnclosingBlock } from '../../utils/text-utils';
import { scanDocumentAST } from '../../../parser';

// Helper to create a mock TextDocument
function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

// Helper to get position from line and character
function pos(line: number, character: number): Position {
    return Position.create(line, character);
}

// Create a mock context for testing
function createMockContext(document: TextDocument): DefinitionContext {
    const text = document.getText();
    const declarations = scanDocumentAST(document);

    return {
        findKiteFilesInWorkspace: () => [],
        getFileContent: () => null,
        extractImports: () => [],
        isSymbolImported: () => false,
        findEnclosingBlock: (t: string, offset: number) => findEnclosingBlock(t, offset),
        getDeclarations: (uri: string) => uri === document.uri ? declarations : undefined,
    };
}

// Helper to find definition at a position
function findDefinitionAt(content: string, line: number, character: number): Location | null {
    const doc = createDocument(content);
    const ctx = createMockContext(doc);
    const result = handleDefinition(
        { textDocument: { uri: doc.uri }, position: pos(line, character) },
        doc,
        ctx
    );
    // handleDefinition can return Definition which could be Location or Location[]
    if (Array.isArray(result)) {
        return result[0] || null;
    }
    return result;
}

describe('findSchemaDefinition', () => {
    it('should find schema definition', () => {
        const text = `schema ServerConfig {
    string host
    number port
}`;
        const result = findSchemaDefinition(text, 'ServerConfig', 'file:///test.kite');

        expect(result).not.toBeNull();
        expect(result?.range.start.line).toBe(0);
        expect(result?.range.start.character).toBe(7); // After "schema "
    });

    it('should return null for non-existent schema', () => {
        const text = `schema Other { }`;
        const result = findSchemaDefinition(text, 'ServerConfig', 'file:///test.kite');

        expect(result).toBeNull();
    });

    it('should handle multiple schemas', () => {
        const text = `schema First { }
schema Second { }
schema Third { }`;

        const first = findSchemaDefinition(text, 'First', 'file:///test.kite');
        const second = findSchemaDefinition(text, 'Second', 'file:///test.kite');
        const third = findSchemaDefinition(text, 'Third', 'file:///test.kite');

        expect(first?.range.start.line).toBe(0);
        expect(second?.range.start.line).toBe(1);
        expect(third?.range.start.line).toBe(2);
    });

    it('should handle file path conversion', () => {
        const text = `schema Config { }`;
        const result = findSchemaDefinition(text, 'Config', '/path/to/file.kite');

        expect(result).not.toBeNull();
        expect(result?.uri).toContain('file:///');
    });
});

describe('findFunctionDefinition', () => {
    it('should find function definition', () => {
        const text = `fun calculate(number x, number y) number {
    return x + y
}`;
        const result = findFunctionDefinition(text, 'calculate', 'file:///test.kite');

        expect(result).not.toBeNull();
        expect(result?.range.start.line).toBe(0);
    });

    it('should return null for non-existent function', () => {
        const text = `fun other() { }`;
        const result = findFunctionDefinition(text, 'calculate', 'file:///test.kite');

        expect(result).toBeNull();
    });

    it('should handle multiple functions', () => {
        const text = `fun first() { }
fun second() { }
fun third() { }`;

        const first = findFunctionDefinition(text, 'first', 'file:///test.kite');
        const second = findFunctionDefinition(text, 'second', 'file:///test.kite');
        const third = findFunctionDefinition(text, 'third', 'file:///test.kite');

        expect(first?.range.start.line).toBe(0);
        expect(second?.range.start.line).toBe(1);
        expect(third?.range.start.line).toBe(2);
    });

    it('should find function with parameters', () => {
        const text = `fun process(string input, number count) string {
    return input
}`;
        const result = findFunctionDefinition(text, 'process', 'file:///test.kite');

        expect(result).not.toBeNull();
    });

    it('should find function with no return type', () => {
        const text = `fun doSomething() {
    println("done")
}`;
        const result = findFunctionDefinition(text, 'doSomething', 'file:///test.kite');

        expect(result).not.toBeNull();
    });
});

describe('findComponentDefinition', () => {
    it('should find component definition', () => {
        const text = `component WebServer {
    input string name
    output string endpoint
}`;
        const result = findComponentDefinition(text, 'WebServer', 'file:///test.kite');

        expect(result).not.toBeNull();
        expect(result?.range.start.line).toBe(0);
    });

    it('should return null for non-existent component', () => {
        const text = `component Other { }`;
        const result = findComponentDefinition(text, 'WebServer', 'file:///test.kite');

        expect(result).toBeNull();
    });

    it('should NOT find component instantiation (only definitions)', () => {
        const text = `component WebServer api {
    name = "api"
}`;
        // This is an instantiation, not a definition
        const result = findComponentDefinition(text, 'WebServer', 'file:///test.kite');

        expect(result).toBeNull();
    });

    it('should find definition when both definition and instantiation exist', () => {
        const text = `component WebServer {
    input string name
}

component WebServer api {
    name = "api"
}`;
        const result = findComponentDefinition(text, 'WebServer', 'file:///test.kite');

        expect(result).not.toBeNull();
        expect(result?.range.start.line).toBe(0); // Should find the definition, not instantiation
    });

    it('should handle multiple component definitions', () => {
        const text = `component First { }
component Second { }
component Third { }`;

        const first = findComponentDefinition(text, 'First', 'file:///test.kite');
        const second = findComponentDefinition(text, 'Second', 'file:///test.kite');
        const third = findComponentDefinition(text, 'Third', 'file:///test.kite');

        expect(first?.range.start.line).toBe(0);
        expect(second?.range.start.line).toBe(1);
        expect(third?.range.start.line).toBe(2);
    });
});

describe('scoped definition lookup', () => {
    it('should find resource declaration when clicking on resource name in property access', () => {
        // When clicking on 'server' in 'server.tag', should go to the 'server' resource declaration
        const text = `component WebServer {
    resource Instance server {
        tag = {
            Name: "test"
        }
    }
    output string name = server.tag.Name
}`;
        // Line 6: 'output string name = server.tag.Name'
        // 'server' starts at character 25
        const result = findDefinitionAt(text, 6, 26);

        expect(result).not.toBeNull();
        expect(result?.range.start.line).toBe(1); // Line 1: resource Instance server
    });

    it('should find property in correct resource when clicking on property in chain', () => {
        // When clicking on 'tag' in 'server.tag', should go to the tag in 'server' resource
        const text = `component WebServer {
    resource Instance server {
        tag = {
            Name: "server-tag"
        }
    }
    resource Instance config {
        tag = {
            Name: "config-tag"
        }
    }
    output string serverTag = server.tag.Name
    output string configTag = config.tag.Name
}`;
        // Line 11: '    output string serverTag = server.tag.Name'
        // 'tag' after 'server.' is at position 37
        const serverTagResult = findDefinitionAt(text, 11, 37);

        expect(serverTagResult).not.toBeNull();
        expect(serverTagResult?.range.start.line).toBe(2); // Line 2: tag = { in server

        // Line 12: '    output string configTag = config.tag.Name'
        // 'tag' after 'config.' is at position 37
        const configTagResult = findDefinitionAt(text, 12, 37);

        expect(configTagResult).not.toBeNull();
        expect(configTagResult?.range.start.line).toBe(7); // Line 7: tag = { in config (NOT line 2!)
    });

    it('should find nested property in correct path', () => {
        // When clicking on 'Name' in 'server.tag.Name', should go to 'Name' inside server.tag
        const text = `component WebServer {
    resource Instance server {
        tag = {
            Name: "server-name"
        }
    }
    output string name = server.tag.Name
}`;
        // Line 6: 'output string name = server.tag.Name'
        // 'Name' starts around character 36
        const result = findDefinitionAt(text, 6, 37);

        expect(result).not.toBeNull();
        expect(result?.range.start.line).toBe(3); // Line 3: Name: "server-name"
    });
});

describe('list comprehension variable lookup', () => {
    it('should find loop variable declaration when clicking on reference in condition', () => {
        // var filtered = [for x in items: if x > 10 { x }]
        // Clicking on 'x' in 'x > 10' should go to 'x' in 'for x in'
        const text = `var filtered = [for x in items: if x > 10 { x }]`;
        // 'x' in 'if x > 10' is at position 35
        const result = findDefinitionAt(text, 0, 35);

        expect(result).not.toBeNull();
        expect(result?.range.start.character).toBe(20); // 'x' in 'for x in' is at position 20
    });

    it('should find loop variable declaration when clicking on reference in body', () => {
        // var filtered = [for x in items: if x > 10 { x }]
        // Clicking on 'x' in '{ x }' should go to 'x' in 'for x in'
        const text = `var filtered = [for x in items: if x > 10 { x }]`;
        // 'x' in '{ x }' is at position 44
        const result = findDefinitionAt(text, 0, 44);

        expect(result).not.toBeNull();
        expect(result?.range.start.character).toBe(20); // 'x' in 'for x in' is at position 20
    });

    it('should find loop variable in simple for comprehension', () => {
        // var doubled = [for n in numbers: { n * 2 }]
        const text = `var doubled = [for n in numbers: { n * 2 }]`;
        // 'n' in '{ n * 2 }' is at position 35
        const result = findDefinitionAt(text, 0, 35);

        expect(result).not.toBeNull();
        expect(result?.range.start.character).toBe(19); // 'n' in 'for n in'
    });

    it('should find loop variable in multiline comprehension', () => {
        const text = `var filtered = [
    for item in items:
    if item.active {
        item
    }
]`;
        // Click on 'item' in 'if item.active' - line 2, around position 7
        const result = findDefinitionAt(text, 2, 7);

        expect(result).not.toBeNull();
        expect(result?.range.start.line).toBe(1); // 'item' declaration is on line 1
    });

    it('should not find loop variable outside of comprehension scope', () => {
        const text = `var filtered = [for x in items: { x }]
var y = x`;
        // Click on 'x' on line 1 (outside the comprehension)
        // Position of 'x' on line 1 is at character 8
        const result = findDefinitionAt(text, 1, 8);

        // Should NOT find the loop variable 'x' from the comprehension
        // (it's out of scope)
        expect(result).toBeNull();
    });

    it('should handle nested property access on loop variable', () => {
        const text = `var names = [for user in users: { user.name }]`;
        // Click on 'user' in 'user.name' - around position 34
        const result = findDefinitionAt(text, 0, 34);

        expect(result).not.toBeNull();
        expect(result?.range.start.character).toBe(17); // 'user' in 'for user in'
    });
});

describe('definition edge cases', () => {
    it('should handle empty file', () => {
        const text = '';

        expect(findSchemaDefinition(text, 'Config', 'file:///test.kite')).toBeNull();
        expect(findFunctionDefinition(text, 'func', 'file:///test.kite')).toBeNull();
        expect(findComponentDefinition(text, 'Comp', 'file:///test.kite')).toBeNull();
    });

    it('should handle file with only comments', () => {
        const text = `// This is a comment
/* Multi-line
   comment */`;

        expect(findSchemaDefinition(text, 'Config', 'file:///test.kite')).toBeNull();
        expect(findFunctionDefinition(text, 'func', 'file:///test.kite')).toBeNull();
        expect(findComponentDefinition(text, 'Comp', 'file:///test.kite')).toBeNull();
    });

    it('should handle mixed declarations', () => {
        const text = `schema Config { }
fun process() { }
component Server { }`;

        expect(findSchemaDefinition(text, 'Config', 'file:///test.kite')).not.toBeNull();
        expect(findFunctionDefinition(text, 'process', 'file:///test.kite')).not.toBeNull();
        expect(findComponentDefinition(text, 'Server', 'file:///test.kite')).not.toBeNull();
    });
});
