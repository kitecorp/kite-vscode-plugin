/**
 * Tests for duplicate decorator validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkDuplicateDecorators } from './duplicate-decorator';

describe('Duplicate decorator validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report error for duplicate decorator', () => {
        const doc = createDoc(`
            @description("First")
            @description("Second")
            schema Config {}
        `);
        const diagnostics = checkDuplicateDecorators(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toBe("Duplicate decorator '@description'");
    });

    it('should not report error for different decorators', () => {
        const doc = createDoc(`
            @description("A config")
            @tags({env: "prod"})
            schema Config {}
        `);
        const diagnostics = checkDuplicateDecorators(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should check decorators per declaration separately', () => {
        const doc = createDoc(`
            @description("First schema")
            schema Config {}

            @description("Second schema")
            schema Database {}
        `);
        const diagnostics = checkDuplicateDecorators(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report multiple duplicates', () => {
        const doc = createDoc(`
            @description("A")
            @description("B")
            @tags({})
            @tags({})
            schema Config {}
        `);
        const diagnostics = checkDuplicateDecorators(doc);

        expect(diagnostics).toHaveLength(2);
    });
});
