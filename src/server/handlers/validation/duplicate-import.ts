/**
 * Duplicate import detection for the Kite language server.
 * Reports warnings when the same file is imported multiple times.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

interface ImportInfo {
    path: string;
    line: number;
    startOffset: number;
    endOffset: number;
}

/**
 * Check for duplicate imports (same file imported multiple times)
 */
export function checkDuplicateImport(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const imports: ImportInfo[] = [];

    // Match import statements: import * from "path" or import { x } from "path"
    const importRegex = /^\s*import\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/gm;

    let match;
    while ((match = importRegex.exec(text)) !== null) {
        // Skip if in comment or string (though imports shouldn't be in strings)
        if (isInCommentOrString(text, match.index)) continue;

        const importPath = match[1];
        imports.push({
            path: importPath,
            line: document.positionAt(match.index).line,
            startOffset: match.index,
            endOffset: match.index + match[0].length,
        });
    }

    // Find duplicates
    const seenPaths = new Map<string, ImportInfo>();
    for (const importInfo of imports) {
        const normalizedPath = normalizePath(importInfo.path);

        if (seenPaths.has(normalizedPath)) {
            const firstImport = seenPaths.get(normalizedPath)!;
            const startPos = document.positionAt(importInfo.startOffset);
            const endPos = document.positionAt(importInfo.endOffset);

            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: Range.create(startPos, endPos),
                message: `Duplicate import: '${importInfo.path}' is already imported on line ${firstImport.line + 1}`,
                source: 'kite',
            });
        } else {
            seenPaths.set(normalizedPath, importInfo);
        }
    }

    return diagnostics;
}

/**
 * Normalize import path for comparison
 * Handles different representations of the same file
 */
function normalizePath(path: string): string {
    // Remove leading ./
    let normalized = path.replace(/^\.\//, '');
    // Remove .kite extension if present
    normalized = normalized.replace(/\.kite$/, '');
    // Normalize slashes
    normalized = normalized.replace(/\\/g, '/');
    return normalized.toLowerCase();
}

/**
 * Check if position is inside a comment or string
 */
function isInCommentOrString(text: string, position: number): boolean {
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inBlockComment = false;

    for (let i = 0; i < position && i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        if (!inString && !inComment && char === '*' && prevChar === '/') {
            inBlockComment = true;
            continue;
        }
        if (inBlockComment && char === '/' && prevChar === '*') {
            inBlockComment = false;
            continue;
        }
        if (inBlockComment) continue;

        if (!inString && char === '/' && text[i + 1] === '/') {
            inComment = true;
            continue;
        }
        if (inComment && char === '\n') {
            inComment = false;
            continue;
        }
        if (inComment) continue;

        if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
            continue;
        }
        if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
            continue;
        }
    }

    return inString || inComment || inBlockComment;
}
