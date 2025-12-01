/**
 * Tests for duplicate property detection in schemas and resources
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkDuplicateProperties } from './duplicate-properties';

function createDocument(content: string): TextDocument {
    return TextDocument.create('file:///test.kite', 'kite', 1, content);
}

describe('checkDuplicateProperties', () => {
    describe('Schema definitions', () => {
        it('should report error for duplicate property names in schema', () => {
            const doc = createDocument(`
schema Config {
    string name
    number port
    string name
}
`);
            const diagnostics = checkDuplicateProperties(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("Duplicate property 'name'");
            expect(diagnostics[0].message).toContain('Config');
        });

        it('should report multiple errors for multiple duplicates', () => {
            const doc = createDocument(`
schema Config {
    string name
    number port
    string name
    number port
}
`);
            const diagnostics = checkDuplicateProperties(doc);

            expect(diagnostics).toHaveLength(2);
            expect(diagnostics.some(d => d.message.includes("'name'"))).toBe(true);
            expect(diagnostics.some(d => d.message.includes("'port'"))).toBe(true);
        });

        it('should not report error when no duplicates', () => {
            const doc = createDocument(`
schema Config {
    string name
    number port
    boolean enabled
}
`);
            const diagnostics = checkDuplicateProperties(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should check each schema independently', () => {
            const doc = createDocument(`
schema Config1 {
    string name
}

schema Config2 {
    string name
}
`);
            const diagnostics = checkDuplicateProperties(doc);

            // Same property name in different schemas is OK
            expect(diagnostics).toHaveLength(0);
        });

        it('should handle dotted schema names', () => {
            const doc = createDocument(`
schema AWS.EC2.Instance {
    string name
    number count
    string name
}
`);
            const diagnostics = checkDuplicateProperties(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'name'");
        });

        it('should handle array type properties', () => {
            const doc = createDocument(`
schema Config {
    string[] tags
    number port
    string[] tags
}
`);
            const diagnostics = checkDuplicateProperties(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("'tags'");
        });
    });

    describe('Resource instances', () => {
        it('should report error for duplicate property assignments', () => {
            const doc = createDocument(`
resource Config server {
    name = "server1"
    port = 8080
    name = "server2"
}
`);
            const diagnostics = checkDuplicateProperties(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("Duplicate property 'name'");
        });

        it('should report multiple duplicate assignments', () => {
            const doc = createDocument(`
resource Config server {
    name = "server1"
    port = 8080
    name = "server2"
    port = 9090
}
`);
            const diagnostics = checkDuplicateProperties(doc);

            expect(diagnostics).toHaveLength(2);
        });

        it('should not report error when no duplicate assignments', () => {
            const doc = createDocument(`
resource Config server {
    name = "server1"
    port = 8080
    enabled = true
}
`);
            const diagnostics = checkDuplicateProperties(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should check each resource independently', () => {
            const doc = createDocument(`
resource Config server1 {
    name = "server1"
}

resource Config server2 {
    name = "server2"
}
`);
            const diagnostics = checkDuplicateProperties(doc);

            // Same property in different resources is OK
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('Component instances', () => {
        it('should report error for duplicate input assignments', () => {
            const doc = createDocument(`
component WebServer api {
    name = "api1"
    replicas = 3
    name = "api2"
}
`);
            const diagnostics = checkDuplicateProperties(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain("Duplicate property 'name'");
        });
    });

    describe('Edge cases', () => {
        it('should handle empty document', () => {
            const doc = createDocument('');
            const diagnostics = checkDuplicateProperties(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should handle empty schema', () => {
            const doc = createDocument('schema Empty { }');
            const diagnostics = checkDuplicateProperties(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should handle empty resource', () => {
            const doc = createDocument('resource Config empty { }');
            const diagnostics = checkDuplicateProperties(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should ignore schemas in comments', () => {
            const doc = createDocument(`
// schema Config { string name string name }
/* schema Bad { number x number x } */
`);
            const diagnostics = checkDuplicateProperties(doc);

            expect(diagnostics).toHaveLength(0);
        });

        it('should highlight the duplicate (second occurrence)', () => {
            const doc = createDocument(`
schema Config {
    string name
    string name
}
`);
            const diagnostics = checkDuplicateProperties(doc);

            expect(diagnostics).toHaveLength(1);
            // The error should point to the second 'name'
            const lines = doc.getText().split('\n');
            const errorLine = diagnostics[0].range.start.line;
            expect(lines[errorLine]).toContain('name');
            // Second occurrence is on line 3 (0-indexed)
            expect(errorLine).toBe(3);
        });
    });
});
