/**
 * Tests for reserved name validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkReservedNames } from './reserved-names';

function createDocument(content: string): TextDocument {
    return TextDocument.create('file:///test.kite', 'kite', 1, content);
}

describe('checkReservedNames', () => {
    describe('Schema property names', () => {
        it('should report error for type used as property name', () => {
            const doc = createDocument(`
schema Config {
    string string
}
`);
            const diagnostics = checkReservedNames(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'string'");
            expect(diagnostics[0].message).toContain('reserved word');
        });

        it('should report error for keyword used as property name', () => {
            const doc = createDocument(`
schema Config {
    number if
}
`);
            const diagnostics = checkReservedNames(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'if'");
        });

        it('should report multiple errors for multiple reserved names', () => {
            const doc = createDocument(`
schema Config {
    string number
    boolean for
    number while
}
`);
            const diagnostics = checkReservedNames(doc);

            expect(diagnostics).toHaveLength(3);
            expect(diagnostics.some(d => d.message.includes("'number'"))).toBe(true);
            expect(diagnostics.some(d => d.message.includes("'for'"))).toBe(true);
            expect(diagnostics.some(d => d.message.includes("'while'"))).toBe(true);
        });

        it('should not report error for valid property names', () => {
            const doc = createDocument(`
schema ServerConfig {
    string host
    number port
    boolean ssl
}
`);
            const diagnostics = checkReservedNames(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should handle array types', () => {
            const doc = createDocument(`
schema Config {
    string[] string
}
`);
            const diagnostics = checkReservedNames(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'string'");
        });
    });

    describe('Component input/output names', () => {
        it('should report error for type used as input name', () => {
            const doc = createDocument(`
component Server {
    input string boolean
}
`);
            const diagnostics = checkReservedNames(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'boolean'");
            expect(diagnostics[0].message).toContain('input name');
        });

        it('should report error for keyword used as output name', () => {
            const doc = createDocument(`
component Server {
    output string return
}
`);
            const diagnostics = checkReservedNames(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'return'");
            expect(diagnostics[0].message).toContain('output name');
        });

        it('should not report error for valid input/output names', () => {
            const doc = createDocument(`
component WebServer {
    input string name
    input number replicas
    output string endpoint
}
`);
            const diagnostics = checkReservedNames(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report error for output with default value using property access', () => {
            const doc = createDocument(`
component WebServer {
    output string endpoint = server.size
}
`);
            const diagnostics = checkReservedNames(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report error for output with interpolated default value', () => {
            const doc = createDocument(`
component WebServer {
    output string url = "http://\${host}:\${port}"
}
`);
            const diagnostics = checkReservedNames(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should handle output with complex expression', () => {
            const doc = createDocument(`
component WebServer {
    output string result = someFunc(a, b)
}
`);
            const diagnostics = checkReservedNames(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should report error when type name used as output name with custom type', () => {
            // This is the user's case: output CustomType string
            // where string is mistakenly used as the name
            const doc = createDocument(`
component WebServer {
    output MyType string = something
}
`);
            const diagnostics = checkReservedNames(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'string'");
        });

        it('should not report error for user full component example', () => {
            const doc = createDocument(`
component WebServer {
  @unique
  @allowed(["dev", "prod"])
  input string env          = "dev"
  input string instanceType = "t2.micro"

  var client = "myClient"

  resource Instance server {
    size = instanceType
    tag = {
      Environment: "$env",
      Name: "web-server",
      New: {
        a: "b"
      }
    }

  }

  resource DatabaseConfig config {
    size = instanceType
    tag = {
      Environment: "$env",
      Name: "web-server",
      New: {
        a: "b"
      }
    }
    private_ips = ["172.16.10.100"]
  }
  // some output
  output string endpoint = server.size
  output string tag      = server.tag.Name
  output string tagNameA = server.tag.New.a
}
`);
            const diagnostics = checkReservedNames(doc);

            // Should have NO errors - all names are valid
            expect(diagnostics).toHaveLength(0);
        });

        it('should not check component instantiations', () => {
            const doc = createDocument(`
component Server {
    input string name
}

component Server myServer {
    name = "test"
}
`);
            const diagnostics = checkReservedNames(doc);

            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty document', () => {
            const doc = createDocument('');
            const diagnostics = checkReservedNames(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should ignore schemas in comments', () => {
            const doc = createDocument(`
// schema Bad { string string }
`);
            const diagnostics = checkReservedNames(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should check all reserved keywords', () => {
            const keywords = ['if', 'else', 'for', 'while', 'in', 'return', 'var', 'fun'];

            for (const keyword of keywords) {
                const doc = createDocument(`schema Test { string ${keyword} }`);
                const diagnostics = checkReservedNames(doc);

                expect(diagnostics.length).toBeGreaterThanOrEqual(1);
                expect(diagnostics[0].message).toContain(`'${keyword}'`);
            }
        });

        it('should check all reserved types', () => {
            const types = ['string', 'number', 'boolean', 'any', 'object'];

            for (const type of types) {
                const doc = createDocument(`schema Test { string ${type} }`);
                const diagnostics = checkReservedNames(doc);

                expect(diagnostics.length).toBeGreaterThanOrEqual(1);
                expect(diagnostics[0].message).toContain(`'${type}'`);
            }
        });
    });
});
