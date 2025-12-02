/**
 * Syntax error detection and improved error messages for the Kite language server.
 * Transforms ANTLR parser errors into user-friendly, actionable messages.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseKite, SyntaxError } from '../../../parser/parse-utils';

/**
 * Check for syntax errors and provide helpful messages
 */
export function checkSyntaxErrors(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Parse the document to get syntax errors
    const result = parseKite(text);

    for (const error of result.errors) {
        const improvedMessage = improveErrorMessage(error, text);

        // Convert 1-based line to 0-based for LSP
        const line = Math.max(0, error.line - 1);
        const column = Math.max(0, error.column);

        // Find the end of the error range
        const lineText = getLineText(text, line);
        const endColumn = findErrorEndColumn(lineText, column, error.message);

        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: Range.create(
                { line, character: column },
                { line, character: endColumn }
            ),
            message: improvedMessage,
            source: 'kite',
        });
    }

    return diagnostics;
}

/**
 * Get a specific line of text from the document
 */
function getLineText(text: string, lineNumber: number): string {
    const lines = text.split('\n');
    return lines[lineNumber] || '';
}

/**
 * Find the end column for error highlighting
 */
function findErrorEndColumn(lineText: string, startColumn: number, _errorMessage: string): number {
    if (startColumn >= lineText.length) {
        return lineText.length;
    }

    // Find the end of the current token
    let endColumn = startColumn;
    const char = lineText[startColumn];

    if (/[a-zA-Z_]/.test(char)) {
        // Identifier - find end of word
        while (endColumn < lineText.length && /\w/.test(lineText[endColumn])) {
            endColumn++;
        }
    } else if (/[0-9]/.test(char)) {
        // Number - find end of number
        while (endColumn < lineText.length && /[0-9.]/.test(lineText[endColumn])) {
            endColumn++;
        }
    } else if (char === '"' || char === "'") {
        // String - find closing quote or end of line
        endColumn++;
        while (endColumn < lineText.length && lineText[endColumn] !== char) {
            endColumn++;
        }
        if (endColumn < lineText.length) endColumn++; // Include closing quote
    } else {
        // Single character token
        endColumn = startColumn + 1;
    }

    return Math.max(endColumn, startColumn + 1);
}

/**
 * Transform ANTLR error messages into helpful, user-friendly messages
 */
function improveErrorMessage(error: SyntaxError, text: string): string {
    const { message, line, column } = error;
    const lineText = getLineText(text, line - 1);
    const context = lineText.substring(Math.max(0, column - 10), column + 20).trim();

    // Pattern matching for common ANTLR error messages

    // Missing token errors
    if (message.includes("missing '}'")) {
        return "Missing closing brace '}'. Every '{' must have a matching '}'.";
    }
    if (message.includes("missing ')'")) {
        return "Missing closing parenthesis ')'. Check that all '(' have matching ')'.";
    }
    if (message.includes("missing ']'")) {
        return "Missing closing bracket ']'. Check that all '[' have matching ']'.";
    }
    if (message.includes("missing '{'")) {
        return "Missing opening brace '{'. Block statements require '{' after the declaration.";
    }
    if (message.includes("missing '('")) {
        return "Missing opening parenthesis '('. Function calls and declarations require '()'.";
    }
    if (message.includes("missing 'from'")) {
        return "Missing 'from' keyword in import. Use: import * from \"path\" or import Name from \"path\"";
    }
    if (message.includes("missing IDENTIFIER")) {
        return "Expected an identifier (name). Names must start with a letter or underscore.";
    }
    if (message.includes("missing STRING_LITERAL") || message.includes("missing STRING")) {
        return "Expected a string. Strings must be enclosed in double quotes: \"text\"";
    }

    // Extraneous/unexpected token errors
    const extraneousMatch = message.match(/extraneous input '([^']+)'/);
    if (extraneousMatch) {
        const token = extraneousMatch[1];
        return getExtraneousInputMessage(token, lineText, column);
    }

    // Mismatched input errors
    const mismatchedMatch = message.match(/mismatched input '([^']+)' expecting (.+)/);
    if (mismatchedMatch) {
        const actual = mismatchedMatch[1];
        const expected = mismatchedMatch[2];
        return getMismatchedInputMessage(actual, expected, lineText, column);
    }

    // No viable alternative errors
    if (message.includes('no viable alternative')) {
        return getNoViableAlternativeMessage(lineText, column, context);
    }

    // Token recognition errors
    const tokenErrorMatch = message.match(/token recognition error at: '([^']+)'/);
    if (tokenErrorMatch) {
        const badToken = tokenErrorMatch[1];
        return getTokenRecognitionMessage(badToken);
    }

    // EOF errors
    if (message.includes('<EOF>')) {
        return "Unexpected end of file. Check for unclosed braces, parentheses, or strings.";
    }

    // Default: return the original message with some cleanup
    return cleanupMessage(message);
}

/**
 * Generate helpful message for extraneous input
 */
function getExtraneousInputMessage(token: string, lineText: string, _column: number): string {
    // Check for common mistakes
    if (token === '=') {
        // Check if this might be an assignment where declaration was expected
        if (/^\s*\w+\s*=$/.test(lineText.substring(0, lineText.indexOf('=') + 1))) {
            return "Unexpected '='. Did you mean to declare a variable? Use: var name = value";
        }
        return "Unexpected '=' at this position. Check the syntax of your statement.";
    }

    if (token === '{') {
        return "Unexpected '{'. Braces are used after 'schema', 'component', 'resource', 'fun', 'if', 'for', 'while'.";
    }

    if (token === '}') {
        return "Unexpected '}'. This closing brace doesn't match any opening brace.";
    }

    if (token === ')') {
        return "Unexpected ')'. This closing parenthesis doesn't match any opening parenthesis.";
    }

    if (token === '(') {
        return "Unexpected '('. Parentheses are used in function calls and declarations.";
    }

    if (token === ']') {
        return "Unexpected ']'. This closing bracket doesn't match any opening bracket.";
    }

    if (token === '@') {
        return "Unexpected '@'. Decorators must appear before declarations (schema, component, resource, fun).";
    }

    if (/^[0-9]/.test(token)) {
        return `Unexpected number '${token}'. Numbers cannot appear here.`;
    }

    if (/^[a-zA-Z_]/.test(token)) {
        return `Unexpected identifier '${token}'. Check the syntax of your statement.`;
    }

    return `Unexpected '${token}'. This token is not valid at this position.`;
}

/**
 * Generate helpful message for mismatched input
 */
function getMismatchedInputMessage(actual: string, expected: string, lineText: string, _column: number): string {
    // Clean up ANTLR's expected tokens list
    const expectedClean = expected
        .replace(/\{|\}/g, '')
        .replace(/'/g, '')
        .split(',')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('<'))
        .slice(0, 5); // Limit to 5 suggestions

    // Check for common patterns
    if (actual === '\\n' || actual === '<EOF>') {
        if (expectedClean.includes('}')) {
            return "Unexpected end of line. Missing closing brace '}' or statement is incomplete.";
        }
        if (expectedClean.includes(')')) {
            return "Unexpected end of line. Missing closing parenthesis ')' or statement is incomplete.";
        }
        return "Statement is incomplete. Check for missing tokens at the end.";
    }

    // Check if they forgot a keyword
    if (lineText.includes('=') && expectedClean.some(e => ['var', 'input', 'output'].includes(e))) {
        return "Missing keyword. Variable declarations need 'var': var name = value";
    }

    // Build a helpful message with suggestions
    if (expectedClean.length > 0) {
        const suggestions = expectedClean.join("', '");
        return `Found '${actual}' but expected '${suggestions}'.`;
    }

    return `Unexpected '${actual}' at this position.`;
}

/**
 * Generate helpful message for no viable alternative errors
 */
function getNoViableAlternativeMessage(lineText: string, column: number, _context: string): string {
    const trimmedLine = lineText.trim();

    // Check for common patterns
    if (trimmedLine.startsWith('import') && !trimmedLine.includes('from')) {
        return "Invalid import statement. Use: import * from \"path\" or import Name from \"path\"";
    }

    if (trimmedLine.startsWith('schema') && !trimmedLine.includes('{')) {
        return "Invalid schema declaration. Use: schema Name { properties }";
    }

    if (trimmedLine.startsWith('component') && !trimmedLine.includes('{')) {
        return "Invalid component declaration. Use: component Name { inputs/outputs }";
    }

    if (trimmedLine.startsWith('resource') && !trimmedLine.includes('{')) {
        return "Invalid resource declaration. Use: resource SchemaName instanceName { properties }";
    }

    if (trimmedLine.startsWith('fun') && !trimmedLine.includes('(')) {
        return "Invalid function declaration. Use: fun name(params) { body }";
    }

    if (/^\w+\s*=/.test(trimmedLine) && !trimmedLine.startsWith('var')) {
        return "Invalid statement. Variable declarations require 'var': var name = value";
    }

    // Get the problematic token
    const token = lineText.substring(column).split(/\s/)[0];
    if (token) {
        return `Syntax error near '${token}'. Check the statement syntax.`;
    }

    return "Syntax error. The parser couldn't understand this statement.";
}

/**
 * Generate helpful message for token recognition errors
 */
function getTokenRecognitionMessage(badToken: string): string {
    if (badToken === '`') {
        return "Invalid character '`'. Kite uses double quotes (\") for strings, not backticks.";
    }

    if (badToken === '#') {
        return "Invalid character '#'. Comments in Kite use // for single-line or /* */ for multi-line.";
    }

    if (badToken === '$' && !badToken.includes('{')) {
        return "Invalid '$'. String interpolation uses ${expression} inside double-quoted strings.";
    }

    if (badToken === '?') {
        return "Invalid character '?'. Kite doesn't support ternary operators. Use if/else instead.";
    }

    if (/[\u0080-\uFFFF]/.test(badToken)) {
        return `Invalid character '${badToken}'. Only ASCII characters are allowed in identifiers.`;
    }

    return `Unrecognized character '${badToken}'. This character is not valid in Kite code.`;
}

/**
 * Clean up an ANTLR message for display
 */
function cleanupMessage(message: string): string {
    return message
        .replace(/<EOF>/g, 'end of file')
        .replace(/\\n/g, 'newline')
        .replace(/\{|\}/g, '')
        .replace(/'\s*'/g, '')
        .trim();
}
