/**
 * Circular import detection for the Kite language server.
 * Detects when files import each other in a circular manner.
 */

import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import * as path from 'path';

/**
 * Context for circular import checking
 */
export interface CircularImportContext {
    /** Get file content by path */
    getFileContent: (filePath: string, currentDocUri?: string) => string | null;
    /** Find all kite files in workspace */
    findKiteFilesInWorkspace: () => string[];
}

/**
 * Extract imports from text
 */
function extractImportPaths(text: string): { path: string; line: number; start: number; end: number }[] {
    const imports: { path: string; line: number; start: number; end: number }[] = [];
    const importRegex = /^import\s+[\w*,\s]+\s+from\s+["']([^"']+)["']/gm;

    let match;
    while ((match = importRegex.exec(text)) !== null) {
        // Skip if in comment
        const lineStart = text.lastIndexOf('\n', match.index) + 1;
        const linePrefix = text.substring(lineStart, match.index);
        if (linePrefix.includes('//')) continue;

        // Count line number
        const beforeMatch = text.substring(0, match.index);
        const lineNumber = beforeMatch.split('\n').length - 1;

        imports.push({
            path: match[1],
            line: lineNumber,
            start: match.index,
            end: match.index + match[0].length,
        });
    }

    return imports;
}

/**
 * Resolve an import path relative to a base file
 */
function resolveImportPath(importPath: string, baseFilePath: string, workspaceFiles: string[]): string | null {
    const baseDir = path.dirname(baseFilePath);

    // Try as relative path first
    let resolved = path.resolve(baseDir, importPath);
    if (!resolved.endsWith('.kite')) {
        resolved += '.kite';
    }

    // Normalize for comparison
    resolved = resolved.replace(/\\/g, '/');

    // Check if file exists in workspace
    for (const file of workspaceFiles) {
        const normalizedFile = file.replace(/\\/g, '/');
        if (normalizedFile.endsWith(resolved) || normalizedFile === resolved) {
            return normalizedFile;
        }
        // Try without leading /
        if (normalizedFile === resolved.replace(/^\//, '') || resolved === normalizedFile.replace(/^\//, '')) {
            return normalizedFile;
        }
    }

    // Try package-style import: "aws.Database" -> "aws/Database.kite"
    if (importPath.includes('.') && !importPath.endsWith('.kite')) {
        const packagePath = importPath.replace(/\./g, '/') + '.kite';
        for (const file of workspaceFiles) {
            const normalizedFile = file.replace(/\\/g, '/');
            if (normalizedFile.endsWith(packagePath)) {
                return normalizedFile;
            }
        }
    }

    return null;
}

/**
 * Check for circular imports starting from a file
 * Returns the cycle chain if found, or null if no cycle
 */
function findCycle(
    startFile: string,
    importedFile: string,
    ctx: CircularImportContext,
    workspaceFiles: string[],
    visited: Set<string> = new Set(),
    chain: string[] = []
): string[] | null {
    const normalizedImported = importedFile.replace(/\\/g, '/');
    const normalizedStart = startFile.replace(/\\/g, '/');

    // Self-import is a cycle
    if (normalizedImported === normalizedStart ||
        normalizedImported.endsWith(path.basename(normalizedStart))) {
        return [...chain, normalizedImported];
    }

    // Already visited this file in current path
    if (visited.has(normalizedImported)) {
        return null;
    }

    visited.add(normalizedImported);
    chain.push(normalizedImported);

    // Get content of imported file
    const content = ctx.getFileContent(normalizedImported);
    if (!content) {
        return null;
    }

    // Extract imports from this file
    const imports = extractImportPaths(content);

    for (const imp of imports) {
        const resolvedPath = resolveImportPath(imp.path, normalizedImported, workspaceFiles);
        if (!resolvedPath) continue;

        const normalizedResolved = resolvedPath.replace(/\\/g, '/');

        // Check if this import points back to start file
        if (normalizedResolved === normalizedStart ||
            normalizedResolved.endsWith(path.basename(normalizedStart))) {
            return [...chain, normalizedResolved];
        }

        // Recursively check
        const cycle = findCycle(startFile, resolvedPath, ctx, workspaceFiles, new Set(visited), [...chain]);
        if (cycle) {
            return cycle;
        }
    }

    return null;
}

/**
 * Check for circular imports in a document
 */
export function checkCircularImports(document: TextDocument, ctx: CircularImportContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const filePath = URI.parse(document.uri).fsPath.replace(/\\/g, '/');
    const workspaceFiles = ctx.findKiteFilesInWorkspace();

    // Extract all imports from this document
    const imports = extractImportPaths(text);

    for (const imp of imports) {
        // Resolve the import path
        const resolvedPath = resolveImportPath(imp.path, filePath, workspaceFiles);

        if (!resolvedPath) {
            // File not found - handled by other validation
            continue;
        }

        const normalizedResolved = resolvedPath.replace(/\\/g, '/');

        // Check for self-import
        if (normalizedResolved === filePath ||
            normalizedResolved.endsWith(path.basename(filePath))) {
            const startPos = document.positionAt(imp.start);
            const endPos = document.positionAt(imp.end);

            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: Range.create(startPos, endPos),
                message: `Circular import: File imports itself`,
                source: 'kite',
            });
            continue;
        }

        // Check for circular dependency
        const cycle = findCycle(filePath, resolvedPath, ctx, workspaceFiles);

        if (cycle) {
            const startPos = document.positionAt(imp.start);
            const endPos = document.positionAt(imp.end);

            // Build cycle description
            const cycleNames = cycle.map(f => path.basename(f));
            const currentFileName = path.basename(filePath);

            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: Range.create(startPos, endPos),
                message: `Circular import detected: ${currentFileName} -> ${cycleNames.join(' -> ')}`,
                source: 'kite',
            });
        }
    }

    return diagnostics;
}
