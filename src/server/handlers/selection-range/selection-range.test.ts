/**
 * Tests for Selection Range handler
 * Selection Range provides smart expand selection (Cmd+Shift+→)
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver/node';
import { handleSelectionRange } from './index';

function createDocument(content: string): TextDocument {
    return TextDocument.create('file:///test.kite', 'kite', 1, content);
}

function getSelectionRanges(content: string, line: number, character: number) {
    const doc = createDocument(content);
    const positions: Position[] = [{ line, character }];
    return handleSelectionRange(doc, positions);
}

function flattenRanges(selectionRange: { range: { start: { line: number; character: number }; end: { line: number; character: number } }; parent?: any } | null): string[] {
    const ranges: string[] = [];
    let current = selectionRange;
    while (current) {
        const { start, end } = current.range;
        ranges.push(`${start.line}:${start.character}-${end.line}:${end.character}`);
        current = current.parent;
    }
    return ranges;
}

describe('Selection Range', () => {
    describe('Variable declarations', () => {
        it('should expand from identifier to value to statement', () => {
            const content = 'var name = "hello"';
            const result = getSelectionRanges(content, 0, 12); // cursor in "hello"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            // Should have: string -> value -> statement -> file
            expect(ranges.length).toBeGreaterThanOrEqual(2);
        });

        it('should expand from variable name', () => {
            const content = 'var myVariable = 123';
            const result = getSelectionRanges(content, 0, 6); // cursor in "myVariable"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(2);
        });

        it('should expand typed variable declaration', () => {
            const content = 'var string name = "value"';
            const result = getSelectionRanges(content, 0, 13); // cursor in "name"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Schema definitions', () => {
        it('should expand from property name to property to schema body to schema', () => {
            const content = `schema ServerConfig {
    string host
    number port = 8080
}`;
            const result = getSelectionRanges(content, 1, 12); // cursor in "host"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            // Should expand: identifier -> property -> body -> schema -> file
            expect(ranges.length).toBeGreaterThanOrEqual(3);
        });

        it('should expand from schema name', () => {
            const content = `schema MySchema {
    string field
}`;
            const result = getSelectionRanges(content, 0, 9); // cursor in "MySchema"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(2);
        });

        it('should expand from property default value', () => {
            const content = `schema Config {
    number timeout = 3000
}`;
            const result = getSelectionRanges(content, 1, 22); // cursor in "3000"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('Component definitions', () => {
        it('should expand from input declaration', () => {
            const content = `component WebServer {
    input string name = "default"
    output string endpoint
}`;
            const result = getSelectionRanges(content, 1, 18); // cursor in "name"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(3);
        });

        it('should expand from output declaration', () => {
            const content = `component WebServer {
    input string name
    output string endpoint = "http://example.com"
}`;
            const result = getSelectionRanges(content, 2, 19); // cursor in "endpoint"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(3);
        });

        it('should expand from component name', () => {
            const content = `component MyComponent {
    input number count
}`;
            const result = getSelectionRanges(content, 0, 12); // cursor in "MyComponent"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Resource instances', () => {
        it('should expand from property value in resource', () => {
            const content = `resource ServerConfig webServer {
    host = "localhost"
    port = 8080
}`;
            const result = getSelectionRanges(content, 1, 12); // cursor in "localhost"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(3);
        });

        it('should expand from resource instance name', () => {
            const content = `resource ServerConfig myServer {
    host = "localhost"
}`;
            const result = getSelectionRanges(content, 0, 24); // cursor in "myServer"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Function definitions', () => {
        it('should expand from parameter name', () => {
            const content = `fun calculate(number amount, string currency) number {
    return amount * 2
}`;
            const result = getSelectionRanges(content, 0, 21); // cursor in "amount"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(3);
        });

        it('should expand from function body statement', () => {
            const content = `fun greet(string name) string {
    var greeting = "Hello"
    return greeting
}`;
            const result = getSelectionRanges(content, 1, 10); // cursor in "greeting"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(3);
        });

        it('should expand from return statement', () => {
            const content = `fun getValue() number {
    return 42
}`;
            const result = getSelectionRanges(content, 1, 11); // cursor in "42"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('Control flow', () => {
        it('should expand from if condition', () => {
            const content = `fun check(boolean flag) {
    if flag {
        return true
    }
}`;
            const result = getSelectionRanges(content, 1, 8); // cursor in "flag"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(3);
        });

        it('should expand from for loop variable', () => {
            const content = `fun process(string[] items) {
    for item in items {
        var x = item
    }
}`;
            const result = getSelectionRanges(content, 1, 9); // cursor in "item"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(3);
        });

        it('should expand from while condition', () => {
            const content = `fun loop(number count) {
    while count > 0 {
        count = count - 1
    }
}`;
            const result = getSelectionRanges(content, 1, 11); // cursor in "count"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('Imports', () => {
        it('should expand from import symbol', () => {
            const content = 'import ServerConfig from "common.kite"';
            const result = getSelectionRanges(content, 0, 10); // cursor in "ServerConfig"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(2);
        });

        it('should expand from import path', () => {
            const content = 'import Config from "config/common.kite"';
            const result = getSelectionRanges(content, 0, 25); // cursor in path
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Strings', () => {
        it('should expand string content to full string', () => {
            const content = 'var message = "Hello World"';
            const result = getSelectionRanges(content, 0, 18); // cursor in "Hello"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(2);
        });

        it('should expand interpolation variable', () => {
            const content = 'var greeting = "Hello ${name}!"';
            const result = getSelectionRanges(content, 0, 25); // cursor in "name"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            // Should expand: name -> ${name} -> string -> statement
            expect(ranges.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('Expressions', () => {
        it('should expand property access', () => {
            const content = 'var host = server.config.host';
            const result = getSelectionRanges(content, 0, 26); // cursor in last "host"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            // Should expand: host -> config.host -> server.config.host -> statement
            expect(ranges.length).toBeGreaterThanOrEqual(2);
        });

        it('should expand function call', () => {
            const content = 'var result = calculate(5, "USD")';
            const result = getSelectionRanges(content, 0, 15); // cursor in "calculate"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(2);
        });

        it('should expand arithmetic expression', () => {
            const content = 'var total = price * quantity + tax';
            const result = getSelectionRanges(content, 0, 21); // cursor in "quantity"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Comments', () => {
        it('should expand from inside line comment', () => {
            const content = '// This is a comment\nvar x = 1';
            const result = getSelectionRanges(content, 0, 10); // cursor in comment
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(1);
        });

        it('should expand from inside block comment', () => {
            const content = '/* Multi\nline\ncomment */\nvar x = 1';
            const result = getSelectionRanges(content, 1, 2); // cursor in "line"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Decorators', () => {
        it('should expand from decorator name', () => {
            const content = `@description("A server")
schema Server {}`;
            const result = getSelectionRanges(content, 0, 5); // cursor in "description"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(2);
        });

        it('should expand from decorator argument', () => {
            const content = `@tags(["web", "api"])
component API {}`;
            const result = getSelectionRanges(content, 0, 9); // cursor in "web"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Multiple positions', () => {
        it('should return selection ranges for multiple positions', () => {
            const content = `var a = 1
var b = 2`;
            const doc = createDocument(content);
            const positions: Position[] = [
                { line: 0, character: 4 }, // cursor in "a"
                { line: 1, character: 4 }, // cursor in "b"
            ];
            const result = handleSelectionRange(doc, positions);

            expect(result).toHaveLength(2);
            expect(flattenRanges(result[0]).length).toBeGreaterThanOrEqual(2);
            expect(flattenRanges(result[1]).length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty document', () => {
            const result = getSelectionRanges('', 0, 0);
            expect(result).toHaveLength(1);
            // Should at least return the whole document range
        });

        it('should handle position at end of line', () => {
            const content = 'var x = 1';
            const result = getSelectionRanges(content, 0, 9);
            expect(result).toHaveLength(1);
        });

        it('should handle position in whitespace', () => {
            const content = 'var x = 1\n\nvar y = 2';
            const result = getSelectionRanges(content, 1, 0); // empty line
            expect(result).toHaveLength(1);
        });

        it('should handle nested braces', () => {
            const content = `schema Config {
    object settings = {
        nested = {
            value = 1
        }
    }
}`;
            const result = getSelectionRanges(content, 3, 22); // cursor in "1"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            // Should have many levels of nesting
            expect(ranges.length).toBeGreaterThanOrEqual(4);
        });

        it('should handle array literals', () => {
            const content = 'var items = ["apple", "banana", "cherry"]';
            const result = getSelectionRanges(content, 0, 23); // cursor in "banana"
            expect(result).toHaveLength(1);

            const ranges = flattenRanges(result[0]);
            expect(ranges.length).toBeGreaterThanOrEqual(3);
        });
    });
});
