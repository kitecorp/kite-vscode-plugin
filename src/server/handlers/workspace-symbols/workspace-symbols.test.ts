/**
 * Tests for Workspace Symbols handler
 * Workspace Symbols provides global "Go to Symbol" (Cmd+T) across all files
 */

import { describe, it, expect } from 'vitest';
import { SymbolKind } from 'vscode-languageserver/node';
import { handleWorkspaceSymbols, WorkspaceSymbolsContext } from './index';

function createContext(files: Map<string, string>): WorkspaceSymbolsContext {
    return {
        findKiteFilesInWorkspace: () => Array.from(files.keys()),
        getFileContent: (path) => files.get(path) || null,
    };
}

describe('Workspace Symbols', () => {
    describe('Schema symbols', () => {
        it('should find schemas across files', () => {
            const files = new Map([
                ['/workspace/config.kite', `schema ServerConfig {
    string host
}`],
                ['/workspace/models.kite', `schema UserModel {
    string name
}`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            expect(result).toHaveLength(2);
            expect(result.map(s => s.name)).toContain('ServerConfig');
            expect(result.map(s => s.name)).toContain('UserModel');
        });

        it('should filter schemas by query', () => {
            const files = new Map([
                ['/workspace/config.kite', `schema ServerConfig {}
schema DatabaseConfig {}`],
            ]);

            const result = handleWorkspaceSymbols('Server', createContext(files));

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('ServerConfig');
        });

        it('should use correct symbol kind for schemas', () => {
            const files = new Map([
                ['/workspace/test.kite', `schema Config {}`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            expect(result[0].kind).toBe(SymbolKind.Struct);
        });
    });

    describe('Component symbols', () => {
        it('should find component definitions', () => {
            const files = new Map([
                ['/workspace/components.kite', `component WebServer {
    input string name
}

component Database {
    input string connectionString
}`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            expect(result.map(s => s.name)).toContain('WebServer');
            expect(result.map(s => s.name)).toContain('Database');
        });

        it('should use correct symbol kind for components', () => {
            const files = new Map([
                ['/workspace/test.kite', `component Server {}`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            const serverSymbol = result.find(s => s.name === 'Server');
            expect(serverSymbol?.kind).toBe(SymbolKind.Class);
        });

        it('should not include component instances as component definitions', () => {
            const files = new Map([
                ['/workspace/test.kite', `component WebServer {
    input string name
}

component WebServer api {
    name = "api"
}`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            // Should have WebServer (definition) and api (instance)
            const webServerSymbols = result.filter(s => s.name === 'WebServer');
            expect(webServerSymbols).toHaveLength(1);
            expect(webServerSymbols[0].kind).toBe(SymbolKind.Class);
        });
    });

    describe('Function symbols', () => {
        it('should find functions', () => {
            const files = new Map([
                ['/workspace/utils.kite', `fun calculateCost(number x) number {
    return x * 2
}

fun formatName(string name) string {
    return name
}`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            expect(result.map(s => s.name)).toContain('calculateCost');
            expect(result.map(s => s.name)).toContain('formatName');
        });

        it('should use correct symbol kind for functions', () => {
            const files = new Map([
                ['/workspace/test.kite', `fun helper() {}`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            expect(result[0].kind).toBe(SymbolKind.Function);
        });
    });

    describe('Variable symbols', () => {
        it('should find top-level variables', () => {
            const files = new Map([
                ['/workspace/constants.kite', `var baseUrl = "https://api.example.com"
var apiKey = "secret123"`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            expect(result.map(s => s.name)).toContain('baseUrl');
            expect(result.map(s => s.name)).toContain('apiKey');
        });

        it('should find typed variables', () => {
            const files = new Map([
                ['/workspace/test.kite', `var string message = "hello"`],
            ]);

            const result = handleWorkspaceSymbols('message', createContext(files));

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('message');
        });

        it('should use correct symbol kind for variables', () => {
            const files = new Map([
                ['/workspace/test.kite', `var x = 1`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            expect(result[0].kind).toBe(SymbolKind.Variable);
        });
    });

    describe('Resource symbols', () => {
        it('should find resource instances', () => {
            const files = new Map([
                ['/workspace/infra.kite', `schema Config {}

resource Config webServer {
    host = "localhost"
}

resource Config dbServer {
    host = "db.local"
}`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            expect(result.map(s => s.name)).toContain('webServer');
            expect(result.map(s => s.name)).toContain('dbServer');
        });

        it('should use correct symbol kind for resources', () => {
            const files = new Map([
                ['/workspace/test.kite', `schema Config {}
resource Config srv {}`],
            ]);

            const result = handleWorkspaceSymbols('srv', createContext(files));

            expect(result[0].kind).toBe(SymbolKind.Object);
        });
    });

    describe('Type alias symbols', () => {
        it('should find type aliases', () => {
            const files = new Map([
                ['/workspace/types.kite', `type Region = "us-east-1" | "us-west-2"
type Environment = "dev" | "staging" | "prod"`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            expect(result.map(s => s.name)).toContain('Region');
            expect(result.map(s => s.name)).toContain('Environment');
        });

        it('should use correct symbol kind for type aliases', () => {
            const files = new Map([
                ['/workspace/test.kite', `type MyType = "a" | "b"`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            expect(result[0].kind).toBe(SymbolKind.TypeParameter);
        });
    });

    describe('Query filtering', () => {
        it('should return all symbols for empty query', () => {
            const files = new Map([
                ['/workspace/test.kite', `schema Config {}
component Server {}
fun helper() {}
var x = 1`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            expect(result).toHaveLength(4);
        });

        it('should filter by case-insensitive substring', () => {
            const files = new Map([
                ['/workspace/test.kite', `schema ServerConfig {}
schema ClientConfig {}
schema UserModel {}`],
            ]);

            const result = handleWorkspaceSymbols('config', createContext(files));

            expect(result).toHaveLength(2);
            expect(result.map(s => s.name)).toContain('ServerConfig');
            expect(result.map(s => s.name)).toContain('ClientConfig');
        });

        it('should support partial matching', () => {
            const files = new Map([
                ['/workspace/test.kite', `schema DatabaseConnectionConfig {}`],
            ]);

            const result = handleWorkspaceSymbols('conn', createContext(files));

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('DatabaseConnectionConfig');
        });

        it('should handle no matches', () => {
            const files = new Map([
                ['/workspace/test.kite', `schema Config {}`],
            ]);

            const result = handleWorkspaceSymbols('xyz', createContext(files));

            expect(result).toHaveLength(0);
        });
    });

    describe('Location information', () => {
        it('should include file URI in location', () => {
            const files = new Map([
                ['/workspace/config.kite', `schema Config {}`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            expect(result[0].location.uri).toBe('file:///workspace/config.kite');
        });

        it('should include correct line number', () => {
            const files = new Map([
                ['/workspace/test.kite', `// Comment
schema Config {}`],
            ]);

            const result = handleWorkspaceSymbols('Config', createContext(files));

            expect(result[0].location.range.start.line).toBe(1);
        });

        it('should include correct character position', () => {
            const files = new Map([
                ['/workspace/test.kite', `schema MySchema {}`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            // "schema " is 7 characters, so MySchema starts at position 7
            expect(result[0].location.range.start.character).toBe(7);
        });
    });

    describe('Multiple files', () => {
        it('should search across all workspace files', () => {
            const files = new Map([
                ['/workspace/file1.kite', `schema Config1 {}`],
                ['/workspace/file2.kite', `schema Config2 {}`],
                ['/workspace/subdir/file3.kite', `schema Config3 {}`],
            ]);

            const result = handleWorkspaceSymbols('Config', createContext(files));

            expect(result).toHaveLength(3);
        });

        it('should include container name (file name)', () => {
            const files = new Map([
                ['/workspace/models/user.kite', `schema UserModel {}`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            expect(result[0].containerName).toBe('user.kite');
        });
    });

    describe('Edge cases', () => {
        it('should handle empty workspace', () => {
            const files = new Map<string, string>();
            const result = handleWorkspaceSymbols('', createContext(files));
            expect(result).toEqual([]);
        });

        it('should handle file with no symbols', () => {
            const files = new Map([
                ['/workspace/empty.kite', `// Just a comment`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            expect(result).toEqual([]);
        });

        it('should handle files that cannot be read', () => {
            const ctx: WorkspaceSymbolsContext = {
                findKiteFilesInWorkspace: () => ['/workspace/missing.kite'],
                getFileContent: () => null,
            };

            const result = handleWorkspaceSymbols('', ctx);

            expect(result).toEqual([]);
        });

        it('should skip symbols inside comments', () => {
            const files = new Map([
                ['/workspace/test.kite', `// schema CommentedOut {}
schema RealSchema {}`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('RealSchema');
        });

        it('should handle decorated declarations', () => {
            const files = new Map([
                ['/workspace/test.kite', `@description("A config")
@tags(["infra"])
schema DecoratedSchema {}`],
            ]);

            const result = handleWorkspaceSymbols('', createContext(files));

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('DecoratedSchema');
            // Should point to schema line, not decorator
            expect(result[0].location.range.start.line).toBe(2);
        });
    });

    describe('Component instances', () => {
        it('should find component instances', () => {
            const files = new Map([
                ['/workspace/test.kite', `component WebServer {
    input string name
}

component WebServer apiServer {
    name = "api"
}`],
            ]);

            const result = handleWorkspaceSymbols('api', createContext(files));

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('apiServer');
            expect(result[0].kind).toBe(SymbolKind.Object);
        });
    });
});
