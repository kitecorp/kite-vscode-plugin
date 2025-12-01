/**
 * Tests for missing required properties detection
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkMissingProperties } from './missing-properties';

function createDocument(content: string, uri = 'file:///workspace/test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

describe('checkMissingProperties', () => {
    describe('Resource instances', () => {
        it('should report error for missing required property', () => {
            const doc = createDocument(`
schema ServerConfig {
    string host
    number port = 8080
}

resource ServerConfig server {
    // missing 'host' which is required
}
`);
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("Missing required property 'host'");
            expect(diagnostics[0].message).toContain('ServerConfig');
        });

        it('should not report error when all required properties are provided', () => {
            const doc = createDocument(`
schema ServerConfig {
    string host
    number port = 8080
}

resource ServerConfig server {
    host = "localhost"
}
`);
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report error for optional properties with defaults', () => {
            const doc = createDocument(`
schema ServerConfig {
    string host
    number port = 8080
    boolean ssl = false
}

resource ServerConfig server {
    host = "localhost"
    // port and ssl are optional - have defaults
}
`);
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should report multiple missing required properties', () => {
            const doc = createDocument(`
schema DatabaseConfig {
    string host
    number port
    string username
    string password
}

resource DatabaseConfig db {
    host = "localhost"
    // missing port, username, password
}
`);
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(3);
            expect(diagnostics.some(d => d.message.includes("'port'"))).toBe(true);
            expect(diagnostics.some(d => d.message.includes("'username'"))).toBe(true);
            expect(diagnostics.some(d => d.message.includes("'password'"))).toBe(true);
        });

        it('should not report error for unknown schema', () => {
            const doc = createDocument(`
resource UnknownSchema server {
    host = "localhost"
}
`);
            const diagnostics = checkMissingProperties(doc);

            // Unknown schema - can't validate, so no error for missing properties
            expect(diagnostics).toHaveLength(0);
        });

        it('should handle schema with all optional properties', () => {
            const doc = createDocument(`
schema Config {
    string name = "default"
    number timeout = 30
}

resource Config myConfig {
    // all properties are optional
}
`);
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should handle schema with all required properties', () => {
            const doc = createDocument(`
schema Credentials {
    string username
    string password
}

resource Credentials creds {
    username = "admin"
    password = "secret"
}
`);
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should handle array type properties', () => {
            const doc = createDocument(`
schema Config {
    string[] hosts
    number port = 8080
}

resource Config cfg {
    // missing required 'hosts' array
}
`);
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'hosts'");
        });
    });

    describe('Component instances', () => {
        it('should not check component inputs (all inputs are optional - prompted at runtime)', () => {
            const doc = createDocument(`
component WebServer {
    input string name
    input number replicas = 1
}

component WebServer api {
    // inputs not provided - user will be prompted at runtime
}
`);
            const diagnostics = checkMissingProperties(doc);

            // No errors for missing component inputs
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty document', () => {
            const doc = createDocument('');
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should handle schema without properties', () => {
            const doc = createDocument(`
schema Empty { }

resource Empty e { }
`);
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should ignore resources/components in comments', () => {
            const doc = createDocument(`
schema Config {
    string name
}

// resource Config commented {
// }

/* resource Config blockCommented {
} */
`);
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should handle nested braces in property values', () => {
            const doc = createDocument(`
schema Config {
    string name
    object settings
}

resource Config cfg {
    name = "test"
    settings = { key: "value" }
}
`);
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should handle multiple resources of same schema', () => {
            const doc = createDocument(`
schema Server {
    string host
    number port = 8080
}

resource Server web {
    host = "web.example.com"
}

resource Server api {
    // missing host
}

resource Server db {
    host = "db.example.com"
}
`);
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(1);
            // Should point to the 'api' resource
            expect(diagnostics[0].message).toContain("'host'");
        });

        it('should handle dotted schema names', () => {
            const doc = createDocument(`
schema AWS.EC2.Instance {
    string instanceType
    string ami
}

resource AWS.EC2.Instance server {
    instanceType = "t2.micro"
    // missing 'ami'
}
`);
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'ami'");
        });

        it('should highlight the resource/component instance name', () => {
            const doc = createDocument(`
schema Config {
    string name
}

resource Config myInstance {
}
`);
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(1);
            // The error should point to the instance name or opening brace
            const startLine = diagnostics[0].range.start.line;
            const text = doc.getText();
            const lines = text.split('\n');
            expect(lines[startLine]).toContain('myInstance');
        });
    });

    describe('Mixed schemas and components', () => {
        it('should only check schema resources, not component instances', () => {
            const doc = createDocument(`
schema DatabaseConfig {
    string host
    number port
}

component WebServer {
    input string name
    input number replicas = 1
}

resource DatabaseConfig db {
    // missing host and port - should report errors
}

component WebServer api {
    // missing inputs - no error (inputs are optional)
}
`);
            const diagnostics = checkMissingProperties(doc);

            // Only schema resource errors, not component input errors
            expect(diagnostics).toHaveLength(2);
            expect(diagnostics.some(d => d.message.includes("'host'"))).toBe(true);
            expect(diagnostics.some(d => d.message.includes("'port'"))).toBe(true);
            expect(diagnostics.some(d => d.message.includes("'name'"))).toBe(false);
        });
    });
});
