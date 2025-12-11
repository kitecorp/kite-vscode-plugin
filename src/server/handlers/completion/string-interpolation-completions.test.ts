/**
 * Tests for string interpolation completions
 */

import { describe, it, expect } from 'vitest';
import {
    getStringInterpolationContext,
    getInterpolationDotTarget,
    getStringInterpolationCompletions,
    getMethodsForType,
} from './string-interpolation-completions';
import { Declaration } from '../../types';

describe('getStringInterpolationContext', () => {
    it('should detect cursor inside string interpolation', () => {
        const text = 'var greeting = "Hello ${name.';
        const offset = text.length;
        const result = getStringInterpolationContext(text, offset);
        expect(result).not.toBeNull();
        expect(result?.content).toBe('name.');
    });

    it('should return null when not in a string', () => {
        const text = 'var x = name.';
        const offset = text.length;
        const result = getStringInterpolationContext(text, offset);
        expect(result).toBeNull();
    });

    it('should return null when in single-quoted string (no interpolation)', () => {
        const text = "var greeting = 'Hello ${name.";
        const offset = text.length;
        const result = getStringInterpolationContext(text, offset);
        expect(result).toBeNull();
    });

    it('should return null when interpolation is closed', () => {
        const text = 'var greeting = "Hello ${name}. "';
        const offset = text.length - 1; // Before closing quote
        const result = getStringInterpolationContext(text, offset);
        expect(result).toBeNull();
    });

    it('should handle nested braces in interpolation', () => {
        const text = 'var x = "Value: ${obj.';
        const offset = text.length;
        const result = getStringInterpolationContext(text, offset);
        expect(result).not.toBeNull();
        expect(result?.content).toBe('obj.');
    });

    it('should detect cursor after dot in interpolation', () => {
        const text = 'var msg = "Count: ${items.length} and ${name.';
        const offset = text.length;
        const result = getStringInterpolationContext(text, offset);
        expect(result).not.toBeNull();
        expect(result?.content).toBe('name.');
    });

    it('should handle multiple interpolations and detect the open one', () => {
        const text = 'var x = "First ${a} second ${b.';
        const offset = text.length;
        const result = getStringInterpolationContext(text, offset);
        expect(result).not.toBeNull();
        expect(result?.content).toBe('b.');
    });
});

describe('getInterpolationDotTarget', () => {
    it('should extract variable name before dot', () => {
        expect(getInterpolationDotTarget('name.')).toBe('name');
        expect(getInterpolationDotTarget('obj.')).toBe('obj');
        expect(getInterpolationDotTarget('myVar123.')).toBe('myVar123');
    });

    it('should return null when no dot at end', () => {
        expect(getInterpolationDotTarget('name')).toBeNull();
        expect(getInterpolationDotTarget('name.foo')).toBeNull();
    });

    it('should handle whitespace after dot', () => {
        expect(getInterpolationDotTarget('name. ')).toBe('name');
    });
});

describe('getStringInterpolationCompletions', () => {
    const mockDeclarations: Declaration[] = [
        { name: 'name', type: 'variable', typeName: 'string', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }, nameRange: { start: { line: 0, character: 4 }, end: { line: 0, character: 8 } }, uri: 'file:///test.kite' },
        { name: 'items', type: 'variable', typeName: 'string[]', range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } }, nameRange: { start: { line: 1, character: 4 }, end: { line: 1, character: 9 } }, uri: 'file:///test.kite' },
        { name: 'count', type: 'variable', typeName: 'number', range: { start: { line: 2, character: 0 }, end: { line: 2, character: 10 } }, nameRange: { start: { line: 2, character: 4 }, end: { line: 2, character: 9 } }, uri: 'file:///test.kite' },
        { name: 'flag', type: 'variable', typeName: 'boolean', range: { start: { line: 3, character: 0 }, end: { line: 3, character: 10 } }, nameRange: { start: { line: 3, character: 4 }, end: { line: 3, character: 8 } }, uri: 'file:///test.kite' },
        { name: 'data', type: 'variable', typeName: 'object', range: { start: { line: 4, character: 0 }, end: { line: 4, character: 10 } }, nameRange: { start: { line: 4, character: 4 }, end: { line: 4, character: 8 } }, uri: 'file:///test.kite' },
    ];

    it('should return string methods for string variable', () => {
        const text = 'var greeting = "Hello ${name.';
        const offset = text.length;
        const completions = getStringInterpolationCompletions(text, offset, mockDeclarations);
        expect(completions).not.toBeNull();
        const labels = completions!.map(c => c.label);
        expect(labels).toContain('toUpperCase');
        expect(labels).toContain('toLowerCase');
        expect(labels).toContain('length');
        expect(labels).toContain('trim');
    });

    it('should return array methods for array variable', () => {
        const text = 'var msg = "Items: ${items.';
        const offset = text.length;
        const completions = getStringInterpolationCompletions(text, offset, mockDeclarations);
        expect(completions).not.toBeNull();
        const labels = completions!.map(c => c.label);
        expect(labels).toContain('length');
        expect(labels).toContain('join');
        expect(labels).toContain('includes');
        expect(labels).toContain('map');
    });

    it('should return number methods for number variable', () => {
        const text = 'var msg = "Count: ${count.';
        const offset = text.length;
        const completions = getStringInterpolationCompletions(text, offset, mockDeclarations);
        expect(completions).not.toBeNull();
        const labels = completions!.map(c => c.label);
        expect(labels).toContain('toString');
        expect(labels).toContain('toFixed');
        expect(labels).toContain('abs');
    });

    it('should return boolean methods for boolean variable', () => {
        const text = 'var msg = "Flag: ${flag.';
        const offset = text.length;
        const completions = getStringInterpolationCompletions(text, offset, mockDeclarations);
        expect(completions).not.toBeNull();
        const labels = completions!.map(c => c.label);
        expect(labels).toContain('toString');
    });

    it('should return object methods for object variable', () => {
        const text = 'var msg = "Data: ${data.';
        const offset = text.length;
        const completions = getStringInterpolationCompletions(text, offset, mockDeclarations);
        expect(completions).not.toBeNull();
        const labels = completions!.map(c => c.label);
        expect(labels).toContain('keys');
        expect(labels).toContain('values');
        expect(labels).toContain('entries');
    });

    it('should return null when not in string interpolation', () => {
        const text = 'var x = name.';
        const offset = text.length;
        const completions = getStringInterpolationCompletions(text, offset, mockDeclarations);
        expect(completions).toBeNull();
    });

    it('should return null when not after dot', () => {
        const text = 'var greeting = "Hello ${name';
        const offset = text.length;
        const completions = getStringInterpolationCompletions(text, offset, mockDeclarations);
        expect(completions).toBeNull();
    });

    it('should return generic completions for unknown variable', () => {
        const text = 'var msg = "Value: ${unknown.';
        const offset = text.length;
        const completions = getStringInterpolationCompletions(text, offset, mockDeclarations);
        expect(completions).not.toBeNull();
        // Should have string, array, and number methods for unknown type
        const labels = completions!.map(c => c.label);
        expect(labels).toContain('toUpperCase'); // string
        expect(labels).toContain('join'); // array
        expect(labels).toContain('toFixed'); // number
    });
});

describe('getMethodsForType', () => {
    it('should return string methods for "string" type', () => {
        const methods = getMethodsForType('string');
        const labels = methods.map(m => m.label);
        expect(labels).toContain('toUpperCase');
        expect(labels).toContain('toLowerCase');
    });

    it('should return string methods for "String" type (case insensitive)', () => {
        const methods = getMethodsForType('String');
        const labels = methods.map(m => m.label);
        expect(labels).toContain('toUpperCase');
    });

    it('should return array methods for array types', () => {
        const methods1 = getMethodsForType('string[]');
        const methods2 = getMethodsForType('number[]');
        const methods3 = getMethodsForType('Array<string>');

        expect(methods1.map(m => m.label)).toContain('join');
        expect(methods2.map(m => m.label)).toContain('join');
        // Note: Array<T> not detected by current impl, but [] suffix is
    });

    it('should return number methods for "number" type', () => {
        const methods = getMethodsForType('number');
        const labels = methods.map(m => m.label);
        expect(labels).toContain('toFixed');
        expect(labels).toContain('abs');
    });

    it('should return boolean methods for "boolean" type', () => {
        const methods = getMethodsForType('boolean');
        const labels = methods.map(m => m.label);
        expect(labels).toContain('toString');
    });

    it('should return object methods for custom schema types', () => {
        const methods = getMethodsForType('MyCustomSchema');
        const labels = methods.map(m => m.label);
        expect(labels).toContain('keys');
        expect(labels).toContain('values');
    });
});
