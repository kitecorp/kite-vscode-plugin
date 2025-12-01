/**
 * Tests for auto-import functionality
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isPasteOperation, AutoImportContext } from './index';

describe('Auto-import', () => {
    describe('isPasteOperation', () => {
        it('should detect paste when inserting 15+ characters', () => {
            const doc = TextDocument.create(
                'file:///test.kite',
                'kite',
                1,
                'resource DatabaseConfig db {\n}'
            );
            // 31 chars - 0 previous = 31 chars inserted
            expect(isPasteOperation(doc, 0)).toBe(true);
        });

        it('should not detect paste for small changes', () => {
            const doc = TextDocument.create(
                'file:///test.kite',
                'kite',
                1,
                'var x = 1'
            );
            // 9 chars - 0 previous = 9 chars inserted (< 15)
            expect(isPasteOperation(doc, 0)).toBe(false);
        });

        it('should not detect paste when deleting text', () => {
            const doc = TextDocument.create(
                'file:///test.kite',
                'kite',
                1,
                'short'
            );
            // 5 chars - 100 previous = -95 chars (deletion)
            expect(isPasteOperation(doc, 100)).toBe(false);
        });

        it('should handle undefined previous length as 0', () => {
            const doc = TextDocument.create(
                'file:///test.kite',
                'kite',
                1,
                'resource DatabaseConfig db { host = "localhost" }'
            );
            expect(isPasteOperation(doc, undefined)).toBe(true);
        });

        it('should detect paste exactly at threshold', () => {
            // Exactly 15 characters
            const doc = TextDocument.create(
                'file:///test.kite',
                'kite',
                1,
                '123456789012345'
            );
            expect(isPasteOperation(doc, 0)).toBe(true);
        });

        it('should not detect paste just below threshold', () => {
            // 14 characters
            const doc = TextDocument.create(
                'file:///test.kite',
                'kite',
                1,
                '12345678901234'
            );
            expect(isPasteOperation(doc, 0)).toBe(false);
        });
    });

});
