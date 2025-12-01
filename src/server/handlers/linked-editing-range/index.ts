/**
 * Linked Editing Range handler for the Kite language server.
 * Provides simultaneous editing of related ranges (e.g., loop variable and its uses).
 */

import {
    LinkedEditingRanges,
    Position,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Handle linked editing range request
 */
export function handleLinkedEditingRange(
    document: TextDocument,
    position: Position
): LinkedEditingRanges | null {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Get word at position
    const word = getWordAtOffset(text, offset);
    if (!word) return null;

    // Skip keywords
    if (isKeyword(word)) return null;

    // Check if inside string
    if (isInsideString(text, offset)) return null;

    // Check if this is a loop variable
    const loopRanges = findLoopVariableRanges(text, word, position);
    if (loopRanges && loopRanges.length > 1) {
        return {
            ranges: loopRanges,
            wordPattern: '[a-zA-Z_]\\w*',
        };
    }

    // Check if this is a function parameter
    const paramRanges = findFunctionParameterRanges(text, word, position);
    if (paramRanges && paramRanges.length > 1) {
        return {
            ranges: paramRanges,
            wordPattern: '[a-zA-Z_]\\w*',
        };
    }

    // Check if this is a local variable used in a while loop or block
    const localVarRanges = findLocalVariableRanges(text, word, position);
    if (localVarRanges && localVarRanges.length > 1) {
        return {
            ranges: localVarRanges,
            wordPattern: '[a-zA-Z_]\\w*',
        };
    }

    return null;
}

/**
 * Find all occurrences of a loop variable within its loop scope
 * Handles both `for var in expr { }` and `[for var in expr]` comprehension syntax
 */
function findLoopVariableRanges(
    text: string,
    word: string,
    position: Position
): Range[] | null {
    const lines = text.split('\n');

    // Try standard for loop first
    const standardResult = findStandardForLoopRanges(lines, word, position);
    if (standardResult) return standardResult;

    // Try for comprehension [for var in expr]
    const comprehensionResult = findForComprehensionRanges(lines, word, position);
    if (comprehensionResult) return comprehensionResult;

    return null;
}

/**
 * Find ranges for standard for loop: `for var in expr { }`
 */
function findStandardForLoopRanges(
    lines: string[],
    word: string,
    position: Position
): Range[] | null {
    // Find if we're inside a for loop and the word is the loop variable
    for (let i = 0; i <= position.line; i++) {
        const line = lines[i];
        const forMatch = line.match(/^\s*for\s+(\w+)\s+in\s+/);

        if (forMatch && forMatch[1] === word) {
            const loopVarName = forMatch[1];
            const loopStartLine = i;

            // Find the loop's closing brace
            const loopEndLine = findBlockEnd(lines, loopStartLine);
            if (loopEndLine === -1) return null;

            // Check if position is within this loop
            if (position.line < loopStartLine || position.line > loopEndLine) {
                continue;
            }

            // Find all occurrences of the variable within the loop
            const ranges: Range[] = [];

            // Add declaration
            const declPos = line.indexOf(loopVarName, line.indexOf('for') + 3);
            ranges.push(Range.create(
                Position.create(loopStartLine, declPos),
                Position.create(loopStartLine, declPos + loopVarName.length)
            ));

            // Find uses in loop body
            for (let j = loopStartLine + 1; j <= loopEndLine; j++) {
                const bodyLine = lines[j];
                const useRanges = findWordOccurrences(bodyLine, loopVarName, j);
                ranges.push(...useRanges);
            }

            return ranges;
        }
    }

    // Also check if we're on a use of the loop variable (not the declaration)
    // by searching backwards for the for loop
    for (let i = position.line; i >= 0; i--) {
        const line = lines[i];
        const forMatch = line.match(/^\s*for\s+(\w+)\s+in\s+/);

        if (forMatch && forMatch[1] === word) {
            const loopStartLine = i;
            const loopEndLine = findBlockEnd(lines, loopStartLine);

            if (loopEndLine === -1) return null;

            // Check if position is within this loop
            if (position.line > loopEndLine) continue;

            // Recursively get ranges with position on declaration line
            return findStandardForLoopRanges(lines, word, Position.create(i, 0));
        }
    }

    return null;
}

/**
 * Find ranges for for comprehension: `[for var in expr]` followed by a block
 */
function findForComprehensionRanges(
    lines: string[],
    word: string,
    position: Position
): Range[] | null {
    // Search for [for var in expr] pattern
    for (let i = 0; i <= position.line; i++) {
        const line = lines[i];
        // Match [for var in expr] - comprehension syntax
        const compMatch = line.match(/\[for\s+(\w+)\s+in\s+[^\]]+\]/);

        if (compMatch && compMatch[1] === word) {
            const loopVarName = compMatch[1];
            const compStartLine = i;

            // Find the end of the comprehension scope (next block after the [for...])
            const blockEndLine = findBlockEnd(lines, compStartLine);
            if (blockEndLine === -1) return null;

            // Check if position is within this comprehension scope
            if (position.line < compStartLine || position.line > blockEndLine) {
                continue;
            }

            // Find all occurrences of the variable
            const ranges: Range[] = [];

            // Add declaration (find position in the [for var in ...] line)
            const forIndex = line.indexOf('[for');
            const declPos = line.indexOf(loopVarName, forIndex + 4);
            ranges.push(Range.create(
                Position.create(compStartLine, declPos),
                Position.create(compStartLine, declPos + loopVarName.length)
            ));

            // Find uses in comprehension body (including the same line after ])
            for (let j = compStartLine; j <= blockEndLine; j++) {
                const bodyLine = lines[j];
                const useRanges = findWordOccurrences(bodyLine, loopVarName, j);

                for (const range of useRanges) {
                    // Skip the declaration itself
                    if (j === compStartLine && range.start.character === declPos) {
                        continue;
                    }
                    ranges.push(range);
                }
            }

            return ranges;
        }
    }

    // Search backwards if we're on a use
    for (let i = position.line; i >= 0; i--) {
        const line = lines[i];
        const compMatch = line.match(/\[for\s+(\w+)\s+in\s+[^\]]+\]/);

        if (compMatch && compMatch[1] === word) {
            const compStartLine = i;
            const blockEndLine = findBlockEnd(lines, compStartLine);

            if (blockEndLine === -1) return null;

            // Check if position is within this comprehension
            if (position.line > blockEndLine) continue;

            // Recursively get ranges with position on declaration line
            return findForComprehensionRanges(lines, word, Position.create(i, 0));
        }
    }

    return null;
}

/**
 * Find all occurrences of a function parameter within its function scope
 */
function findFunctionParameterRanges(
    text: string,
    word: string,
    position: Position
): Range[] | null {
    const lines = text.split('\n');

    // Find if we're inside a function and the word is a parameter
    for (let i = position.line; i >= 0; i--) {
        const line = lines[i];
        const funcMatch = line.match(/^\s*fun\s+\w+\s*\(([^)]*)\)/);

        if (funcMatch) {
            const paramsStr = funcMatch[1];
            const params = parseParameters(paramsStr);

            // Check if word is one of the parameters
            const param = params.find(p => p.name === word);
            if (!param) return null;

            const funcStartLine = i;
            const funcEndLine = findBlockEnd(lines, funcStartLine);

            if (funcEndLine === -1) return null;

            // Check if position is within this function
            if (position.line > funcEndLine) return null;

            // Find all occurrences of the parameter within the function
            const ranges: Range[] = [];

            // Add parameter declaration
            const paramStartInLine = line.indexOf(paramsStr, line.indexOf('('));
            const paramOffset = paramsStr.indexOf(word);
            if (paramOffset !== -1) {
                const declCol = paramStartInLine + paramOffset;
                ranges.push(Range.create(
                    Position.create(funcStartLine, line.indexOf('(') + 1 + paramOffset),
                    Position.create(funcStartLine, line.indexOf('(') + 1 + paramOffset + word.length)
                ));
            }

            // Find uses in function body
            for (let j = funcStartLine + 1; j <= funcEndLine; j++) {
                const bodyLine = lines[j];
                const useRanges = findWordOccurrences(bodyLine, word, j);
                ranges.push(...useRanges);
            }

            return ranges;
        }
    }

    return null;
}

/**
 * Find all occurrences of a local variable within its scope (function body or block)
 * Handles variables used in while loops, if blocks, etc.
 */
function findLocalVariableRanges(
    text: string,
    word: string,
    position: Position
): Range[] | null {
    const lines = text.split('\n');

    // Check if we're inside a function
    const functionScope = findFunctionScope(lines, position.line);

    // Look for var declaration
    let declarationLine = -1;
    let declarationCol = -1;
    const searchStart = functionScope ? functionScope.startLine : 0;
    const searchEnd = functionScope ? functionScope.endLine : lines.length - 1;

    // Search for declaration from start of scope up to current position
    for (let i = searchStart; i <= Math.min(position.line, searchEnd); i++) {
        const line = lines[i];
        // Match: var [type] name = or var name =
        const varMatch = line.match(new RegExp(`\\bvar\\s+(?:\\w+\\s+)?(${escapeRegex(word)})\\s*=`));
        if (varMatch) {
            const nameIndex = line.indexOf(varMatch[1], line.indexOf('var'));
            declarationLine = i;
            declarationCol = nameIndex;
            break;
        }
    }

    // If no declaration found, search again from position backwards (we might be on a use)
    if (declarationLine === -1) {
        for (let i = position.line; i >= searchStart; i--) {
            const line = lines[i];
            const varMatch = line.match(new RegExp(`\\bvar\\s+(?:\\w+\\s+)?(${escapeRegex(word)})\\s*=`));
            if (varMatch) {
                const nameIndex = line.indexOf(varMatch[1], line.indexOf('var'));
                declarationLine = i;
                declarationCol = nameIndex;
                break;
            }
        }
    }

    if (declarationLine === -1) return null;

    // If NOT inside a function, only link if variable is used in control structures
    if (!functionScope) {
        const hasControlStructureUse = checkUsedInControlStructure(lines, word, declarationLine, searchEnd);
        if (!hasControlStructureUse) {
            // Top-level variable without control structure use - use rename instead
            return null;
        }
    }

    // Find all occurrences within the scope
    const ranges: Range[] = [];

    // Add declaration
    ranges.push(Range.create(
        Position.create(declarationLine, declarationCol),
        Position.create(declarationLine, declarationCol + word.length)
    ));

    // Find uses after declaration within scope
    for (let j = declarationLine; j <= searchEnd; j++) {
        const bodyLine = lines[j];
        const useRanges = findWordOccurrences(bodyLine, word, j);

        for (const range of useRanges) {
            // Skip the declaration itself
            if (j === declarationLine && range.start.character === declarationCol) {
                continue;
            }
            ranges.push(range);
        }
    }

    return ranges;
}

/**
 * Find the enclosing function scope (returns null if at top level)
 */
function findFunctionScope(lines: string[], currentLine: number): { startLine: number; endLine: number } | null {
    for (let i = currentLine; i >= 0; i--) {
        const line = lines[i];
        if (line.match(/^\s*fun\s+\w+\s*\(/)) {
            const endLine = findBlockEnd(lines, i);
            if (endLine >= currentLine) {
                return { startLine: i, endLine };
            }
        }
    }
    return null;
}

/**
 * Check if a variable is used within control structures (while, if, for blocks)
 */
function checkUsedInControlStructure(lines: string[], word: string, startLine: number, endLine: number): boolean {
    let inControlBlock = false;
    let braceDepth = 0;

    for (let i = startLine; i <= endLine; i++) {
        const line = lines[i];

        // Check for control structure starts
        if (line.match(/^\s*(while|if|for)\s*[\({]/)) {
            inControlBlock = true;
        }

        // Track braces for control structures
        for (const char of line) {
            if (char === '{') {
                braceDepth++;
            } else if (char === '}') {
                braceDepth--;
                if (braceDepth === 0) {
                    inControlBlock = false;
                }
            }
        }

        // Check if word is used on lines with control structures or inside blocks
        if (inControlBlock || line.match(/^\s*(while|if)\s*\(/)) {
            const regex = new RegExp(`\\b${escapeRegex(word)}\\b`);
            if (regex.test(line)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Parse function parameters from parameter string
 */
function parseParameters(paramsStr: string): Array<{ type: string; name: string }> {
    const params: Array<{ type: string; name: string }> = [];
    if (!paramsStr.trim()) return params;

    const parts = paramsStr.split(',');
    for (const part of parts) {
        const match = part.trim().match(/(\w+)\s+(\w+)/);
        if (match) {
            params.push({ type: match[1], name: match[2] });
        }
    }

    return params;
}

/**
 * Find the end line of a block starting at given line
 */
function findBlockEnd(lines: string[], startLine: number): number {
    let braceCount = 0;
    let foundOpen = false;

    for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];
        for (const char of line) {
            if (char === '{') {
                braceCount++;
                foundOpen = true;
            } else if (char === '}') {
                braceCount--;
                if (foundOpen && braceCount === 0) {
                    return i;
                }
            }
        }
    }

    return -1;
}

/**
 * Find all occurrences of a word in a line (respecting word boundaries)
 * Includes occurrences inside string interpolation ${...}
 */
function findWordOccurrences(line: string, word: string, lineNum: number): Range[] {
    const ranges: Range[] = [];
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g');
    let match;

    while ((match = regex.exec(line)) !== null) {
        // Include if not inside string OR inside string interpolation
        if (!isInsideStringInLine(line, match.index) || isInsideStringInterpolation(line, match.index)) {
            ranges.push(Range.create(
                Position.create(lineNum, match.index),
                Position.create(lineNum, match.index + word.length)
            ));
        }
    }

    return ranges;
}

/**
 * Check if position is inside a string interpolation ${...}
 */
function isInsideStringInterpolation(line: string, pos: number): boolean {
    // Find all ${...} regions and check if pos is inside one
    let i = 0;
    while (i < line.length) {
        if (line[i] === '$' && line[i + 1] === '{') {
            const start = i + 2;
            // Find matching }
            let braceCount = 1;
            let j = start;
            while (j < line.length && braceCount > 0) {
                if (line[j] === '{') braceCount++;
                else if (line[j] === '}') braceCount--;
                j++;
            }
            const end = j - 1;
            if (pos >= start && pos < end) {
                return true;
            }
            i = j;
        } else {
            i++;
        }
    }
    return false;
}

/**
 * Get word at offset
 */
function getWordAtOffset(text: string, offset: number): string | null {
    const before = text.substring(0, offset);
    const after = text.substring(offset);

    const beforeMatch = before.match(/[a-zA-Z_]\w*$/);
    const afterMatch = after.match(/^\w*/);

    if (!beforeMatch && !afterMatch?.[0]) return null;

    return (beforeMatch?.[0] || '') + (afterMatch?.[0] || '');
}

/**
 * Check if offset is inside a string literal
 */
function isInsideString(text: string, offset: number): boolean {
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < offset && i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
        } else if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
        }
    }

    return inString;
}

/**
 * Check if position in line is inside a string
 */
function isInsideStringInLine(line: string, pos: number): boolean {
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < pos; i++) {
        const char = line[i];
        const prevChar = i > 0 ? line[i - 1] : '';

        if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
        } else if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
        }
    }

    return inString;
}

/**
 * Check if word is a keyword
 */
function isKeyword(word: string): boolean {
    const keywords = [
        'if', 'else', 'for', 'while', 'in', 'return',
        'var', 'fun', 'schema', 'component', 'resource',
        'input', 'output', 'type', 'import', 'from',
        'true', 'false', 'null', 'init', 'this'
    ];
    return keywords.includes(word);
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
