/**
 * Tests for signature help handler.
 */

import { describe, it, expect } from 'vitest';
import { createDocument } from '../../test-utils';
import { Position, Range } from 'vscode-languageserver/node';
import { handleSignatureHelp, findFunctionCallAtPosition } from '.';
import { Declaration } from '../../types';


// Helper to create a function declaration
function createFunctionDecl(
    name: string,
    params: { type: string; name: string }[],
    returnType?: string
): Declaration {
    return {
        name,
        type: 'function',
        parameters: params,
        returnType,
        range: Range.create(0, 0, 0, 0),
        nameRange: Range.create(0, 0, 0, 0),
        uri: 'file:///test.kite',
    };
}

describe('findFunctionCallAtPosition', () => {
    it('should find function call at cursor inside parentheses', () => {
        const text = 'calculate(10, 20)';
        const result = findFunctionCallAtPosition(text, 10); // After '('

        expect(result).not.toBeNull();
        expect(result?.functionName).toBe('calculate');
        expect(result?.activeParameter).toBe(0);
    });

    it('should return correct active parameter after comma', () => {
        const text = 'calculate(10, 20)';
        const result = findFunctionCallAtPosition(text, 14); // After first comma

        expect(result).not.toBeNull();
        expect(result?.activeParameter).toBe(1);
    });

    it('should handle multiple commas', () => {
        const text = 'func(a, b, c, d)';
        const result = findFunctionCallAtPosition(text, 14); // After third comma

        expect(result).not.toBeNull();
        expect(result?.activeParameter).toBe(3);
    });

    it('should return null outside function call', () => {
        const text = 'var x = 10';
        const result = findFunctionCallAtPosition(text, 5);

        expect(result).toBeNull();
    });

    it('should return null for function declaration', () => {
        const text = 'fun calculate(number x) { }';
        const result = findFunctionCallAtPosition(text, 14); // Inside params

        expect(result).toBeNull();
    });

    it('should handle nested parentheses', () => {
        const text = 'outer(inner(1), 2)';
        const result = findFunctionCallAtPosition(text, 17); // After inner call

        expect(result).not.toBeNull();
        expect(result?.functionName).toBe('outer');
        expect(result?.activeParameter).toBe(1);
    });

    it('should handle whitespace before function name', () => {
        const text = '  calculate  (10)';
        const result = findFunctionCallAtPosition(text, 15);

        expect(result).not.toBeNull();
        expect(result?.functionName).toBe('calculate');
    });

    it('should return null after block boundary', () => {
        const text = '{ } calculate(10)';
        // Position inside the braces before calculate
        const result = findFunctionCallAtPosition(text, 2);

        expect(result).toBeNull();
    });

    it('should return null at statement boundary', () => {
        const text = 'x = 1; calculate(10)';
        const result = findFunctionCallAtPosition(text, 4); // Before semicolon

        expect(result).toBeNull();
    });
});

describe('handleSignatureHelp', () => {
    it('should return signature help for function call', () => {
        const doc = createDocument('calculate(10, 20)');
        const declarations = [
            createFunctionDecl('calculate', [
                { type: 'number', name: 'x' },
                { type: 'number', name: 'y' },
            ], 'number'),
        ];
        const result = handleSignatureHelp(doc, Position.create(0, 10), declarations);

        expect(result).not.toBeNull();
        expect(result?.signatures).toHaveLength(1);
        expect(result?.signatures[0].label).toBe('calculate(number x, number y): number');
        expect(result?.signatures[0].parameters).toHaveLength(2);
        expect(result?.activeParameter).toBe(0);
    });

    it('should return correct active parameter', () => {
        const doc = createDocument('calculate(10, 20)');
        const declarations = [
            createFunctionDecl('calculate', [
                { type: 'number', name: 'x' },
                { type: 'number', name: 'y' },
            ]),
        ];
        const result = handleSignatureHelp(doc, Position.create(0, 14), declarations);

        expect(result).not.toBeNull();
        expect(result?.activeParameter).toBe(1);
    });

    it('should return null for undefined function', () => {
        const doc = createDocument('unknownFunc(10)');
        const result = handleSignatureHelp(doc, Position.create(0, 12), []);

        expect(result).toBeNull();
    });

    it('should return null outside function call', () => {
        const doc = createDocument('var x = 10');
        const declarations = [
            createFunctionDecl('calculate', [{ type: 'number', name: 'x' }]),
        ];
        const result = handleSignatureHelp(doc, Position.create(0, 5), declarations);

        expect(result).toBeNull();
    });

    it('should include return type in signature', () => {
        const doc = createDocument('process(data)');
        const declarations = [
            createFunctionDecl('process', [{ type: 'string', name: 'data' }], 'boolean'),
        ];
        const result = handleSignatureHelp(doc, Position.create(0, 8), declarations);

        expect(result).not.toBeNull();
        expect(result?.signatures[0].label).toContain(': boolean');
    });

    it('should handle function with no parameters', () => {
        const doc = createDocument('getData()');
        const declarations = [createFunctionDecl('getData', [], 'any')];
        const result = handleSignatureHelp(doc, Position.create(0, 8), declarations);

        expect(result).not.toBeNull();
        expect(result?.signatures[0].label).toBe('getData(): any');
        expect(result?.signatures[0].parameters).toHaveLength(0);
    });

    it('should handle function with no return type', () => {
        const doc = createDocument('doSomething(x)');
        const declarations = [
            createFunctionDecl('doSomething', [{ type: 'any', name: 'x' }]),
        ];
        const result = handleSignatureHelp(doc, Position.create(0, 12), declarations);

        expect(result).not.toBeNull();
        expect(result?.signatures[0].label).toBe('doSomething(any x)');
    });

    it('should include documentation when available', () => {
        const doc = createDocument('calculate(10)');
        const declarations: Declaration[] = [{
            name: 'calculate',
            type: 'function',
            parameters: [{ type: 'number', name: 'x' }],
            documentation: 'Calculates a value',
            range: Range.create(0, 0, 0, 0),
            nameRange: Range.create(0, 0, 0, 0),
            uri: 'file:///test.kite',
        }];
        const result = handleSignatureHelp(doc, Position.create(0, 10), declarations);

        expect(result).not.toBeNull();
        expect(result?.signatures[0].documentation).toBe('Calculates a value');
    });
});
