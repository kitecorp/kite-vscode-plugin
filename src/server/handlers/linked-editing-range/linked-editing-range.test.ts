/**
 * Tests for Linked Editing Range handler
 * Provides simultaneous editing of related ranges (e.g., loop variable and its uses)
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver/node';
import { handleLinkedEditingRange } from './index';

function createDocument(content: string): TextDocument {
    return TextDocument.create('file:///test.kite', 'kite', 1, content);
}

describe('Linked Editing Range', () => {
    describe('Loop variables', () => {
        it('should link loop variable declaration and uses', () => {
            const doc = createDocument(`for item in items {
    process(item)
    log(item)
}`);
            // On "item" in declaration (line 0, col 4)
            const result = handleLinkedEditingRange(doc, Position.create(0, 5));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(3);
            // Declaration
            expect(result?.ranges[0].start.line).toBe(0);
            expect(result?.ranges[0].start.character).toBe(4);
            // First use
            expect(result?.ranges[1].start.line).toBe(1);
            // Second use
            expect(result?.ranges[2].start.line).toBe(2);
        });

        it('should link when cursor is on loop variable use', () => {
            const doc = createDocument(`for item in items {
    process(item)
}`);
            // On "item" in use (line 1)
            const result = handleLinkedEditingRange(doc, Position.create(1, 13));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(2);
        });

        it('should not link loop variable to same name outside loop', () => {
            const doc = createDocument(`var item = "outside"
for item in items {
    process(item)
}
var x = item`);
            // On "item" in loop declaration
            const result = handleLinkedEditingRange(doc, Position.create(1, 5));

            expect(result).not.toBeNull();
            // Should only include declaration and use inside loop, not outside
            expect(result?.ranges).toHaveLength(2);
            expect(result?.ranges[0].start.line).toBe(1); // declaration
            expect(result?.ranges[1].start.line).toBe(2); // use inside loop
        });

        it('should handle nested loops with different variables', () => {
            const doc = createDocument(`for outer in items {
    for inner in outer {
        process(inner)
    }
}`);
            // On "inner" in declaration
            const result = handleLinkedEditingRange(doc, Position.create(1, 9));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(2);
            expect(result?.ranges[0].start.line).toBe(1); // declaration
            expect(result?.ranges[1].start.line).toBe(2); // use
        });
    });

    describe('For comprehensions', () => {
        it('should link for comprehension variable declaration and uses', () => {
            const doc = createDocument(`[for env in environments]
resource S3.Bucket data {
    name = "data-\${env}"
    some = env
}`);
            // On "env" in [for env in environments]
            const result = handleLinkedEditingRange(doc, Position.create(0, 5));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(3);
            expect(result?.ranges[0].start.line).toBe(0); // declaration
            expect(result?.ranges[1].start.line).toBe(2); // use in string interpolation
            expect(result?.ranges[2].start.line).toBe(3); // use in assignment
        });

        it('should link when cursor is on for comprehension variable use', () => {
            const doc = createDocument(`[for item in items]
resource Config cfg {
    value = item
}`);
            // On "item" in use (line 2)
            const result = handleLinkedEditingRange(doc, Position.create(2, 12));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(2);
        });

        it('should handle for comprehension with string interpolation only', () => {
            const doc = createDocument(`[for region in regions]
resource S3.Bucket bucket {
    name = "bucket-\${region}"
}`);
            // On "region" in declaration
            const result = handleLinkedEditingRange(doc, Position.create(0, 5));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(2);
            expect(result?.ranges[0].start.line).toBe(0); // declaration
            expect(result?.ranges[1].start.line).toBe(2); // use in interpolation
        });

        it('should not link comprehension variable outside its scope', () => {
            const doc = createDocument(`var env = "production"
[for env in environments]
resource S3.Bucket data {
    name = env
}
var x = env`);
            // On "env" in comprehension declaration
            const result = handleLinkedEditingRange(doc, Position.create(1, 5));

            expect(result).not.toBeNull();
            // Should only include declaration and use inside resource, not outside
            expect(result?.ranges).toHaveLength(2);
            expect(result?.ranges[0].start.line).toBe(1); // declaration
            expect(result?.ranges[1].start.line).toBe(3); // use inside resource
        });
    });

    describe('Function parameters', () => {
        it('should link function parameter and uses in body', () => {
            const doc = createDocument(`fun calculate(number x) number {
    var y = x * 2
    return x + y
}`);
            // On "x" in parameter
            const result = handleLinkedEditingRange(doc, Position.create(0, 21));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(3);
            // Parameter declaration
            expect(result?.ranges[0].start.line).toBe(0);
            // First use (x * 2)
            expect(result?.ranges[1].start.line).toBe(1);
            // Second use (x + y)
            expect(result?.ranges[2].start.line).toBe(2);
        });

        it('should link when cursor is on parameter use', () => {
            const doc = createDocument(`fun double(number n) number {
    return n * 2
}`);
            // On "n" in return statement
            const result = handleLinkedEditingRange(doc, Position.create(1, 11));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(2);
        });

        it('should handle multiple parameters', () => {
            const doc = createDocument(`fun add(number a, number b) number {
    return a + b
}`);
            // On "a" in parameter
            const result = handleLinkedEditingRange(doc, Position.create(0, 15));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(2); // declaration + use
        });

        it('should not link parameter to same name outside function', () => {
            const doc = createDocument(`var x = 10
fun calc(number x) number {
    return x * 2
}
var y = x`);
            // On "x" in parameter
            const result = handleLinkedEditingRange(doc, Position.create(1, 16));

            expect(result).not.toBeNull();
            // Should only include parameter and use inside function
            expect(result?.ranges).toHaveLength(2);
            expect(result?.ranges[0].start.line).toBe(1); // parameter
            expect(result?.ranges[1].start.line).toBe(2); // use inside function
        });
    });

    describe('While loop variables', () => {
        it('should link variable declaration and uses in while loop', () => {
            const doc = createDocument(`var counter = 0
while (counter < 5) {
    println(counter)
    counter++
}`);
            // On "counter" in declaration (line 0)
            const result = handleLinkedEditingRange(doc, Position.create(0, 6));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(4); // declaration + 3 uses
        });

        it('should link when cursor is on while condition variable', () => {
            const doc = createDocument(`var counter = 0
while (counter < 5) {
    println(counter)
    counter++
}`);
            // On "counter" in while condition (line 1)
            const result = handleLinkedEditingRange(doc, Position.create(1, 10));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(4);
        });

        it('should link when cursor is on variable use inside while body', () => {
            const doc = createDocument(`var counter = 0
while (counter < 5) {
    println(counter)
    counter++
}`);
            // On "counter" in println (line 2)
            const result = handleLinkedEditingRange(doc, Position.create(2, 14));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(4);
        });
    });

    describe('Local variables in functions', () => {
        it('should link local variable declaration and uses in function', () => {
            const doc = createDocument(`fun process() {
    var total = 0
    total = total + 10
    return total
}`);
            // On "total" in declaration
            const result = handleLinkedEditingRange(doc, Position.create(1, 10));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(4); // declaration + 3 uses
        });

        it('should not link variables outside function scope', () => {
            const doc = createDocument(`var total = 100

fun process() {
    var total = 0
    return total
}

var x = total`);
            // On "total" in function (line 3)
            const result = handleLinkedEditingRange(doc, Position.create(3, 10));

            expect(result).not.toBeNull();
            // Should only include 2 occurrences within the function
            expect(result?.ranges).toHaveLength(2);
            expect(result?.ranges[0].start.line).toBe(3); // declaration
            expect(result?.ranges[1].start.line).toBe(4); // return
        });
    });

    describe('Non-linkable positions', () => {
        it('should return null for top-level variable', () => {
            const doc = createDocument(`var x = 1
var y = x`);
            // On "x" declaration - top level, should use rename instead
            const result = handleLinkedEditingRange(doc, Position.create(0, 4));

            expect(result).toBeNull();
        });

        it('should return null for function name', () => {
            const doc = createDocument(`fun calculate() {}`);
            // On function name
            const result = handleLinkedEditingRange(doc, Position.create(0, 6));

            expect(result).toBeNull();
        });

        it('should return null for schema name', () => {
            const doc = createDocument(`schema Config {}`);
            const result = handleLinkedEditingRange(doc, Position.create(0, 8));

            expect(result).toBeNull();
        });

        it('should return null for keywords', () => {
            const doc = createDocument(`for item in items {}`);
            // On "for" keyword
            const result = handleLinkedEditingRange(doc, Position.create(0, 1));

            expect(result).toBeNull();
        });

        it('should return null for whitespace', () => {
            const doc = createDocument(`var x = 1`);
            const result = handleLinkedEditingRange(doc, Position.create(0, 3));

            expect(result).toBeNull();
        });

        it('should return null for string content', () => {
            const doc = createDocument(`var x = "item"`);
            // Inside string
            const result = handleLinkedEditingRange(doc, Position.create(0, 10));

            expect(result).toBeNull();
        });
    });

    describe('Input/Output declarations', () => {
        it('should link top-level input declaration and uses', () => {
            const doc = createDocument(`input string bucketNames

@tags({Environment: "production"})
resource Storage backup {
    name = bucketNames
    replication = true
}`);
            // On "bucketNames" in input declaration
            const result = handleLinkedEditingRange(doc, Position.create(0, 13));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(2);
            expect(result?.ranges[0].start.line).toBe(0); // declaration
            expect(result?.ranges[1].start.line).toBe(4); // use in resource
        });

        it('should link when cursor is on input use in resource', () => {
            const doc = createDocument(`input string bucketNames

resource Storage backup {
    name = bucketNames
}`);
            // On "bucketNames" in resource
            const result = handleLinkedEditingRange(doc, Position.create(3, 11));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(2);
        });

        it('should link input with multiple uses', () => {
            const doc = createDocument(`input string prefix

resource Storage primary {
    name = prefix
}

resource Storage secondary {
    name = prefix
}`);
            // On "prefix" in declaration
            const result = handleLinkedEditingRange(doc, Position.create(0, 13));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(3);
        });

        it('should link output declaration and uses', () => {
            const doc = createDocument(`output string endpoint

resource API api {
    url = endpoint
}`);
            // On "endpoint" in output declaration
            const result = handleLinkedEditingRange(doc, Position.create(0, 14));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(2);
        });

        it('should link input inside component', () => {
            const doc = createDocument(`component WebServer {
    input string name
    output string endpoint = "http://\${name}.example.com"
}`);
            // On "name" in input declaration
            const result = handleLinkedEditingRange(doc, Position.create(1, 17));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(2);
            expect(result?.ranges[0].start.line).toBe(1); // declaration
            expect(result?.ranges[1].start.line).toBe(2); // use in interpolation
        });

        it('should link input with default value', () => {
            const doc = createDocument(`input number port = 8080

resource Server srv {
    listenPort = port
}`);
            // On "port" in declaration
            const result = handleLinkedEditingRange(doc, Position.create(0, 13));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(2);
        });

        it('should link input used in string interpolation', () => {
            const doc = createDocument(`input string bucketNames

resource Storage backup {
    name = "prefix-\${bucketNames}"
    tag = bucketNames
}`);
            // On "bucketNames" in declaration
            const result = handleLinkedEditingRange(doc, Position.create(0, 13));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(3);
            expect(result?.ranges[0].start.line).toBe(0); // declaration
            expect(result?.ranges[1].start.line).toBe(3); // use in string interpolation
            expect(result?.ranges[2].start.line).toBe(4); // direct use
        });

        it('should link when cursor is on input inside string interpolation', () => {
            const doc = createDocument(`input string env

resource S3.Bucket data {
    name = "data-\${env}-bucket"
}`);
            // On "env" inside the string interpolation (line 3, inside ${env})
            // Line 3: `    name = "data-${env}-bucket"`
            //          0123456789...    17 18 19-21
            // $ is at 17, { at 18, env starts at 19
            const result = handleLinkedEditingRange(doc, Position.create(3, 19));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(2);
        });
    });

    describe('String interpolation', () => {
        it('should link input with simple $var interpolation', () => {
            const doc = createDocument(`component WebServer {
    input string env = "dev"

    resource Instance server {
        tag = {
            Environment: "$env"
        }
    }
}`);
            // On "env" in input declaration
            const result = handleLinkedEditingRange(doc, Position.create(1, 17));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(2);
            expect(result?.ranges[0].start.line).toBe(1); // declaration
            expect(result?.ranges[1].start.line).toBe(5); // use in $env
        });

        it('should link when cursor is on $var interpolation', () => {
            const doc = createDocument(`component WebServer {
    input string env = "dev"

    resource Instance server {
        tag = "$env-server"
    }
}`);
            // On "env" inside "$env" (line 4)
            // Line: `        tag = "$env-server"`
            //        01234567890123456
            // $ is at 15, env starts at 16
            const result = handleLinkedEditingRange(doc, Position.create(4, 16));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(2);
        });

        it('should link variable used in string interpolation', () => {
            const doc = createDocument(`fun greet(string name) string {
    return "Hello, \${name}!"
}`);
            // On "name" in parameter
            const result = handleLinkedEditingRange(doc, Position.create(0, 19));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(2);
            expect(result?.ranges[0].start.line).toBe(0); // parameter
            expect(result?.ranges[1].start.line).toBe(1); // use in interpolation
        });

        it('should link loop variable used in string interpolation', () => {
            const doc = createDocument(`for item in items {
    println("Item: \${item}")
}`);
            const result = handleLinkedEditingRange(doc, Position.create(0, 5));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(2);
        });

        it('should link local variable used in string interpolation', () => {
            const doc = createDocument(`fun format() string {
    var value = 42
    return "Value is \${value}"
}`);
            // On "value" declaration
            const result = handleLinkedEditingRange(doc, Position.create(1, 8));

            expect(result).not.toBeNull();
            expect(result?.ranges).toHaveLength(2);
            expect(result?.ranges[0].start.line).toBe(1); // declaration
            expect(result?.ranges[1].start.line).toBe(2); // use in interpolation
        });
    });

    describe('Edge cases', () => {
        it('should handle empty document', () => {
            const doc = createDocument('');
            const result = handleLinkedEditingRange(doc, Position.create(0, 0));

            expect(result).toBeNull();
        });

        it('should handle single occurrence (no linking needed)', () => {
            const doc = createDocument(`for item in items {
}`);
            // "item" only declared, never used
            const result = handleLinkedEditingRange(doc, Position.create(0, 5));

            // Single occurrence - no need for linked editing
            expect(result).toBeNull();
        });

        it('should include wordPattern for valid identifiers', () => {
            const doc = createDocument(`for item in items {
    process(item)
}`);
            const result = handleLinkedEditingRange(doc, Position.create(0, 5));

            expect(result).not.toBeNull();
            expect(result?.wordPattern).toBeDefined();
        });
    });
});
