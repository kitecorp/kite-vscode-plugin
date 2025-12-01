/**
 * Tests for Folding Range handler
 * Provides custom code folding regions via LSP
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FoldingRangeKind } from 'vscode-languageserver/node';
import { handleFoldingRange } from './index';

function createDocument(content: string): TextDocument {
    return TextDocument.create('file:///test.kite', 'kite', 1, content);
}

describe('Folding Range', () => {
    describe('Schema blocks', () => {
        it('should fold schema block', () => {
            const doc = createDocument(`schema Config {
    string host
    number port
}`);
            const ranges = handleFoldingRange(doc);

            expect(ranges).toHaveLength(1);
            expect(ranges[0].startLine).toBe(0);
            expect(ranges[0].endLine).toBe(3);
            expect(ranges[0].kind).toBe(FoldingRangeKind.Region);
        });

        it('should fold multiple schemas', () => {
            const doc = createDocument(`schema Config {
    string host
}

schema Database {
    number port
}`);
            const ranges = handleFoldingRange(doc);

            expect(ranges).toHaveLength(2);
            expect(ranges[0].startLine).toBe(0);
            expect(ranges[0].endLine).toBe(2);
            expect(ranges[1].startLine).toBe(4);
            expect(ranges[1].endLine).toBe(6);
        });
    });

    describe('Component blocks', () => {
        it('should fold component definition', () => {
            const doc = createDocument(`component WebServer {
    input string name
    output string endpoint
}`);
            const ranges = handleFoldingRange(doc);

            expect(ranges).toHaveLength(1);
            expect(ranges[0].startLine).toBe(0);
            expect(ranges[0].endLine).toBe(3);
        });

        it('should fold component instance', () => {
            const doc = createDocument(`component WebServer api {
    name = "payments"
    replicas = 3
}`);
            const ranges = handleFoldingRange(doc);

            expect(ranges).toHaveLength(1);
            expect(ranges[0].startLine).toBe(0);
            expect(ranges[0].endLine).toBe(3);
        });
    });

    describe('Resource blocks', () => {
        it('should fold resource block', () => {
            const doc = createDocument(`resource ServerConfig webServer {
    host = "localhost"
    port = 8080
}`);
            const ranges = handleFoldingRange(doc);

            expect(ranges).toHaveLength(1);
            expect(ranges[0].startLine).toBe(0);
            expect(ranges[0].endLine).toBe(3);
        });
    });

    describe('Function blocks', () => {
        it('should fold function block', () => {
            const doc = createDocument(`fun calculate(number x) number {
    var result = x * 2
    return result
}`);
            const ranges = handleFoldingRange(doc);

            expect(ranges).toHaveLength(1);
            expect(ranges[0].startLine).toBe(0);
            expect(ranges[0].endLine).toBe(3);
        });

        it('should fold function without return type', () => {
            const doc = createDocument(`fun doSomething() {
    var x = 1
}`);
            const ranges = handleFoldingRange(doc);

            expect(ranges).toHaveLength(1);
            expect(ranges[0].startLine).toBe(0);
            expect(ranges[0].endLine).toBe(2);
        });
    });

    describe('Control flow blocks', () => {
        it('should fold if block', () => {
            const doc = createDocument(`if condition {
    var x = 1
}`);
            const ranges = handleFoldingRange(doc);

            expect(ranges).toHaveLength(1);
            expect(ranges[0].startLine).toBe(0);
            expect(ranges[0].endLine).toBe(2);
        });

        it('should fold if-else blocks', () => {
            const doc = createDocument(`if condition {
    var x = 1
} else {
    var x = 2
}`);
            const ranges = handleFoldingRange(doc);

            expect(ranges).toHaveLength(2);
            // if block
            expect(ranges[0].startLine).toBe(0);
            expect(ranges[0].endLine).toBe(2);
            // else block
            expect(ranges[1].startLine).toBe(2);
            expect(ranges[1].endLine).toBe(4);
        });

        it('should fold for loop', () => {
            const doc = createDocument(`for item in items {
    process(item)
}`);
            const ranges = handleFoldingRange(doc);

            expect(ranges).toHaveLength(1);
            expect(ranges[0].startLine).toBe(0);
            expect(ranges[0].endLine).toBe(2);
        });

        it('should fold while loop', () => {
            const doc = createDocument(`while running {
    tick()
}`);
            const ranges = handleFoldingRange(doc);

            expect(ranges).toHaveLength(1);
            expect(ranges[0].startLine).toBe(0);
            expect(ranges[0].endLine).toBe(2);
        });
    });

    describe('Import groups', () => {
        it('should fold consecutive imports', () => {
            const doc = createDocument(`import Config from "config.kite"
import Database from "db.kite"
import Server from "server.kite"

schema App {}`);
            const ranges = handleFoldingRange(doc);

            const importRange = ranges.find(r => r.kind === FoldingRangeKind.Imports);
            expect(importRange).toBeDefined();
            expect(importRange?.startLine).toBe(0);
            expect(importRange?.endLine).toBe(2);
        });

        it('should not fold single import', () => {
            const doc = createDocument(`import Config from "config.kite"

schema App {}`);
            const ranges = handleFoldingRange(doc);

            const importRange = ranges.find(r => r.kind === FoldingRangeKind.Imports);
            expect(importRange).toBeUndefined();
        });
    });

    describe('Comments', () => {
        it('should fold multi-line comment', () => {
            const doc = createDocument(`/*
 * This is a multi-line comment
 * with multiple lines
 */
schema Config {}`);
            const ranges = handleFoldingRange(doc);

            const commentRange = ranges.find(r => r.kind === FoldingRangeKind.Comment);
            expect(commentRange).toBeDefined();
            expect(commentRange?.startLine).toBe(0);
            expect(commentRange?.endLine).toBe(3);
        });

        it('should fold doc comment on same line start', () => {
            const doc = createDocument(`/* Documentation
   for the schema
   below */
schema Config {}`);
            const ranges = handleFoldingRange(doc);

            const commentRange = ranges.find(r => r.kind === FoldingRangeKind.Comment);
            expect(commentRange).toBeDefined();
            expect(commentRange?.startLine).toBe(0);
            expect(commentRange?.endLine).toBe(2);
        });
    });

    describe('Nested blocks', () => {
        it('should fold nested function inside component', () => {
            const doc = createDocument(`component Server {
    fun init() {
        var x = 1
    }
}`);
            const ranges = handleFoldingRange(doc);

            expect(ranges).toHaveLength(2);
            // Inner function
            const innerFunc = ranges.find(r => r.startLine === 1);
            expect(innerFunc).toBeDefined();
            expect(innerFunc?.endLine).toBe(3);
            // Outer component
            const outerComp = ranges.find(r => r.startLine === 0);
            expect(outerComp).toBeDefined();
            expect(outerComp?.endLine).toBe(4);
        });

        it('should fold nested if inside function', () => {
            const doc = createDocument(`fun process() {
    if condition {
        return 1
    }
    return 0
}`);
            const ranges = handleFoldingRange(doc);

            expect(ranges).toHaveLength(2);
            // Inner if
            const innerIf = ranges.find(r => r.startLine === 1);
            expect(innerIf).toBeDefined();
            expect(innerIf?.endLine).toBe(3);
            // Outer function
            const outerFunc = ranges.find(r => r.startLine === 0);
            expect(outerFunc).toBeDefined();
            expect(outerFunc?.endLine).toBe(5);
        });
    });

    describe('Object literals', () => {
        it('should fold object literal in variable', () => {
            const doc = createDocument(`var config = {
    host: "localhost",
    port: 8080
}`);
            const ranges = handleFoldingRange(doc);

            expect(ranges).toHaveLength(1);
            expect(ranges[0].startLine).toBe(0);
            expect(ranges[0].endLine).toBe(3);
        });

        it('should fold array with objects', () => {
            const doc = createDocument(`var items = [
    { name: "a" },
    { name: "b" }
]`);
            const ranges = handleFoldingRange(doc);

            // Should fold the array
            const arrayRange = ranges.find(r => r.startLine === 0);
            expect(arrayRange).toBeDefined();
            expect(arrayRange?.endLine).toBe(3);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty document', () => {
            const doc = createDocument('');
            const ranges = handleFoldingRange(doc);
            expect(ranges).toEqual([]);
        });

        it('should handle document with no blocks', () => {
            const doc = createDocument(`var x = 1
var y = 2`);
            const ranges = handleFoldingRange(doc);
            expect(ranges).toEqual([]);
        });

        it('should handle single-line block (no fold)', () => {
            const doc = createDocument('schema Empty {}');
            const ranges = handleFoldingRange(doc);
            expect(ranges).toEqual([]);
        });

        it('should handle decorator before block', () => {
            const doc = createDocument(`@description("A config schema")
schema Config {
    string name
}`);
            const ranges = handleFoldingRange(doc);

            // Should fold from schema line, not decorator
            expect(ranges).toHaveLength(1);
            expect(ranges[0].startLine).toBe(1);
            expect(ranges[0].endLine).toBe(3);
        });
    });
});
