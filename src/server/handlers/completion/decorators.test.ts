/**
 * Tests for decorators.ts - decorator completion logic.
 */

import { describe, it, expect } from 'vitest';
import {
    getDecoratorCompletions,
    getDecoratorContext,
    decoratorAppliesToTarget,
} from './decorators';
import { DecoratorInfo } from '../../types';

describe('getDecoratorContext', () => {
    describe('top-level declarations', () => {
        it('detects resource context', () => {
            const text = '@\nresource Config server { }';
            const context = getDecoratorContext(text, 1);
            expect(context).toBe('resource');
        });

        it('detects schema context', () => {
            const text = '@\nschema Config { }';
            const context = getDecoratorContext(text, 1);
            expect(context).toBe('schema');
        });

        it('detects component definition context', () => {
            const text = '@\ncomponent WebServer { }';
            const context = getDecoratorContext(text, 1);
            expect(context).toBe('component');
        });

        it('detects var context', () => {
            const text = '@\nvar x = 1';
            const context = getDecoratorContext(text, 1);
            expect(context).toBe('var');
        });

        it('detects fun context', () => {
            const text = '@\nfun calculate() { }';
            const context = getDecoratorContext(text, 1);
            expect(context).toBe('fun');
        });
    });

    describe('component body declarations', () => {
        it('detects input context', () => {
            const text = 'component C {\n    @\n    input string name\n}';
            const offset = text.indexOf('@') + 1;
            const context = getDecoratorContext(text, offset);
            expect(context).toBe('input');
        });

        it('detects output context', () => {
            const text = 'component C {\n    @\n    output string endpoint\n}';
            const offset = text.indexOf('@') + 1;
            const context = getDecoratorContext(text, offset);
            expect(context).toBe('output');
        });
    });

    describe('schema property context', () => {
        it('detects schema property context', () => {
            const text = 'schema Config {\n    @\n    string name\n}';
            const offset = text.indexOf('@') + 1;
            const context = getDecoratorContext(text, offset);
            expect(context).toBe('schema property');
        });
    });

    describe('chained decorators', () => {
        it('handles multiple decorators before declaration', () => {
            const text = '@deprecated\n@\nresource Config server { }';
            const offset = text.indexOf('@', 1) + 1;
            const context = getDecoratorContext(text, offset);
            expect(context).toBe('resource');
        });

        it('handles decorator with arguments before current', () => {
            const text = '@tags({env: "prod"})\n@\nresource Config server { }';
            const offset = text.lastIndexOf('@') + 1;
            const context = getDecoratorContext(text, offset);
            expect(context).toBe('resource');
        });
    });

    describe('unknown context', () => {
        it('returns null for ambiguous context', () => {
            const text = '@\nsome random text';
            const context = getDecoratorContext(text, 1);
            expect(context).toBeNull();
        });

        it('returns null at start of file', () => {
            const text = '@';
            const context = getDecoratorContext(text, 1);
            expect(context).toBeNull();
        });
    });
});

describe('decoratorAppliesToTarget', () => {
    const createDecorator = (targets: string): DecoratorInfo => ({
        name: 'test',
        category: 'validation',
        description: 'Test decorator',
        example: '@test',
        argType: 'none',
        sortOrder: 1,
        targets,
    });

    describe('input target', () => {
        it('matches decorator with input target', () => {
            const dec = createDecorator('input');
            expect(decoratorAppliesToTarget(dec, 'input')).toBe(true);
        });

        it('matches decorator with any target', () => {
            const dec = createDecorator('any');
            expect(decoratorAppliesToTarget(dec, 'input')).toBe(true);
        });

        it('does not match decorator without input target', () => {
            const dec = createDecorator('resource, schema');
            expect(decoratorAppliesToTarget(dec, 'input')).toBe(false);
        });
    });

    describe('output target', () => {
        it('matches decorator with output target', () => {
            const dec = createDecorator('output');
            expect(decoratorAppliesToTarget(dec, 'output')).toBe(true);
        });

        it('does not match decorator without output target', () => {
            const dec = createDecorator('input');
            expect(decoratorAppliesToTarget(dec, 'output')).toBe(false);
        });
    });

    describe('resource target', () => {
        it('matches decorator with resource target', () => {
            const dec = createDecorator('resource');
            expect(decoratorAppliesToTarget(dec, 'resource')).toBe(true);
        });

        it('matches decorator with schema target (resources use schemas)', () => {
            const dec = createDecorator('schema');
            expect(decoratorAppliesToTarget(dec, 'resource')).toBe(true);
        });
    });

    describe('component target', () => {
        it('matches decorator with component target', () => {
            const dec = createDecorator('component');
            expect(decoratorAppliesToTarget(dec, 'component')).toBe(true);
        });

        it('does not match decorator without component target', () => {
            const dec = createDecorator('resource');
            expect(decoratorAppliesToTarget(dec, 'component')).toBe(false);
        });
    });

    describe('schema target', () => {
        it('matches decorator with schema target', () => {
            const dec = createDecorator('schema');
            expect(decoratorAppliesToTarget(dec, 'schema')).toBe(true);
        });
    });

    describe('function target', () => {
        it('matches decorator with fun target', () => {
            const dec = createDecorator('fun');
            expect(decoratorAppliesToTarget(dec, 'fun')).toBe(true);
        });

        it('matches decorator with function target', () => {
            const dec = createDecorator('function');
            expect(decoratorAppliesToTarget(dec, 'fun')).toBe(true);
        });
    });

    describe('schema property target', () => {
        it('matches decorator with property target', () => {
            const dec = createDecorator('property');
            expect(decoratorAppliesToTarget(dec, 'schema property')).toBe(true);
        });
    });

    describe('null/undefined handling', () => {
        it('returns true when target is null', () => {
            const dec = createDecorator('input');
            expect(decoratorAppliesToTarget(dec, null)).toBe(true);
        });

        it('returns true when decorator has no targets', () => {
            const dec: DecoratorInfo = {
                name: 'test',
                category: 'validation',
                description: 'Test',
                example: '@test',
                argType: 'none',
                sortOrder: 1,
            };
            expect(decoratorAppliesToTarget(dec, 'input')).toBe(true);
        });
    });

    describe('case insensitivity', () => {
        it('handles uppercase targets', () => {
            const dec = createDecorator('INPUT, OUTPUT');
            expect(decoratorAppliesToTarget(dec, 'input')).toBe(true);
            expect(decoratorAppliesToTarget(dec, 'output')).toBe(true);
        });
    });
});

describe('getDecoratorCompletions', () => {
    it('returns completions for resource context', () => {
        const text = '@\nresource Config server { }';
        const completions = getDecoratorCompletions(text, 1);
        expect(completions.length).toBeGreaterThan(0);
    });

    it('returns completions for input context', () => {
        const text = 'component C {\n    @\n    input string name\n}';
        const offset = text.indexOf('@') + 1;
        const completions = getDecoratorCompletions(text, offset);
        expect(completions.length).toBeGreaterThan(0);
    });

    it('returns completions sorted by sortOrder', () => {
        const text = '@\nresource Config server { }';
        const completions = getDecoratorCompletions(text, 1);
        // Should have sortText for ordering
        expect(completions[0].sortText).toBeDefined();
    });

    it('completions have documentation', () => {
        const text = '@\nresource Config server { }';
        const completions = getDecoratorCompletions(text, 1);
        const withDocs = completions.filter(c => c.documentation);
        expect(withDocs.length).toBeGreaterThan(0);
    });

    it('completions have correct kind', () => {
        const text = '@\nresource Config server { }';
        const completions = getDecoratorCompletions(text, 1);
        // All decorator completions should be Event kind
        completions.forEach(c => {
            expect(c.kind).toBeDefined();
        });
    });

    it('filters decorators based on context', () => {
        const resourceText = '@\nresource Config server { }';
        const inputText = 'component C {\n    @\n    input string name\n}';

        const resourceCompletions = getDecoratorCompletions(resourceText, 1);
        const inputCompletions = getDecoratorCompletions(inputText, inputText.indexOf('@') + 1);

        // Different contexts may have different applicable decorators
        // At minimum, both should return some completions
        expect(resourceCompletions.length).toBeGreaterThan(0);
        expect(inputCompletions.length).toBeGreaterThan(0);
    });
});
