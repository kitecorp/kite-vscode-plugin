/**
 * Document Links handler for the Kite language server.
 * Makes import paths clickable in the editor.
 */

import {
    DocumentLink,
    Range,
    Position,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import * as path from 'path';

export interface DocumentLinksContext {
    findKiteFilesInWorkspace: () => string[];
    resolveImportPath: (importPath: string, currentDir: string) => string;
}

/**
 * Handle document links request - makes import paths clickable
 */
export function handleDocumentLinks(
    document: TextDocument,
    ctx: DocumentLinksContext
): DocumentLink[] {
    const text = document.getText();
    const links: DocumentLink[] = [];
    const lines = text.split('\n');

    // Get current file directory for resolving relative imports
    const currentFilePath = URI.parse(document.uri).fsPath;
    const currentDir = path.dirname(currentFilePath);

    // Find all import statements and create links for their paths
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];

        // Skip if line doesn't start with import (after optional whitespace)
        // This avoids matching strings containing "import"
        if (!line.match(/^\s*import\s/)) {
            continue;
        }

        // Match import paths: import ... from "path" or import ... from 'path'
        const importMatch = line.match(/\bimport\s+.+\s+from\s+(["'])([^"']+)\1/);

        if (importMatch) {
            const quote = importMatch[1];
            const importPath = importMatch[2];

            // Find the position of the path in the line
            const fromIndex = line.indexOf('from');
            const quoteStart = line.indexOf(quote, fromIndex);
            const pathStart = quoteStart + 1;
            const pathEnd = pathStart + importPath.length;

            // Resolve the import path to an absolute file path
            const resolvedPath = ctx.resolveImportPath(importPath, currentDir);
            const targetUri = URI.file(resolvedPath).toString();

            const link: DocumentLink = {
                range: Range.create(
                    Position.create(lineNum, pathStart),
                    Position.create(lineNum, pathEnd)
                ),
                target: targetUri,
                tooltip: `Open ${importPath}`,
            };

            links.push(link);
        }
    }

    return links;
}
