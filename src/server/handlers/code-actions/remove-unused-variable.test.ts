/**
 * Tests for remove unused variable code action
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Range, DiagnosticTag } from 'vscode-languageserver/node';
import { createRemoveUnusedVariableAction } from './remove-unused-variable';

function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

function createUnusedVarDiagnostic(
    line: number,
    startChar: number,
    endChar: number,
    varName: string
): Diagnostic {
    return {
        severity: DiagnosticSeverity.Warning,
        range: Range.create(line, startChar, line, endChar),
        message: `Variable '${varName}' is declared but never used`,
        source: 'kite',
        tags: [DiagnosticTag.Unnecessary],
    };
}

describe('createRemoveUnusedVariableAction', () => {
    describe('Simple variable removal', () => {
        it('should create action to remove unused variable', () => {
            const doc = createDocument(`var x = 10
var y = 20`);
            const diagnostic = createUnusedVarDiagnostic(0, 4, 5, 'x');

            const action = createRemoveUnusedVariableAction(doc, diagnostic);

            expect(action).not.toBeNull();
            expect(action!.title).toContain('x');
            expect(action!.title).toContain('Remove');
        });

        it('should remove the entire line for simple var', () => {
            const doc = createDocument(`var x = 10
var y = 20`);
            const diagnostic = createUnusedVarDiagnostic(0, 4, 5, 'x');

            const action = createRemoveUnusedVariableAction(doc, diagnostic);
            const edits = action!.edit!.changes![doc.uri];

            expect(edits).toHaveLength(1);
            // Should remove "var x = 10\n"
            const newText = edits[0].newText;
            expect(newText).toBe('');
        });

        it('should remove variable with type annotation', () => {
            const doc = createDocument(`var string name = "test"
var y = 20`);
            const diagnostic = createUnusedVarDiagnostic(0, 11, 15, 'name');

            const action = createRemoveUnusedVariableAction(doc, diagnostic);

            expect(action).not.toBeNull();
            expect(action!.title).toContain('name');
        });

        it('should handle last line without newline', () => {
            const doc = createDocument(`var y = 20
var x = 10`);
            const diagnostic = createUnusedVarDiagnostic(1, 4, 5, 'x');

            const action = createRemoveUnusedVariableAction(doc, diagnostic);
            const edits = action!.edit!.changes![doc.uri];

            expect(edits).toHaveLength(1);
            // Should remove "\nvar x = 10" (including preceding newline)
            expect(edits[0].newText).toBe('');
        });
    });

    describe('Loop variable removal', () => {
        it('should create action for unused loop variable', () => {
            const doc = createDocument(`for item in items {
    println("hello")
}`);
            const diagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Warning,
                range: Range.create(0, 4, 0, 8),
                message: `Loop variable 'item' is declared but never used`,
                source: 'kite',
                tags: [DiagnosticTag.Unnecessary],
            };

            const action = createRemoveUnusedVariableAction(doc, diagnostic);

            // For loop variables, we might suggest renaming to _ or show info
            expect(action).not.toBeNull();
            expect(action!.title).toContain('item');
        });
    });

    describe('Function parameter removal', () => {
        it('should create action for unused parameter', () => {
            const doc = createDocument(`fun process(string name, number count) {
    println("hello")
}`);
            const diagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Warning,
                range: Range.create(0, 19, 0, 23),
                message: `Parameter 'name' is declared but never used`,
                source: 'kite',
                tags: [DiagnosticTag.Unnecessary],
            };

            const action = createRemoveUnusedVariableAction(doc, diagnostic);

            // Parameters are trickier - might suggest renaming to _
            expect(action).not.toBeNull();
        });
    });

    describe('Edge cases', () => {
        it('should return null for non-unused-variable diagnostic', () => {
            const doc = createDocument(`var x = 10`);
            const diagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Error,
                range: Range.create(0, 0, 0, 10),
                message: 'Some other error',
                source: 'kite',
            };

            const action = createRemoveUnusedVariableAction(doc, diagnostic);

            expect(action).toBeNull();
        });

        it('should handle variable at start of document', () => {
            const doc = createDocument(`var x = 10`);
            const diagnostic = createUnusedVarDiagnostic(0, 4, 5, 'x');

            const action = createRemoveUnusedVariableAction(doc, diagnostic);

            expect(action).not.toBeNull();
        });

        it('should preserve indentation context', () => {
            const doc = createDocument(`fun test() {
    var unused = 10
    var used = 20
    println(used)
}`);
            const diagnostic = createUnusedVarDiagnostic(1, 8, 14, 'unused');

            const action = createRemoveUnusedVariableAction(doc, diagnostic);
            const edits = action!.edit!.changes![doc.uri];

            expect(edits).toHaveLength(1);
            // Should remove the entire line including indentation
        });
    });
});
