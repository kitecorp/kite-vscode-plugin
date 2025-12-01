/**
 * Tests for generate missing properties code action
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Range, CodeActionKind } from 'vscode-languageserver/node';
import { createGenerateMissingPropertiesAction, MissingPropertyData } from './generate-properties';

function createDocument(content: string, uri = 'file:///workspace/test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

function createDiagnostic(
    message: string,
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number,
    data?: MissingPropertyData
): Diagnostic {
    return {
        severity: DiagnosticSeverity.Error,
        range: Range.create(startLine, startChar, endLine, endChar),
        message,
        source: 'kite',
        data
    };
}

describe('createGenerateMissingPropertiesAction', () => {
    describe('Resource instances', () => {
        it('should create action to add single missing property', () => {
            const doc = createDocument(`
schema ServerConfig {
    string host
    number port = 8080
}

resource ServerConfig server {
}
`);
            const diagnostic = createDiagnostic(
                "Missing required property 'host' in resource 'ServerConfig'",
                6, 22, 6, 28,
                {
                    type: 'missing-property',
                    propertyName: 'host',
                    propertyType: 'string',
                    instanceType: 'resource',
                    braceOffset: doc.getText().indexOf('{', doc.getText().indexOf('resource'))
                }
            );

            const action = createGenerateMissingPropertiesAction(doc, [diagnostic]);

            expect(action).not.toBeNull();
            expect(action!.title).toContain('host');
            expect(action!.kind).toBe(CodeActionKind.QuickFix);
            expect(action!.edit).toBeDefined();

            // Verify the edit inserts the property
            const edits = action!.edit!.changes![doc.uri];
            expect(edits).toHaveLength(1);
            expect(edits[0].newText).toContain('host');
            expect(edits[0].newText).toContain('=');
        });

        it('should create action to add multiple missing properties', () => {
            const doc = createDocument(`
schema DatabaseConfig {
    string host
    number port
    string username
}

resource DatabaseConfig db {
}
`);
            const diagnostics = [
                createDiagnostic(
                    "Missing required property 'host' in resource 'DatabaseConfig'",
                    7, 25, 7, 27,
                    {
                        type: 'missing-property',
                        propertyName: 'host',
                        propertyType: 'string',
                        instanceType: 'resource',
                        braceOffset: doc.getText().indexOf('{', doc.getText().indexOf('resource'))
                    }
                ),
                createDiagnostic(
                    "Missing required property 'port' in resource 'DatabaseConfig'",
                    7, 25, 7, 27,
                    {
                        type: 'missing-property',
                        propertyName: 'port',
                        propertyType: 'number',
                        instanceType: 'resource',
                        braceOffset: doc.getText().indexOf('{', doc.getText().indexOf('resource'))
                    }
                ),
                createDiagnostic(
                    "Missing required property 'username' in resource 'DatabaseConfig'",
                    7, 25, 7, 27,
                    {
                        type: 'missing-property',
                        propertyName: 'username',
                        propertyType: 'string',
                        instanceType: 'resource',
                        braceOffset: doc.getText().indexOf('{', doc.getText().indexOf('resource'))
                    }
                )
            ];

            const action = createGenerateMissingPropertiesAction(doc, diagnostics);

            expect(action).not.toBeNull();
            expect(action!.title).toContain('3');
            expect(action!.title).toContain('properties');

            const edits = action!.edit!.changes![doc.uri];
            expect(edits).toHaveLength(1);
            expect(edits[0].newText).toContain('host');
            expect(edits[0].newText).toContain('port');
            expect(edits[0].newText).toContain('username');
        });

        it('should use appropriate placeholder for string type', () => {
            const doc = createDocument(`
schema Config {
    string name
}

resource Config cfg {
}
`);
            const diagnostic = createDiagnostic(
                "Missing required property 'name' in resource 'Config'",
                5, 16, 5, 19,
                {
                    type: 'missing-property',
                    propertyName: 'name',
                    propertyType: 'string',
                    instanceType: 'resource',
                    braceOffset: doc.getText().indexOf('{', doc.getText().indexOf('resource'))
                }
            );

            const action = createGenerateMissingPropertiesAction(doc, [diagnostic]);
            const edit = action!.edit!.changes![doc.uri][0];

            expect(edit.newText).toContain('name = ""');
        });

        it('should use appropriate placeholder for number type', () => {
            const doc = createDocument(`
schema Config {
    number count
}

resource Config cfg {
}
`);
            const diagnostic = createDiagnostic(
                "Missing required property 'count' in resource 'Config'",
                5, 16, 5, 19,
                {
                    type: 'missing-property',
                    propertyName: 'count',
                    propertyType: 'number',
                    instanceType: 'resource',
                    braceOffset: doc.getText().indexOf('{', doc.getText().indexOf('resource'))
                }
            );

            const action = createGenerateMissingPropertiesAction(doc, [diagnostic]);
            const edit = action!.edit!.changes![doc.uri][0];

            expect(edit.newText).toContain('count = 0');
        });

        it('should use appropriate placeholder for boolean type', () => {
            const doc = createDocument(`
schema Config {
    boolean enabled
}

resource Config cfg {
}
`);
            const diagnostic = createDiagnostic(
                "Missing required property 'enabled' in resource 'Config'",
                5, 16, 5, 19,
                {
                    type: 'missing-property',
                    propertyName: 'enabled',
                    propertyType: 'boolean',
                    instanceType: 'resource',
                    braceOffset: doc.getText().indexOf('{', doc.getText().indexOf('resource'))
                }
            );

            const action = createGenerateMissingPropertiesAction(doc, [diagnostic]);
            const edit = action!.edit!.changes![doc.uri][0];

            expect(edit.newText).toContain('enabled = false');
        });

        it('should use appropriate placeholder for array type', () => {
            const doc = createDocument(`
schema Config {
    string[] tags
}

resource Config cfg {
}
`);
            const diagnostic = createDiagnostic(
                "Missing required property 'tags' in resource 'Config'",
                5, 16, 5, 19,
                {
                    type: 'missing-property',
                    propertyName: 'tags',
                    propertyType: 'string[]',
                    instanceType: 'resource',
                    braceOffset: doc.getText().indexOf('{', doc.getText().indexOf('resource'))
                }
            );

            const action = createGenerateMissingPropertiesAction(doc, [diagnostic]);
            const edit = action!.edit!.changes![doc.uri][0];

            expect(edit.newText).toContain('tags = []');
        });

        it('should use appropriate placeholder for object type', () => {
            const doc = createDocument(`
schema Config {
    object metadata
}

resource Config cfg {
}
`);
            const diagnostic = createDiagnostic(
                "Missing required property 'metadata' in resource 'Config'",
                5, 16, 5, 19,
                {
                    type: 'missing-property',
                    propertyName: 'metadata',
                    propertyType: 'object',
                    instanceType: 'resource',
                    braceOffset: doc.getText().indexOf('{', doc.getText().indexOf('resource'))
                }
            );

            const action = createGenerateMissingPropertiesAction(doc, [diagnostic]);
            const edit = action!.edit!.changes![doc.uri][0];

            expect(edit.newText).toContain('metadata = {}');
        });
    });

    // Note: Component inputs are all optional (users are prompted at CLI runtime)
    // so we don't generate missing-property diagnostics for them.

    describe('Insertion position', () => {
        it('should insert after opening brace for empty body', () => {
            const doc = createDocument(`
schema Config {
    string name
}

resource Config cfg {
}
`);
            const braceOffset = doc.getText().indexOf('{', doc.getText().indexOf('resource'));
            const diagnostic = createDiagnostic(
                "Missing required property 'name' in resource 'Config'",
                5, 16, 5, 19,
                {
                    type: 'missing-property',
                    propertyName: 'name',
                    propertyType: 'string',
                    instanceType: 'resource',
                    braceOffset
                }
            );

            const action = createGenerateMissingPropertiesAction(doc, [diagnostic]);
            const edit = action!.edit!.changes![doc.uri][0];
            const insertPos = edit.range.start;

            // Should insert on the line after the opening brace
            expect(insertPos.line).toBe(6);
        });

        it('should insert with existing properties', () => {
            const doc = createDocument(`
schema Config {
    string name
    number port
}

resource Config cfg {
    port = 8080
}
`);
            const braceOffset = doc.getText().indexOf('{', doc.getText().indexOf('resource'));
            const diagnostic = createDiagnostic(
                "Missing required property 'name' in resource 'Config'",
                6, 16, 6, 19,
                {
                    type: 'missing-property',
                    propertyName: 'name',
                    propertyType: 'string',
                    instanceType: 'resource',
                    braceOffset
                }
            );

            const action = createGenerateMissingPropertiesAction(doc, [diagnostic]);
            const edit = action!.edit!.changes![doc.uri][0];

            // Should insert the new property
            expect(edit.newText).toContain('name = ""');
        });
    });

    describe('Edge cases', () => {
        it('should return null for empty diagnostics', () => {
            const doc = createDocument('');
            const action = createGenerateMissingPropertiesAction(doc, []);

            expect(action).toBeNull();
        });

        it('should return null for diagnostics without missing-property data', () => {
            const doc = createDocument(`
schema Config {
    string name
}

resource Config cfg {
}
`);
            const diagnostic = createDiagnostic(
                "Some other error",
                5, 16, 5, 19
                // No data
            );

            const action = createGenerateMissingPropertiesAction(doc, [diagnostic]);

            expect(action).toBeNull();
        });

        it('should handle custom/schema types with null placeholder', () => {
            const doc = createDocument(`
schema Address {
    string street
}

schema Person {
    Address address
}

resource Person p {
}
`);
            const braceOffset = doc.getText().indexOf('{', doc.getText().indexOf('resource'));
            const diagnostic = createDiagnostic(
                "Missing required property 'address' in resource 'Person'",
                9, 16, 9, 17,
                {
                    type: 'missing-property',
                    propertyName: 'address',
                    propertyType: 'Address',
                    instanceType: 'resource',
                    braceOffset
                }
            );

            const action = createGenerateMissingPropertiesAction(doc, [diagnostic]);
            const edit = action!.edit!.changes![doc.uri][0];

            // Custom types should use null or empty object as placeholder
            expect(edit.newText).toMatch(/address = (null|\{\})/);
        });
    });
});
