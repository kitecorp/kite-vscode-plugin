import { describe, it, expect } from 'vitest';
import { parseKite, tokenize, getTokenAtOffset, positionToOffset, offsetToPosition, KiteLexer } from './parse-utils';

describe('parseKite', () => {
    it('should parse a simple variable declaration', () => {
        const result = parseKite('var x = 1');
        expect(result.errors).toHaveLength(0);
        expect(result.tree).toBeDefined();
    });

    it('should parse a schema definition', () => {
        const result = parseKite(`
schema Config {
    string host
    number port = 8080
}
`);
        expect(result.errors).toHaveLength(0);
    });

    it('should parse a component definition', () => {
        const result = parseKite(`
component WebServer {
    input string name = "default"
    output string url = "http://localhost"
}
`);
        expect(result.errors).toHaveLength(0);
    });

    it('should parse a function definition', () => {
        const result = parseKite(`
fun greet(string name) string {
    return "Hello, " + name
}
`);
        expect(result.errors).toHaveLength(0);
    });

    it('should collect syntax errors', () => {
        const result = parseKite('var x = ');
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should parse imports', () => {
        const result = parseKite('import * from "common.kite"');
        expect(result.errors).toHaveLength(0);
    });

    it('should parse resource declarations', () => {
        const result = parseKite(`
resource Config db {
    host = "localhost"
}
`);
        expect(result.errors).toHaveLength(0);
    });

    it('should parse decorators', () => {
        const result = parseKite(`
@cloud("aws")
@tags({Environment: "prod"})
resource VM.Instance server {
    name = "web"
}
`);
        expect(result.errors).toHaveLength(0);
    });

    it('should parse string interpolation', () => {
        const result = parseKite('var greeting = "Hello, ${name}!"');
        expect(result.errors).toHaveLength(0);
    });

    it('should parse for loops', () => {
        const result = parseKite(`
for item in items {
    var x = item
}
`);
        expect(result.errors).toHaveLength(0);
    });
});

describe('tokenize', () => {
    it('should return tokens for source code', () => {
        const tokens = tokenize('var x = 1');
        expect(tokens.length).toBeGreaterThan(0);

        const tokenTypes = tokens.map(t => t.type);
        expect(tokenTypes).toContain(KiteLexer.VAR);
        expect(tokenTypes).toContain(KiteLexer.IDENTIFIER);
        expect(tokenTypes).toContain(KiteLexer.ASSIGN);
        expect(tokenTypes).toContain(KiteLexer.NUMBER);
    });

    it('should handle keywords correctly', () => {
        const tokens = tokenize('schema component resource');
        const types = tokens.filter(t => t.type !== KiteLexer.NL).map(t => t.type);
        expect(types).toContain(KiteLexer.SCHEMA);
        expect(types).toContain(KiteLexer.COMPONENT);
        expect(types).toContain(KiteLexer.RESOURCE);
    });
});

describe('getTokenAtOffset', () => {
    it('should find token at offset', () => {
        const source = 'var x = 1';
        const token = getTokenAtOffset(source, 4); // 'x'
        expect(token).toBeDefined();
        expect(token!.text).toBe('x');
    });

    it('should return undefined for offset outside tokens', () => {
        const source = 'var x = 1';
        const token = getTokenAtOffset(source, 100);
        expect(token).toBeUndefined();
    });
});

describe('positionToOffset', () => {
    it('should convert line/column to offset', () => {
        const source = 'line1\nline2\nline3';
        expect(positionToOffset(source, 1, 0)).toBe(0);
        expect(positionToOffset(source, 2, 0)).toBe(6);
        expect(positionToOffset(source, 3, 0)).toBe(12);
    });

    it('should handle column correctly', () => {
        const source = 'var x = 1';
        expect(positionToOffset(source, 1, 4)).toBe(4);
    });

    it('should handle Windows line endings (CRLF)', () => {
        const source = 'line1\r\nline2\r\nline3';
        expect(positionToOffset(source, 1, 0)).toBe(0);
        expect(positionToOffset(source, 2, 0)).toBe(7);  // 5 + 2 for \r\n
        expect(positionToOffset(source, 3, 0)).toBe(14); // 7 + 5 + 2
    });

    it('should handle old Mac line endings (CR only)', () => {
        const source = 'line1\rline2\rline3';
        expect(positionToOffset(source, 1, 0)).toBe(0);
        expect(positionToOffset(source, 2, 0)).toBe(6);
        expect(positionToOffset(source, 3, 0)).toBe(12);
    });
});

describe('offsetToPosition', () => {
    it('should convert offset to line/column', () => {
        const source = 'line1\nline2\nline3';
        expect(offsetToPosition(source, 0)).toEqual({ line: 1, column: 0 });
        expect(offsetToPosition(source, 6)).toEqual({ line: 2, column: 0 });
        expect(offsetToPosition(source, 12)).toEqual({ line: 3, column: 0 });
    });

    it('should handle column correctly', () => {
        const source = 'var x = 1';
        expect(offsetToPosition(source, 4)).toEqual({ line: 1, column: 4 });
    });

    it('should handle Windows line endings (CRLF)', () => {
        const source = 'line1\r\nline2\r\nline3';
        expect(offsetToPosition(source, 0)).toEqual({ line: 1, column: 0 });
        expect(offsetToPosition(source, 7)).toEqual({ line: 2, column: 0 });
        expect(offsetToPosition(source, 14)).toEqual({ line: 3, column: 0 });
    });

    it('should handle old Mac line endings (CR only)', () => {
        const source = 'line1\rline2\rline3';
        expect(offsetToPosition(source, 0)).toEqual({ line: 1, column: 0 });
        expect(offsetToPosition(source, 6)).toEqual({ line: 2, column: 0 });
        expect(offsetToPosition(source, 12)).toEqual({ line: 3, column: 0 });
    });
});
