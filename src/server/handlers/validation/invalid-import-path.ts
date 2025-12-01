/**
 * Invalid import path detection for the Kite language server.
 * Reports errors when an import references a file that doesn't exist.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import * as path from 'path';

/**
 * Context for import path checking
 */
export interface ImportPathContext {
    /** Find all kite files in workspace */
    findKiteFilesInWorkspace: () => string[];
    /** Get file content by path */
    getFileContent: (filePath: string, currentDocUri?: string) => string | null;
}

/**
 * Extract import paths from text with their positions
 */
function extractImportPaths(text: string): { importPath: string; start: number; end: number }[] {
    const imports: { importPath: string; start: number; end: number }[] = [];
    // Allow whitespace before import (for indented code)
    const importRegex = /^\s*import\s+[\w*,\s]+\s+from\s+["']([^"']+)["']/gm;

    let match;
    while ((match = importRegex.exec(text)) !== null) {
        // Skip if in comment
        const lineStart = text.lastIndexOf('\n', match.index) + 1;
        const linePrefix = text.substring(lineStart, match.index);
        if (linePrefix.includes('//')) continue;

        // Find the path string position
        const pathStart = match.index + match[0].lastIndexOf(match[1]) - 1; // -1 for quote
        const pathEnd = pathStart + match[1].length + 2; // +2 for quotes

        imports.push({
            importPath: match[1],
            start: pathStart,
            end: pathEnd,
        });
    }

    return imports;
}

/**
 * Check if an import path resolves to an existing file
 */
function resolveImportPath(importPath: string, baseFilePath: string, workspaceFiles: string[]): boolean {
    const baseDir = path.dirname(baseFilePath);

    // Normalize workspace files for comparison
    const normalizedWorkspaceFiles = workspaceFiles.map(f => f.replace(/\\/g, '/'));

    // Try as relative path first
    let resolved = path.resolve(baseDir, importPath);
    if (!resolved.endsWith('.kite')) {
        resolved += '.kite';
    }
    resolved = resolved.replace(/\\/g, '/');

    // Check if file exists in workspace (exact match or ending match)
    for (const file of normalizedWorkspaceFiles) {
        if (file === resolved) {
            return true;
        }
        // Handle case where resolved is absolute and file is relative or vice versa
        if (file.endsWith(resolved) || resolved.endsWith(file)) {
            return true;
        }
        // Check just the filename for simple matches
        if (path.basename(file) === path.basename(resolved)) {
            // For simple imports like "common.kite", just check if there's a file with that name
            // in the same directory or workspace
            const fileDir = path.dirname(file);
            const resolvedDir = path.dirname(resolved);
            if (fileDir.endsWith(path.basename(resolvedDir)) || resolvedDir.endsWith(path.basename(fileDir))) {
                return true;
            }
        }
    }

    // Try package-style import: "aws.Database" -> "aws/Database.kite"
    if (importPath.includes('.') && !importPath.endsWith('.kite')) {
        const packagePath = importPath.replace(/\./g, '/') + '.kite';
        for (const file of normalizedWorkspaceFiles) {
            if (file.endsWith('/' + packagePath) || file.endsWith(packagePath)) {
                return true;
            }
        }
    }

    // Also check if just the filename matches (for simple imports like "common.kite")
    const simpleName = importPath.endsWith('.kite') ? importPath : importPath + '.kite';
    for (const file of normalizedWorkspaceFiles) {
        if (file.endsWith('/' + simpleName) || file === simpleName) {
            return true;
        }
    }

    return false;
}

/**
 * Check for invalid import paths in a document
 */
export function checkInvalidImportPaths(document: TextDocument, ctx: ImportPathContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const filePath = URI.parse(document.uri).fsPath.replace(/\\/g, '/');
    const workspaceFiles = ctx.findKiteFilesInWorkspace();

    // Extract all imports from this document
    const imports = extractImportPaths(text);

    for (const imp of imports) {
        // Check if the import path resolves to an existing file
        const exists = resolveImportPath(imp.importPath, filePath, workspaceFiles);

        if (!exists) {
            const startPos = document.positionAt(imp.start);
            const endPos = document.positionAt(imp.end);

            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: Range.create(startPos, endPos),
                message: `Cannot find file '${imp.importPath}'`,
                source: 'kite',
            });
        }
    }

    return diagnostics;
}
