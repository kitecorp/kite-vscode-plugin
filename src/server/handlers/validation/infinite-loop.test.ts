/**
 * Tests for infinite loop validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkInfiniteLoop } from './infinite-loop';

describe('Infinite loop validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    it('should report warning for while true without break', () => {
        const doc = createDoc(`
            while true {
                println("infinite")
            }
        `);
        const diagnostics = checkInfiniteLoop(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain('Infinite loop');
    });

    it('should not report for while true with break', () => {
        const doc = createDoc(`
            while true {
                if condition {
                    break
                }
            }
        `);
        const diagnostics = checkInfiniteLoop(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for while true with return', () => {
        const doc = createDoc(`
            fun process() {
                while true {
                    if done {
                        return
                    }
                }
            }
        `);
        const diagnostics = checkInfiniteLoop(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not report for while with condition', () => {
        const doc = createDoc(`
            while running {
                process()
            }
        `);
        const diagnostics = checkInfiniteLoop(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report for while 1 (truthy literal)', () => {
        const doc = createDoc(`
            while 1 {
                println("infinite")
            }
        `);
        const diagnostics = checkInfiniteLoop(doc);

        expect(diagnostics).toHaveLength(1);
    });

    it('should skip while true in comments', () => {
        const doc = createDoc(`
            // while true { }
        `);
        const diagnostics = checkInfiniteLoop(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should skip while true in strings', () => {
        const doc = createDoc(`
            var x = "while true { }"
        `);
        const diagnostics = checkInfiniteLoop(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should report multiple infinite loops', () => {
        const doc = createDoc(`
            while true {
                println("first")
            }
            while true {
                println("second")
            }
        `);
        const diagnostics = checkInfiniteLoop(doc);

        expect(diagnostics).toHaveLength(2);
    });

    it('should not report for nested break in if', () => {
        const doc = createDoc(`
            while true {
                if x > 10 {
                    break
                }
                x++
            }
        `);
        const diagnostics = checkInfiniteLoop(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should handle while with parentheses', () => {
        const doc = createDoc(`
            while (true) {
                println("infinite")
            }
        `);
        const diagnostics = checkInfiniteLoop(doc);

        expect(diagnostics).toHaveLength(1);
    });
});
