/**
 * Tests for completion handler.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItemKind, Position, Range } from 'vscode-languageserver/node';
import { handleCompletion, CompletionContext, isAfterEquals, isInsideNestedStructure } from './completion';
import { Declaration, BlockContext } from '../types';

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
