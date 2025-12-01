/**
 * Tests for unknown decorator validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkUnknownDecorators } from './unknown-decorator';

describe('Unknown decorator validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report warning for unknown decorator', () => {
        const doc = createDoc(`
            @unknownDecorator
            schema Config {}
        `);
        const diagnostics = checkUnknownDecorators(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toBe("Unknown decorator '@unknownDecorator'");
    });

    it('should not report warning for known decorators', () => {
        const doc = createDoc(`
            @description("A config")
            @tags({env: "prod"})
            schema Config {}
        `);
        const diagnostics = checkUnknownDecorators(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should skip decorators in comments', () => {
        const doc = createDoc(`
            // @unknownDecorator
            schema Config {}
        `);
        const diagnostics = checkUnknownDecorators(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should skip decorators in strings', () => {
        const doc = createDoc(`
            var x = "@unknownDecorator"
        `);
        const diagnostics = checkUnknownDecorators(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report multiple unknown decorators', () => {
        const doc = createDoc(`
            @foo
            @bar
            schema Config {}
        `);
        const diagnostics = checkUnknownDecorators(doc);

        expect(diagnostics).toHaveLength(2);
    });
});
