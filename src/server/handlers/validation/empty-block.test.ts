/**
 * Tests for empty block validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkEmptyBlocks } from './empty-block';

describe('Empty block validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report warning for empty schema', () => {
        const doc = createDoc(`
            schema Config {}
        `);
        const diagnostics = checkEmptyBlocks(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Empty schema 'Config'");
    });

    it('should report warning for empty component definition', () => {
        const doc = createDoc(`
            component Server {}
        `);
        const diagnostics = checkEmptyBlocks(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Empty component 'Server'");
    });

    it('should report warning for empty function', () => {
        const doc = createDoc(`
            fun calculate() {}
        `);
        const diagnostics = checkEmptyBlocks(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Empty function 'calculate'");
    });

    it('should not report for non-empty schema', () => {
        const doc = createDoc(`
            schema Config {
                string host
            }
        `);
        const diagnostics = checkEmptyBlocks(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for non-empty component', () => {
        const doc = createDoc(`
            component Server {
                input string name
            }
        `);
        const diagnostics = checkEmptyBlocks(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for non-empty function', () => {
        const doc = createDoc(`
            fun calculate() {
                return 42
            }
        `);
        const diagnostics = checkEmptyBlocks(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for component instantiation', () => {
        const doc = createDoc(`
            component Server api {}
        `);
        const diagnostics = checkEmptyBlocks(doc);

        // This is an instantiation, not a definition
        expect(diagnostics).toHaveLength(0);
    });

    it('should treat block with only comments as empty', () => {
        const doc = createDoc(`
            schema Config {
                // TODO: add fields
            }
        `);
        const diagnostics = checkEmptyBlocks(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Empty schema 'Config'");
    });

    it('should skip definitions in comments', () => {
        const doc = createDoc(`
            // schema Config {}
        `);
        const diagnostics = checkEmptyBlocks(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report multiple empty blocks', () => {
        const doc = createDoc(`
            schema Config {}
            schema Database {}
            fun process() {}
        `);
        const diagnostics = checkEmptyBlocks(doc);

        expect(diagnostics).toHaveLength(3);
    });
});
