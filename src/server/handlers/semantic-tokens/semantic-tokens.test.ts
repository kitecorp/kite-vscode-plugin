/**
 * Tests for Semantic Tokens handler
 * Semantic Tokens provides enhanced syntax highlighting via LSP
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    handleSemanticTokens,
    semanticTokensLegend,
    TOKEN_TYPES,
    TOKEN_MODIFIERS
} from './index';

function createDocument(content: string): TextDocument {
    return TextDocument.create('file:///test.kite', 'kite', 1, content);
}

/**
 * Decode semantic tokens data into readable format
 */
function decodeTokens(data: number[]): Array<{
    line: number;
    char: number;
    length: number;
    type: string;
    modifiers: string[];
}> {
    const tokens: Array<{
        line: number;
        char: number;
        length: number;
        type: string;
        modifiers: string[];
    }> = [];

    let line = 0;
    let char = 0;

    for (let i = 0; i < data.length; i += 5) {
        const deltaLine = data[i];
        const deltaChar = data[i + 1];
        const length = data[i + 2];
        const tokenType = data[i + 3];
        const tokenModifiers = data[i + 4];

        line += deltaLine;
        char = deltaLine === 0 ? char + deltaChar : deltaChar;

        const modifiers: string[] = [];
        for (let bit = 0; bit < semanticTokensLegend.tokenModifiers.length; bit++) {
            if (tokenModifiers & (1 << bit)) {
                modifiers.push(semanticTokensLegend.tokenModifiers[bit]);
            }
        }

        tokens.push({
            line,
            char,
            length,
            type: semanticTokensLegend.tokenTypes[tokenType] || `unknown(${tokenType})`,
            modifiers,
        });
    }

    return tokens;
}

function findToken(tokens: ReturnType<typeof decodeTokens>, line: number, char: number) {
    return tokens.find(t => t.line === line && t.char === char);
}

describe('Semantic Tokens', () => {
    describe('Legend', () => {
        it('should export token types', () => {
            expect(semanticTokensLegend.tokenTypes).toContain('namespace');
            expect(semanticTokensLegend.tokenTypes).toContain('class');
            expect(semanticTokensLegend.tokenTypes).toContain('function');
            expect(semanticTokensLegend.tokenTypes).toContain('variable');
            expect(semanticTokensLegend.tokenTypes).toContain('property');
        });

        it('should export token modifiers', () => {
            expect(semanticTokensLegend.tokenModifiers).toContain('declaration');
            expect(semanticTokensLegend.tokenModifiers).toContain('definition');
            expect(semanticTokensLegend.tokenModifiers).toContain('readonly');
        });
    });

    describe('Schema tokens', () => {
        it('should highlight schema name as class definition', () => {
            const doc = createDocument('schema ServerConfig {}');
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const schemaToken = findToken(tokens, 0, 7); // "ServerConfig"
            expect(schemaToken).toBeDefined();
            expect(schemaToken?.type).toBe('class');
            expect(schemaToken?.modifiers).toContain('definition');
        });

        it('should highlight schema properties', () => {
            const doc = createDocument(`schema Config {
    string host
    number port
}`);
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const hostToken = findToken(tokens, 1, 11); // "host"
            expect(hostToken).toBeDefined();
            expect(hostToken?.type).toBe('property');
            expect(hostToken?.modifiers).toContain('declaration');
        });

        it('should highlight property types', () => {
            const doc = createDocument(`schema Config {
    string host
}`);
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const typeToken = findToken(tokens, 1, 4); // "string"
            expect(typeToken).toBeDefined();
            expect(typeToken?.type).toBe('type');
        });
    });

    describe('Component tokens', () => {
        it('should highlight component definition name', () => {
            const doc = createDocument('component WebServer {}');
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const componentToken = findToken(tokens, 0, 10); // "WebServer"
            expect(componentToken).toBeDefined();
            expect(componentToken?.type).toBe('class');
            expect(componentToken?.modifiers).toContain('definition');
        });

        it('should highlight input declarations', () => {
            const doc = createDocument(`component Server {
    input string name
}`);
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const inputToken = findToken(tokens, 1, 17); // "name"
            expect(inputToken).toBeDefined();
            expect(inputToken?.type).toBe('parameter');
            expect(inputToken?.modifiers).toContain('declaration');
        });

        it('should highlight output declarations', () => {
            const doc = createDocument(`component Server {
    output string endpoint
}`);
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const outputToken = findToken(tokens, 1, 18); // "endpoint"
            expect(outputToken).toBeDefined();
            expect(outputToken?.type).toBe('property');
            expect(outputToken?.modifiers).toContain('declaration');
        });

        it('should highlight component instance name', () => {
            const doc = createDocument('component WebServer api {}');
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            // "WebServer" is type reference, "api" is instance name
            const instanceToken = findToken(tokens, 0, 20); // "api"
            expect(instanceToken).toBeDefined();
            expect(instanceToken?.type).toBe('variable');
            expect(instanceToken?.modifiers).toContain('declaration');
        });
    });

    describe('Resource tokens', () => {
        it('should highlight resource type reference', () => {
            const doc = createDocument('resource ServerConfig webServer {}');
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const typeToken = findToken(tokens, 0, 9); // "ServerConfig"
            expect(typeToken).toBeDefined();
            expect(typeToken?.type).toBe('class');
        });

        it('should highlight resource instance name', () => {
            const doc = createDocument('resource ServerConfig webServer {}');
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const instanceToken = findToken(tokens, 0, 22); // "webServer"
            expect(instanceToken).toBeDefined();
            expect(instanceToken?.type).toBe('variable');
            expect(instanceToken?.modifiers).toContain('declaration');
        });
    });

    describe('Function tokens', () => {
        it('should highlight function name as definition', () => {
            const doc = createDocument('fun calculate() {}');
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const funcToken = findToken(tokens, 0, 4); // "calculate"
            expect(funcToken).toBeDefined();
            expect(funcToken?.type).toBe('function');
            expect(funcToken?.modifiers).toContain('definition');
        });

        it('should highlight function parameters', () => {
            const doc = createDocument('fun calc(number x, string y) {}');
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const param1 = findToken(tokens, 0, 16); // "x"
            expect(param1).toBeDefined();
            expect(param1?.type).toBe('parameter');
            expect(param1?.modifiers).toContain('declaration');

            const param2 = findToken(tokens, 0, 26); // "y"
            expect(param2).toBeDefined();
            expect(param2?.type).toBe('parameter');
        });

        it('should highlight return type', () => {
            const doc = createDocument('fun getValue() number {}');
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const returnType = findToken(tokens, 0, 15); // "number"
            expect(returnType).toBeDefined();
            expect(returnType?.type).toBe('type');
        });
    });

    describe('Variable tokens', () => {
        it('should highlight variable declaration', () => {
            const doc = createDocument('var myVar = 123');
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const varToken = findToken(tokens, 0, 4); // "myVar"
            expect(varToken).toBeDefined();
            expect(varToken?.type).toBe('variable');
            expect(varToken?.modifiers).toContain('declaration');
        });

        it('should highlight typed variable', () => {
            const doc = createDocument('var string name = "hello"');
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const typeToken = findToken(tokens, 0, 4); // "string"
            expect(typeToken).toBeDefined();
            expect(typeToken?.type).toBe('type');

            const varToken = findToken(tokens, 0, 11); // "name"
            expect(varToken).toBeDefined();
            expect(varToken?.type).toBe('variable');
            expect(varToken?.modifiers).toContain('declaration');
        });
    });

    describe('Type alias tokens', () => {
        it('should highlight type alias name', () => {
            const doc = createDocument('type Region = "us-east-1"');
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const typeToken = findToken(tokens, 0, 5); // "Region"
            expect(typeToken).toBeDefined();
            expect(typeToken?.type).toBe('type');
            expect(typeToken?.modifiers).toContain('definition');
        });
    });

    describe('Decorator tokens', () => {
        it('should highlight decorator name', () => {
            const doc = createDocument('@description("test")');
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const decoratorToken = findToken(tokens, 0, 1); // "description"
            expect(decoratorToken).toBeDefined();
            expect(decoratorToken?.type).toBe('decorator');
        });

        it('should highlight decorator without arguments', () => {
            const doc = createDocument('@deprecated');
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const decoratorToken = findToken(tokens, 0, 1); // "deprecated"
            expect(decoratorToken).toBeDefined();
            expect(decoratorToken?.type).toBe('decorator');
        });
    });

    describe('Keyword tokens', () => {
        it('should highlight control flow keywords', () => {
            const doc = createDocument(`fun test() {
    if true {
        return 1
    }
}`);
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const ifToken = findToken(tokens, 1, 4); // "if"
            expect(ifToken).toBeDefined();
            expect(ifToken?.type).toBe('keyword');

            const returnToken = findToken(tokens, 2, 8); // "return"
            expect(returnToken).toBeDefined();
            expect(returnToken?.type).toBe('keyword');
        });

        it('should highlight for loop keyword', () => {
            const doc = createDocument(`for item in items {}`);
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const forToken = findToken(tokens, 0, 0); // "for"
            expect(forToken).toBeDefined();
            expect(forToken?.type).toBe('keyword');

            const inToken = findToken(tokens, 0, 9); // "in"
            expect(inToken).toBeDefined();
            expect(inToken?.type).toBe('keyword');
        });
    });

    describe('Reference tokens', () => {
        it('should highlight variable reference', () => {
            const doc = createDocument(`var x = 1
var y = x`);
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const refToken = findToken(tokens, 1, 8); // "x" reference
            expect(refToken).toBeDefined();
            expect(refToken?.type).toBe('variable');
            expect(refToken?.modifiers).not.toContain('declaration');
        });

        it('should highlight function call', () => {
            const doc = createDocument(`fun calc() {}
var result = calc()`);
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            const callToken = findToken(tokens, 1, 13); // "calc" call
            expect(callToken).toBeDefined();
            expect(callToken?.type).toBe('function');
        });
    });

    describe('Edge cases', () => {
        it('should handle empty document', () => {
            const doc = createDocument('');
            const result = handleSemanticTokens(doc);
            expect(result.data).toEqual([]);
        });

        it('should skip comments', () => {
            const doc = createDocument('// var x = 1');
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            // Should have comment token but no variable token
            const varToken = tokens.find(t => t.type === 'variable');
            expect(varToken).toBeUndefined();
        });

        it('should handle string content (not highlight inside strings)', () => {
            const doc = createDocument('var x = "schema Config {}"');
            const result = handleSemanticTokens(doc);
            const tokens = decodeTokens(result.data);

            // Should only have the variable declaration, not schema inside string
            const schemaToken = tokens.find(t => t.type === 'class');
            expect(schemaToken).toBeUndefined();
        });
    });
});
