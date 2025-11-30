/**
 * Tests for loop-scope.ts - loop variable scope detection.
 */

import { describe, it, expect } from 'vitest';
import { findLoopVariableScope } from './loop-scope';

describe('findLoopVariableScope', () => {
    describe('list comprehension', () => {
        it('finds scope when cursor is on loop variable declaration', () => {
            const text = '[for x in items: x * 2]';
            const cursorOffset = 5; // on 'x' in 'for x in'
            const scope = findLoopVariableScope(text, cursorOffset, 'x');
            expect(scope).not.toBeNull();
            expect(scope?.scopeStart).toBe(0);
            expect(scope?.scopeEnd).toBe(23);
        });

        it('finds scope when cursor is on loop variable usage', () => {
            const text = '[for x in items: x * 2]';
            const cursorOffset = 17; // on 'x' in 'x * 2'
            const scope = findLoopVariableScope(text, cursorOffset, 'x');
            expect(scope).not.toBeNull();
            expect(scope?.scopeStart).toBe(0);
        });

        it('returns null for non-loop variable', () => {
            const text = '[for x in items: x * 2]';
            const cursorOffset = 10; // on 'i' in 'items'
            const scope = findLoopVariableScope(text, cursorOffset, 'items');
            expect(scope).toBeNull();
        });

        it('returns null when cursor is outside scope', () => {
            const text = 'var y = 1\n[for x in items: x]';
            const cursorOffset = 4; // on 'y'
            const scope = findLoopVariableScope(text, cursorOffset, 'x');
            expect(scope).toBeNull();
        });

        it('handles nested brackets in list comprehension', () => {
            const text = '[for x in [1,2,3]: x]';
            const cursorOffset = 5; // on 'x'
            const scope = findLoopVariableScope(text, cursorOffset, 'x');
            expect(scope).not.toBeNull();
        });
    });

    describe('for-prefixed statements', () => {
        it('finds scope for for-prefixed resource', () => {
            const text = '[for env in envs] resource Config c { name = env }';
            const cursorOffset = 5; // on 'env' declaration
            const scope = findLoopVariableScope(text, cursorOffset, 'env');
            expect(scope).not.toBeNull();
            expect(scope?.scopeStart).toBe(0);
        });

        it('finds scope when cursor is on usage in resource body', () => {
            const text = '[for env in envs] resource Config c { name = env }';
            const cursorOffset = 45; // on 'env' in body
            const scope = findLoopVariableScope(text, cursorOffset, 'env');
            expect(scope).not.toBeNull();
        });

        it('finds scope for for-prefixed component', () => {
            const text = '[for i in items] component Server s { count = i }';
            const cursorOffset = 5; // on 'i'
            const scope = findLoopVariableScope(text, cursorOffset, 'i');
            expect(scope).not.toBeNull();
        });
    });

    describe('multiple loops', () => {
        it('finds correct scope for first loop variable', () => {
            const text = '[for x in a: x]\n[for y in b: y]';
            const cursorOffset = 5; // first 'x'
            const scope = findLoopVariableScope(text, cursorOffset, 'x');
            expect(scope).not.toBeNull();
            expect(scope?.scopeEnd).toBeLessThan(20);
        });

        it('finds correct scope for second loop variable', () => {
            const text = '[for x in a: x]\n[for y in b: y]';
            const cursorOffset = 21; // 'y' declaration
            const scope = findLoopVariableScope(text, cursorOffset, 'y');
            expect(scope).not.toBeNull();
            expect(scope?.scopeStart).toBeGreaterThan(10);
        });

        it('does not confuse variables with same name in different scopes', () => {
            const text = '[for x in a: x] + [for x in b: x]';
            const cursorOffset = 5; // first 'x'
            const scope = findLoopVariableScope(text, cursorOffset, 'x');
            expect(scope).not.toBeNull();
            expect(scope?.scopeEnd).toBeLessThan(20);
        });
    });

    describe('edge cases', () => {
        it('returns null for empty text', () => {
            const scope = findLoopVariableScope('', 0, 'x');
            expect(scope).toBeNull();
        });

        it('returns null for text without loops', () => {
            const text = 'var x = [1, 2, 3]';
            const scope = findLoopVariableScope(text, 4, 'x');
            expect(scope).toBeNull();
        });

        it('handles whitespace variations', () => {
            const text = '[  for   x   in   items  :  x  ]';
            const cursorOffset = 9; // on 'x'
            const scope = findLoopVariableScope(text, cursorOffset, 'x');
            expect(scope).not.toBeNull();
        });

        it('returns null for unclosed bracket', () => {
            const text = '[for x in items: x';
            const cursorOffset = 5;
            const scope = findLoopVariableScope(text, cursorOffset, 'x');
            expect(scope).toBeNull();
        });
    });
});
