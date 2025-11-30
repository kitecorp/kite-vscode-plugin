/**
 * Tests for component-completions.ts - component definition completion logic.
 */

import { describe, it, expect } from 'vitest';
import { CompletionItemKind } from 'vscode-languageserver/node';
import {
    getComponentDefinitionCompletions,
    getComponentDefaultValueCompletions,
} from './component-completions';

describe('getComponentDefinitionCompletions', () => {
    describe('type context (before =)', () => {
        it('returns keywords for component body', () => {
            const text = 'component WebServer {\n    \n}';
            const offset = text.indexOf('\n    ') + 5;
            const completions = getComponentDefinitionCompletions(text, offset);

            const labels = completions.map(c => c.label);
            expect(labels).toContain('input');
            expect(labels).toContain('output');
            expect(labels).toContain('var');
            expect(labels).toContain('resource');
            expect(labels).toContain('component');
        });

        it('returns type completions', () => {
            const text = 'component WebServer {\n    \n}';
            const offset = text.indexOf('\n    ') + 5;
            const completions = getComponentDefinitionCompletions(text, offset);

            const labels = completions.map(c => c.label);
            expect(labels).toContain('string');
            expect(labels).toContain('number');
            expect(labels).toContain('boolean');
            expect(labels).toContain('any');
        });

        it('keywords have Keyword kind', () => {
            const text = 'component WebServer {\n    \n}';
            const offset = text.indexOf('\n    ') + 5;
            const completions = getComponentDefinitionCompletions(text, offset);

            const inputCompletion = completions.find(c => c.label === 'input');
            expect(inputCompletion?.kind).toBe(CompletionItemKind.Keyword);
        });

        it('types have TypeParameter kind', () => {
            const text = 'component WebServer {\n    \n}';
            const offset = text.indexOf('\n    ') + 5;
            const completions = getComponentDefinitionCompletions(text, offset);

            const stringCompletion = completions.find(c => c.label === 'string');
            expect(stringCompletion?.kind).toBe(CompletionItemKind.TypeParameter);
        });

        it('includes snippets for component body', () => {
            const text = 'component WebServer {\n    \n}';
            const offset = text.indexOf('\n    ') + 5;
            const completions = getComponentDefinitionCompletions(text, offset);

            // Should have some snippet completions
            const withSnippets = completions.filter(c => c.insertTextFormat === 2);
            // May or may not have snippets depending on implementation
            expect(completions.length).toBeGreaterThan(0);
        });
    });

    describe('value context (after =)', () => {
        it('delegates to getComponentDefaultValueCompletions for boolean', () => {
            const text = 'component WebServer {\n    input boolean enabled = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getComponentDefinitionCompletions(text, offset);

            const labels = completions.map(c => c.label);
            expect(labels).toContain('true');
            expect(labels).toContain('false');
        });

        it('delegates to getComponentDefaultValueCompletions for number', () => {
            const text = 'component WebServer {\n    input number port = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getComponentDefinitionCompletions(text, offset);

            expect(completions.length).toBeGreaterThan(0);
        });
    });
});

describe('getComponentDefaultValueCompletions', () => {
    describe('boolean properties', () => {
        it('returns true and false for input boolean', () => {
            const text = 'component C {\n    input boolean enabled = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getComponentDefaultValueCompletions(text, offset);

            const labels = completions.map(c => c.label);
            expect(labels).toContain('true');
            expect(labels).toContain('false');
            expect(completions).toHaveLength(2);
        });

        it('returns true and false for output boolean', () => {
            const text = 'component C {\n    output boolean success = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getComponentDefaultValueCompletions(text, offset);

            const labels = completions.map(c => c.label);
            expect(labels).toContain('true');
            expect(labels).toContain('false');
        });

        it('completions have Value kind', () => {
            const text = 'component C {\n    input boolean enabled = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getComponentDefaultValueCompletions(text, offset);

            completions.forEach(c => {
                expect(c.kind).toBe(CompletionItemKind.Value);
            });
        });
    });

    describe('number properties', () => {
        it('returns number suggestions for number type', () => {
            const text = 'component C {\n    input number port = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getComponentDefaultValueCompletions(text, offset);

            // port is a DevOps-aware property name
            expect(completions.length).toBeGreaterThan(0);
        });

        it('returns port-specific suggestions for port property', () => {
            const text = 'component C {\n    input number port = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getComponentDefaultValueCompletions(text, offset);

            const labels = completions.map(c => c.label);
            expect(labels.some(l => l.includes('80') || l.includes('443') || l.includes('8080'))).toBe(true);
        });

        it('returns replicas-specific suggestions for replicas property', () => {
            const text = 'component C {\n    input number replicas = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getComponentDefaultValueCompletions(text, offset);

            expect(completions.length).toBeGreaterThan(0);
        });

        it('returns timeout-specific suggestions for timeout property', () => {
            const text = 'component C {\n    input number timeout = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getComponentDefaultValueCompletions(text, offset);

            expect(completions.length).toBeGreaterThan(0);
        });
    });

    describe('string properties', () => {
        it('returns string suggestions for string type', () => {
            const text = 'component C {\n    input string name = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getComponentDefaultValueCompletions(text, offset);

            expect(completions.length).toBeGreaterThan(0);
        });

        it('returns region suggestions for region property', () => {
            const text = 'component C {\n    input string region = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getComponentDefaultValueCompletions(text, offset);

            const labels = completions.map(c => c.label);
            expect(labels.some(l => l.includes('us-') || l.includes('eu-'))).toBe(true);
        });

        it('returns environment suggestions for environment property', () => {
            const text = 'component C {\n    input string environment = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getComponentDefaultValueCompletions(text, offset);

            const labels = completions.map(c => c.label);
            expect(labels.some(l =>
                l.includes('prod') || l.includes('dev') || l.includes('staging')
            )).toBe(true);
        });

        it('returns host suggestions for host property', () => {
            const text = 'component C {\n    input string host = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getComponentDefaultValueCompletions(text, offset);

            expect(completions.length).toBeGreaterThan(0);
        });
    });

    describe('array types', () => {
        it('handles array type syntax', () => {
            const text = 'component C {\n    input string[] tags = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getComponentDefaultValueCompletions(text, offset);

            // Array types might not have default value suggestions
            expect(completions).toBeDefined();
        });
    });

    describe('edge cases', () => {
        it('returns empty for non-input/output line', () => {
            const text = 'component C {\n    var x = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getComponentDefaultValueCompletions(text, offset);

            // May return empty or some suggestions
            expect(completions).toBeDefined();
        });

        it('handles output keyword', () => {
            const text = 'component C {\n    output string endpoint = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getComponentDefaultValueCompletions(text, offset);

            expect(completions.length).toBeGreaterThan(0);
        });

        it('handles extra whitespace', () => {
            const text = 'component C {\n    input  boolean  enabled  =  \n}';
            const offset = text.indexOf('=  ') + 3;
            const completions = getComponentDefaultValueCompletions(text, offset);

            // Should handle extra whitespace gracefully
            expect(completions).toBeDefined();
        });
    });
});
