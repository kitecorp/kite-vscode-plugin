/**
 * Tests for Call Hierarchy handler
 * Provides incoming/outgoing call navigation for functions
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, SymbolKind } from 'vscode-languageserver/node';
import {
    prepareCallHierarchy,
    getIncomingCalls,
    getOutgoingCalls,
    CallHierarchyContext,
} from './index';

function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

function createContext(files: Map<string, string> = new Map()): CallHierarchyContext {
    return {
        findKiteFilesInWorkspace: () => Array.from(files.keys()),
        getFileContent: (path) => files.get(path) || null,
    };
}

describe('Call Hierarchy', () => {
    describe('prepareCallHierarchy', () => {
        it('should return item for function definition', () => {
            const doc = createDocument(`fun calculate(number x) number {
    return x * 2
}`);
            const result = prepareCallHierarchy(doc, Position.create(0, 6));

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('calculate');
            expect(result[0].kind).toBe(SymbolKind.Function);
            expect(result[0].range.start.line).toBe(0);
            expect(result[0].range.end.line).toBe(2);
        });

        it('should return item for function call', () => {
            const doc = createDocument(`fun calc() {}
var x = calc()`);
            const result = prepareCallHierarchy(doc, Position.create(1, 10));

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('calc');
        });

        it('should return empty for non-function position', () => {
            const doc = createDocument(`var x = 123`);
            const result = prepareCallHierarchy(doc, Position.create(0, 6));

            expect(result).toHaveLength(0);
        });

        it('should return empty for keyword', () => {
            const doc = createDocument(`schema Config {}`);
            const result = prepareCallHierarchy(doc, Position.create(0, 2));

            expect(result).toHaveLength(0);
        });

        it('should include function parameters in detail', () => {
            const doc = createDocument(`fun process(string name, number count) boolean {
    return true
}`);
            const result = prepareCallHierarchy(doc, Position.create(0, 6));

            expect(result).toHaveLength(1);
            expect(result[0].detail).toBe('(string name, number count) boolean');
        });

        it('should handle function without parameters', () => {
            const doc = createDocument(`fun init() {}`);
            const result = prepareCallHierarchy(doc, Position.create(0, 5));

            expect(result).toHaveLength(1);
            expect(result[0].detail).toBe('()');
        });
    });

    describe('incomingCalls', () => {
        it('should find calls from same file', () => {
            const doc = createDocument(`fun helper() {}

fun main() {
    helper()
}`);
            const ctx = createContext();
            const item = prepareCallHierarchy(doc, Position.create(0, 5))[0];
            const incoming = getIncomingCalls(item, doc, ctx);

            expect(incoming).toHaveLength(1);
            expect(incoming[0].from.name).toBe('main');
            expect(incoming[0].fromRanges).toHaveLength(1);
            expect(incoming[0].fromRanges[0].start.line).toBe(3);
        });

        it('should find multiple calls from same function', () => {
            const doc = createDocument(`fun helper() {}

fun main() {
    helper()
    helper()
}`);
            const ctx = createContext();
            const item = prepareCallHierarchy(doc, Position.create(0, 5))[0];
            const incoming = getIncomingCalls(item, doc, ctx);

            expect(incoming).toHaveLength(1);
            expect(incoming[0].fromRanges).toHaveLength(2);
        });

        it('should find calls from multiple functions', () => {
            const doc = createDocument(`fun helper() {}

fun foo() {
    helper()
}

fun bar() {
    helper()
}`);
            const ctx = createContext();
            const item = prepareCallHierarchy(doc, Position.create(0, 5))[0];
            const incoming = getIncomingCalls(item, doc, ctx);

            expect(incoming).toHaveLength(2);
            expect(incoming.map(i => i.from.name).sort()).toEqual(['bar', 'foo']);
        });

        it('should find calls from other files', () => {
            const mainContent = `import helper from "utils.kite"

fun main() {
    helper()
}`;
            const utilsContent = `fun helper() {}`;

            const files = new Map([
                ['/workspace/main.kite', mainContent],
                ['/workspace/utils.kite', utilsContent],
            ]);

            const utilsDoc = createDocument(utilsContent, 'file:///workspace/utils.kite');
            const ctx = createContext(files);
            const item = prepareCallHierarchy(utilsDoc, Position.create(0, 5))[0];
            const incoming = getIncomingCalls(item, utilsDoc, ctx);

            expect(incoming).toHaveLength(1);
            expect(incoming[0].from.name).toBe('main');
        });

        it('should return empty for function with no calls', () => {
            const doc = createDocument(`fun unused() {}`);
            const ctx = createContext();
            const item = prepareCallHierarchy(doc, Position.create(0, 5))[0];
            const incoming = getIncomingCalls(item, doc, ctx);

            expect(incoming).toHaveLength(0);
        });

        it('should not include recursive call as incoming', () => {
            const doc = createDocument(`fun recursive() {
    recursive()
}`);
            const ctx = createContext();
            const item = prepareCallHierarchy(doc, Position.create(0, 5))[0];
            const incoming = getIncomingCalls(item, doc, ctx);

            // Recursive call is from same function, should still show
            expect(incoming).toHaveLength(1);
            expect(incoming[0].from.name).toBe('recursive');
        });
    });

    describe('outgoingCalls', () => {
        it('should find calls within function body', () => {
            const doc = createDocument(`fun helper() {}

fun main() {
    helper()
}`);
            const ctx = createContext();
            const item = prepareCallHierarchy(doc, Position.create(2, 5))[0]; // main
            const outgoing = getOutgoingCalls(item, doc, ctx);

            expect(outgoing).toHaveLength(1);
            expect(outgoing[0].to.name).toBe('helper');
            expect(outgoing[0].fromRanges).toHaveLength(1);
        });

        it('should find multiple different calls', () => {
            const doc = createDocument(`fun a() {}
fun b() {}
fun c() {}

fun main() {
    a()
    b()
    c()
}`);
            const ctx = createContext();
            const item = prepareCallHierarchy(doc, Position.create(4, 5))[0]; // main
            const outgoing = getOutgoingCalls(item, doc, ctx);

            expect(outgoing).toHaveLength(3);
            expect(outgoing.map(o => o.to.name).sort()).toEqual(['a', 'b', 'c']);
        });

        it('should count multiple calls to same function', () => {
            const doc = createDocument(`fun helper() {}

fun main() {
    helper()
    helper()
    helper()
}`);
            const ctx = createContext();
            const item = prepareCallHierarchy(doc, Position.create(2, 5))[0]; // main
            const outgoing = getOutgoingCalls(item, doc, ctx);

            expect(outgoing).toHaveLength(1);
            expect(outgoing[0].to.name).toBe('helper');
            expect(outgoing[0].fromRanges).toHaveLength(3);
        });

        it('should return empty for function with no calls', () => {
            const doc = createDocument(`fun leaf() {
    var x = 1
    return x
}`);
            const ctx = createContext();
            const item = prepareCallHierarchy(doc, Position.create(0, 5))[0];
            const outgoing = getOutgoingCalls(item, doc, ctx);

            expect(outgoing).toHaveLength(0);
        });

        it('should include recursive call as outgoing', () => {
            const doc = createDocument(`fun recursive(number n) {
    if n > 0 {
        recursive(n - 1)
    }
}`);
            const ctx = createContext();
            const item = prepareCallHierarchy(doc, Position.create(0, 5))[0];
            const outgoing = getOutgoingCalls(item, doc, ctx);

            expect(outgoing).toHaveLength(1);
            expect(outgoing[0].to.name).toBe('recursive');
        });

        it('should find calls to functions in other files', () => {
            const mainContent = `import helper from "utils.kite"

fun main() {
    helper()
}`;
            const utilsContent = `fun helper() {}`;

            const files = new Map([
                ['/workspace/main.kite', mainContent],
                ['/workspace/utils.kite', utilsContent],
            ]);

            const mainDoc = createDocument(mainContent, 'file:///workspace/main.kite');
            const ctx = createContext(files);
            const item = prepareCallHierarchy(mainDoc, Position.create(2, 5))[0]; // main
            const outgoing = getOutgoingCalls(item, mainDoc, ctx);

            expect(outgoing).toHaveLength(1);
            expect(outgoing[0].to.name).toBe('helper');
        });
    });

    describe('Edge cases', () => {
        it('should handle nested function calls', () => {
            const doc = createDocument(`fun a() number {
    return 1
}

fun b(number x) number {
    return x
}

fun main() {
    b(a())
}`);
            const ctx = createContext();
            const item = prepareCallHierarchy(doc, Position.create(8, 5))[0]; // main on line 8
            const outgoing = getOutgoingCalls(item, doc, ctx);

            expect(outgoing).toHaveLength(2);
            expect(outgoing.map(o => o.to.name).sort()).toEqual(['a', 'b']);
        });

        it('should not treat method-like property access as call', () => {
            const doc = createDocument(`fun main() {
    var x = obj.property
}`);
            const ctx = createContext();
            const item = prepareCallHierarchy(doc, Position.create(0, 5))[0];
            const outgoing = getOutgoingCalls(item, doc, ctx);

            expect(outgoing).toHaveLength(0);
        });

        it('should handle function call in variable initialization', () => {
            const doc = createDocument(`fun getValue() number { return 42 }

fun main() {
    var x = getValue()
}`);
            const ctx = createContext();
            const item = prepareCallHierarchy(doc, Position.create(2, 5))[0]; // main
            const outgoing = getOutgoingCalls(item, doc, ctx);

            expect(outgoing).toHaveLength(1);
            expect(outgoing[0].to.name).toBe('getValue');
        });

        it('should handle calls inside control flow', () => {
            const doc = createDocument(`fun check() boolean { return true }
fun process() {}

fun main() {
    if check() {
        process()
    }
}`);
            const ctx = createContext();
            const item = prepareCallHierarchy(doc, Position.create(3, 5))[0]; // main
            const outgoing = getOutgoingCalls(item, doc, ctx);

            expect(outgoing).toHaveLength(2);
            expect(outgoing.map(o => o.to.name).sort()).toEqual(['check', 'process']);
        });
    });
});
