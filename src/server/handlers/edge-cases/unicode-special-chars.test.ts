/**
 * Edge case tests for Unicode and special characters.
 * Tests that handlers gracefully handle various character encodings,
 * special characters, and different line endings.
 */

import { describe, it, expect } from 'vitest';
import { createDocument } from '../../test-utils';
import { TextDocument } from 'vscode-languageserver-textdocument';

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

describe('Unicode & Special Characters Edge Cases', () => {
    describe('Unicode in strings', () => {
        it('handles basic Unicode characters in strings', () => {
            const doc = createDocument('var x = "héllo wörld"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles Chinese characters in strings', () => {
            const doc = createDocument('var greeting = "你好世界"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles Japanese characters in strings', () => {
            const doc = createDocument('var msg = "こんにちは"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles Korean characters in strings', () => {
            const doc = createDocument('var text = "안녕하세요"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles Arabic characters in strings', () => {
            const doc = createDocument('var text = "مرحبا"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles Hebrew characters in strings', () => {
            const doc = createDocument('var text = "שלום"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles Cyrillic characters in strings', () => {
            const doc = createDocument('var text = "Привет мир"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles Greek characters in strings', () => {
            const doc = createDocument('var text = "Γειά σου κόσμε"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles Thai characters in strings', () => {
            const doc = createDocument('var text = "สวัสดี"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles mixed scripts in strings', () => {
            const doc = createDocument('var text = "Hello 你好 مرحبا Привет"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Emoji in code', () => {
        it('handles emoji in strings', () => {
            const doc = createDocument('var emoji = "Hello 👋 World 🌍"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles multiple emojis', () => {
            const doc = createDocument('var emojis = "🎉🎊🎈🎁"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles emoji with skin tone modifiers', () => {
            const doc = createDocument('var wave = "👋🏻👋🏼👋🏽👋🏾👋🏿"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles compound emojis (ZWJ sequences)', () => {
            const doc = createDocument('var family = "👨‍👩‍👧‍👦"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles flag emojis', () => {
            const doc = createDocument('var flags = "🇺🇸🇬🇧🇯🇵🇨🇳"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles emoji in comments', () => {
            const doc = createDocument('// TODO: Fix this bug 🐛\nvar x = 1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Unicode identifiers', () => {
        it('handles accented Latin characters in identifiers', () => {
            const doc = createDocument('var café = "coffee"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles German umlauts in identifiers', () => {
            const doc = createDocument('var größe = 100');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles Nordic characters in identifiers', () => {
            const doc = createDocument('var fjärd = "inlet"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles completion with Unicode identifiers', () => {
            const doc = createDocument('var naïve = 1\nvar x = ');
            const ctx = createCompletionContext();
            const result = handleCompletion(doc, { line: 1, character: 8 }, ctx);
            expect(result).toBeDefined();
        });
    });

    describe('Special Unicode characters', () => {
        it('handles zero-width space', () => {
            const doc = createDocument('var x\u200B = 1'); // Zero-width space
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles zero-width non-joiner', () => {
            const doc = createDocument('var x = "test\u200Cvalue"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles zero-width joiner', () => {
            const doc = createDocument('var x = "test\u200Dvalue"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles non-breaking space', () => {
            const doc = createDocument('var x\u00A0= 1'); // Non-breaking space
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles em space', () => {
            const doc = createDocument('var x\u2003= 1'); // Em space
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles en space', () => {
            const doc = createDocument('var x\u2002= 1'); // En space
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles thin space', () => {
            const doc = createDocument('var x\u2009= 1'); // Thin space
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles ideographic space', () => {
            const doc = createDocument('var x\u3000= 1'); // Ideographic space
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles soft hyphen', () => {
            const doc = createDocument('var x = "very\u00ADlong\u00ADword"'); // Soft hyphen
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles byte order mark at start', () => {
            const doc = createDocument('\uFEFFvar x = 1'); // BOM
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles replacement character', () => {
            const doc = createDocument('var x = "test\uFFFDvalue"'); // Replacement character
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Line endings', () => {
        it('handles Unix line endings (LF)', () => {
            const doc = createDocument('var x = 1\nvar y = 2\nvar z = 3');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles Windows line endings (CRLF)', () => {
            const doc = createDocument('var x = 1\r\nvar y = 2\r\nvar z = 3');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles old Mac line endings (CR)', () => {
            const doc = createDocument('var x = 1\rvar y = 2\rvar z = 3');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles mixed line endings', () => {
            const doc = createDocument('var x = 1\nvar y = 2\r\nvar z = 3\rvar w = 4');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles completion with CRLF', () => {
            const doc = createDocument('var x = 1\r\nvar y = ');
            const ctx = createCompletionContext();
            const result = handleCompletion(doc, { line: 1, character: 8 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles hover with CRLF', () => {
            const doc = createDocument('var x = 1\r\nvar y = 2');
            const result = handleHover(doc, { line: 0, character: 4 }, []);
            expect(result === null || result !== undefined).toBe(true);
        });

        it('handles line ending at file end', () => {
            const doc = createDocument('var x = 1\n');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles multiple consecutive line endings', () => {
            const doc = createDocument('var x = 1\n\n\n\nvar y = 2');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Mathematical symbols', () => {
        it('handles mathematical operators in strings', () => {
            const doc = createDocument('var formula = "a × b ÷ c ± d"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles Greek letters commonly used in math', () => {
            const doc = createDocument('var text = "α β γ δ ε π θ"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles mathematical symbols', () => {
            const doc = createDocument('var symbols = "∞ √ ∑ ∏ ∫ ∂"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles subscript and superscript', () => {
            const doc = createDocument('var text = "H₂O x² x³"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles fraction characters', () => {
            const doc = createDocument('var fractions = "½ ⅓ ¼ ⅔ ¾"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Currency symbols', () => {
        it('handles common currency symbols', () => {
            const doc = createDocument('var price = "$100 €50 £30 ¥1000"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles less common currency symbols', () => {
            const doc = createDocument('var currencies = "₹ ₽ ₿ ฿ ₩"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Punctuation and symbols', () => {
        it('handles smart quotes', () => {
            const doc = createDocument('var text = ""Hello" \'World\'"'); // Using straight quotes with smart inside
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles ellipsis', () => {
            const doc = createDocument('var text = "Loading…"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles dashes', () => {
            const doc = createDocument('var text = "en–dash em—dash"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles bullets and list markers', () => {
            const doc = createDocument('var bullets = "• ◦ ‣ ⁃"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles arrows', () => {
            const doc = createDocument('var arrows = "← → ↑ ↓ ↔ ⇒ ⇔"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles check marks and crosses', () => {
            const doc = createDocument('var marks = "✓ ✔ ✗ ✘ ☑ ☐"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles stars and decorative symbols', () => {
            const doc = createDocument('var stars = "★ ☆ ✦ ✧ ❋"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Control characters', () => {
        it('handles tab character', () => {
            const doc = createDocument('var\tx\t=\t1');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles form feed', () => {
            const doc = createDocument('var x = 1\fvar y = 2'); // Form feed
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles vertical tab', () => {
            const doc = createDocument('var x = 1\vvar y = 2'); // Vertical tab
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles backspace in string', () => {
            const doc = createDocument('var x = "test\bvalue"'); // Backspace
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles null character in string', () => {
            const doc = createDocument('var x = "test\0value"'); // Null
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Unicode escape sequences', () => {
        it('handles Unicode escape in string', () => {
            const doc = createDocument('var x = "\\u0048\\u0065\\u006C\\u006C\\u006F"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles mixed Unicode escapes and characters', () => {
            const doc = createDocument('var x = "Hello \\u4E16\\u754C"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('RTL (Right-to-Left) text', () => {
        it('handles RTL text in strings', () => {
            const doc = createDocument('var text = "שלום עולם"'); // Hebrew
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles mixed RTL and LTR', () => {
            const doc = createDocument('var text = "Hello שלום World"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles RTL override characters', () => {
            const doc = createDocument('var text = "\u202Edesrever\u202C"'); // RTL override
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Combining characters', () => {
        it('handles combining diacritical marks', () => {
            const doc = createDocument('var text = "e\u0301"'); // é as e + combining acute
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles multiple combining marks', () => {
            const doc = createDocument('var text = "a\u0301\u0327"'); // a with acute and cedilla
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles zalgo text', () => {
            const doc = createDocument('var text = "H̵̡̪̯ͨ͊̽̅e̗̦̞l̡͎̜l̲̺̖o̱"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Box drawing and block characters', () => {
        it('handles box drawing characters', () => {
            const doc = createDocument('var box = "┌─┐│ │└─┘"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles block characters', () => {
            const doc = createDocument('var blocks = "█▓▒░"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Position handling with Unicode', () => {
        it('handles hover on character after emoji', () => {
            const doc = createDocument('var x = "👋" // comment');
            const ctx = createCompletionContext();
            // Position after the emoji string
            const result = handleCompletion(doc, { line: 0, character: 14 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles completion after multibyte characters', () => {
            const doc = createDocument('var 你好 = 1\nvar x = ');
            const ctx = createCompletionContext();
            const result = handleCompletion(doc, { line: 1, character: 8 }, ctx);
            expect(result).toBeDefined();
        });

        it('handles document symbols with Unicode names', () => {
            const doc = createDocument('var café = 1\nvar naïve = 2\nvar 変数 = 3');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Null and undefined handling', () => {
        it('handles string with only null characters', () => {
            const doc = createDocument('var x = "\0\0\0"');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles empty Unicode string', () => {
            const doc = createDocument('var x = ""');
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });

    describe('Surrogate pairs', () => {
        it('handles characters outside BMP (emoji)', () => {
            const doc = createDocument('var x = "𝕳𝖊𝖑𝖑𝖔"'); // Mathematical Fraktur
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles ancient scripts', () => {
            const doc = createDocument('var x = "𐤀𐤁𐤂"'); // Phoenician
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });

        it('handles musical symbols', () => {
            const doc = createDocument('var x = "𝄞𝄢𝅘𝅥𝅮"'); // Musical symbols
            const result = handleDocumentSymbol(doc);
            expect(result).toBeDefined();
        });
    });
});
