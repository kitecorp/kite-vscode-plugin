/**
 * Tests for definition handler.
 */

import { describe, it, expect } from 'vitest';
import {
    findSchemaDefinition,
    findFunctionDefinition,
    findComponentDefinition,
} from './definition';

describe('findSchemaDefinition', () => {
    it('should find schema definition', () => {
        const text = `schema ServerConfig {
    string host
    number port
}`;
        const result = findSchemaDefinition(text, 'ServerConfig', 'file:///test.kite');

        expect(result).not.toBeNull();
        expect(result?.range.start.line).toBe(0);
        expect(result?.range.start.character).toBe(7); // After "schema "
    });

    it('should return null for non-existent schema', () => {
        const text = `schema Other { }`;
        const result = findSchemaDefinition(text, 'ServerConfig', 'file:///test.kite');

        expect(result).toBeNull();
    });

    it('should handle multiple schemas', () => {
        const text = `schema First { }
schema Second { }
schema Third { }`;

        const first = findSchemaDefinition(text, 'First', 'file:///test.kite');
        const second = findSchemaDefinition(text, 'Second', 'file:///test.kite');
        const third = findSchemaDefinition(text, 'Third', 'file:///test.kite');

        expect(first?.range.start.line).toBe(0);
        expect(second?.range.start.line).toBe(1);
        expect(third?.range.start.line).toBe(2);
    });

    it('should handle file path conversion', () => {
        const text = `schema Config { }`;
        const result = findSchemaDefinition(text, 'Config', '/path/to/file.kite');

        expect(result).not.toBeNull();
        expect(result?.uri).toContain('file:///');
    });
});

describe('findFunctionDefinition', () => {
    it('should find function definition', () => {
        const text = `fun calculate(number x, number y) number {
    return x + y
}`;
        const result = findFunctionDefinition(text, 'calculate', 'file:///test.kite');

        expect(result).not.toBeNull();
        expect(result?.range.start.line).toBe(0);
    });

    it('should return null for non-existent function', () => {
        const text = `fun other() { }`;
        const result = findFunctionDefinition(text, 'calculate', 'file:///test.kite');

        expect(result).toBeNull();
    });

    it('should handle multiple functions', () => {
        const text = `fun first() { }
fun second() { }
fun third() { }`;

        const first = findFunctionDefinition(text, 'first', 'file:///test.kite');
        const second = findFunctionDefinition(text, 'second', 'file:///test.kite');
        const third = findFunctionDefinition(text, 'third', 'file:///test.kite');

        expect(first?.range.start.line).toBe(0);
        expect(second?.range.start.line).toBe(1);
        expect(third?.range.start.line).toBe(2);
    });

    it('should find function with parameters', () => {
        const text = `fun process(string input, number count) string {
    return input
}`;
        const result = findFunctionDefinition(text, 'process', 'file:///test.kite');

        expect(result).not.toBeNull();
    });

    it('should find function with no return type', () => {
        const text = `fun doSomething() {
    println("done")
}`;
        const result = findFunctionDefinition(text, 'doSomething', 'file:///test.kite');

        expect(result).not.toBeNull();
    });
});

describe('findComponentDefinition', () => {
    it('should find component definition', () => {
        const text = `component WebServer {
    input string name
    output string endpoint
}`;
        const result = findComponentDefinition(text, 'WebServer', 'file:///test.kite');

        expect(result).not.toBeNull();
        expect(result?.range.start.line).toBe(0);
    });

    it('should return null for non-existent component', () => {
        const text = `component Other { }`;
        const result = findComponentDefinition(text, 'WebServer', 'file:///test.kite');

        expect(result).toBeNull();
    });

    it('should NOT find component instantiation (only definitions)', () => {
        const text = `component WebServer api {
    name = "api"
}`;
        // This is an instantiation, not a definition
        const result = findComponentDefinition(text, 'WebServer', 'file:///test.kite');

        expect(result).toBeNull();
    });

    it('should find definition when both definition and instantiation exist', () => {
        const text = `component WebServer {
    input string name
}

component WebServer api {
    name = "api"
}`;
        const result = findComponentDefinition(text, 'WebServer', 'file:///test.kite');

        expect(result).not.toBeNull();
        expect(result?.range.start.line).toBe(0); // Should find the definition, not instantiation
    });

    it('should handle multiple component definitions', () => {
        const text = `component First { }
component Second { }
component Third { }`;

        const first = findComponentDefinition(text, 'First', 'file:///test.kite');
        const second = findComponentDefinition(text, 'Second', 'file:///test.kite');
        const third = findComponentDefinition(text, 'Third', 'file:///test.kite');

        expect(first?.range.start.line).toBe(0);
        expect(second?.range.start.line).toBe(1);
        expect(third?.range.start.line).toBe(2);
    });
});

describe('definition edge cases', () => {
    it('should handle empty file', () => {
        const text = '';

        expect(findSchemaDefinition(text, 'Config', 'file:///test.kite')).toBeNull();
        expect(findFunctionDefinition(text, 'func', 'file:///test.kite')).toBeNull();
        expect(findComponentDefinition(text, 'Comp', 'file:///test.kite')).toBeNull();
    });

    it('should handle file with only comments', () => {
        const text = `// This is a comment
/* Multi-line
   comment */`;

        expect(findSchemaDefinition(text, 'Config', 'file:///test.kite')).toBeNull();
        expect(findFunctionDefinition(text, 'func', 'file:///test.kite')).toBeNull();
        expect(findComponentDefinition(text, 'Comp', 'file:///test.kite')).toBeNull();
    });

    it('should handle mixed declarations', () => {
        const text = `schema Config { }
fun process() { }
component Server { }`;

        expect(findSchemaDefinition(text, 'Config', 'file:///test.kite')).not.toBeNull();
        expect(findFunctionDefinition(text, 'process', 'file:///test.kite')).not.toBeNull();
        expect(findComponentDefinition(text, 'Server', 'file:///test.kite')).not.toBeNull();
    });
});
