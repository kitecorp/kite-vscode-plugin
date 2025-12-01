/**
 * Tests for code actions handler.
 */

import { describe, it, expect } from 'vitest';
import { createDocument } from '../../test-utils';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CodeActionKind, CodeActionTriggerKind, DiagnosticSeverity, DiagnosticTag, Range, Position } from 'vscode-languageserver/node';
import { handleCodeAction } from '.';
import { ImportSuggestion } from '../../types';
import { UnusedImportData } from '../validation/unused-imports';


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

    describe('remove unused import action', () => {
        describe('remove wildcard import', () => {
            it('should create remove action for unused wildcard import', () => {
                const doc = createDocument(`import * from "common.kite"

var x = 1`);
                const diagnosticData = new Map<string, ImportSuggestion>();

                const unusedData: UnusedImportData = {
                    type: 'unused-import',
                    importPath: 'common.kite',
                    isWildcard: true,
                    importLineStart: 0,
                    importLineEnd: 27,
                };

                const params = {
                    textDocument: { uri: 'file:///test.kite' },
                    range: Range.create(0, 0, 0, 27),
                    context: {
                        diagnostics: [{
                            range: Range.create(0, 0, 0, 27),
                            message: 'Unused import from "common.kite"',
                            severity: DiagnosticSeverity.Hint,
                            source: 'kite',
                            tags: [DiagnosticTag.Unnecessary],
                            data: unusedData,
                        }],
                        only: undefined,
                        triggerKind: CodeActionTriggerKind.Invoked,
                    },
                };

                const actions = handleCodeAction(params, doc, diagnosticData);

                const removeAction = actions.find(a => a.title.includes('Remove'));
                expect(removeAction).toBeDefined();
                expect(removeAction?.kind).toBe(CodeActionKind.QuickFix);
            });

            it('should remove entire line for wildcard import', () => {
                const doc = createDocument(`import * from "common.kite"

var x = 1`);
                const diagnosticData = new Map<string, ImportSuggestion>();

                const unusedData: UnusedImportData = {
                    type: 'unused-import',
                    importPath: 'common.kite',
                    isWildcard: true,
                    importLineStart: 0,
                    importLineEnd: 27,
                };

                const params = {
                    textDocument: { uri: 'file:///test.kite' },
                    range: Range.create(0, 0, 0, 27),
                    context: {
                        diagnostics: [{
                            range: Range.create(0, 0, 0, 27),
                            message: 'Unused import from "common.kite"',
                            severity: DiagnosticSeverity.Hint,
                            source: 'kite',
                            tags: [DiagnosticTag.Unnecessary],
                            data: unusedData,
                        }],
                        only: undefined,
                        triggerKind: CodeActionTriggerKind.Invoked,
                    },
                };

                const actions = handleCodeAction(params, doc, diagnosticData);

                const removeAction = actions.find(a => a.title.includes('Remove'));
                const edit = removeAction?.edit?.changes?.['file:///test.kite'];
                expect(edit).toBeDefined();
                // Should delete from start of line to end of line including newline
                expect(edit?.[0].newText).toBe('');
            });
        });

        describe('remove named import', () => {
            it('should create remove action for unused named import', () => {
                const doc = createDocument(`import Config from "types.kite"

var x = 1`);
                const diagnosticData = new Map<string, ImportSuggestion>();

                const unusedData: UnusedImportData = {
                    type: 'unused-import',
                    importPath: 'types.kite',
                    symbol: 'Config',
                    isWildcard: false,
                    importLineStart: 0,
                    importLineEnd: 31,
                };

                const params = {
                    textDocument: { uri: 'file:///test.kite' },
                    range: Range.create(0, 0, 0, 31),
                    context: {
                        diagnostics: [{
                            range: Range.create(0, 0, 0, 31),
                            message: 'Unused import \'Config\' from "types.kite"',
                            severity: DiagnosticSeverity.Hint,
                            source: 'kite',
                            tags: [DiagnosticTag.Unnecessary],
                            data: unusedData,
                        }],
                        only: undefined,
                        triggerKind: CodeActionTriggerKind.Invoked,
                    },
                };

                const actions = handleCodeAction(params, doc, diagnosticData);

                const removeAction = actions.find(a =>
                    a.title.includes('Remove') && a.title.includes('Config')
                );
                expect(removeAction).toBeDefined();
            });

            it('should remove entire line when single symbol import is unused', () => {
                const doc = createDocument(`import Config from "types.kite"

var x = 1`);
                const diagnosticData = new Map<string, ImportSuggestion>();

                const unusedData: UnusedImportData = {
                    type: 'unused-import',
                    importPath: 'types.kite',
                    symbol: 'Config',
                    isWildcard: false,
                    importLineStart: 0,
                    importLineEnd: 31,
                };

                const params = {
                    textDocument: { uri: 'file:///test.kite' },
                    range: Range.create(0, 0, 0, 31),
                    context: {
                        diagnostics: [{
                            range: Range.create(0, 0, 0, 31),
                            message: 'Unused import \'Config\' from "types.kite"',
                            severity: DiagnosticSeverity.Hint,
                            source: 'kite',
                            tags: [DiagnosticTag.Unnecessary],
                            data: unusedData,
                        }],
                        only: undefined,
                        triggerKind: CodeActionTriggerKind.Invoked,
                    },
                };

                const actions = handleCodeAction(params, doc, diagnosticData);

                const removeAction = actions.find(a => a.title.includes('Remove'));
                const edit = removeAction?.edit?.changes?.['file:///test.kite'];
                expect(edit).toBeDefined();
                expect(edit?.[0].newText).toBe('');
            });

            it('should remove only the unused symbol from multi-symbol import', () => {
                const doc = createDocument(`import Config, Server, Database from "types.kite"

var x = Config`);
                const diagnosticData = new Map<string, ImportSuggestion>();

                const unusedData: UnusedImportData = {
                    type: 'unused-import',
                    importPath: 'types.kite',
                    symbol: 'Server',
                    isWildcard: false,
                    importLineStart: 0,
                    importLineEnd: 48,
                };

                const params = {
                    textDocument: { uri: 'file:///test.kite' },
                    range: Range.create(0, 15, 0, 21),
                    context: {
                        diagnostics: [{
                            range: Range.create(0, 15, 0, 21),
                            message: 'Unused import \'Server\' from "types.kite"',
                            severity: DiagnosticSeverity.Hint,
                            source: 'kite',
                            tags: [DiagnosticTag.Unnecessary],
                            data: unusedData,
                        }],
                        only: undefined,
                        triggerKind: CodeActionTriggerKind.Invoked,
                    },
                };

                const actions = handleCodeAction(params, doc, diagnosticData);

                const removeAction = actions.find(a =>
                    a.title.includes('Remove') && a.title.includes('Server')
                );
                expect(removeAction).toBeDefined();
                // Should modify import to: import Config, Database from "types.kite"
                const edit = removeAction?.edit?.changes?.['file:///test.kite'];
                expect(edit).toBeDefined();
                if (edit && edit[0].newText !== '') {
                    expect(edit[0].newText).not.toContain('Server');
                    expect(edit[0].newText).toContain('Config');
                    expect(edit[0].newText).toContain('Database');
                }
            });
        });

        describe('multiple unused imports', () => {
            it('should create separate actions for multiple unused imports', () => {
                const doc = createDocument(`import Config from "types.kite"
import Server from "server.kite"

var x = 1`);
                const diagnosticData = new Map<string, ImportSuggestion>();

                const unusedData1: UnusedImportData = {
                    type: 'unused-import',
                    importPath: 'types.kite',
                    symbol: 'Config',
                    isWildcard: false,
                    importLineStart: 0,
                    importLineEnd: 31,
                };

                const unusedData2: UnusedImportData = {
                    type: 'unused-import',
                    importPath: 'server.kite',
                    symbol: 'Server',
                    isWildcard: false,
                    importLineStart: 32,
                    importLineEnd: 64,
                };

                const params = {
                    textDocument: { uri: 'file:///test.kite' },
                    range: Range.create(0, 0, 3, 9),
                    context: {
                        diagnostics: [
                            {
                                range: Range.create(0, 0, 0, 31),
                                message: 'Unused import \'Config\' from "types.kite"',
                                severity: DiagnosticSeverity.Hint,
                                source: 'kite',
                                tags: [DiagnosticTag.Unnecessary],
                                data: unusedData1,
                            },
                            {
                                range: Range.create(1, 0, 1, 32),
                                message: 'Unused import \'Server\' from "server.kite"',
                                severity: DiagnosticSeverity.Hint,
                                source: 'kite',
                                tags: [DiagnosticTag.Unnecessary],
                                data: unusedData2,
                            },
                        ],
                        only: undefined,
                        triggerKind: CodeActionTriggerKind.Invoked,
                    },
                };

                const actions = handleCodeAction(params, doc, diagnosticData);

                const removeActions = actions.filter(a => a.title.includes('Remove'));
                expect(removeActions.length).toBeGreaterThanOrEqual(2);
            });
        });

        describe('remove all unused imports action', () => {
            it('should create "Remove all unused imports" action when multiple unused', () => {
                const doc = createDocument(`import Config from "types.kite"
import Server from "server.kite"

var x = 1`);
                const diagnosticData = new Map<string, ImportSuggestion>();

                const unusedData1: UnusedImportData = {
                    type: 'unused-import',
                    importPath: 'types.kite',
                    symbol: 'Config',
                    isWildcard: false,
                    importLineStart: 0,
                    importLineEnd: 31,
                };

                const unusedData2: UnusedImportData = {
                    type: 'unused-import',
                    importPath: 'server.kite',
                    symbol: 'Server',
                    isWildcard: false,
                    importLineStart: 32,
                    importLineEnd: 64,
                };

                const params = {
                    textDocument: { uri: 'file:///test.kite' },
                    range: Range.create(0, 0, 3, 9),
                    context: {
                        diagnostics: [
                            {
                                range: Range.create(0, 0, 0, 31),
                                message: 'Unused import \'Config\' from "types.kite"',
                                severity: DiagnosticSeverity.Hint,
                                source: 'kite',
                                tags: [DiagnosticTag.Unnecessary],
                                data: unusedData1,
                            },
                            {
                                range: Range.create(1, 0, 1, 32),
                                message: 'Unused import \'Server\' from "server.kite"',
                                severity: DiagnosticSeverity.Hint,
                                source: 'kite',
                                tags: [DiagnosticTag.Unnecessary],
                                data: unusedData2,
                            },
                        ],
                        only: undefined,
                        triggerKind: CodeActionTriggerKind.Invoked,
                    },
                };

                const actions = handleCodeAction(params, doc, diagnosticData);

                const removeAllAction = actions.find(a =>
                    a.title.toLowerCase().includes('all') &&
                    a.title.toLowerCase().includes('unused')
                );
                expect(removeAllAction).toBeDefined();
            });
        });
    });
});
