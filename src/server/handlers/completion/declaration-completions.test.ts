/**
 * Tests for declaration-completions.ts - keyword, type, and declaration completion logic.
 */

import { describe, it, expect } from 'vitest';
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    addKeywordCompletions,
    addTypeCompletions,
    addDeclarationCompletions,
} from './declaration-completions';
import { KEYWORDS, TYPES } from '../../constants';
import { BlockContext, Declaration } from '../../types';
import { CompletionContext } from './types';

function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

function createMockContext(declarations: Declaration[] = []): CompletionContext {
    return {
        getDeclarations: () => declarations,
        findKiteFilesInWorkspace: () => [],
        getFileContent: () => null,
        findEnclosingBlock: () => null,
    };
}

describe('addKeywordCompletions', () => {
    it('adds all keywords from KEYWORDS constant', () => {
        const completions: CompletionItem[] = [];
        addKeywordCompletions(completions);

        const labels = completions.map(c => c.label);
        KEYWORDS.forEach(kw => {
            expect(labels).toContain(kw);
        });
    });

    it('adds completions with Keyword kind', () => {
        const completions: CompletionItem[] = [];
        addKeywordCompletions(completions);

        completions.forEach(c => {
            expect(c.kind).toBe(CompletionItemKind.Keyword);
        });
    });

    it('adds completions with "keyword" detail', () => {
        const completions: CompletionItem[] = [];
        addKeywordCompletions(completions);

        completions.forEach(c => {
            expect(c.detail).toBe('keyword');
        });
    });

    it('adds completions with sortText starting with "9"', () => {
        const completions: CompletionItem[] = [];
        addKeywordCompletions(completions);

        completions.forEach(c => {
            expect(c.sortText).toMatch(/^9/);
        });
    });

    it('includes IaC keywords', () => {
        const completions: CompletionItem[] = [];
        addKeywordCompletions(completions);

        const labels = completions.map(c => c.label);
        expect(labels).toContain('resource');
        expect(labels).toContain('component');
        expect(labels).toContain('schema');
        expect(labels).toContain('input');
        expect(labels).toContain('output');
    });

    it('includes control flow keywords', () => {
        const completions: CompletionItem[] = [];
        addKeywordCompletions(completions);

        const labels = completions.map(c => c.label);
        expect(labels).toContain('if');
        expect(labels).toContain('else');
        expect(labels).toContain('while');
        expect(labels).toContain('for');
        expect(labels).toContain('return');
    });

    it('includes literal keywords', () => {
        const completions: CompletionItem[] = [];
        addKeywordCompletions(completions);

        const labels = completions.map(c => c.label);
        expect(labels).toContain('true');
        expect(labels).toContain('false');
        expect(labels).toContain('null');
    });
});

describe('addTypeCompletions', () => {
    it('adds all basic types from TYPES constant', () => {
        const completions: CompletionItem[] = [];
        addTypeCompletions(completions);

        const labels = completions.map(c => c.label);
        TYPES.forEach(t => {
            expect(labels).toContain(t);
        });
    });

    it('adds array versions of all types', () => {
        const completions: CompletionItem[] = [];
        addTypeCompletions(completions);

        const labels = completions.map(c => c.label);
        TYPES.forEach(t => {
            expect(labels).toContain(t + '[]');
        });
    });

    it('adds completions with TypeParameter kind', () => {
        const completions: CompletionItem[] = [];
        addTypeCompletions(completions);

        completions.forEach(c => {
            expect(c.kind).toBe(CompletionItemKind.TypeParameter);
        });
    });

    it('adds "type" detail for basic types', () => {
        const completions: CompletionItem[] = [];
        addTypeCompletions(completions);

        const basicType = completions.find(c => c.label === 'string');
        expect(basicType?.detail).toBe('type');
    });

    it('adds "array type" detail for array types', () => {
        const completions: CompletionItem[] = [];
        addTypeCompletions(completions);

        const arrayType = completions.find(c => c.label === 'string[]');
        expect(arrayType?.detail).toBe('array type');
    });

    it('adds sortText starting with "8"', () => {
        const completions: CompletionItem[] = [];
        addTypeCompletions(completions);

        completions.forEach(c => {
            expect(c.sortText).toMatch(/^8/);
        });
    });

    it('includes primitive types', () => {
        const completions: CompletionItem[] = [];
        addTypeCompletions(completions);

        const labels = completions.map(c => c.label);
        expect(labels).toContain('string');
        expect(labels).toContain('number');
        expect(labels).toContain('boolean');
    });

    it('includes special types', () => {
        const completions: CompletionItem[] = [];
        addTypeCompletions(completions);

        const labels = completions.map(c => c.label);
        expect(labels).toContain('any');
        expect(labels).toContain('object');
        expect(labels).toContain('void');
    });
});

describe('addDeclarationCompletions', () => {
    describe('basic declaration completions', () => {
        it('adds declarations from context', () => {
            const declarations: Declaration[] = [
                {
                    name: 'myVar',
                    type: 'variable',
                    typeName: 'string',
                    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
                    nameRange: { start: { line: 0, character: 4 }, end: { line: 0, character: 9 } },
                    uri: 'file:///test.kite',
                },
            ];
            const completions: CompletionItem[] = [];
            const doc = createDocument('var myVar = "test"');
            const ctx = createMockContext(declarations);

            addDeclarationCompletions(completions, doc, 0, null, false, ctx);

            const labels = completions.map(c => c.label);
            expect(labels).toContain('myVar');
        });

        it('includes type information in detail', () => {
            const declarations: Declaration[] = [
                {
                    name: 'server',
                    type: 'resource',
                    typeName: 'ServerConfig',
                    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 20 } },
                    nameRange: { start: { line: 0, character: 8 }, end: { line: 0, character: 14 } },
                    uri: 'file:///test.kite',
                },
            ];
            const completions: CompletionItem[] = [];
            const doc = createDocument('resource ServerConfig server {}');
            const ctx = createMockContext(declarations);

            addDeclarationCompletions(completions, doc, 0, null, false, ctx);

            const serverCompletion = completions.find(c => c.label === 'server');
            expect(serverCompletion?.detail).toContain('resource');
            expect(serverCompletion?.detail).toContain('ServerConfig');
        });
    });

    describe('output filtering in enclosing block', () => {
        it('filters outputs from the same enclosing block', () => {
            const declarations: Declaration[] = [
                {
                    name: 'endpoint',
                    type: 'output',
                    typeName: 'string',
                    range: { start: { line: 1, character: 4 }, end: { line: 1, character: 25 } },
                    nameRange: { start: { line: 1, character: 18 }, end: { line: 1, character: 26 } },
                    uri: 'file:///test.kite',
                },
            ];
            const text = 'component C {\n    output string endpoint\n    var x = \n}';
            const completions: CompletionItem[] = [];
            const doc = createDocument(text);
            const ctx = createMockContext(declarations);
            const enclosingBlock: BlockContext = {
                name: 'C',
                type: 'component',
                typeName: 'C',
                start: 12,
                end: text.length - 1,
            };

            addDeclarationCompletions(completions, doc, text.indexOf('var x = ') + 8, enclosingBlock, false, ctx);

            const labels = completions.map(c => c.label);
            expect(labels).not.toContain('endpoint');
        });

        it('does not filter outputs from different blocks', () => {
            const declarations: Declaration[] = [
                {
                    name: 'otherEndpoint',
                    type: 'output',
                    typeName: 'string',
                    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 20 } },
                    nameRange: { start: { line: 0, character: 10 }, end: { line: 0, character: 23 } },
                    uri: 'file:///test.kite',
                },
            ];
            const text = 'component Other {\n    output string otherEndpoint\n}\ncomponent C {\n    var x = \n}';
            const completions: CompletionItem[] = [];
            const doc = createDocument(text);
            const ctx = createMockContext(declarations);
            const enclosingBlock: BlockContext = {
                name: 'C',
                type: 'component',
                typeName: 'C',
                start: text.indexOf('component C {') + 14,
                end: text.length - 1,
            };

            addDeclarationCompletions(completions, doc, text.indexOf('var x = ') + 8, enclosingBlock, false, ctx);

            const labels = completions.map(c => c.label);
            expect(labels).toContain('otherEndpoint');
        });
    });

    describe('scope filtering for variables', () => {
        it('filters out variables outside their scope', () => {
            const declarations: Declaration[] = [
                {
                    name: 'scopedVar',
                    type: 'variable',
                    typeName: 'string',
                    range: { start: { line: 1, character: 4 }, end: { line: 1, character: 20 } },
                    nameRange: { start: { line: 1, character: 8 }, end: { line: 1, character: 17 } },
                    uri: 'file:///test.kite',
                    scopeStart: 10,
                    scopeEnd: 50,
                },
            ];
            const text = 'var x = 1\nif true {\n    var scopedVar = "test"\n}\nvar y = ';
            const completions: CompletionItem[] = [];
            const doc = createDocument(text);
            const ctx = createMockContext(declarations);

            // Position outside the scope
            addDeclarationCompletions(completions, doc, text.length, null, false, ctx);

            const labels = completions.map(c => c.label);
            expect(labels).not.toContain('scopedVar');
        });

        it('includes variables inside their scope', () => {
            const declarations: Declaration[] = [
                {
                    name: 'scopedVar',
                    type: 'variable',
                    typeName: 'string',
                    range: { start: { line: 1, character: 4 }, end: { line: 1, character: 20 } },
                    nameRange: { start: { line: 1, character: 8 }, end: { line: 1, character: 17 } },
                    uri: 'file:///test.kite',
                    scopeStart: 10,
                    scopeEnd: 100,
                },
            ];
            const text = 'var x = 1\nif true {\n    var scopedVar = "test"\n    var y = \n}';
            const completions: CompletionItem[] = [];
            const doc = createDocument(text);
            const ctx = createMockContext(declarations);

            // Position inside the scope (offset 50 is within 10-100)
            addDeclarationCompletions(completions, doc, 50, null, false, ctx);

            const labels = completions.map(c => c.label);
            expect(labels).toContain('scopedVar');
        });

        it('filters out for-loop variables outside their scope', () => {
            const declarations: Declaration[] = [
                {
                    name: 'item',
                    type: 'for',
                    range: { start: { line: 0, character: 5 }, end: { line: 0, character: 9 } },
                    nameRange: { start: { line: 0, character: 5 }, end: { line: 0, character: 9 } },
                    uri: 'file:///test.kite',
                    scopeStart: 0,
                    scopeEnd: 30,
                },
            ];
            const text = '[for item in items: item * 2]\nvar x = ';
            const completions: CompletionItem[] = [];
            const doc = createDocument(text);
            const ctx = createMockContext(declarations);

            // Position outside the scope
            addDeclarationCompletions(completions, doc, text.length, null, false, ctx);

            const labels = completions.map(c => c.label);
            expect(labels).not.toContain('item');
        });
    });

    describe('value context priority', () => {
        it('uses priority ordering in value context', () => {
            const declarations: Declaration[] = [
                { name: 'myInput', type: 'input', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }, nameRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } }, uri: 'file:///test.kite' },
                { name: 'myVar', type: 'variable', range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } }, nameRange: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } }, uri: 'file:///test.kite' },
                { name: 'myResource', type: 'resource', range: { start: { line: 2, character: 0 }, end: { line: 2, character: 10 } }, nameRange: { start: { line: 2, character: 0 }, end: { line: 2, character: 10 } }, uri: 'file:///test.kite' },
                { name: 'myFunc', type: 'function', range: { start: { line: 3, character: 0 }, end: { line: 3, character: 10 } }, nameRange: { start: { line: 3, character: 0 }, end: { line: 3, character: 6 } }, uri: 'file:///test.kite' },
            ];
            const completions: CompletionItem[] = [];
            const doc = createDocument('');
            const ctx = createMockContext(declarations);

            addDeclarationCompletions(completions, doc, 0, null, true, ctx);

            const inputCompletion = completions.find(c => c.label === 'myInput');
            const varCompletion = completions.find(c => c.label === 'myVar');
            const resourceCompletion = completions.find(c => c.label === 'myResource');
            const funcCompletion = completions.find(c => c.label === 'myFunc');

            // input has priority 0, variable has 1, resource has 2, function has 5
            expect(inputCompletion?.sortText).toMatch(/^0/);
            expect(varCompletion?.sortText).toMatch(/^1/);
            expect(resourceCompletion?.sortText).toMatch(/^2/);
            expect(funcCompletion?.sortText).toMatch(/^5/);
        });

        it('does not add priority in non-value context', () => {
            const declarations: Declaration[] = [
                { name: 'myInput', type: 'input', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }, nameRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } }, uri: 'file:///test.kite' },
            ];
            const completions: CompletionItem[] = [];
            const doc = createDocument('');
            const ctx = createMockContext(declarations);

            addDeclarationCompletions(completions, doc, 0, null, false, ctx);

            const inputCompletion = completions.find(c => c.label === 'myInput');
            // sortText should be just the name without priority prefix
            expect(inputCompletion?.sortText).toBe('myInput');
        });
    });

    describe('completion kinds', () => {
        it('uses correct kind for variables', () => {
            const declarations: Declaration[] = [
                { name: 'myVar', type: 'variable', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }, nameRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, uri: 'file:///test.kite' },
            ];
            const completions: CompletionItem[] = [];
            const doc = createDocument('');
            const ctx = createMockContext(declarations);

            addDeclarationCompletions(completions, doc, 0, null, false, ctx);

            const varCompletion = completions.find(c => c.label === 'myVar');
            expect(varCompletion?.kind).toBe(CompletionItemKind.Variable);
        });

        it('uses correct kind for functions', () => {
            const declarations: Declaration[] = [
                { name: 'myFunc', type: 'function', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }, nameRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } }, uri: 'file:///test.kite' },
            ];
            const completions: CompletionItem[] = [];
            const doc = createDocument('');
            const ctx = createMockContext(declarations);

            addDeclarationCompletions(completions, doc, 0, null, false, ctx);

            const funcCompletion = completions.find(c => c.label === 'myFunc');
            expect(funcCompletion?.kind).toBe(CompletionItemKind.Function);
        });

        it('uses correct kind for resources', () => {
            const declarations: Declaration[] = [
                { name: 'myResource', type: 'resource', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }, nameRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }, uri: 'file:///test.kite' },
            ];
            const completions: CompletionItem[] = [];
            const doc = createDocument('');
            const ctx = createMockContext(declarations);

            addDeclarationCompletions(completions, doc, 0, null, false, ctx);

            const resourceCompletion = completions.find(c => c.label === 'myResource');
            expect(resourceCompletion?.kind).toBe(CompletionItemKind.Class);
        });
    });

    describe('edge cases', () => {
        it('handles empty declarations', () => {
            const completions: CompletionItem[] = [];
            const doc = createDocument('');
            const ctx = createMockContext([]);

            addDeclarationCompletions(completions, doc, 0, null, false, ctx);

            expect(completions).toHaveLength(0);
        });

        it('handles undefined declarations', () => {
            const completions: CompletionItem[] = [];
            const doc = createDocument('');
            const ctx = {
                getDeclarations: () => undefined,
                findKiteFilesInWorkspace: () => [],
                getFileContent: () => null,
                findEnclosingBlock: () => null,
            };

            addDeclarationCompletions(completions, doc, 0, null, false, ctx);

            expect(completions).toHaveLength(0);
        });
    });
});
