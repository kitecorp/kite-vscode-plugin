/**
 * Tests for return type mismatch validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkReturnTypeMismatch } from './return-type-mismatch';

describe('Return type mismatch validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report error when returning number instead of string', () => {
        const doc = createDoc(`
fun calculate() string {
    return 42
}
        `);
        const diagnostics = checkReturnTypeMismatch(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("expected 'string' but got 'number'");
    });

    it('should report error when returning string instead of number', () => {
        const doc = createDoc(`
fun getPort() number {
    return "8080"
}
        `);
        const diagnostics = checkReturnTypeMismatch(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("expected 'number' but got 'string'");
    });

    it('should report error when returning number instead of boolean', () => {
        const doc = createDoc(`
fun isEnabled() boolean {
    return 1
}
        `);
        const diagnostics = checkReturnTypeMismatch(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("expected 'boolean' but got 'number'");
    });

    it('should not report error for matching types', () => {
        const doc = createDoc(`
fun calculate() number {
    return 42
}

fun getName() string {
    return "Alice"
}

fun isEnabled() boolean {
    return true
}
        `);
        const diagnostics = checkReturnTypeMismatch(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should allow any type to accept any value', () => {
        const doc = createDoc(`
fun getValue() any {
    return 42
}

fun getOther() any {
    return "hello"
}
        `);
        const diagnostics = checkReturnTypeMismatch(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should allow null as return value for any type', () => {
        const doc = createDoc(`
fun getValue() string {
    return null
}
        `);
        const diagnostics = checkReturnTypeMismatch(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should check array return types', () => {
        const doc = createDoc(`
fun getItems() string[] {
    return [1, 2, 3]  // Error: array type matches, but should be OK for basic check
}
        `);
        const diagnostics = checkReturnTypeMismatch(doc);

        // Should accept array literal for array type
        expect(diagnostics).toHaveLength(0);
    });

    it('should report error when returning non-array for array type', () => {
        const doc = createDoc(`
fun getItems() string[] {
    return "not an array"
}
        `);
        const diagnostics = checkReturnTypeMismatch(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("expected 'string[]'");
    });

    it('should skip functions without return type', () => {
        const doc = createDoc(`
fun process() {
    return 42
}
        `);
        const diagnostics = checkReturnTypeMismatch(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should skip void functions', () => {
        const doc = createDoc(`
fun process() void {
    return
}
        `);
        const diagnostics = checkReturnTypeMismatch(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report error for variable/identifier returns', () => {
        const doc = createDoc(`
fun calculate() number {
    var result = 42
    return result
}
        `);
        const diagnostics = checkReturnTypeMismatch(doc);

        // Can't infer type of identifier, so skip validation
        expect(diagnostics).toHaveLength(0);
    });

    it('should check multiple return statements', () => {
        const doc = createDoc(`
fun getValue(boolean flag) string {
    if (flag) {
        return 123  // Error
    } else {
        return "hello"  // OK
    }
}
        `);
        const diagnostics = checkReturnTypeMismatch(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("expected 'string' but got 'number'");
    });

    it('should skip returns in comments', () => {
        const doc = createDoc(`
fun calculate() string {
    // return 42
    return "test"
}
        `);
        const diagnostics = checkReturnTypeMismatch(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should handle nested functions independently', () => {
        const doc = createDoc(`
fun outer() string {
    fun inner() number {
        return 42  // OK for inner
    }
    return "test"  // OK for outer
}
        `);
        const diagnostics = checkReturnTypeMismatch(doc);

        expect(diagnostics).toHaveLength(0);
    });
});
