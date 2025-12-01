/**
 * Remove unused variable code action for the Kite language server.
 */

import {
    CodeAction,
    CodeActionKind,
    Diagnostic,
    DiagnosticTag,
    Range,
    TextEdit,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Check if a diagnostic is for an unused variable/parameter/loop variable.
 */
export function isUnusedVariableDiagnostic(diagnostic: Diagnostic): boolean {
    // Check for Unnecessary tag
    if (!diagnostic.tags?.includes(DiagnosticTag.Unnecessary)) {
        return false;
    }

    // Check message pattern
    const message = diagnostic.message.toLowerCase();
    return message.includes('declared but never used') ||
           message.includes('is declared but never used');
}

/**
 * Create a code action to remove an unused variable.
 */
export function createRemoveUnusedVariableAction(
    document: TextDocument,
    diagnostic: Diagnostic
): CodeAction | null {
    if (!isUnusedVariableDiagnostic(diagnostic)) {
        return null;
    }

    // Extract variable name from diagnostic message
    const varNameMatch = diagnostic.message.match(/[''](\w+)['']/);
    if (!varNameMatch) return null;

    const varName = varNameMatch[1];
    const text = document.getText();

    // Determine what kind of declaration this is
    const isLoopVar = diagnostic.message.toLowerCase().includes('loop variable');
    const isParameter = diagnostic.message.toLowerCase().includes('parameter');

    if (isLoopVar || isParameter) {
        // For loop variables and parameters, suggest renaming to _ (convention for unused)
        return createRenameToUnderscoreAction(document, diagnostic, varName, isLoopVar ? 'loop variable' : 'parameter');
    }

    // For regular variables, remove the entire declaration line
    const line = diagnostic.range.start.line;
    const lineStart = document.offsetAt({ line, character: 0 });
    const lineEnd = document.offsetAt({ line: line + 1, character: 0 });

    // Check if this is the last line (no newline after)
    const isLastLine = line === document.lineCount - 1;

    let deleteStart: number;
    let deleteEnd: number;

    if (isLastLine) {
        // Last line: remove from end of previous line (newline) to end of this line
        if (line > 0) {
            deleteStart = document.offsetAt({ line: line - 1, character: Number.MAX_VALUE });
            deleteEnd = lineStart + text.substring(lineStart).length;
        } else {
            // Only line in document
            deleteStart = lineStart;
            deleteEnd = text.length;
        }
    } else {
        // Not last line: remove entire line including newline
        deleteStart = lineStart;
        deleteEnd = lineEnd;
    }

    const edit: TextEdit = {
        range: Range.create(
            document.positionAt(deleteStart),
            document.positionAt(deleteEnd)
        ),
        newText: ''
    };

    return {
        title: `Remove unused variable '${varName}'`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        isPreferred: false,
        edit: {
            changes: {
                [document.uri]: [edit]
            }
        }
    };
}

/**
 * Create action to rename variable to _ (convention for intentionally unused).
 */
function createRenameToUnderscoreAction(
    document: TextDocument,
    diagnostic: Diagnostic,
    varName: string,
    varType: string
): CodeAction {
    const edit: TextEdit = {
        range: diagnostic.range,
        newText: '_'
    };

    return {
        title: `Rename unused ${varType} '${varName}' to '_'`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        isPreferred: false,
        edit: {
            changes: {
                [document.uri]: [edit]
            }
        }
    };
}
