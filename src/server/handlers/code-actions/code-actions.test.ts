/**
 * Tests for code actions handler.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CodeActionKind, CodeActionTriggerKind, DiagnosticSeverity, Range, Position } from 'vscode-languageserver/node';
import { handleCodeAction } from '.';
import { ImportSuggestion } from '../../types';

// Helper to create a mock TextDocument
function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

// Helper to create diagnostic data
function createDiagnosticData(
    symbolName: string,
    importPath: string
): { key: string; suggestion: ImportSuggestion } {
    const key = `${symbolName}:${importPath}`;
    return {
        key,
        suggestion: { symbolName, importPath, filePath: `/path/to/${importPath}` },
    };
}

describe('handleCodeAction', () => {
    describe('add import action', () => {
        it('should create add import action for unresolved symbol', () => {
            const doc = createDocument(`resource Config server { }`);
            const { key, suggestion } = createDiagnosticData('Config', 'common.kite');
            const diagnosticData = new Map<string, ImportSuggestion>();
            diagnosticData.set(key, suggestion);

            const params = {
                textDocument: { uri: 'file:///test.kite' },
                range: Range.create(0, 9, 0, 15),
                context: {
                    diagnostics: [{
                        range: Range.create(0, 9, 0, 15),
                        message: "Cannot resolve schema 'Config'",
                        severity: DiagnosticSeverity.Error,
                        source: 'kite',
                        data: key,
                    }],
                    only: undefined,
                    triggerKind: CodeActionTriggerKind.Invoked,
                },
            };

            const actions = handleCodeAction(params, doc, diagnosticData);

            expect(actions).toHaveLength(1);
            expect(actions[0].title).toBe('Import \'Config\' from "common.kite"');
            expect(actions[0].kind).toBe(CodeActionKind.QuickFix);
            expect(actions[0].isPreferred).toBe(true);
        });

        it('should insert import at beginning of file', () => {
            const doc = createDocument(`resource Config server { }`);
            const { key, suggestion } = createDiagnosticData('Config', 'common.kite');
            const diagnosticData = new Map<string, ImportSuggestion>();
            diagnosticData.set(key, suggestion);

            const params = {
                textDocument: { uri: 'file:///test.kite' },
                range: Range.create(0, 9, 0, 15),
                context: {
                    diagnostics: [{
                        range: Range.create(0, 9, 0, 15),
                        message: "Cannot resolve schema 'Config'",
                        severity: DiagnosticSeverity.Error,
                        source: 'kite',
                        data: key,
                    }],
                    only: undefined,
                    triggerKind: CodeActionTriggerKind.Invoked,
                },
            };

            const actions = handleCodeAction(params, doc, diagnosticData);

            const edit = actions[0].edit?.changes?.['file:///test.kite'];
            expect(edit).toBeDefined();
            expect(edit?.[0].newText).toContain('import Config from "common.kite"');
        });

        it('should insert import after existing imports', () => {
            const doc = createDocument(`import * from "other.kite"

resource Config server { }`);
            const { key, suggestion } = createDiagnosticData('Config', 'common.kite');
            const diagnosticData = new Map<string, ImportSuggestion>();
            diagnosticData.set(key, suggestion);

            const params = {
                textDocument: { uri: 'file:///test.kite' },
                range: Range.create(2, 9, 2, 15),
                context: {
                    diagnostics: [{
                        range: Range.create(2, 9, 2, 15),
                        message: "Cannot resolve schema 'Config'",
                        severity: DiagnosticSeverity.Error,
                        source: 'kite',
                        data: key,
                    }],
                    only: undefined,
                    triggerKind: CodeActionTriggerKind.Invoked,
                },
            };

            const actions = handleCodeAction(params, doc, diagnosticData);

            const edit = actions[0].edit?.changes?.['file:///test.kite'];
            expect(edit).toBeDefined();
            // Should insert after line 0 (the existing import)
            expect(edit?.[0].range.start.line).toBe(1);
        });
    });

    describe('update existing import', () => {
        it('should add symbol to existing import', () => {
            const doc = createDocument(`import Other from "common.kite"
resource Config server { }`);
            const { key, suggestion } = createDiagnosticData('Config', 'common.kite');
            const diagnosticData = new Map<string, ImportSuggestion>();
            diagnosticData.set(key, suggestion);

            const params = {
                textDocument: { uri: 'file:///test.kite' },
                range: Range.create(1, 9, 1, 15),
                context: {
                    diagnostics: [{
                        range: Range.create(1, 9, 1, 15),
                        message: "Cannot resolve schema 'Config'",
                        severity: DiagnosticSeverity.Error,
                        source: 'kite',
                        data: key,
                    }],
                    only: undefined,
                    triggerKind: CodeActionTriggerKind.Invoked,
                },
            };

            const actions = handleCodeAction(params, doc, diagnosticData);

            expect(actions).toHaveLength(1);
            const edit = actions[0].edit?.changes?.['file:///test.kite'];
            expect(edit?.[0].newText).toContain('Other, Config');
        });
    });

    describe('no action needed', () => {
        it('should not create action for wildcard import', () => {
            const doc = createDocument(`import * from "common.kite"
resource Config server { }`);
            const { key, suggestion } = createDiagnosticData('Config', 'common.kite');
            const diagnosticData = new Map<string, ImportSuggestion>();
            diagnosticData.set(key, suggestion);

            const params = {
                textDocument: { uri: 'file:///test.kite' },
                range: Range.create(1, 9, 1, 15),
                context: {
                    diagnostics: [{
                        range: Range.create(1, 9, 1, 15),
                        message: "Cannot resolve schema 'Config'",
                        severity: DiagnosticSeverity.Error,
                        source: 'kite',
                        data: key,
                    }],
                    only: undefined,
                    triggerKind: CodeActionTriggerKind.Invoked,
                },
            };

            const actions = handleCodeAction(params, doc, diagnosticData);

            expect(actions).toHaveLength(0);
        });

        it('should not create action for already imported symbol', () => {
            const doc = createDocument(`import Config from "common.kite"
resource Config server { }`);
            const { key, suggestion } = createDiagnosticData('Config', 'common.kite');
            const diagnosticData = new Map<string, ImportSuggestion>();
            diagnosticData.set(key, suggestion);

            const params = {
                textDocument: { uri: 'file:///test.kite' },
                range: Range.create(1, 9, 1, 15),
                context: {
                    diagnostics: [{
                        range: Range.create(1, 9, 1, 15),
                        message: "Cannot resolve schema 'Config'",
                        severity: DiagnosticSeverity.Error,
                        source: 'kite',
                        data: key,
                    }],
                    only: undefined,
                    triggerKind: CodeActionTriggerKind.Invoked,
                },
            };

            const actions = handleCodeAction(params, doc, diagnosticData);

            expect(actions).toHaveLength(0);
        });

        it('should not create action for non-kite diagnostics', () => {
            const doc = createDocument(`resource Config server { }`);
            const { key, suggestion } = createDiagnosticData('Config', 'common.kite');
            const diagnosticData = new Map<string, ImportSuggestion>();
            diagnosticData.set(key, suggestion);

            const params = {
                textDocument: { uri: 'file:///test.kite' },
                range: Range.create(0, 9, 0, 15),
                context: {
                    diagnostics: [{
                        range: Range.create(0, 9, 0, 15),
                        message: "Some error",
                        severity: DiagnosticSeverity.Error,
                        source: 'other-linter',
                        data: key,
                    }],
                    only: undefined,
                    triggerKind: CodeActionTriggerKind.Invoked,
                },
            };

            const actions = handleCodeAction(params, doc, diagnosticData);

            expect(actions).toHaveLength(0);
        });

        it('should not create action without diagnostic data', () => {
            const doc = createDocument(`resource Config server { }`);
            const diagnosticData = new Map<string, ImportSuggestion>();

            const params = {
                textDocument: { uri: 'file:///test.kite' },
                range: Range.create(0, 9, 0, 15),
                context: {
                    diagnostics: [{
                        range: Range.create(0, 9, 0, 15),
                        message: "Cannot resolve schema 'Config'",
                        severity: DiagnosticSeverity.Error,
                        source: 'kite',
                        // No data
                    }],
                    only: undefined,
                    triggerKind: CodeActionTriggerKind.Invoked,
                },
            };

            const actions = handleCodeAction(params, doc, diagnosticData);

            expect(actions).toHaveLength(0);
        });
    });

    describe('multiple diagnostics', () => {
        it('should create multiple import actions', () => {
            const doc = createDocument(`resource Config server { }
component WebServer api { }`);

            const data1 = createDiagnosticData('Config', 'common.kite');
            const data2 = createDiagnosticData('WebServer', 'components.kite');
            const diagnosticData = new Map<string, ImportSuggestion>();
            diagnosticData.set(data1.key, data1.suggestion);
            diagnosticData.set(data2.key, data2.suggestion);

            const params = {
                textDocument: { uri: 'file:///test.kite' },
                range: Range.create(0, 0, 1, 27),
                context: {
                    diagnostics: [
                        {
                            range: Range.create(0, 9, 0, 15),
                            message: "Cannot resolve schema 'Config'",
                            severity: DiagnosticSeverity.Error,
                            source: 'kite',
                            data: data1.key,
                        },
                        {
                            range: Range.create(1, 10, 1, 19),
                            message: "Cannot resolve component 'WebServer'",
                            severity: DiagnosticSeverity.Error,
                            source: 'kite',
                            data: data2.key,
                        },
                    ],
                    only: undefined,
                    triggerKind: CodeActionTriggerKind.Invoked,
                },
            };

            const actions = handleCodeAction(params, doc, diagnosticData);

            expect(actions).toHaveLength(2);
            expect(actions[0].title).toContain('Config');
            expect(actions[1].title).toContain('WebServer');
        });
    });
});
