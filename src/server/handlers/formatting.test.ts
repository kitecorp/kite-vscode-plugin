/**
 * Tests for code formatting handler.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { formatDocument, FormatOptions } from './formatting';

// Helper to create a mock TextDocument
function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

// Helper to format and return the result as a string
function format(content: string, options?: Partial<FormatOptions>): string {
    const doc = createDocument(content);
    const edits = formatDocument(doc, {
        tabSize: 4,
        insertSpaces: true,
        ...options,
    });

    // Apply edits to get the result (edits are in reverse order)
    let result = content;
    const sortedEdits = [...edits].sort((a, b) => {
        if (b.range.start.line !== a.range.start.line) {
            return b.range.start.line - a.range.start.line;
        }
        return b.range.start.character - a.range.start.character;
    });

    for (const edit of sortedEdits) {
        const startOffset = doc.offsetAt(edit.range.start);
        const endOffset = doc.offsetAt(edit.range.end);
        result = result.substring(0, startOffset) + edit.newText + result.substring(endOffset);
    }

    return result;
}

describe('formatDocument', () => {
    describe('indentation', () => {
        it('should indent schema body with 4 spaces by default', () => {
            const input = `schema Config {
string host
number port
}`;
            const expected = `schema Config {
    string host
    number port
}`;
            expect(format(input)).toBe(expected);
        });

        it('should indent with 2 spaces when tabSize is 2', () => {
            const input = `schema Config {
string host
}`;
            const expected = `schema Config {
  string host
}`;
            expect(format(input, { tabSize: 2 })).toBe(expected);
        });

        it('should indent component body', () => {
            const input = `component WebServer {
input string name
output string url
}`;
            const expected = `component WebServer {
    input string name
    output string url
}`;
            expect(format(input)).toBe(expected);
        });

        it('should indent resource body', () => {
            const input = `resource Config server {
host = "localhost"
port = 8080
}`;
            const expected = `resource Config server {
    host = "localhost"
    port = 8080
}`;
            expect(format(input)).toBe(expected);
        });

        it('should indent function body', () => {
            const input = `fun greet(string name) string {
return "Hello, " + name
}`;
            const expected = `fun greet(string name) string {
    return "Hello, " + name
}`;
            expect(format(input)).toBe(expected);
        });

        it('should indent nested blocks', () => {
            const input = `component WebServer {
input string name
resource Config server {
host = "localhost"
}
}`;
            const expected = `component WebServer {
    input string name
    resource Config server {
        host = "localhost"
    }
}`;
            expect(format(input)).toBe(expected);
        });

        it('should indent control flow statements', () => {
            const input = `fun test() {
if (condition) {
doSomething()
}
}`;
            const expected = `fun test() {
    if (condition) {
        doSomething()
    }
}`;
            expect(format(input)).toBe(expected);
        });

        it('should indent for loops', () => {
            const input = `fun process(items) {
for (item in items) {
process(item)
}
}`;
            const expected = `fun process(items) {
    for (item in items) {
        process(item)
    }
}`;
            expect(format(input)).toBe(expected);
        });
    });

    describe('spacing', () => {
        it('should add space around assignment operator', () => {
            const input = `var x=1`;
            const expected = `var x = 1`;
            expect(format(input)).toBe(expected);
        });

        it('should add space around equals in properties', () => {
            const input = `resource Config server {
    host="localhost"
    port=8080
}`;
            const expected = `resource Config server {
    host = "localhost"
    port = 8080
}`;
            expect(format(input)).toBe(expected);
        });

        it('should handle spacing in object literals', () => {
            const input = `@tags({Environment:"prod",Team:"platform"})`;
            const expected = `@tags({ Environment: "prod", Team: "platform" })`;
            expect(format(input)).toBe(expected);
        });

        it('should handle spacing in array literals', () => {
            const input = `var items = [1,2,3]`;
            const expected = `var items = [1, 2, 3]`;
            expect(format(input)).toBe(expected);
        });

        it('should add space after keywords', () => {
            const input = `if(condition) { }`;
            const expected = `if (condition) { }`;
            expect(format(input)).toBe(expected);
        });

        it('should handle for loop spacing', () => {
            const input = `for(item in items) { }`;
            const expected = `for (item in items) { }`;
            expect(format(input)).toBe(expected);
        });
    });

    describe('trailing whitespace', () => {
        it('should remove trailing whitespace', () => {
            const input = `var x = 1   \nvar y = 2  `;
            const expected = `var x = 1\nvar y = 2`;
            expect(format(input)).toBe(expected);
        });

        it('should remove trailing whitespace from empty lines', () => {
            const input = `schema Config {\n    \n    string host\n}`;
            const expected = `schema Config {\n\n    string host\n}`;
            expect(format(input)).toBe(expected);
        });
    });

    describe('blank lines', () => {
        it('should preserve single blank lines between declarations', () => {
            const input = `schema Config { }

resource Config server { }`;
            const expected = `schema Config { }

resource Config server { }`;
            expect(format(input)).toBe(expected);
        });

        it('should reduce multiple blank lines to one', () => {
            const input = `schema Config { }



resource Config server { }`;
            const expected = `schema Config { }

resource Config server { }`;
            expect(format(input)).toBe(expected);
        });
    });

    describe('braces', () => {
        it('should keep opening brace on same line', () => {
            const input = `schema Config
{
    string host
}`;
            const expected = `schema Config {
    string host
}`;
            expect(format(input)).toBe(expected);
        });

        it('should put closing brace on its own line', () => {
            const input = `schema Config { string host }`;
            // Single-line declarations should stay single-line
            const expected = `schema Config { string host }`;
            expect(format(input)).toBe(expected);
        });

        it('should add space before opening brace', () => {
            const input = `schema Config{
    string host
}`;
            const expected = `schema Config {
    string host
}`;
            expect(format(input)).toBe(expected);
        });
    });

    describe('imports', () => {
        it('should format import statements', () => {
            const input = `import * from"common.kite"`;
            const expected = `import * from "common.kite"`;
            expect(format(input)).toBe(expected);
        });

        it('should format named imports', () => {
            const input = `import Config from"common.kite"`;
            const expected = `import Config from "common.kite"`;
            expect(format(input)).toBe(expected);
        });
    });

    describe('decorators', () => {
        it('should format decorator with arguments', () => {
            const input = `@cloud("aws")
resource VM server { }`;
            const expected = `@cloud("aws")
resource VM server { }`;
            expect(format(input)).toBe(expected);
        });

        it('should format decorator with object argument', () => {
            const input = `@tags({Environment:"prod"})
resource VM server { }`;
            const expected = `@tags({ Environment: "prod" })
resource VM server { }`;
            expect(format(input)).toBe(expected);
        });
    });

    describe('strings', () => {
        it('should not modify string contents', () => {
            const input = `var x = "hello   world"`;
            const expected = `var x = "hello   world"`;
            expect(format(input)).toBe(expected);
        });

        it('should not modify string interpolation', () => {
            const input = `var x = "Hello, \${name}!"`;
            const expected = `var x = "Hello, \${name}!"`;
            expect(format(input)).toBe(expected);
        });
    });

    describe('comments', () => {
        it('should preserve line comments', () => {
            const input = `// This is a comment
var x = 1`;
            const expected = `// This is a comment
var x = 1`;
            expect(format(input)).toBe(expected);
        });

        it('should preserve block comments', () => {
            const input = `/* Block comment */
var x = 1`;
            const expected = `/* Block comment */
var x = 1`;
            expect(format(input)).toBe(expected);
        });

        it('should indent comments inside blocks', () => {
            const input = `schema Config {
// Comment
string host
}`;
            const expected = `schema Config {
    // Comment
    string host
}`;
            expect(format(input)).toBe(expected);
        });
    });

    describe('vertical alignment', () => {
        it('should align values by = in schema body', () => {
            const input = `schema Config {
    string hostname = "localhost"
    number port = 8080
    boolean ssl = true
}`;
            const expected = `schema Config {
    string hostname = "localhost"
    number port     = 8080
    boolean ssl     = true
}`;
            expect(format(input)).toBe(expected);
        });

        it('should align values by = in resource body', () => {
            const input = `resource Config server {
    hostname = "localhost"
    port = 8080
    ssl = true
}`;
            const expected = `resource Config server {
    hostname = "localhost"
    port     = 8080
    ssl      = true
}`;
            expect(format(input)).toBe(expected);
        });

        it('should align values by = in component body', () => {
            const input = `component WebServer {
    input string name = "default"
    input number replicas = 1
    output string endpoint = "http://localhost"
}`;
            const expected = `component WebServer {
    input string name      = "default"
    input number replicas  = 1
    output string endpoint = "http://localhost"
}`;
            expect(format(input)).toBe(expected);
        });

        it('should handle mixed lines with and without =', () => {
            const input = `schema Config {
    string host = "localhost"
    number port
    boolean ssl = true
}`;
            const expected = `schema Config {
    string host = "localhost"
    number port
    boolean ssl = true
}`;
            expect(format(input)).toBe(expected);
        });

        it('should align decorated inputs', () => {
            const input = `component WebServer {
    @unique
    @allowed(["dev", "prod"])
    input string env = "dev"
    input string instanceType = "t2.micro"
}`;
            const expected = `component WebServer {
    @unique
    @allowed(["dev", "prod"])
    input string env          = "dev"
    input string instanceType = "t2.micro"
}`;
            expect(format(input)).toBe(expected);
        });

        it('should not align across different blocks', () => {
            const input = `schema A {
    string x = "a"
}

schema B {
    string longerName = "b"
}`;
            const expected = `schema A {
    string x = "a"
}

schema B {
    string longerName = "b"
}`;
            expect(format(input)).toBe(expected);
        });
    });

    describe('complex cases', () => {
        it('should format a complete schema', () => {
            const input = `schema ServerConfig{
string host="localhost"
number port=8080
boolean ssl=true
}`;
            const expected = `schema ServerConfig {
    string host = "localhost"
    number port = 8080
    boolean ssl = true
}`;
            expect(format(input)).toBe(expected);
        });

        it('should format a component with inputs and outputs', () => {
            const input = `component WebServer{
input string name="default"
input number replicas=1
output string endpoint="http://localhost"
}`;
            const expected = `component WebServer {
    input string name      = "default"
    input number replicas  = 1
    output string endpoint = "http://localhost"
}`;
            expect(format(input)).toBe(expected);
        });

        it('should format nested object literals', () => {
            const input = `resource Config server {
    settings = {
        database = {
            host = "localhost"
        }
    }
}`;
            // Already properly formatted
            expect(format(input)).toBe(input);
        });
    });
});
