/**
 * On Type Formatting handler for the Kite language server.
 * Auto-formats code as you type.
 */

import {
    TextEdit,
    Range,
    Position,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

export interface FormattingOptions {
    tabSize: number;
    insertSpaces: boolean;
}

/**
 * Handle on-type formatting request
 * Triggered when user types specific characters (Enter, })
 */
export function handleOnTypeFormatting(
    document: TextDocument,
    position: Position,
    ch: string,
    options: FormattingOptions
): TextEdit[] {
    if (ch === '\n') {
        return handleNewline(document, position, options);
    } else if (ch === '}') {
        return handleClosingBrace(document, position, options);
    }

    return [];
}

/**
 * Handle newline - add appropriate indentation
 */
function handleNewline(
    document: TextDocument,
    position: Position,
    options: FormattingOptions
): TextEdit[] {
    const text = document.getText();
    const lines = text.split('\n');

    // Position is on the new empty line, check the previous line
    const prevLineIndex = position.line - 1;
    if (prevLineIndex < 0) return [];

    const prevLine = lines[prevLineIndex];

    // Check if previous line ends with { (and not in a string)
    if (endsWithOpenBrace(prevLine)) {
        // Calculate new indent: previous indent + one level
        const prevIndent = getIndent(prevLine);
        const newIndent = prevIndent + getIndentUnit(options);

        return [
            TextEdit.insert(Position.create(position.line, 0), newIndent)
        ];
    }

    // If not after a brace, maintain the same indent as previous line
    const prevIndent = getIndent(prevLine);
    if (prevIndent.length > 0) {
        return [
            TextEdit.insert(Position.create(position.line, 0), prevIndent)
        ];
    }

    return [];
}

/**
 * Handle closing brace - adjust indentation
 */
function handleClosingBrace(
    document: TextDocument,
    position: Position,
    options: FormattingOptions
): TextEdit[] {
    const text = document.getText();
    const lines = text.split('\n');
    const currentLine = lines[position.line];

    // Get current whitespace before }
    const leadingWhitespace = currentLine.match(/^(\s*)/)?.[1] || '';
    const bracePos = currentLine.indexOf('}');

    if (bracePos === -1) return [];

    // Only format if } is the first non-whitespace character
    if (currentLine.substring(0, bracePos).trim() !== '') {
        return [];
    }

    // Find matching opening brace to determine correct indent
    const targetIndent = findMatchingBraceIndent(lines, position.line, options);

    // If indent is the same, no change needed
    if (targetIndent === leadingWhitespace) {
        return [];
    }

    // Replace the whitespace before }
    return [
        TextEdit.replace(
            Range.create(
                Position.create(position.line, 0),
                Position.create(position.line, leadingWhitespace.length)
            ),
            targetIndent
        )
    ];
}

/**
 * Check if line ends with opening brace (not inside a string)
 */
function endsWithOpenBrace(line: string): boolean {
    // Trim whitespace from end
    const trimmed = line.trimEnd();
    if (!trimmed.endsWith('{')) return false;

    // Check if the { is inside a string
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];
        const prevChar = i > 0 ? trimmed[i - 1] : '';

        if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
        } else if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
        }
    }

    // If we're still in a string at the end, the { is inside a string
    return !inString;
}

/**
 * Get the leading whitespace (indentation) from a line
 */
function getIndent(line: string): string {
    const match = line.match(/^(\s*)/);
    return match ? match[1] : '';
}

/**
 * Get one unit of indentation
 */
function getIndentUnit(options: FormattingOptions): string {
    if (options.insertSpaces) {
        return ' '.repeat(options.tabSize);
    } else {
        return '\t';
    }
}

/**
 * Find the indent level of the matching opening brace
 */
function findMatchingBraceIndent(
    lines: string[],
    closingBraceLine: number,
    options: FormattingOptions
): string {
    let braceCount = 1; // Start with 1 for the closing brace we're on

    // Search backwards for matching opening brace
    for (let i = closingBraceLine - 1; i >= 0; i--) {
        const line = lines[i];

        // Count braces in this line (right to left to handle multiple braces)
        for (let j = line.length - 1; j >= 0; j--) {
            const char = line[j];

            // Skip braces inside strings
            if (isInsideStringAtPosition(line, j)) continue;

            if (char === '}') {
                braceCount++;
            } else if (char === '{') {
                braceCount--;
                if (braceCount === 0) {
                    // Found matching opening brace - return its indent
                    return getIndent(line);
                }
            }
        }
    }

    // No matching brace found, return no indent
    return '';
}

/**
 * Check if position in line is inside a string literal
 */
function isInsideStringAtPosition(line: string, pos: number): boolean {
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
