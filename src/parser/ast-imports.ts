/**
 * AST-based import utilities.
 * Provides functions to extract and find import statements.
 */

import { ProgramContext, ImportStatementContext } from './grammar/KiteParser';

/**
 * Information about an import statement
 */
export interface ImportInfo {
    /** The import path (without quotes) */
    path: string;
    /** Whether this is a wildcard import (import * from) */
    isWildcard: boolean;
    /** Start offset of the import statement */
    start: number;
    /** End offset of the import statement */
    end: number;
    /** Line number (0-based) */
    line: number;
}

/**
 * Extract all import statements from the AST
 */
export function extractImportsAST(tree: ProgramContext): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const stmtList = tree.statementList();
    if (!stmtList) return imports;

    for (const stmt of stmtList.nonEmptyStatement_list()) {
        const importStmt = stmt.importStatement();
        if (importStmt) {
            const info = extractImportInfo(importStmt);
            if (info) {
                imports.push(info);
            }
        }
    }

    return imports;
}

/**
 * Extract import info from an import statement context
 */
function extractImportInfo(importStmt: ImportStatementContext): ImportInfo | null {
    const stringLiteral = importStmt.stringLiteral();
    if (!stringLiteral) return null;

    // Get the path without quotes
    let path = stringLiteral.getText();
    if ((path.startsWith('"') && path.endsWith('"')) ||
        (path.startsWith("'") && path.endsWith("'"))) {
        path = path.slice(1, -1);
    }

    const isWildcard = importStmt.MULTIPLY() !== null;
    const start = importStmt.start?.start ?? 0;
    const end = (importStmt.stop?.stop ?? 0) + 1;
    const line = (importStmt.start?.line ?? 1) - 1; // Convert to 0-based

    return { path, isWildcard, start, end, line };
}

/**
 * Find the last import line number in the file (0-based)
 * Returns -1 if there are no imports
 */
export function findLastImportLineAST(tree: ProgramContext): number {
    const imports = extractImportsAST(tree);
    if (imports.length === 0) return -1;

    return Math.max(...imports.map(i => i.line));
}

/**
 * Check if there's an existing import from a specific path
 */
export function findImportByPathAST(tree: ProgramContext, importPath: string): ImportInfo | null {
    const imports = extractImportsAST(tree);
    return imports.find(i => i.path === importPath) ?? null;
}
