/**
 * Tests for @cloud property assignment validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkCloudPropertyAssignment } from './cloud-property-assignment';

function createDocument(content: string, uri = 'file:///workspace/test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

describe('checkCloudPropertyAssignment', () => {
    it('should report error when setting @cloud property', () => {
        const doc = createDocument(`
schema ServerConfig {
    string name
    @cloud string arn
}

resource ServerConfig server {
    name = "web-server"
    arn = "arn:aws:..."  // Error: cannot set @cloud property
}
`);
        const diagnostics = checkCloudPropertyAssignment(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("Cannot set '@cloud' property 'arn'");
        expect(diagnostics[0].message).toContain('cloud provider');
    });

    it('should report multiple errors for multiple @cloud properties', () => {
        const doc = createDocument(`
schema ServerConfig {
    string name
    @cloud string arn
    @cloud string id
    @cloud string endpoint
}

resource ServerConfig server {
    name = "web-server"
    arn = "arn:aws:..."
    id = "i-123"
    endpoint = "http://..."
}
`);
        const diagnostics = checkCloudPropertyAssignment(doc);

        expect(diagnostics).toHaveLength(3);
        expect(diagnostics.some(d => d.message.includes("'arn'"))).toBe(true);
        expect(diagnostics.some(d => d.message.includes("'id'"))).toBe(true);
        expect(diagnostics.some(d => d.message.includes("'endpoint'"))).toBe(true);
    });

    it('should not report error for regular properties', () => {
        const doc = createDocument(`
schema ServerConfig {
    string name
    number port = 8080
    @cloud string arn
}

resource ServerConfig server {
    name = "web-server"
    port = 3000
}
`);
        const diagnostics = checkCloudPropertyAssignment(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should handle @cloud with importable argument', () => {
        const doc = createDocument(`
schema ServerConfig {
    string name
    @cloud(importable) string id
}

resource ServerConfig server {
    name = "web-server"
    id = "i-123"  // Error: cannot set @cloud property
}
`);
        const diagnostics = checkCloudPropertyAssignment(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("'id'");
    });

    it('should handle @cloud with importable=true argument', () => {
        const doc = createDocument(`
schema ServerConfig {
    string name
    @cloud(importable=true) string id
}

resource ServerConfig server {
    name = "web-server"
    id = "i-123"
}
`);
        const diagnostics = checkCloudPropertyAssignment(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("'id'");
    });

    it('should not report error when no @cloud properties exist', () => {
        const doc = createDocument(`
schema ServerConfig {
    string name
    number port = 8080
}

resource ServerConfig server {
    name = "web-server"
}
`);
        const diagnostics = checkCloudPropertyAssignment(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should handle multiple resources with same schema', () => {
        const doc = createDocument(`
schema ServerConfig {
    string name
    @cloud string arn
}

resource ServerConfig web {
    name = "web"
    arn = "arn:web"  // Error
}

resource ServerConfig api {
    name = "api"
    // arn not set - OK
}

resource ServerConfig db {
    name = "db"
    arn = "arn:db"  // Error
}
`);
        const diagnostics = checkCloudPropertyAssignment(doc);

        expect(diagnostics).toHaveLength(2);
    });

    it('should handle simple schema names with cloud properties', () => {
        // Note: Schema names don't support dots in grammar (unlike type references)
        // Resource type references like 'AWS.EC2.Instance' match schema 'Instance'
        const doc = createDocument(`
schema Instance {
    string name
    @cloud string instanceId
}

resource Instance server {
    name = "web-server"
    instanceId = "i-123"  // Error
}
`);
        const diagnostics = checkCloudPropertyAssignment(doc);

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain("'instanceId'");
    });

    it('should ignore schemas without @cloud properties', () => {
        const doc = createDocument(`
schema Config {
    string name
    number port
}

resource Config cfg {
    name = "test"
    port = 8080
}
`);
        const diagnostics = checkCloudPropertyAssignment(doc);

        expect(diagnostics).toHaveLength(0);
    });

    it('should not match in comments', () => {
        const doc = createDocument(`
schema ServerConfig {
    string name
    @cloud string arn
}

// resource ServerConfig server {
//     arn = "arn:aws:..."
// }
`);
        const diagnostics = checkCloudPropertyAssignment(doc);

        expect(diagnostics).toHaveLength(0);
    });
});
