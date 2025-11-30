/**
 * Utility functions for parsing Kite source code using the ANTLR-generated parser.
 * This module provides convenient wrappers around the generated parser classes.
 */

import { CharStream, CommonTokenStream, Token } from 'antlr4';
import KiteLexer from './grammar/KiteLexer';
import KiteParser, { ProgramContext } from './grammar/KiteParser';

/**
 * Parse result containing the AST and any syntax errors
 */
export interface ParseResult {
    tree: ProgramContext;
    tokens: CommonTokenStream;
    errors: SyntaxError[];
}

/**
 * Syntax error information
 */
export interface SyntaxError {
    line: number;
    column: number;
    message: string;
}

/**
 * Custom error listener to collect syntax errors
 */
class ErrorCollector {
    errors: SyntaxError[] = [];

    syntaxError(
        _recognizer: unknown,
        _offendingSymbol: unknown,
        line: number,
        charPositionInLine: number,
        msg: string
    ): void {
        this.errors.push({
            line,
            column: charPositionInLine,
            message: msg
        });
    }

    reportAmbiguity(): void { /* ignore */ }
    reportAttemptingFullContext(): void { /* ignore */ }
    reportContextSensitivity(): void { /* ignore */ }
}

/**
 * Parse Kite source code and return the AST
 *
 * @param source - The Kite source code to parse
 * @returns ParseResult containing the AST, token stream, and any errors
 */
export function parseKite(source: string): ParseResult {
    const inputStream = new CharStream(source);
    const lexer = new KiteLexer(inputStream);
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new KiteParser(tokenStream);

    // Collect errors instead of printing to console
    const errorCollector = new ErrorCollector();
    lexer.removeErrorListeners();
    parser.removeErrorListeners();
    lexer.addErrorListener(errorCollector);
    parser.addErrorListener(errorCollector);

    const tree = parser.program();

    return {
        tree,
        tokens: tokenStream,
        errors: errorCollector.errors
    };
}

/**
 * Get all tokens from source code
 *
 * @param source - The Kite source code to tokenize
 * @returns Array of tokens
 */
export function tokenize(source: string): Token[] {
    const inputStream = new CharStream(source);
    const lexer = new KiteLexer(inputStream);
    const tokens: Token[] = [];

    let token = lexer.nextToken();
    while (token.type !== Token.EOF) {
        tokens.push(token);
        token = lexer.nextToken();
    }

    return tokens;
}

/**
 * Get token at a specific offset in the source
 *
 * @param source - The Kite source code
 * @param offset - The character offset
 * @returns The token at the offset, or undefined if not found
 */
export function getTokenAtOffset(source: string, offset: number): Token | undefined {
    const tokens = tokenize(source);

    for (const token of tokens) {
        const start = token.start;
        const end = token.stop + 1;
        if (offset >= start && offset < end) {
            return token;
        }
    }

    return undefined;
}

/**
 * Convert a line/column position to a character offset
 *
 * @param source - The source text
 * @param line - 1-based line number
 * @param column - 0-based column number
 * @returns The character offset
 */
export function positionToOffset(source: string, line: number, column: number): number {
    let currentLine = 1;
    let offset = 0;

    // Find the start of the target line
    while (offset < source.length && currentLine < line) {
        const char = source[offset];
        if (char === '\r') {
            // Handle \r\n (Windows) or \r (old Mac)
            if (offset + 1 < source.length && source[offset + 1] === '\n') {
                offset++; // Skip the \n in \r\n
            }
            currentLine++;
        } else if (char === '\n') {
            currentLine++;
        }
        offset++;
    }

    return offset + column;
}

/**
 * Convert a character offset to line/column position
 *
 * @param source - The source text
 * @param offset - The character offset
 * @returns Object with 1-based line and 0-based column
 */
export function offsetToPosition(source: string, offset: number): { line: number; column: number } {
    let line = 1;
    let lastNewline = -1;

    for (let i = 0; i < offset && i < source.length; i++) {
        const char = source[i];
        if (char === '\r') {
            // Handle \r\n (Windows) or \r (old Mac)
            line++;
            lastNewline = i;
            if (i + 1 < source.length && source[i + 1] === '\n') {
                i++; // Skip the \n in \r\n
                lastNewline = i;
            }
        } else if (char === '\n') {
            line++;
            lastNewline = i;
        }
    }

    return {
        line,
        column: offset - lastNewline - 1
    };
}

// Re-export lexer for token type constants
export { default as KiteLexer } from './grammar/KiteLexer';
