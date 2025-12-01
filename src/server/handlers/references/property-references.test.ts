/**
 * Tests for property-references.ts - property reference finding for schemas and components.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createDocument } from '../../test-utils';
import {
    findComponentPropertyReferences,
    findSchemaPropertyReferences,
} from './property-references';
import { ReferencesContext } from './types';

function createContext(files: Record<string, string>): ReferencesContext {
    const docs = new Map<string, TextDocument>();
    for (const [path, content] of Object.entries(files)) {
        docs.set(`file://${path}`, createDocument(content, `file://${path}`));
    }

    return {
        findKiteFilesInWorkspace: () => Object.keys(files),
        getFileContent: (filePath: string) => files[filePath] || null,
        getDocument: (uri: string) => docs.get(uri),
        getDeclarations: () => [],
    };
}

describe('findComponentPropertyReferences', () => {
    it('finds property assignment in component instantiation', () => {
        const files = {
            '/project/main.kite': `
component WebServer {
    input string name
}
component WebServer api {
    name = "api-server"
}
`
        };
        const ctx = createContext(files);
        const refs = findComponentPropertyReferences(
            'WebServer',
            'name',
            'file:///project/main.kite',
            ctx
        );
        expect(refs.length).toBeGreaterThanOrEqual(1);
    });

    it('finds property access on component instance', () => {
        const files = {
            '/project/main.kite': `
component WebServer {
    input string name
    output string endpoint
}
component WebServer api {
    name = "api"
}
var url = api.endpoint
`
        };
        const ctx = createContext(files);
        const refs = findComponentPropertyReferences(
            'WebServer',
            'endpoint',
            'file:///project/main.kite',
            ctx
        );
        expect(refs.length).toBeGreaterThanOrEqual(1);
    });

    it('finds references across multiple instantiations', () => {
        const files = {
            '/project/main.kite': `
component WebServer {
    input string name
}
component WebServer api {
    name = "api"
}
component WebServer web {
    name = "web"
}
`
        };
        const ctx = createContext(files);
        const refs = findComponentPropertyReferences(
            'WebServer',
            'name',
            'file:///project/main.kite',
            ctx
        );
        expect(refs.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty array when no instantiations exist', () => {
        const files = {
            '/project/main.kite': `
component WebServer {
    input string name
}
`
        };
        const ctx = createContext(files);
        const refs = findComponentPropertyReferences(
            'WebServer',
            'name',
            'file:///project/main.kite',
            ctx
        );
        expect(refs).toHaveLength(0);
    });

    it('ignores properties in other component types', () => {
        const files = {
            '/project/main.kite': `
component WebServer {
    input string name
}
component Database {
    input string name
}
component Database db {
    name = "mydb"
}
`
        };
        const ctx = createContext(files);
        const refs = findComponentPropertyReferences(
            'WebServer',
            'name',
            'file:///project/main.kite',
            ctx
        );
        expect(refs).toHaveLength(0);
    });
});

describe('findSchemaPropertyReferences', () => {
    it('finds property assignment in resource instantiation', () => {
        const files = {
            '/project/main.kite': `
schema ServerConfig {
    string host
    number port
}
resource ServerConfig server {
    host = "localhost"
    port = 8080
}
`
        };
        const ctx = createContext(files);
        const refs = findSchemaPropertyReferences(
            'ServerConfig',
            'host',
            'file:///project/main.kite',
            ctx
        );
        expect(refs.length).toBeGreaterThanOrEqual(1);
    });

    it('finds property access on resource instance', () => {
        const files = {
            '/project/main.kite': `
schema ServerConfig {
    string host
}
resource ServerConfig server {
    host = "localhost"
}
var h = server.host
`
        };
        const ctx = createContext(files);
        const refs = findSchemaPropertyReferences(
            'ServerConfig',
            'host',
            'file:///project/main.kite',
            ctx
        );
        expect(refs.length).toBeGreaterThanOrEqual(2);
    });

    it('finds references across multiple resources', () => {
        const files = {
            '/project/main.kite': `
schema Config {
    string name
}
resource Config c1 {
    name = "first"
}
resource Config c2 {
    name = "second"
}
`
        };
        const ctx = createContext(files);
        const refs = findSchemaPropertyReferences(
            'Config',
            'name',
            'file:///project/main.kite',
            ctx
        );
        expect(refs.length).toBeGreaterThanOrEqual(2);
    });

    it('handles dotted schema names', () => {
        const files = {
            '/project/main.kite': `
schema AWS.S3.Bucket {
    string name
}
resource AWS.S3.Bucket bucket {
    name = "my-bucket"
}
`
        };
        const ctx = createContext(files);
        const refs = findSchemaPropertyReferences(
            'AWS.S3.Bucket',
            'name',
            'file:///project/main.kite',
            ctx
        );
        expect(refs.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty array when no resources exist', () => {
        const files = {
            '/project/main.kite': `
schema Config {
    string name
}
`
        };
        const ctx = createContext(files);
        const refs = findSchemaPropertyReferences(
            'Config',
            'name',
            'file:///project/main.kite',
            ctx
        );
        expect(refs).toHaveLength(0);
    });

    it('ignores properties in other schema types', () => {
        const files = {
            '/project/main.kite': `
schema Config {
    string name
}
schema Other {
    string name
}
resource Other o {
    name = "other"
}
`
        };
        const ctx = createContext(files);
        const refs = findSchemaPropertyReferences(
            'Config',
            'name',
            'file:///project/main.kite',
            ctx
        );
        expect(refs).toHaveLength(0);
    });
});
