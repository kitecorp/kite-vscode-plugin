/**
 * Tests for unused variables detection.
 */

import { describe, it, expect } from 'vitest';
import { createDocument } from '../../test-utils';
import { DiagnosticSeverity, DiagnosticTag } from 'vscode-languageserver/node';
import { checkUnusedVariables } from './unused-variables';

describe('Unused Variables', () => {
    describe('var declarations', () => {
        it('should report warning for unused variable', () => {
            const doc = createDocument(`var x = 10`);
            const diagnostics = checkUnusedVariables(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
            expect(diagnostics[0].message).toContain('x');
            expect(diagnostics[0].message).toContain('never used');
            expect(diagnostics[0].tags).toContain(DiagnosticTag.Unnecessary);
        });

        it('should not report warning for used variable', () => {
            const doc = createDocument(`var x = 10
var y = x + 5`);
            const diagnostics = checkUnusedVariables(doc);

            // x is used, y is not
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('y');
        });

        it('should handle variable used in function call', () => {
            const doc = createDocument(`var name = "John"
println(name)`);
            const diagnostics = checkUnusedVariables(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should handle variable used in string interpolation', () => {
            const doc = createDocument(`var name = "John"
var msg = "Hello, \${name}!"`);
            const diagnostics = checkUnusedVariables(doc);

            // name is used in interpolation, msg is unused
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('msg');
        });

        it('should handle typed variable declaration', () => {
            const doc = createDocument(`var string name = "John"`);
            const diagnostics = checkUnusedVariables(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('name');
        });
    });

    describe('input declarations', () => {
        it('should NOT report warning for unused input (inputs are component API)', () => {
            const doc = createDocument(`component Server {
    input string name = "default"
}`);
            const diagnostics = checkUnusedVariables(doc);

            // Inputs are the component's public API - they're meant to be
            // provided when instantiated, not necessarily used in the body
            expect(diagnostics).toHaveLength(0);
        });

        it('should NOT check outputs either (outputs export values externally)', () => {
            const doc = createDocument(`component Server {
    input string name = "default"
    output string greeting = "Hello, world!"
}`);
            const diagnostics = checkUnusedVariables(doc);

            // Neither inputs nor outputs should be flagged
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('loop variables', () => {
        it('should report warning for unused loop variable', () => {
            const doc = createDocument(`for item in items {
    println("hello")
}`);
            const diagnostics = checkUnusedVariables(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('Loop variable');
            expect(diagnostics[0].message).toContain('item');
        });

        it('should not report warning for used loop variable', () => {
            const doc = createDocument(`for item in items {
    println(item)
}`);
            const diagnostics = checkUnusedVariables(doc);

            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('function parameters', () => {
        it('should report warning for unused parameter', () => {
            const doc = createDocument(`fun calculate(number x) number {
    return 42
}`);
            const diagnostics = checkUnusedVariables(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('Parameter');
            expect(diagnostics[0].message).toContain('x');
        });

        it('should not report warning for used parameter', () => {
            const doc = createDocument(`fun double(number x) number {
    return x * 2
}`);
            const diagnostics = checkUnusedVariables(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should check multiple parameters', () => {
            const doc = createDocument(`fun add(number a, number b) number {
    return a + b
}`);
            const diagnostics = checkUnusedVariables(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should report warning for some unused parameters', () => {
            const doc = createDocument(`fun process(string name, number count, boolean flag) {
    println(name)
}`);
            const diagnostics = checkUnusedVariables(doc);

            // count and flag are unused
            expect(diagnostics).toHaveLength(2);
            expect(diagnostics.some(d => d.message.includes('count'))).toBe(true);
            expect(diagnostics.some(d => d.message.includes('flag'))).toBe(true);
        });
    });

    describe('scope handling', () => {
        it('should respect function scope', () => {
            const doc = createDocument(`fun outer() {
    var x = 10
}

fun inner() {
    var y = 20
    println(y)
}`);
            const diagnostics = checkUnusedVariables(doc);

            // x is unused in outer, y is used in inner
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('x');
        });

        it('should respect block scope in if statements', () => {
            const doc = createDocument(`if condition {
    var x = 10
    println(x)
}`);
            const diagnostics = checkUnusedVariables(doc);

            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('edge cases', () => {
        it('should handle empty document', () => {
            const doc = createDocument('');
            const diagnostics = checkUnusedVariables(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report variables in comments', () => {
            const doc = createDocument(`// var x = 10
/* var y = 20 */`);
            const diagnostics = checkUnusedVariables(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report variables in strings', () => {
            const doc = createDocument(`var msg = "var x = 10"`);
            const diagnostics = checkUnusedVariables(doc);

            // Only msg is a real declaration
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('msg');
        });

        it('should not consider same name in different scopes as usage', () => {
            const doc = createDocument(`fun foo() {
    var x = 10
}

fun bar() {
    var x = 20
    println(x)
}`);
            const diagnostics = checkUnusedVariables(doc);

            // x in foo is unused (x in bar is different variable)
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('x');
        });
    });

    describe('complex scenarios', () => {
        it('should handle nested functions', () => {
            const doc = createDocument(`fun outer(number n) {
    fun inner(number m) {
        println(m)
    }
    inner(n)
}`);
            const diagnostics = checkUnusedVariables(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should handle component with resources', () => {
            const doc = createDocument(`component Server {
    input string name = "default"
    var serverName = name

    resource ServerConfig config {
        serverName = serverName
    }
}`);
            const diagnostics = checkUnusedVariables(doc);

            // input 'name' is not checked (component API), var 'serverName' is used
            expect(diagnostics).toHaveLength(0);
        });
    });
});
