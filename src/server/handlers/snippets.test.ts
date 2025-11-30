/**
 * Tests for snippet completions.
 */

import { describe, it, expect } from 'vitest';
import { CompletionItemKind, InsertTextFormat } from 'vscode-languageserver/node';
import { SNIPPETS, getSnippetCompletions, getSnippetByPrefix } from './snippets';

describe('SNIPPETS', () => {
    it('should have all required snippet properties', () => {
        for (const snippet of SNIPPETS) {
            expect(snippet.label).toBeDefined();
            expect(snippet.prefix).toBeDefined();
            expect(snippet.body).toBeDefined();
            expect(snippet.description).toBeDefined();
            expect(snippet.detail).toBeDefined();
            expect(typeof snippet.sortOrder).toBe('number');
        }
    });

    it('should have unique prefixes', () => {
        const prefixes = SNIPPETS.map(s => s.prefix);
        const uniquePrefixes = new Set(prefixes);
        expect(uniquePrefixes.size).toBe(prefixes.length);
    });

    it('should have valid snippet body syntax', () => {
        for (const snippet of SNIPPETS) {
            // Check for balanced ${ } placeholders
            const openCount = (snippet.body.match(/\$\{/g) || []).length;
            const closeCount = (snippet.body.match(/\}/g) || []).length;
            expect(closeCount).toBeGreaterThanOrEqual(openCount);
        }
    });

    it('should contain essential snippets', () => {
        const prefixes = SNIPPETS.map(s => s.prefix);
        expect(prefixes).toContain('schema');
        expect(prefixes).toContain('component');
        expect(prefixes).toContain('resource');
        expect(prefixes).toContain('fun');
        expect(prefixes).toContain('import');
        expect(prefixes).toContain('if');
        expect(prefixes).toContain('for');
        expect(prefixes).toContain('var');
    });
});

describe('getSnippetCompletions', () => {
    it('should return completion items with snippet format', () => {
        const completions = getSnippetCompletions('top-level');

        expect(completions.length).toBeGreaterThan(0);
        for (const completion of completions) {
            expect(completion.kind).toBe(CompletionItemKind.Snippet);
            expect(completion.insertTextFormat).toBe(InsertTextFormat.Snippet);
        }
    });

    it('should filter by top-level context', () => {
        const completions = getSnippetCompletions('top-level');
        const labels = completions.map(c => c.label);

        expect(labels).toContain('schema');
        expect(labels).toContain('component');
        expect(labels).toContain('resource');
        expect(labels).toContain('function');
    });

    it('should filter by component-body context', () => {
        const completions = getSnippetCompletions('component-body');
        const labels = completions.map(c => c.label);

        expect(labels).toContain('input');
        expect(labels).toContain('output');
        // 'any' context snippets should also be included
        expect(labels).toContain('if');
        expect(labels).toContain('for');
        expect(labels).toContain('var');
    });

    it('should include any-context snippets in all contexts', () => {
        const topLevel = getSnippetCompletions('top-level');
        const componentBody = getSnippetCompletions('component-body');

        const topLabels = topLevel.map(c => c.label);
        const compLabels = componentBody.map(c => c.label);

        // Control flow snippets should be in both
        expect(topLabels).toContain('if');
        expect(compLabels).toContain('if');
        expect(topLabels).toContain('for');
        expect(compLabels).toContain('for');
    });

    it('should provide documentation for each snippet', () => {
        const completions = getSnippetCompletions('top-level');

        for (const completion of completions) {
            expect(completion.documentation).toBeDefined();
        }
    });

    it('should have sortText starting with 0 for priority', () => {
        const completions = getSnippetCompletions('top-level');

        for (const completion of completions) {
            expect(completion.sortText?.startsWith('0')).toBe(true);
        }
    });

    it('should have filterText for prefix matching', () => {
        const completions = getSnippetCompletions('top-level');
        const schemaSnippet = completions.find(c => c.label === 'schema');

        expect(schemaSnippet?.filterText).toBe('schema');
    });
});

describe('getSnippetByPrefix', () => {
    it('should find snippet by prefix', () => {
        const snippet = getSnippetByPrefix('schema');

        expect(snippet).toBeDefined();
        expect(snippet?.label).toBe('schema');
    });

    it('should return undefined for unknown prefix', () => {
        const snippet = getSnippetByPrefix('nonexistent');

        expect(snippet).toBeUndefined();
    });

    it('should find all snippets by their prefix', () => {
        for (const snippet of SNIPPETS) {
            const found = getSnippetByPrefix(snippet.prefix);
            expect(found).toBe(snippet);
        }
    });
});

describe('snippet content', () => {
    describe('schema snippet', () => {
        it('should have proper structure', () => {
            const snippet = getSnippetByPrefix('schema');

            expect(snippet?.body).toContain('schema ${1:Name}');
            expect(snippet?.body).toContain('{');
            expect(snippet?.body).toContain('}');
        });
    });

    describe('component snippet', () => {
        it('should include input and output', () => {
            const snippet = getSnippetByPrefix('component');

            expect(snippet?.body).toContain('input');
            expect(snippet?.body).toContain('output');
        });
    });

    describe('function snippet', () => {
        it('should include return statement', () => {
            const snippet = getSnippetByPrefix('fun');

            expect(snippet?.body).toContain('return');
        });
    });

    describe('import snippets', () => {
        it('should have wildcard import', () => {
            const snippet = getSnippetByPrefix('import');

            expect(snippet?.body).toContain('import *');
            expect(snippet?.body).toContain('.kite');
        });

        it('should have named import', () => {
            const snippet = getSnippetByPrefix('importn');

            expect(snippet?.body).toContain('import ${1:Symbol}');
        });
    });

    describe('control flow snippets', () => {
        it('should have proper if structure', () => {
            const snippet = getSnippetByPrefix('if');

            expect(snippet?.body).toContain('if (${1:condition})');
            expect(snippet?.body).toContain('{');
        });

        it('should have proper for structure', () => {
            const snippet = getSnippetByPrefix('for');

            expect(snippet?.body).toContain('for (${1:item} in ${2:items})');
        });
    });
});
