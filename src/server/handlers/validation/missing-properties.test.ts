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
        it('should report error for missing required input', () => {
            const doc = createDocument(`
component WebServer {
    input string name
    input number replicas = 1
}

component WebServer api {
    // missing 'name' which is required
}
`);
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("Missing required input 'name'");
            expect(diagnostics[0].message).toContain('WebServer');
        });

        it('should not report error when all required inputs are provided', () => {
            const doc = createDocument(`
component WebServer {
    input string name
    input number replicas = 1
}

component WebServer api {
    name = "api-server"
}
`);
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should not report error for component definitions', () => {
            const doc = createDocument(`
component WebServer {
    input string name
    input number replicas
    output string endpoint = "http://example.com"
}
`);
            // This is a definition, not an instantiation
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should report multiple missing required inputs', () => {
            const doc = createDocument(`
component Database {
    input string host
    input number port
    input string dbName
    input string user = "admin"
}

component Database myDb {
    // missing host, port, dbName
}
`);
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(3);
            expect(diagnostics.some(d => d.message.includes("'host'"))).toBe(true);
            expect(diagnostics.some(d => d.message.includes("'port'"))).toBe(true);
            expect(diagnostics.some(d => d.message.includes("'dbName'"))).toBe(true);
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
        it('should handle both schema resources and component instances', () => {
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
    // missing host and port
}

component WebServer api {
    // missing name
}
`);
            const diagnostics = checkMissingProperties(doc);

            expect(diagnostics).toHaveLength(3);
            expect(diagnostics.some(d => d.message.includes("'host'"))).toBe(true);
            expect(diagnostics.some(d => d.message.includes("'port'"))).toBe(true);
            expect(diagnostics.some(d => d.message.includes("'name'"))).toBe(true);
        });
    });
});
