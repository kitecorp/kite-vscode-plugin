/**
 * Code Actions handler for the Kite language server.
 * Provides quick fixes like "Add import".
 */

import {
    CodeAction,
    CodeActionKind,
    CodeActionParams,
    TextEdit,
    Range,
    Position,
    WorkspaceEdit,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ImportSuggestion } from '../types';
import { escapeRegex } from '../utils/rename-utils';

/**
 * Handle code action request
 */
export function handleCodeAction(
    params: CodeActionParams,
    document: TextDocument,
    diagnosticData: Map<string, ImportSuggestion>
): CodeAction[] {
    const actions: CodeAction[] = [];
    const text = document.getText();

    for (const diagnostic of params.context.diagnostics) {
        if (diagnostic.source !== 'kite') continue;
        if (!diagnostic.data) continue;

        const suggestion = diagnosticData.get(diagnostic.data as string);
        if (!suggestion) continue;

        // Check if there's already an import from this file
        const existingImportRegex = new RegExp(
            `^(import\\s+)([\\w\\s,]+)(\\s+from\\s+["']${escapeRegex(suggestion.importPath)}["'])`,
            'gm'
        );
        const existingMatch = existingImportRegex.exec(text);

        let edit: WorkspaceEdit;

        if (existingMatch) {
            // Add to existing import
            const existingSymbols = existingMatch[2].trim();
            if (existingSymbols === '*') {
                // Wildcard import - no action needed
                continue;
            }

            const symbolList = existingSymbols.split(',').map(s => s.trim());
            if (symbolList.includes(suggestion.symbolName)) {
                // Already imported
                continue;
            }

            const newSymbols = existingSymbols + ', ' + suggestion.symbolName;
            const newImportLine = existingMatch[1] + newSymbols + existingMatch[3];

            const matchStart = existingMatch.index;
            const matchEnd = matchStart + existingMatch[0].length;

            const beforeMatch = text.substring(0, matchStart);
            const startLine = beforeMatch.split('\n').length - 1;
            const startChar = matchStart - beforeMatch.lastIndexOf('\n') - 1;

            const beforeEnd = text.substring(0, matchEnd);
            const endLine = beforeEnd.split('\n').length - 1;
            const endChar = matchEnd - beforeEnd.lastIndexOf('\n') - 1;

            edit = {
                changes: {
                    [params.textDocument.uri]: [
                        TextEdit.replace(
                            Range.create(Position.create(startLine, startChar), Position.create(endLine, endChar)),
                            newImportLine
                        )
                    ]
                }
            };
        } else {
            // Add new import line
            const importRegex = /^import\s+.*$/gm;
            let lastImportMatch;
            let match;
            while ((match = importRegex.exec(text)) !== null) {
                lastImportMatch = match;
            }

            let insertLine = 0;
            if (lastImportMatch) {
                const beforeLastImport = text.substring(0, lastImportMatch.index + lastImportMatch[0].length);
                insertLine = beforeLastImport.split('\n').length;
            }

            const importStatement = `import ${suggestion.symbolName} from "${suggestion.importPath}"`;

            edit = {
                changes: {
                    [params.textDocument.uri]: [
                        TextEdit.insert(Position.create(insertLine, 0), importStatement + '\n')
                    ]
                }
            };
        }

        actions.push({
            title: `Import '${suggestion.symbolName}' from "${suggestion.importPath}"`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred: true,
            edit
        });
    }

    return actions;
}
