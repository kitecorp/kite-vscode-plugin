/**
 * Code formatting handler for the Kite language server.
 * Provides document formatting functionality.
 */

import { TextEdit, Range, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Formatting options
 */
export interface FormatOptions {
    tabSize: number;
    insertSpaces: boolean;
}

/**
 * Format a Kite document
 */
export function formatDocument(document: TextDocument, options: FormatOptions): TextEdit[] {
    const text = document.getText();
    const formatted = formatKiteCode(text, options);

    if (formatted === text) {
        return [];
    }

    // Return a single edit that replaces the entire document
    return [
        TextEdit.replace(
            Range.create(Position.create(0, 0), document.positionAt(text.length)),
            formatted
        ),
    ];
}

/**
 * Format Kite source code
 */
export function formatKiteCode(text: string, options: FormatOptions): string {
    const indent = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';

    // Pre-process: join opening brace on new line with previous line
    text = text.replace(/\n\s*\{(\s*\n)/g, ' {$1');

    const lines = text.split('\n');
    const result: string[] = [];

    let indentLevel = 0;
    let inMultiLineString = false;
    let prevLineWasBlank = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Handle blank lines - reduce multiple to one
        const trimmedLine = line.trim();
        if (trimmedLine === '') {
            if (prevLineWasBlank) {
                continue; // Skip consecutive blank lines
            }
            result.push('');
            prevLineWasBlank = true;
            continue;
        }
        prevLineWasBlank = false;

        // Check for multi-line string (basic check)
        const stringMatches = line.match(/"/g);
        if (stringMatches && stringMatches.length % 2 !== 0) {
            inMultiLineString = !inMultiLineString;
        }

        // Don't format inside multi-line strings
        if (inMultiLineString) {
            result.push(line);
            continue;
        }

        // Remove trailing whitespace
        line = line.trimEnd();

        // Format the line content
        line = formatLineContent(line.trim());

        // Calculate indent level based on braces
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;

        // Handle closing brace - decrease indent before the line
        // Only if the line starts with closing brace
        const startsWithClose = /^\}/.test(line);
        if (startsWithClose) {
            indentLevel = Math.max(0, indentLevel - 1);
        }

        // Apply indentation
        const indentedLine = indent.repeat(indentLevel) + line;
        result.push(indentedLine);

        // Update indent level for next line based on net brace change
        // But account for closing braces we already handled
        let netChange = openBraces - closeBraces;
        if (startsWithClose) {
            // We already decremented for the leading close brace
            netChange += 1;
        }
        indentLevel += netChange;
        indentLevel = Math.max(0, indentLevel);
    }

    // Remove trailing blank lines
    while (result.length > 0 && result[result.length - 1] === '') {
        result.pop();
    }

    // Apply vertical alignment within blocks
    return alignEqualsInBlocks(result).join('\n');
}

/**
 * Align = signs vertically within blocks and at top level
 */
function alignEqualsInBlocks(lines: string[]): string[] {
    const result = [...lines];
    let blockStart = 0;  // Start from beginning for top-level
    let depth = 0;

    for (let i = 0; i < result.length; i++) {
        const line = result[i];

        // Track block depth
        const opens = (line.match(/\{/g) || []).length;
        const closes = (line.match(/\}/g) || []).length;

        // Start of a block
        if (opens > closes) {
            // Align lines before this block (at current depth)
            if (blockStart < i) {
                alignBlockLines(result, blockStart, i - 1);
            }
            depth += opens - closes;
            blockStart = i + 1;
        } else if (closes > opens) {
            // End of a block - align lines in this block
            if (blockStart < i) {
                alignBlockLines(result, blockStart, i - 1);
            }
            depth -= closes - opens;
            blockStart = i + 1;  // Next potential block starts after closing brace
        }
    }

    // Align any remaining lines
    if (blockStart < result.length) {
        alignBlockLines(result, blockStart, result.length - 1);
    }

    return result;
}

/**
 * Align = signs in a range of lines (within a block)
 */
function alignBlockLines(lines: string[], start: number, end: number): void {
    // Find groups of consecutive lines with = (not interrupted by blank lines)
    // Decorators (@...) and lines with = are part of the group
    let groupStart = -1;
    let linesWithEquals = 0;

    for (let i = start; i <= end + 1; i++) {
        const line = i <= end ? lines[i] : '';
        const trimmed = line.trim();
        const isDecorator = trimmed.startsWith('@');
        const isComment = trimmed.startsWith('//') || trimmed.startsWith('/*');
        const isBlank = trimmed === '';
        const hasEquals = trimmed.includes('=') && !isComment;

        if (isBlank) {
            // Blank line ends the group
            if (groupStart !== -1 && linesWithEquals >= 2) {
                alignGroup(lines, groupStart, i - 1);
            }
            groupStart = -1;
            linesWithEquals = 0;
        } else if (hasEquals || isDecorator) {
            // Lines with = or decorators continue/start the group
            if (groupStart === -1) {
                groupStart = i;
                linesWithEquals = 0;
            }
            if (hasEquals) {
                linesWithEquals++;
            }
        } else if (!isComment) {
            // Other non-comment lines end the group
            if (groupStart !== -1 && linesWithEquals >= 2) {
                alignGroup(lines, groupStart, i - 1);
            }
            groupStart = -1;
            linesWithEquals = 0;
        }
        // Comments don't affect grouping - they're skipped
    }
}

/**
 * Align = signs in a group of consecutive lines
 */
function alignGroup(lines: string[], start: number, end: number): void {
    // Find the maximum position of = in this group
    let maxEqPos = 0;

    for (let i = start; i <= end; i++) {
        const line = lines[i];
        const eqIndex = findAssignmentEquals(line);
        if (eqIndex > maxEqPos) {
            maxEqPos = eqIndex;
        }
    }

    // Pad each line to align =
    for (let i = start; i <= end; i++) {
        const line = lines[i];
        const eqIndex = findAssignmentEquals(line);
        if (eqIndex >= 0 && eqIndex < maxEqPos) {
            const padding = ' '.repeat(maxEqPos - eqIndex);
            lines[i] = line.substring(0, eqIndex) + padding + line.substring(eqIndex);
        }
    }
}

/**
 * Find the position of the assignment = (not ==, !=, <=, >=)
 */
function findAssignmentEquals(line: string): number {
    // Find = that is not part of ==, !=, <=, >=
    let i = 0;
    while (i < line.length) {
        const char = line[i];
        if (char === '"' || char === "'") {
            // Skip strings
            const quote = char;
            i++;
            while (i < line.length && line[i] !== quote) {
                if (line[i] === '\\') i++; // Skip escaped char
                i++;
            }
            i++;
        } else if (char === '=') {
            // Check if it's a standalone =
            const prev = i > 0 ? line[i - 1] : '';
            const next = i < line.length - 1 ? line[i + 1] : '';
            if (prev !== '=' && prev !== '!' && prev !== '<' && prev !== '>' && next !== '=') {
                return i;
            }
            i++;
        } else {
            i++;
        }
    }
    return -1;
}

/**
 * Format the content of a single line (spacing, operators, etc.)
 */
function formatLineContent(line: string): string {
    // Don't modify empty lines or comments
    if (line === '' || line.startsWith('//') || line.startsWith('/*')) {
        return line;
    }

    // Preserve strings by temporarily replacing them
    const strings: string[] = [];
    let stringIndex = 0;
    line = line.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
        strings.push(match);
        return `__STRING_${stringIndex++}__`;
    });
    line = line.replace(/'(?:[^'\\]|\\.)*'/g, (match) => {
        strings.push(match);
        return `__STRING_${stringIndex++}__`;
    });

    // Add space before opening brace if missing (but not after opening paren)
    line = line.replace(/([^\s(])\{/g, '$1 {');

    // Add space after keywords before parentheses
    line = line.replace(/\b(if|for|while|fun|component|schema|resource)\(/g, '$1 (');

    // Format assignment operator: ensure space around =
    // But not inside == or != or <= or >=
    line = line.replace(/([^=!<>])=([^=])/g, '$1 = $2');
    line = line.replace(/([^=!<>])=$/g, '$1 ='); // Handle = at end

    // Clean up multiple spaces around =
    line = line.replace(/\s+=\s+/g, ' = ');

    // Format colon in object literals: key: value -> key: value
    line = line.replace(/(\w):(\S)/g, '$1: $2');
    line = line.replace(/(\w)\s*:\s*/g, '$1: ');

    // Add space after comma
    line = line.replace(/,(\S)/g, ', $1');

    // Add space inside braces for inline objects: {x} -> { x }
    // But not when brace follows opening paren: ({ should stay as ({
    line = line.replace(/\(\{(\S)/g, '({ $1');  // Handle ({ specially
    line = line.replace(/([^(])\{(\S)/g, '$1{ $2');  // Other cases
    line = line.replace(/\{(\s*)$/g, '{');  // No trailing space for { at end of line
    line = line.replace(/(\S)\}/g, '$1 }');

    // Fix "( {" -> "({" - no space between ( and {
    line = line.replace(/\(\s+\{/g, '({');

    // Clean up double spaces
    line = line.replace(/  +/g, ' ');

    // Add space after 'from' keyword before string
    line = line.replace(/\bfrom(__STRING_\d+__)/g, 'from $1');

    // Restore strings
    for (let i = 0; i < strings.length; i++) {
        line = line.replace(`__STRING_${i}__`, strings[i]);
    }

    return line;
}
