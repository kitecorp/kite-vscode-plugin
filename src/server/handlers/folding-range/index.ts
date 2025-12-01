/**
 * Folding Range handler for the Kite language server.
 * Provides custom code folding regions via LSP.
 */

import {
    FoldingRange,
    FoldingRangeKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Handle folding range request
 */
export function handleFoldingRange(document: TextDocument): FoldingRange[] {
    const text = document.getText();
    const lines = text.split('\n');
    const ranges: FoldingRange[] = [];

    // Track block starts with a stack
    const blockStack: Array<{ line: number; char: number }> = [];

    // Track import group
    let importStartLine: number | null = null;
    let importEndLine: number | null = null;

    // Track multi-line comments
    let commentStartLine: number | null = null;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        const trimmed = line.trim();

        // Handle multi-line comments
        if (commentStartLine === null) {
            const commentStart = line.indexOf('/*');
            if (commentStart !== -1) {
                const commentEnd = line.indexOf('*/', commentStart + 2);
                if (commentEnd === -1) {
                    // Multi-line comment starts
                    commentStartLine = lineNum;
                }
            }
        } else {
            const commentEnd = line.indexOf('*/');
            if (commentEnd !== -1) {
                // Multi-line comment ends
                if (lineNum > commentStartLine) {
                    ranges.push({
                        startLine: commentStartLine,
                        endLine: lineNum,
                        kind: FoldingRangeKind.Comment,
                    });
                }
                commentStartLine = null;
            }
            continue; // Skip processing inside comments
        }

        // Skip single-line comments
        if (trimmed.startsWith('//')) {
            continue;
        }

        // Track import groups
        if (trimmed.startsWith('import ')) {
            if (importStartLine === null) {
                importStartLine = lineNum;
            }
            importEndLine = lineNum;
        } else if (trimmed.length > 0 && importStartLine !== null) {
            // Non-import, non-empty line - close import group if multiple imports
            if (importEndLine !== null && importEndLine > importStartLine) {
                ranges.push({
                    startLine: importStartLine,
                    endLine: importEndLine,
                    kind: FoldingRangeKind.Imports,
                });
            }
            importStartLine = null;
            importEndLine = null;
        }

        // Find opening braces (not in strings or comments)
        const effectiveLine = removeStringsAndComments(line);

        for (let i = 0; i < effectiveLine.length; i++) {
            const char = effectiveLine[i];

            if (char === '{' || char === '[') {
                blockStack.push({ line: lineNum, char: i });
            } else if (char === '}' || char === ']') {
                const openBlock = blockStack.pop();
                if (openBlock && lineNum > openBlock.line) {
                    ranges.push({
                        startLine: openBlock.line,
                        endLine: lineNum,
                        kind: FoldingRangeKind.Region,
                    });
                }
            }
        }
    }

    // Close any remaining import group at end of file
    if (importStartLine !== null && importEndLine !== null && importEndLine > importStartLine) {
        ranges.push({
            startLine: importStartLine,
            endLine: importEndLine,
            kind: FoldingRangeKind.Imports,
        });
    }

    // Sort by start line for consistent output
    ranges.sort((a, b) => a.startLine - b.startLine);

    return ranges;
}

/**
 * Remove strings and single-line comments from a line for brace matching
 */
function removeStringsAndComments(line: string): string {
    let result = '';
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const prevChar = i > 0 ? line[i - 1] : '';

        // Check for single-line comment
        if (!inString && char === '/' && line[i + 1] === '/') {
            break; // Rest of line is comment
        }

        // Check for string start/end
        if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
            result += ' '; // Replace with space to preserve position
        } else if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
            result += ' ';
        } else if (inString) {
            result += ' '; // Replace string content with spaces
        } else {
            result += char;
        }
    }

    return result;
}
