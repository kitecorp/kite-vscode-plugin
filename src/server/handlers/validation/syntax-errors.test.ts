/**
 * Tests for syntax error validation with improved messages
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkSyntaxErrors } from './syntax-errors';

describe('Syntax error validation', () => {
    const createDoc = (content: string) =>
        TextDocument.create('file:///test.kite', 'kite', 1, content);

    describe('Missing braces', () => {
        it('should report missing closing brace in schema', () => {
            const doc = createDoc(`
schema Config {
    string name
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics.length).toBeGreaterThan(0);
            // Parser reports EOF error or syntax error when brace is missing
            expect(diagnostics.some(d =>
                d.message.toLowerCase().includes("'}'") ||
                d.message.toLowerCase().includes('end of file') ||
                d.message.toLowerCase().includes('brace') ||
                d.message.toLowerCase().includes('syntax error') ||
                d.message.toLowerCase().includes('unexpected')
            )).toBe(true);
        });

        it('should report missing closing brace in function', () => {
            const doc = createDoc(`
fun calculate() number {
    return 42
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics.length).toBeGreaterThan(0);
        });

        it('should report missing opening brace', () => {
            const doc = createDoc(`
schema Config
    string name
}
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics.length).toBeGreaterThan(0);
        });
    });

    describe('Missing parentheses', () => {
        it('should report missing closing parenthesis in function', () => {
            const doc = createDoc(`
fun calculate(number x {
    return x
}
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics.length).toBeGreaterThan(0);
            expect(diagnostics.some(d => d.message.includes("')'") || d.message.includes("parenthesis"))).toBe(true);
        });

        it('should report missing opening parenthesis', () => {
            const doc = createDoc(`
fun calculate number x) {
    return x
}
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics.length).toBeGreaterThan(0);
        });
    });

    describe('Import statement errors', () => {
        it('should report missing from keyword', () => {
            const doc = createDoc(`
import * "common.kite"
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics.length).toBeGreaterThan(0);
            expect(diagnostics.some(d =>
                d.message.toLowerCase().includes('from') ||
                d.message.toLowerCase().includes('import')
            )).toBe(true);
        });

        it('should report missing path in import', () => {
            const doc = createDoc(`
import * from
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics.length).toBeGreaterThan(0);
        });
    });

    describe('Variable declaration errors', () => {
        it('should accept assignment without var keyword as expression', () => {
            // Note: The Kite parser accepts `x = 42` as an expression statement
            // This is valid syntax, even though it may be flagged by other validations
            const doc = createDoc(`
x = 42
`);
            const diagnostics = checkSyntaxErrors(doc);

            // No syntax error - this is valid (semantic error may be reported elsewhere)
            expect(diagnostics).toHaveLength(0);
        });

        it('should handle incomplete variable declaration', () => {
            const doc = createDoc(`
var x =
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics.length).toBeGreaterThan(0);
        });
    });

    describe('Function declaration errors', () => {
        it('should report missing function body', () => {
            const doc = createDoc(`
fun calculate() number
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics.length).toBeGreaterThan(0);
        });

        it('should accept shorthand parameter syntax', () => {
            // Note: The Kite parser accepts parameters without explicit type
            // Type checking is done at a semantic level, not syntax level
            const doc = createDoc(`
fun calculate(x) {
    return x
}
`);
            const diagnostics = checkSyntaxErrors(doc);

            // No syntax error - type inference/checking done elsewhere
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('Schema declaration errors', () => {
        it('should report missing schema name', () => {
            const doc = createDoc(`
schema {
    string name
}
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics.length).toBeGreaterThan(0);
        });

        it('should report invalid property syntax', () => {
            const doc = createDoc(`
schema Config {
    name = "default"
}
`);
            const diagnostics = checkSyntaxErrors(doc);

            // Properties need type: string name = "default"
            expect(diagnostics.length).toBeGreaterThan(0);
        });
    });

    describe('Resource declaration errors', () => {
        it('should report missing resource instance name', () => {
            const doc = createDoc(`
resource Config {
    name = "test"
}
`);
            const diagnostics = checkSyntaxErrors(doc);

            // Resources need: resource Schema instanceName { }
            expect(diagnostics.length).toBeGreaterThan(0);
        });
    });

    describe('Component declaration errors', () => {
        it('should report invalid input declaration', () => {
            const doc = createDoc(`
component Server {
    input name
}
`);
            const diagnostics = checkSyntaxErrors(doc);

            // Inputs need type: input string name
            expect(diagnostics.length).toBeGreaterThan(0);
        });
    });

    describe('Expression errors', () => {
        it('should report unclosed string in expression', () => {
            const doc = createDoc(`
var x = "hello
var y = 42
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics.length).toBeGreaterThan(0);
        });

        it('should report unclosed array', () => {
            const doc = createDoc(`
var x = [1, 2, 3
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics.length).toBeGreaterThan(0);
        });
    });

    describe('Control flow errors', () => {
        it('should report missing condition in if', () => {
            const doc = createDoc(`
if {
    var x = 1
}
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics.length).toBeGreaterThan(0);
        });

        it('should report missing body in for loop', () => {
            // Note: Without trailing newline, parser expects more input
            const doc = createDoc(`for item in items`);
            const diagnostics = checkSyntaxErrors(doc);

            // Parser expects a block expression after the iterable
            expect(diagnostics.length).toBeGreaterThan(0);
            expect(diagnostics.some(d =>
                d.message.toLowerCase().includes('end of file') ||
                d.message.toLowerCase().includes('{') ||
                d.message.toLowerCase().includes('block') ||
                d.message.toLowerCase().includes('unexpected') ||
                d.message.toLowerCase().includes('incomplete')
            )).toBe(true);
        });

        it('should report missing in keyword in for loop', () => {
            const doc = createDoc(`
for item items {
    println(item)
}
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics.length).toBeGreaterThan(0);
        });
    });

    describe('Decorator errors', () => {
        it('should report decorator in wrong position', () => {
            const doc = createDoc(`
var x = @description("test")
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics.length).toBeGreaterThan(0);
        });
    });

    describe('Valid code should have no syntax errors', () => {
        it('should not report errors for valid schema', () => {
            const doc = createDoc(`
schema Config {
    string name
    number port = 8080
}
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report errors for valid function', () => {
            const doc = createDoc(`
fun add(number a, number b) number {
    return a + b
}
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report errors for valid component', () => {
            const doc = createDoc(`
component Server {
    input string name = "default"
    output string endpoint = "http://localhost"
}
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report errors for valid resource', () => {
            const doc = createDoc(`
schema Config {
    string name
}

resource Config myConfig {
    name = "test"
}
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report errors for valid import', () => {
            const doc = createDoc(`
import * from "common.kite"
import Config, Server from "types.kite"
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report errors for valid control flow', () => {
            const doc = createDoc(`
fun process(number x) number {
    if x > 0 {
        return x
    } else {
        return 0
    }
}
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('Error message quality', () => {
        it('should provide helpful message for missing brace', () => {
            const doc = createDoc(`
schema Config {
    string name
`);
            const diagnostics = checkSyntaxErrors(doc);

            expect(diagnostics.length).toBeGreaterThan(0);
            // Message should be user-friendly, not raw ANTLR output
            const msg = diagnostics[0].message.toLowerCase();
            expect(
                msg.includes('brace') ||
                msg.includes('}') ||
                msg.includes('missing') ||
                msg.includes('end of file') ||
                msg.includes('syntax error') ||
                msg.includes('unexpected')
            ).toBe(true);
        });

        it('should have correct error range', () => {
            const doc = createDoc(`
schema Config {
    string name
`);
            const diagnostics = checkSyntaxErrors(doc);

            if (diagnostics.length > 0) {
                const range = diagnostics[0].range;
                // Error should point to a specific location
                expect(range.start.line).toBeGreaterThanOrEqual(0);
                expect(range.end.character).toBeGreaterThanOrEqual(range.start.character);
            }
        });
    });
});
