/**
 * Tests for text-utils.ts utility functions.
 */

import { describe, it, expect } from 'vitest';
import { CompletionItemKind, Position } from 'vscode-languageserver/node';
import { createDocument } from '../test-utils';
import {
    offsetToPosition,
    getWordAtPosition,
    getCompletionKind,
    findMatchingBrace,
    findMatchingBracket,
    findEnclosingBlock,
} from './text-utils';

describe('offsetToPosition', () => {
    it('returns line 0, character 0 for offset 0', () => {
        const pos = offsetToPosition('hello', 0);
        expect(pos.line).toBe(0);
        expect(pos.character).toBe(0);
    });

    it('returns correct position within first line', () => {
        const pos = offsetToPosition('hello world', 6);
        expect(pos.line).toBe(0);
        expect(pos.character).toBe(6);
    });

    it('returns correct position on second line', () => {
        const text = 'line1\nline2';
        const pos = offsetToPosition(text, 8); // 'n' in line2
        expect(pos.line).toBe(1);
        expect(pos.character).toBe(2);
    });

    it('handles multiple lines', () => {
        const text = 'line1\nline2\nline3';
        const pos = offsetToPosition(text, 12); // start of line3
        expect(pos.line).toBe(2);
        expect(pos.character).toBe(0);
    });

    it('handles empty lines', () => {
        const text = 'line1\n\nline3';
        const pos = offsetToPosition(text, 7); // start of line3
        expect(pos.line).toBe(2);
        expect(pos.character).toBe(0);
    });

    it('handles offset at end of text', () => {
        const text = 'hello';
        const pos = offsetToPosition(text, 5);
        expect(pos.line).toBe(0);
        expect(pos.character).toBe(5);
    });
});

describe('getWordAtPosition', () => {
    it('returns word at cursor position', () => {
        const doc = createDocument('var hello = 123');
        const word = getWordAtPosition(doc, Position.create(0, 5)); // 'e' in hello
        expect(word).toBe('hello');
    });

    it('returns word when cursor is at start of word', () => {
        const doc = createDocument('var hello = 123');
        const word = getWordAtPosition(doc, Position.create(0, 4)); // 'h' in hello
        expect(word).toBe('hello');
    });

    it('returns word when cursor is at end of word', () => {
        const doc = createDocument('var hello = 123');
        const word = getWordAtPosition(doc, Position.create(0, 9)); // after 'o' in hello
        expect(word).toBe('hello');
    });

    it('returns previous word when cursor is just after word', () => {
        // getWordAtPosition adjusts when cursor is right after a word
        const doc = createDocument('var hello = 123');
        const word = getWordAtPosition(doc, Position.create(0, 3)); // just after 'var'
        expect(word).toBe('var');
    });

    it('returns null for whitespace between words', () => {
        const doc = createDocument('var   hello');
        const word = getWordAtPosition(doc, Position.create(0, 5)); // middle of spaces
        expect(word).toBeNull();
    });

    it('returns null for operators', () => {
        const doc = createDocument('var hello = 123');
        const word = getWordAtPosition(doc, Position.create(0, 10)); // '='
        expect(word).toBeNull();
    });

    it('handles underscores in identifiers', () => {
        const doc = createDocument('var my_var = 123');
        const word = getWordAtPosition(doc, Position.create(0, 6)); // 'y' in my_var
        expect(word).toBe('my_var');
    });

    it('handles numbers in identifiers', () => {
        const doc = createDocument('var var123 = 456');
        const word = getWordAtPosition(doc, Position.create(0, 6)); // 'r' in var123
        expect(word).toBe('var123');
    });

    it('returns null for empty document', () => {
        const doc = createDocument('');
        const word = getWordAtPosition(doc, Position.create(0, 0));
        expect(word).toBeNull();
    });

    it('handles word at start of document', () => {
        const doc = createDocument('hello world');
        const word = getWordAtPosition(doc, Position.create(0, 0));
        expect(word).toBe('hello');
    });

    it('handles word at end of document', () => {
        const doc = createDocument('hello world');
        const word = getWordAtPosition(doc, Position.create(0, 11)); // after 'd'
        expect(word).toBe('world');
    });
});

describe('getCompletionKind', () => {
    it('returns Variable for variable type', () => {
        expect(getCompletionKind('variable')).toBe(CompletionItemKind.Variable);
    });

    it('returns Field for input type', () => {
        expect(getCompletionKind('input')).toBe(CompletionItemKind.Field);
    });

    it('returns Field for output type', () => {
        expect(getCompletionKind('output')).toBe(CompletionItemKind.Field);
    });

    it('returns Class for resource type', () => {
        expect(getCompletionKind('resource')).toBe(CompletionItemKind.Class);
    });

    it('returns Module for component type', () => {
        expect(getCompletionKind('component')).toBe(CompletionItemKind.Module);
    });

    it('returns Interface for schema type', () => {
        expect(getCompletionKind('schema')).toBe(CompletionItemKind.Interface);
    });

    it('returns Function for function type', () => {
        expect(getCompletionKind('function')).toBe(CompletionItemKind.Function);
    });

    it('returns TypeParameter for type type', () => {
        expect(getCompletionKind('type')).toBe(CompletionItemKind.TypeParameter);
    });

    it('returns Variable for for type', () => {
        expect(getCompletionKind('for')).toBe(CompletionItemKind.Variable);
    });

    it('returns Text for unknown type', () => {
        expect(getCompletionKind('unknown' as any)).toBe(CompletionItemKind.Text);
    });
});

describe('findMatchingBrace', () => {
    it('finds matching brace for simple case', () => {
        const text = '{ }';
        expect(findMatchingBrace(text, 0)).toBe(2);
    });

    it('finds matching brace with content', () => {
        const text = '{ hello }';
        expect(findMatchingBrace(text, 0)).toBe(8);
    });

    it('handles nested braces', () => {
        const text = '{ { inner } }';
        expect(findMatchingBrace(text, 0)).toBe(12);
    });

    it('handles deeply nested braces', () => {
        const text = '{ { { deep } } }';
        expect(findMatchingBrace(text, 0)).toBe(15);
    });

    it('returns -1 when not starting at brace', () => {
        const text = 'hello { }';
        expect(findMatchingBrace(text, 0)).toBe(-1);
    });

    it('returns -1 for unmatched brace', () => {
        const text = '{ { unclosed';
        expect(findMatchingBrace(text, 0)).toBe(-1);
    });

    it('ignores braces inside double-quoted strings', () => {
        const text = '{ "}" }';
        expect(findMatchingBrace(text, 0)).toBe(6);
    });

    it('ignores braces inside single-quoted strings', () => {
        const text = "{ '}' }";
        expect(findMatchingBrace(text, 0)).toBe(6);
    });

    it('handles escaped quotes in strings', () => {
        const text = '{ "\\"}" }';
        expect(findMatchingBrace(text, 0)).toBe(8);
    });

    it('handles mixed strings and braces', () => {
        const text = '{ a = "{" b = "}" }';
        expect(findMatchingBrace(text, 0)).toBe(18);
    });

    it('finds inner brace match', () => {
        const text = '{ { inner } }';
        expect(findMatchingBrace(text, 2)).toBe(10);
    });

    it('handles real-world schema example', () => {
        const text = 'schema Config { string name = "default" }';
        expect(findMatchingBrace(text, 14)).toBe(40);
    });
});

describe('findMatchingBracket', () => {
    it('finds matching bracket for simple case', () => {
        const text = '[ ]';
        expect(findMatchingBracket(text, 0)).toBe(2);
    });

    it('finds matching bracket with content', () => {
        const text = '[ 1, 2, 3 ]';
        expect(findMatchingBracket(text, 0)).toBe(10);
    });

    it('handles nested brackets', () => {
        const text = '[ [ inner ] ]';
        expect(findMatchingBracket(text, 0)).toBe(12);
    });

    it('handles deeply nested brackets', () => {
        const text = '[ [ [ deep ] ] ]';
        expect(findMatchingBracket(text, 0)).toBe(15);
    });

    it('returns -1 when not starting at bracket', () => {
        const text = 'hello [ ]';
        expect(findMatchingBracket(text, 0)).toBe(-1);
    });

    it('returns -1 for unmatched bracket', () => {
        const text = '[ [ unclosed';
        expect(findMatchingBracket(text, 0)).toBe(-1);
    });

    it('ignores brackets inside double-quoted strings', () => {
        const text = '[ "]" ]';
        expect(findMatchingBracket(text, 0)).toBe(6);
    });

    it('ignores brackets inside single-quoted strings', () => {
        const text = "[ ']' ]";
        expect(findMatchingBracket(text, 0)).toBe(6);
    });

    it('handles list comprehension', () => {
        const text = '[for x in items: x * 2]';
        expect(findMatchingBracket(text, 0)).toBe(22);
    });

    it('handles array with strings containing brackets', () => {
        const text = '["[test]", "value"]';
        expect(findMatchingBracket(text, 0)).toBe(18);
    });
});

describe('findEnclosingBlock', () => {
    it('returns null when not inside a block', () => {
        const text = 'var x = 123';
        expect(findEnclosingBlock(text, 5)).toBeNull();
    });

    it('finds enclosing resource block', () => {
        const text = 'resource Config server { name = "test" }';
        const block = findEnclosingBlock(text, 30); // inside block
        expect(block).not.toBeNull();
        expect(block?.type).toBe('resource');
        expect(block?.typeName).toBe('Config');
        expect(block?.name).toBe('server');
    });

    it('finds enclosing component block', () => {
        const text = 'component WebServer api { port = 8080 }';
        const block = findEnclosingBlock(text, 30); // inside block
        expect(block).not.toBeNull();
        expect(block?.type).toBe('component');
        expect(block?.typeName).toBe('WebServer');
        expect(block?.name).toBe('api');
    });

    it('returns null when before block', () => {
        const text = 'resource Config server { name = "test" }';
        expect(findEnclosingBlock(text, 5)).toBeNull();
    });

    it('returns null when after block', () => {
        const text = 'resource Config server { name = "test" }';
        expect(findEnclosingBlock(text, 40)).toBeNull();
    });

    it('handles dotted type names', () => {
        const text = 'resource AWS.EC2.Instance server { size = "large" }';
        const block = findEnclosingBlock(text, 40);
        expect(block).not.toBeNull();
        expect(block?.typeName).toBe('AWS.EC2.Instance');
    });

    it('finds most specific block when nested', () => {
        const text = `component Outer outer {
            resource Inner inner { value = 1 }
        }`;
        const innerOffset = text.indexOf('value');
        const block = findEnclosingBlock(text, innerOffset);
        expect(block).not.toBeNull();
        expect(block?.type).toBe('resource');
        expect(block?.name).toBe('inner');
    });

    it('handles multiple blocks', () => {
        const text = `resource A a { x = 1 }
resource B b { y = 2 }`;
        const block = findEnclosingBlock(text, text.indexOf('y'));
        expect(block).not.toBeNull();
        expect(block?.name).toBe('b');
    });

    it('handles block with string containing braces', () => {
        const text = 'resource Config server { name = "{test}" }';
        const block = findEnclosingBlock(text, 30);
        expect(block).not.toBeNull();
        expect(block?.name).toBe('server');
    });

    it('returns correct start and end positions', () => {
        const text = 'resource Config server { name = "test" }';
        const block = findEnclosingBlock(text, 30);
        expect(block?.start).toBe(0);
        expect(block?.end).toBe(39); // position of closing brace
    });
});
