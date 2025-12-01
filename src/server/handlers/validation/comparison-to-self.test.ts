/**
 * Tests for comparison to self validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkComparisonToSelf } from './comparison-to-self';

describe('Comparison to self validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report warning for x == x', () => {
        const doc = createDoc(`
            if x == x {
                println("always true")
            }
        `);
        const diagnostics = checkComparisonToSelf(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('always true');
    });

    it('should report warning for x != x', () => {
        const doc = createDoc(`
            if x != x {
                println("always false")
            }
        `);
        const diagnostics = checkComparisonToSelf(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('always false');
    });

    it('should report warning for x >= x', () => {
        const doc = createDoc(`
            if x >= x {
                println("always true")
            }
        `);
        const diagnostics = checkComparisonToSelf(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('always true');
    });

    it('should report warning for x <= x', () => {
        const doc = createDoc(`
            if x <= x {
                println("always true")
            }
        `);
        const diagnostics = checkComparisonToSelf(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('always true');
    });

    it('should report warning for x > x', () => {
        const doc = createDoc(`
            if x > x {
                println("always false")
            }
        `);
        const diagnostics = checkComparisonToSelf(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('always false');
    });

    it('should report warning for x < x', () => {
        const doc = createDoc(`
            if x < x {
                println("always false")
            }
        `);
        const diagnostics = checkComparisonToSelf(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('always false');
    });

    it('should not report for comparison with different variables', () => {
        const doc = createDoc(`
            if x == y {
                println("maybe")
            }
        `);
        const diagnostics = checkComparisonToSelf(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should skip in comments', () => {
        const doc = createDoc(`
            // if x == x { }
        `);
        const diagnostics = checkComparisonToSelf(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should skip in strings', () => {
        const doc = createDoc(`
            var msg = "x == x"
        `);
        const diagnostics = checkComparisonToSelf(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report multiple self-comparisons', () => {
        const doc = createDoc(`
            if x == x {
                println("a")
            }
            if y != y {
                println("b")
            }
        `);
        const diagnostics = checkComparisonToSelf(doc);

        expect(diagnostics).toHaveLength(2);
    });

    it('should handle comparison in while loop', () => {
        const doc = createDoc(`
            while x == x {
                process()
            }
        `);
        const diagnostics = checkComparisonToSelf(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should not report for property comparisons', () => {
        const doc = createDoc(`
            if obj.x == obj.x {
                println("maybe intentional")
            }
        `);
        const diagnostics = checkComparisonToSelf(doc);

        // Property access might be intentional (side effects, getters)
        expect(diagnostics).toHaveLength(0);
    });
});
