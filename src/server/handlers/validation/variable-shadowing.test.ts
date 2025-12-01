/**
 * Tests for variable shadowing detection
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkVariableShadowing } from './variable-shadowing';

describe('Variable shadowing validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report warning when inner variable shadows outer', () => {
        const doc = createDoc(`
            var x = 10
            fun calculate() {
                var x = 20
            }
        `);
        const diagnostics = checkVariableShadowing(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Variable 'x' shadows outer variable");
    });

    it('should not report for variables at same scope', () => {
        const doc = createDoc(`
            var x = 10
            var y = 20
        `);
        const diagnostics = checkVariableShadowing(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for different variable names', () => {
        const doc = createDoc(`
            var x = 10
            fun calculate() {
                var y = 20
            }
        `);
        const diagnostics = checkVariableShadowing(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report for loop variable shadowing outer variable', () => {
        const doc = createDoc(`
            var item = "test"
            for item in items {
                println(item)
            }
        `);
        const diagnostics = checkVariableShadowing(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Variable 'item' shadows outer variable");
    });

    it('should report for function parameter shadowing outer variable', () => {
        const doc = createDoc(`
            var name = "global"
            fun greet(string name) {
                println(name)
            }
        `);
        const diagnostics = checkVariableShadowing(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Variable 'name' shadows outer variable");
    });

    it('should not report for nested functions with different variables', () => {
        const doc = createDoc(`
            var a = 1
            fun outer() {
                var b = 2
                fun inner() {
                    var c = 3
                }
            }
        `);
        const diagnostics = checkVariableShadowing(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report multiple shadowing instances', () => {
        const doc = createDoc(`
            var x = 10
            var y = 20
            fun calculate() {
                var x = 30
                var y = 40
            }
        `);
        const diagnostics = checkVariableShadowing(doc);

        expect(diagnostics).toHaveLength(2);
    });

    it('should skip variables in comments', () => {
        const doc = createDoc(`
            var x = 10
            // var x = 20
        `);
        const diagnostics = checkVariableShadowing(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should skip variables in strings', () => {
        const doc = createDoc(`
            var x = 10
            var msg = "var x = 20"
        `);
        const diagnostics = checkVariableShadowing(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should handle typed variable declarations', () => {
        const doc = createDoc(`
            var number x = 10
            fun calculate() {
                var number x = 20
            }
        `);
        const diagnostics = checkVariableShadowing(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Variable 'x' shadows outer variable");
    });

    it('should handle deeply nested shadowing', () => {
        const doc = createDoc(`
            var x = 1
            fun level1() {
                fun level2() {
                    fun level3() {
                        var x = 3
                    }
                }
            }
        `);
        const diagnostics = checkVariableShadowing(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should handle for loop with parentheses', () => {
        const doc = createDoc(`
            var i = 10
            for (i in items) {
                println(i)
            }
        `);
        const diagnostics = checkVariableShadowing(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Variable 'i' shadows outer variable");
    });
});
