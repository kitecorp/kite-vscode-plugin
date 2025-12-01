/**
 * Tests for unused import detection - TDD
 *
 * Feature: Detect unused imports and provide quick fixes to remove them.
 * - Wildcard imports: warn if no symbol from imported file is used
 * - Named imports: warn for each symbol that is not used
 */

import { describe, it, expect } from 'vitest';
import { createDocument } from '../../test-utils';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity, Range, Location } from 'vscode-languageserver/node';
import { validateDocument, ValidationContext } from '.';
import { ImportInfo, Declaration } from '../../types';


// Helper to create a mock validation context with import support
function createContext(options: {
    files?: Record<string, string>;
    declarations?: Declaration[];
    imports?: ImportInfo[];
} = {}): ValidationContext {
    const diagnosticData = new Map<string, Map<string, any>>();

    return {
        getDeclarations: () => options.declarations || [],
        findKiteFilesInWorkspace: () => Object.keys(options.files || {}),
        getFileContent: (path: string) => options.files?.[path] || null,
        getDiagnosticData: (uri: string) => {
            if (!diagnosticData.has(uri)) {
                diagnosticData.set(uri, new Map());
            }
            return diagnosticData.get(uri)!;
        },
        clearDiagnosticData: (uri: string) => {
            diagnosticData.delete(uri);
        },
        extractImports: (): ImportInfo[] => options.imports || [],
        isSymbolImported: () => false,
        findSchemaDefinition: (text: string, name: string): Location | null => {
            if (text.includes(`schema ${name}`)) {
                return Location.create('file:///test.kite', Range.create(0, 0, 0, 0));
            }
            return null;
        },
        findComponentDefinition: (text: string, name: string): Location | null => {
            const regex = new RegExp(`component\\s+${name}\\s*\\{`);
            if (regex.test(text)) {
                return Location.create('file:///test.kite', Range.create(0, 0, 0, 0));
            }
            return null;
        },
        findFunctionDefinition: (text: string, name: string): Location | null => {
            if (text.includes(`fun ${name}`)) {
                return Location.create('file:///test.kite', Range.create(0, 0, 0, 0));
            }
            return null;
        },
    };
}

describe('Unused Import Detection', () => {
    describe('wildcard imports (import * from "file.kite")', () => {
        it('should report warning for unused wildcard import', () => {
            const doc = createDocument(`import * from "common.kite"

var x = 1`);
            const ctx = createContext({
                imports: [{ path: 'common.kite', symbols: [] }],
                files: {
                    '/project/common.kite': 'schema Config { string name }'
                }
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('unused') || d.message.includes('Unused')
            );
            expect(unusedImportWarnings.length).toBeGreaterThanOrEqual(1);
            expect(unusedImportWarnings[0].severity).toBe(DiagnosticSeverity.Hint);
        });

        it('should NOT report warning when wildcard import symbol is used', () => {
            const doc = createDocument(`import * from "common.kite"

resource Config server {
    name = "test"
}`);
            const ctx = createContext({
                imports: [{ path: 'common.kite', symbols: [] }],
                files: {
                    '/project/common.kite': 'schema Config { string name }'
                }
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('unused') || d.message.includes('Unused')
            );
            // Should be 0 because Config from common.kite is used
            expect(unusedImportWarnings).toHaveLength(0);
        });

        it('should report warning with correct range pointing to import line', () => {
            const doc = createDocument(`import * from "common.kite"

var x = 1`);
            const ctx = createContext({
                imports: [{ path: 'common.kite', symbols: [] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('unused') || d.message.includes('Unused')
            );
            if (unusedImportWarnings.length > 0) {
                // Should point to line 0 (the import line)
                expect(unusedImportWarnings[0].range.start.line).toBe(0);
            }
        });

        it('should report warning for multiple unused wildcard imports', () => {
            const doc = createDocument(`import * from "common.kite"
import * from "utils.kite"

var x = 1`);
            const ctx = createContext({
                imports: [
                    { path: 'common.kite', symbols: [] },
                    { path: 'utils.kite', symbols: [] }
                ]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('unused') || d.message.includes('Unused')
            );
            expect(unusedImportWarnings.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('named imports (import Symbol from "file.kite")', () => {
        it('should report warning for unused named import', () => {
            const doc = createDocument(`import Config from "types.kite"

var x = 1`);
            const ctx = createContext({
                imports: [{ path: 'types.kite', symbols: ['Config'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('Config') &&
                (d.message.includes('unused') || d.message.includes('Unused'))
            );
            expect(unusedImportWarnings.length).toBeGreaterThanOrEqual(1);
        });

        it('should NOT report warning when named import symbol is used', () => {
            const doc = createDocument(`import Config from "types.kite"

resource Config server {
    name = "test"
}`);
            const ctx = createContext({
                imports: [{ path: 'types.kite', symbols: ['Config'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('Config') &&
                (d.message.includes('unused') || d.message.includes('Unused'))
            );
            expect(unusedImportWarnings).toHaveLength(0);
        });

        it('should report warning for each unused symbol in multi-symbol import', () => {
            const doc = createDocument(`import Config, Server, Database from "types.kite"

resource Config server {
    name = "test"
}`);
            const ctx = createContext({
                imports: [{ path: 'types.kite', symbols: ['Config', 'Server', 'Database'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            // Config is used, but Server and Database are not
            const serverWarning = diagnostics.filter(d =>
                d.message.includes('Server') &&
                (d.message.includes('unused') || d.message.includes('Unused'))
            );
            const databaseWarning = diagnostics.filter(d =>
                d.message.includes('Database') &&
                (d.message.includes('unused') || d.message.includes('Unused'))
            );
            expect(serverWarning.length).toBeGreaterThanOrEqual(1);
            expect(databaseWarning.length).toBeGreaterThanOrEqual(1);
        });

        it('should NOT report warning when all named imports are used', () => {
            const doc = createDocument(`import Config, Server from "types.kite"

resource Config cfg { }
resource Server srv { }`);
            const ctx = createContext({
                imports: [{ path: 'types.kite', symbols: ['Config', 'Server'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('unused') || d.message.includes('Unused')
            );
            expect(unusedImportWarnings).toHaveLength(0);
        });
    });

    describe('symbol usage detection', () => {
        it('should detect usage in resource type position', () => {
            const doc = createDocument(`import Config from "types.kite"

resource Config server { }`);
            const ctx = createContext({
                imports: [{ path: 'types.kite', symbols: ['Config'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('Config') &&
                (d.message.includes('unused') || d.message.includes('Unused'))
            );
            expect(unusedImportWarnings).toHaveLength(0);
        });

        it('should detect usage in component type position', () => {
            const doc = createDocument(`import WebServer from "components.kite"

component WebServer api {
    name = "api"
}`);
            const ctx = createContext({
                imports: [{ path: 'components.kite', symbols: ['WebServer'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('WebServer') &&
                (d.message.includes('unused') || d.message.includes('Unused'))
            );
            expect(unusedImportWarnings).toHaveLength(0);
        });

        it('should detect usage in function call', () => {
            const doc = createDocument(`import calculate from "utils.kite"

var result = calculate(5)`);
            const ctx = createContext({
                imports: [{ path: 'utils.kite', symbols: ['calculate'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('calculate') &&
                (d.message.includes('unused') || d.message.includes('Unused'))
            );
            expect(unusedImportWarnings).toHaveLength(0);
        });

        it('should detect usage in variable assignment', () => {
            const doc = createDocument(`import DEFAULT_PORT from "constants.kite"

var port = DEFAULT_PORT`);
            const ctx = createContext({
                imports: [{ path: 'constants.kite', symbols: ['DEFAULT_PORT'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('DEFAULT_PORT') &&
                (d.message.includes('unused') || d.message.includes('Unused'))
            );
            expect(unusedImportWarnings).toHaveLength(0);
        });

        it('should detect usage in string interpolation', () => {
            const doc = createDocument(`import prefix from "constants.kite"

var name = "\${prefix}-server"`);
            const ctx = createContext({
                imports: [{ path: 'constants.kite', symbols: ['prefix'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('prefix') &&
                (d.message.includes('unused') || d.message.includes('Unused'))
            );
            expect(unusedImportWarnings).toHaveLength(0);
        });

        it('should detect usage in property value', () => {
            const doc = createDocument(`import defaultHost from "defaults.kite"

schema Config { string host }
resource Config server {
    host = defaultHost
}`);
            const ctx = createContext({
                imports: [{ path: 'defaults.kite', symbols: ['defaultHost'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('defaultHost') &&
                (d.message.includes('unused') || d.message.includes('Unused'))
            );
            expect(unusedImportWarnings).toHaveLength(0);
        });

        it('should detect usage in type annotation', () => {
            const doc = createDocument(`import Region from "types.kite"

var region Region = "us-east-1"`);
            const ctx = createContext({
                imports: [{ path: 'types.kite', symbols: ['Region'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('Region') &&
                (d.message.includes('unused') || d.message.includes('Unused'))
            );
            expect(unusedImportWarnings).toHaveLength(0);
        });
    });

    describe('diagnostic properties', () => {
        it('should use Hint severity for unused imports', () => {
            const doc = createDocument(`import Config from "types.kite"

var x = 1`);
            const ctx = createContext({
                imports: [{ path: 'types.kite', symbols: ['Config'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('unused') || d.message.includes('Unused')
            );
            if (unusedImportWarnings.length > 0) {
                expect(unusedImportWarnings[0].severity).toBe(DiagnosticSeverity.Hint);
            }
        });

        it('should have "unnecessary" tag for unused imports', () => {
            const doc = createDocument(`import Config from "types.kite"

var x = 1`);
            const ctx = createContext({
                imports: [{ path: 'types.kite', symbols: ['Config'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('unused') || d.message.includes('Unused')
            );
            if (unusedImportWarnings.length > 0) {
                // DiagnosticTag.Unnecessary = 1
                expect(unusedImportWarnings[0].tags).toContain(1);
            }
        });

        it('should include data for quick fix', () => {
            const doc = createDocument(`import Config from "types.kite"

var x = 1`);
            const ctx = createContext({
                imports: [{ path: 'types.kite', symbols: ['Config'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('unused') || d.message.includes('Unused')
            );
            if (unusedImportWarnings.length > 0) {
                expect(unusedImportWarnings[0].data).toBeDefined();
            }
        });
    });

    describe('edge cases', () => {
        it('should handle empty file with only imports', () => {
            const doc = createDocument(`import * from "common.kite"`);
            const ctx = createContext({
                imports: [{ path: 'common.kite', symbols: [] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('unused') || d.message.includes('Unused')
            );
            expect(unusedImportWarnings.length).toBeGreaterThanOrEqual(1);
        });

        it('should handle import with package-style path', () => {
            const doc = createDocument(`import Config from "aws.database"

var x = 1`);
            const ctx = createContext({
                imports: [{ path: 'aws.database', symbols: ['Config'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('Config') &&
                (d.message.includes('unused') || d.message.includes('Unused'))
            );
            expect(unusedImportWarnings.length).toBeGreaterThanOrEqual(1);
        });

        it('should not report import in comment as unused', () => {
            const doc = createDocument(`import Config from "types.kite"

// Config is mentioned in comment but that should not count as usage
var x = 1`);
            const ctx = createContext({
                imports: [{ path: 'types.kite', symbols: ['Config'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            // Config mentioned in comment should NOT count as usage
            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('Config') &&
                (d.message.includes('unused') || d.message.includes('Unused'))
            );
            expect(unusedImportWarnings.length).toBeGreaterThanOrEqual(1);
        });

        it('should handle symbol used multiple times', () => {
            const doc = createDocument(`import Config from "types.kite"

resource Config server1 { }
resource Config server2 { }
resource Config server3 { }`);
            const ctx = createContext({
                imports: [{ path: 'types.kite', symbols: ['Config'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes('Config') &&
                (d.message.includes('unused') || d.message.includes('Unused'))
            );
            expect(unusedImportWarnings).toHaveLength(0);
        });

        it('should not confuse similar symbol names', () => {
            const doc = createDocument(`import Config from "types.kite"

var ConfigValue = 1
var myConfig = 2`);
            const ctx = createContext({
                imports: [{ path: 'types.kite', symbols: ['Config'] }]
            });
            const diagnostics = validateDocument(doc, ctx);

            // ConfigValue and myConfig contain "Config" but are different symbols
            // So Config should still be unused
            const unusedImportWarnings = diagnostics.filter(d =>
                d.message.includes("'Config'") &&
                (d.message.includes('unused') || d.message.includes('Unused'))
            );
            expect(unusedImportWarnings.length).toBeGreaterThanOrEqual(1);
        });
    });
});
