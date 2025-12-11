/**
 * Tests for impossible condition validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkImpossibleCondition } from './impossible-condition';

function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

describe('checkImpossibleCondition', () => {
    describe('Equality contradictions', () => {
        it('should detect x == 5 && x == 6', () => {
            const doc = createDocument('if (x == 5 && x == 6) { }');
            const diagnostics = checkImpossibleCondition(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('cannot equal both');
        });

        it('should not flag x == 5 && y == 6 (different variables)', () => {
            const doc = createDocument('if (x == 5 && y == 6) { }');
            const diagnostics = checkImpossibleCondition(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should not flag x == 5 && x == 5 (same value)', () => {
            const doc = createDocument('if (x == 5 && x == 5) { }');
            const diagnostics = checkImpossibleCondition(doc);
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('Range contradictions', () => {
        it('should detect x > 5 && x < 5', () => {
            const doc = createDocument('if (x > 5 && x < 5) { }');
            const diagnostics = checkImpossibleCondition(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('can never be true');
        });

        it('should detect x > 10 && x < 5', () => {
            const doc = createDocument('if (x > 10 && x < 5) { }');
            const diagnostics = checkImpossibleCondition(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('can never be true');
        });

        it('should detect x >= 10 && x <= 5', () => {
            const doc = createDocument('if (x >= 10 && x <= 5) { }');
            const diagnostics = checkImpossibleCondition(doc);
            expect(diagnostics).toHaveLength(1);
        });

        it('should detect x >= 5 && x < 5', () => {
            const doc = createDocument('if (x >= 5 && x < 5) { }');
            const diagnostics = checkImpossibleCondition(doc);
            expect(diagnostics).toHaveLength(1);
        });

        it('should not flag x > 5 && x < 10 (valid range)', () => {
            const doc = createDocument('if (x > 5 && x < 10) { }');
            const diagnostics = checkImpossibleCondition(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should not flag x >= 5 && x <= 10 (valid range)', () => {
            const doc = createDocument('if (x >= 5 && x <= 10) { }');
            const diagnostics = checkImpossibleCondition(doc);
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('Equality and range contradictions', () => {
        it('should detect x == 5 && x > 5', () => {
            const doc = createDocument('if (x == 5 && x > 5) { }');
            const diagnostics = checkImpossibleCondition(doc);
            expect(diagnostics).toHaveLength(1);
        });

        it('should detect x == 5 && x < 5', () => {
            const doc = createDocument('if (x == 5 && x < 5) { }');
            const diagnostics = checkImpossibleCondition(doc);
            expect(diagnostics).toHaveLength(1);
        });

        it('should not flag x == 5 && x >= 5 (valid)', () => {
            const doc = createDocument('if (x == 5 && x >= 5) { }');
            const diagnostics = checkImpossibleCondition(doc);
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('While loops', () => {
        it('should detect impossible condition in while loop', () => {
            const doc = createDocument('while (x > 10 && x < 5) { }');
            const diagnostics = checkImpossibleCondition(doc);
            expect(diagnostics).toHaveLength(1);
        });
    });

    describe('Reversed comparisons', () => {
        it('should detect 5 > x && 10 < x (reversed order)', () => {
            const doc = createDocument('if (5 > x && 10 < x) { }');
            const diagnostics = checkImpossibleCondition(doc);
            // 5 > x means x < 5, 10 < x means x > 10
            // So this is x < 5 && x > 10, which is impossible
            expect(diagnostics).toHaveLength(1);
        });
    });

    describe('Edge cases', () => {
        it('should not flag conditions inside comments', () => {
            const doc = createDocument('// if (x > 5 && x < 5) { }');
            const diagnostics = checkImpossibleCondition(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should handle conditions with no comparisons', () => {
            const doc = createDocument('if (isReady && isValid) { }');
            const diagnostics = checkImpossibleCondition(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should handle single comparison', () => {
            const doc = createDocument('if (x > 5) { }');
            const diagnostics = checkImpossibleCondition(doc);
            expect(diagnostics).toHaveLength(0);
        });
    });
});
