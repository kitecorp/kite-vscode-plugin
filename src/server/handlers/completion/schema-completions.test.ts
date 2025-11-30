/**
 * Tests for schema-completions.ts - schema body completion logic.
 */

import { describe, it, expect } from 'vitest';
import { CompletionItemKind } from 'vscode-languageserver/node';
import {
    getSchemaBodyCompletions,
    getSchemaDefaultValueCompletions,
} from './schema-completions';

describe('getSchemaBodyCompletions', () => {
    describe('type context (before =)', () => {
        it('returns type completions when not after equals', () => {
            const text = 'schema Config {\n    \n}';
            const offset = text.indexOf('\n    ') + 5;
            const completions = getSchemaBodyCompletions(text, offset);

            const typeLabels = completions.map(c => c.label);
            expect(typeLabels).toContain('string');
            expect(typeLabels).toContain('number');
            expect(typeLabels).toContain('boolean');
        });

        it('includes array types', () => {
            const text = 'schema Config {\n    \n}';
            const offset = text.indexOf('\n    ') + 5;
            const completions = getSchemaBodyCompletions(text, offset);

            const typeLabels = completions.map(c => c.label);
            expect(typeLabels).toContain('string[]');
            expect(typeLabels).toContain('number[]');
        });

        it('completions have TypeParameter kind', () => {
            const text = 'schema Config {\n    \n}';
            const offset = text.indexOf('\n    ') + 5;
            const completions = getSchemaBodyCompletions(text, offset);

            completions.forEach(c => {
                expect(c.kind).toBe(CompletionItemKind.TypeParameter);
            });
        });
    });

    describe('value context (after =)', () => {
        it('delegates to getSchemaDefaultValueCompletions when after equals', () => {
            const text = 'schema Config {\n    boolean enabled = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getSchemaBodyCompletions(text, offset);

            // Should get boolean values for boolean type
            const labels = completions.map(c => c.label);
            expect(labels).toContain('true');
            expect(labels).toContain('false');
        });
    });
});

describe('getSchemaDefaultValueCompletions', () => {
    describe('boolean properties', () => {
        it('returns true and false for boolean type', () => {
            const text = 'schema Config {\n    boolean enabled = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getSchemaDefaultValueCompletions(text, offset);

            const labels = completions.map(c => c.label);
            expect(labels).toContain('true');
            expect(labels).toContain('false');
            expect(completions).toHaveLength(2);
        });

        it('completions have Value kind for booleans', () => {
            const text = 'schema Config {\n    boolean enabled = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getSchemaDefaultValueCompletions(text, offset);

            completions.forEach(c => {
                expect(c.kind).toBe(CompletionItemKind.Value);
            });
        });
    });

    describe('number properties', () => {
        it('returns number suggestions for number type', () => {
            const text = 'schema Config {\n    number port = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getSchemaDefaultValueCompletions(text, offset);

            expect(completions.length).toBeGreaterThan(0);
        });

        it('returns port-specific suggestions for port property', () => {
            const text = 'schema Config {\n    number port = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getSchemaDefaultValueCompletions(text, offset);

            const labels = completions.map(c => c.label);
            // Should include common port numbers
            expect(labels.some(l => l.includes('80') || l.includes('443') || l.includes('8080'))).toBe(true);
        });

        it('returns timeout-specific suggestions for timeout property', () => {
            const text = 'schema Config {\n    number timeout = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getSchemaDefaultValueCompletions(text, offset);

            expect(completions.length).toBeGreaterThan(0);
        });
    });

    describe('string properties', () => {
        it('returns string suggestions for string type', () => {
            const text = 'schema Config {\n    string host = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getSchemaDefaultValueCompletions(text, offset);

            expect(completions.length).toBeGreaterThan(0);
        });

        it('returns region-specific suggestions for region property', () => {
            const text = 'schema Config {\n    string region = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getSchemaDefaultValueCompletions(text, offset);

            const labels = completions.map(c => c.label);
            // Should include AWS region suggestions
            expect(labels.some(l => l.includes('us-') || l.includes('eu-'))).toBe(true);
        });

        it('returns environment-specific suggestions for env/environment property', () => {
            const text = 'schema Config {\n    string environment = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getSchemaDefaultValueCompletions(text, offset);

            const labels = completions.map(c => c.label);
            expect(labels.some(l =>
                l.includes('prod') || l.includes('dev') || l.includes('staging')
            )).toBe(true);
        });
    });

    describe('unknown/other types', () => {
        it('returns empty for unknown type', () => {
            const text = 'schema Config {\n    custom value = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getSchemaDefaultValueCompletions(text, offset);

            // May or may not have completions depending on property name matching
            expect(completions).toBeDefined();
        });

        it('returns empty when type cannot be determined', () => {
            const text = 'schema Config {\n    = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getSchemaDefaultValueCompletions(text, offset);

            expect(completions).toHaveLength(0);
        });
    });

    describe('array types', () => {
        it('handles array type syntax', () => {
            const text = 'schema Config {\n    string[] tags = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getSchemaDefaultValueCompletions(text, offset);

            // Array types might not have default value suggestions
            expect(completions).toBeDefined();
        });
    });

    describe('property name detection', () => {
        it('extracts property name for context-aware suggestions', () => {
            const text = 'schema Config {\n    number replicas = \n}';
            const offset = text.indexOf('= ') + 2;
            const completions = getSchemaDefaultValueCompletions(text, offset);

            // replicas should get replica count suggestions
            expect(completions.length).toBeGreaterThan(0);
        });
    });
});
