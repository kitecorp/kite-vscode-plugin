/**
 * Edge case tests for malformed and incomplete input.
 * Tests that handlers gracefully handle syntax errors, incomplete code,
 * and unusual input without crashing.
 */

import { describe, it, expect } from 'vitest';
import { createDocument } from '../../test-utils';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver/node';

// Import handlers
import { handleCompletion, CompletionContext } from '../completion';
import { handleDocumentSymbol } from '../document-symbols';
import { handleHover } from '../hover';
import { Declaration } from '../../types';
function createCompletionContext(): CompletionContext {
    return {
        getDeclarations: () => [],
        findKiteFilesInWorkspace: () => [],
        getFileContent: () => null,
        findEnclosingBlock: () => null,
    };
}

describe('Malformed Input Edge Cases', () => {
    describe('Empty and whitespace-only files', () => {
        it('handles empty file for completions', () => {
            const doc = createDocument('');
            const ctx = createCompletionContext();
            const result = handleCompletion(doc, { line: 0, character: 0 }, ctx);
            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
        });

        it('handles empty file for document symbols', () => {
            const doc = createDocument('');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
            expect(result).toHaveLength(0);
        });

        it('handles empty file for hover', () => {
            const doc = createDocument('');
            const declarations: Declaration[] = [];
            const result = handleHover(doc, { line: 0, character: 0 }, declarations);
            expect(result).toBeNull();
        });

        it('handles whitespace-only file for completions', () => {
            const doc = createDocument('   \n\t\n   ');
            const ctx = createCompletionContext();
            const result = handleCompletion(doc, { line: 1, character: 0 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles file with only newlines', () => {
            const doc = createDocument('\n\n\n\n\n');
            const ctx = createCompletionContext();
            const result = handleCompletion(doc, { line: 2, character: 0 }, ctx);
            expect(result).toBeDefined();
        });
    });

    describe('Comment-only files', () => {
        it('handles file with only line comments', () => {
            const doc = createDocument('// comment 1\n// comment 2\n// comment 3');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
            expect(result).toHaveLength(0);
        });

        it('handles file with only block comments', () => {
            const doc = createDocument('/* multi\nline\ncomment */');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
            expect(result).toHaveLength(0);
        });

        it('does not crash on completion inside comment', () => {
            const doc = createDocument('// this is a comment');
            const ctx = createCompletionContext();
            const result = handleCompletion(doc, { line: 0, character: 10 }, ctx);
            expect(result).toBeDefined();
        });
    });

    describe('Unclosed braces', () => {
        it('handles unclosed resource brace', () => {
            const doc = createDocument('resource Config server {');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles unclosed component brace', () => {
            const doc = createDocument('component WebServer {\n    input string name');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles unclosed schema brace', () => {
            const doc = createDocument('schema Config {\n    string host');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles unclosed nested braces', () => {
            const doc = createDocument('resource Config server {\n    config = {\n        nested = {');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles completion with unclosed brace', () => {
            const doc = createDocument('resource Config server {\n    ');
            const ctx = createCompletionContext();
            const result = handleCompletion(doc, { line: 1, character: 4 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles unclosed function brace', () => {
            const doc = createDocument('fun calculate() {\n    var x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles multiple unclosed braces', () => {
            const doc = createDocument('component C {\n    if true {\n        for x in items {');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Unclosed strings', () => {
        it('handles unclosed double-quoted string', () => {
            const doc = createDocument('var x = "unclosed string');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles unclosed single-quoted string', () => {
            const doc = createDocument("var x = 'unclosed string");
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles unclosed string with interpolation', () => {
            const doc = createDocument('var x = "hello ${name');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles completion after unclosed string', () => {
            const doc = createDocument('var x = "unclosed\nvar y = ');
            const ctx = createCompletionContext();
            const result = handleCompletion(doc, { line: 1, character: 8 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles multiline unclosed string', () => {
            const doc = createDocument('var x = "line1\nline2\nline3');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Unclosed brackets and parentheses', () => {
        it('handles unclosed array bracket', () => {
            const doc = createDocument('var x = [1, 2, 3');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles unclosed function parentheses', () => {
            const doc = createDocument('fun test(string name, number age');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles unclosed decorator parentheses', () => {
            const doc = createDocument('@minValue(10\nresource Config server {}');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles unclosed list comprehension', () => {
            const doc = createDocument('var x = [for item in items: item');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles nested unclosed brackets', () => {
            const doc = createDocument('var x = [[1, 2], [3, 4');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Incomplete declarations', () => {
        it('handles incomplete var declaration', () => {
            const doc = createDocument('var');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles var without value', () => {
            const doc = createDocument('var x =');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles incomplete resource declaration', () => {
            const doc = createDocument('resource');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles resource without name', () => {
            const doc = createDocument('resource Config');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles incomplete component declaration', () => {
            const doc = createDocument('component');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles incomplete schema declaration', () => {
            const doc = createDocument('schema');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles incomplete function declaration', () => {
            const doc = createDocument('fun');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles function without body', () => {
            const doc = createDocument('fun calculate()');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles incomplete import statement', () => {
            const doc = createDocument('import');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles import without path', () => {
            const doc = createDocument('import * from');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles incomplete type alias', () => {
            const doc = createDocument('type Region =');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Incomplete expressions', () => {
        it('handles incomplete property access', () => {
            const doc = createDocument('var x = server.');
            const ctx = createCompletionContext();
            const result = handleCompletion(doc, { line: 0, character: 15 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles incomplete binary expression', () => {
            const doc = createDocument('var x = 1 +');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles incomplete comparison', () => {
            const doc = createDocument('if x >');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles incomplete logical expression', () => {
            const doc = createDocument('if x &&');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles incomplete ternary', () => {
            const doc = createDocument('var x = condition ?');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles incomplete function call', () => {
            const doc = createDocument('var x = calculate(1,');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Syntax errors in various positions', () => {
        it('handles double equals typo', () => {
            const doc = createDocument('var x == 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles missing colon in for loop', () => {
            const doc = createDocument('[for x in items x]');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles extra closing brace', () => {
            const doc = createDocument('resource Config server { } }');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles extra closing bracket', () => {
            const doc = createDocument('var x = [1, 2] ]');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles mismatched braces', () => {
            const doc = createDocument('resource Config server { ]');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles decorator without @', () => {
            const doc = createDocument('minValue(10)\nresource Config server {}');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles multiple consecutive operators', () => {
            const doc = createDocument('var x = 1 ++ + 2');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Invalid identifiers and keywords', () => {
        it('handles number as identifier start', () => {
            const doc = createDocument('var 123abc = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles special characters in identifier', () => {
            const doc = createDocument('var my-var = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles keyword as identifier', () => {
            const doc = createDocument('var if = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles empty identifier', () => {
            const doc = createDocument('var = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Hover with malformed input', () => {
        it('handles hover on incomplete property access', () => {
            const doc = createDocument('var x = server.');
            const result = handleHover(doc, { line: 0, character: 15 }, []);
            // Should not crash, may return null
            expect(result === null || result !== undefined).toBe(true);
        });

        it('handles hover in unclosed string', () => {
            const doc = createDocument('var x = "hello');
            const result = handleHover(doc, { line: 0, character: 10 }, []);
            expect(result === null || result !== undefined).toBe(true);
        });

        it('handles hover on partial keyword', () => {
            const doc = createDocument('res');
            const result = handleHover(doc, { line: 0, character: 1 }, []);
            expect(result === null || result !== undefined).toBe(true);
        });

        it('handles hover on whitespace', () => {
            const doc = createDocument('   \n   \n   ');
            const result = handleHover(doc, { line: 1, character: 1 }, []);
            expect(result).toBeNull();
        });

        it('handles hover on operator', () => {
            const doc = createDocument('var x = 1 + 2');
            const result = handleHover(doc, { line: 0, character: 10 }, []);
            expect(result).toBeNull();
        });

        it('handles hover on number', () => {
            const doc = createDocument('var x = 12345');
            const result = handleHover(doc, { line: 0, character: 10 }, []);
            expect(result).toBeNull();
        });
    });

    describe('Position edge cases', () => {
        it('handles position beyond file end', () => {
            const doc = createDocument('var x = 1');
            const ctx = createCompletionContext();
            // Position way beyond the file
            const result = handleCompletion(doc, { line: 100, character: 100 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles position at exact file end', () => {
            const doc = createDocument('var x = 1');
            const ctx = createCompletionContext();
            const result = handleCompletion(doc, { line: 0, character: 9 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles position in middle of identifier', () => {
            const doc = createDocument('var myVariable = 1');
            const result = handleHover(doc, { line: 0, character: 6 }, []);
            // Should find the full identifier
            expect(result === null || result !== undefined).toBe(true);
        });
    });

    describe('Mixed valid and invalid code', () => {
        it('handles valid code followed by incomplete code', () => {
            const doc = createDocument('var x = 1\nresource Config server {');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
            // Should still find the valid var declaration
        });

        it('handles incomplete code followed by valid code', () => {
            const doc = createDocument('resource Config\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles valid code surrounded by comments with syntax errors', () => {
            const doc = createDocument('// incomplete {{{\nvar x = 1\n// more incomplete }}}');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles completion in valid section after invalid section', () => {
            const doc = createDocument('resource Config {\nvar x = ');
            const ctx = createCompletionContext();
            const result = handleCompletion(doc, { line: 1, character: 8 }, ctx);
            expect(result).toBeDefined();
        });
    });

    describe('Deeply nested structures', () => {
        it('handles deeply nested braces', () => {
            const doc = createDocument('{{{{{{{{{{}}}}}}}}}}');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles deeply nested brackets', () => {
            const doc = createDocument('[[[[[[[[[[]]]]]]]]]]');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles mixed deep nesting', () => {
            const doc = createDocument('[{[{[{[{[{]}]}]}]}]');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Long lines and identifiers', () => {
        it('handles very long identifier', () => {
            const longName = 'a'.repeat(1000);
            const doc = createDocument(`var ${longName} = 1`);
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles very long string', () => {
            const longString = 'x'.repeat(10000);
            const doc = createDocument(`var x = "${longString}"`);
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles very long line', () => {
            const longLine = 'var x = ' + '1 + '.repeat(1000) + '1';
            const doc = createDocument(longLine);
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Special characters and escapes', () => {
        it('handles escaped quotes in strings', () => {
            const doc = createDocument('var x = "hello \\"world\\""');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles escaped backslashes', () => {
            const doc = createDocument('var x = "path\\\\to\\\\file"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles newlines in strings', () => {
            const doc = createDocument('var x = "line1\\nline2"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles tab characters', () => {
            const doc = createDocument('var\tx\t=\t1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });
});
