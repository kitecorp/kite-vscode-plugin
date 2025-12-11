/**
 * Unreachable code detection for the Kite language server.
 * Reports warnings for code that appears after return statements.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment } from '../../utils/text-utils';

/**
 * Check for unreachable code after return statements
 */
export function checkUnreachableCode(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Find all function bodies and check for code after return
    const funcRegex = /\bfun\s+\w+\s*\([^)]*\)(?:\s+\w+)?\s*\{/g;

    let match;
    while ((match = funcRegex.exec(text)) !== null) {
        if (isInComment(text, match.index)) continue;

        const braceStart = match.index + match[0].length - 1;
        const braceEnd = findMatchingBrace(text, braceStart);
        if (braceEnd === -1) continue;

        // Check function body for unreachable code
        checkBlockForUnreachable(text, braceStart, braceEnd, document, diagnostics);
    }

    return diagnostics;
}

/**
 * Check a block for unreachable code after return
 */
function checkBlockForUnreachable(
    text: string,
    blockStart: number,
    blockEnd: number,
    document: TextDocument,
    diagnostics: Diagnostic[]
): void {
    const blockContent = text.substring(blockStart + 1, blockEnd);

    // Find return statements at the current block level
    let i = 0;
    let depth = 0;
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inBlockComment = false;

    while (i < blockContent.length) {
        const char = blockContent[i];
        const prevChar = i > 0 ? blockContent[i - 1] : '';

        // Handle comments
        if (!inString && !inComment && char === '*' && prevChar === '/') {
            inBlockComment = true;
            i++;
            continue;
        }
        if (inBlockComment && char === '/' && prevChar === '*') {
            inBlockComment = false;
            i++;
            continue;
        }
        if (inBlockComment) { i++; continue; }

        if (!inString && char === '/' && blockContent[i + 1] === '/') {
            inComment = true;
            i++;
            continue;
        }
        if (inComment && char === '\n') {
            inComment = false;
            i++;
            continue;
        }
        if (inComment) { i++; continue; }

        // Handle strings
        if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
            i++;
            continue;
        }
        if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
            i++;
            continue;
        }
        if (inString) { i++; continue; }

        // Track nesting
        if (char === '{') depth++;
        if (char === '}') depth--;

        // Look for return at depth 0
        if (depth === 0 && blockContent.substring(i).match(/^\breturn\b/)) {
            // Find end of return statement, tracking brace depth for object literals
            const returnStart = i;
            let returnEnd = i + 6; // After 'return'
            let returnBraceDepth = 0;
            let returnInString = false;
            let returnStringChar = '';

            // Skip to end of statement (handle multi-line object literals)
            while (returnEnd < blockContent.length) {
                const c = blockContent[returnEnd];
                const pc = returnEnd > 0 ? blockContent[returnEnd - 1] : '';

                // Track strings
                if (!returnInString && (c === '"' || c === "'")) {
                    returnInString = true;
                    returnStringChar = c;
                    returnEnd++;
                    continue;
                }
                if (returnInString && c === returnStringChar && pc !== '\\') {
                    returnInString = false;
                    returnEnd++;
                    continue;
                }
                if (returnInString) {
                    returnEnd++;
                    continue;
                }

                // Track braces for object literals
                if (c === '{') returnBraceDepth++;
                if (c === '}') {
                    if (returnBraceDepth > 0) {
                        returnBraceDepth--;
                        returnEnd++;
                        continue;
                    }
                    // This is the function's closing brace, stop here
                    break;
                }

                // Only end on newline if not inside object literal
                if (c === '\n' && returnBraceDepth === 0) {
                    returnEnd++;
                    break;
                }
                returnEnd++;
            }

            // Check if there's code after the return (at same depth)
            const afterReturn = blockContent.substring(returnEnd).trim();

            // Remove comments and check if anything remains before closing brace
            const withoutComments = afterReturn
                .replace(/\/\/.*$/gm, '')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .trim();

            // If there's code and it's not just closing braces
            if (withoutComments && !withoutComments.match(/^[\s}]*$/)) {
                // Find the first non-whitespace after return
                let codeStart = returnEnd;
                while (codeStart < blockContent.length && /\s/.test(blockContent[codeStart])) {
                    codeStart++;
                }

                if (codeStart < blockContent.length && blockContent[codeStart] !== '}') {
                    const absoluteOffset = blockStart + 1 + codeStart;

                    // Find end of unreachable section (next closing brace at depth 0)
                    let codeEnd = codeStart;
                    let d = 0;
                    while (codeEnd < blockContent.length) {
                        if (blockContent[codeEnd] === '{') d++;
                        if (blockContent[codeEnd] === '}') {
                            if (d === 0) break;
                            d--;
                        }
                        codeEnd++;
                    }

                    const startPos = document.positionAt(absoluteOffset);
                    const endPos = document.positionAt(blockStart + 1 + codeEnd);

                    diagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        range: Range.create(startPos, endPos),
                        message: 'Unreachable code after return statement',
                        source: 'kite',
                    });
                }
            }

            break; // Only check first return at this level
        }

        i++;
    }
}

/**
 * Find the matching closing brace
 */
function findMatchingBrace(text: string, start: number): number {
    if (text[start] !== '{') return -1;

    let depth = 1;
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inBlockComment = false;

    for (let i = start + 1; i < text.length; i++) {
        const char = text[i];
        const prevChar = text[i - 1];

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
        if (inString) continue;

        if (char === '{') depth++;
        if (char === '}') depth--;

        if (depth === 0) return i;
    }

    return -1;
}
