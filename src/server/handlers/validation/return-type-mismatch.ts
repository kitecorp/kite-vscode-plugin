/**
 * Return type mismatch detection for the Kite language server.
 * Reports errors when a function's return value type doesn't match its declared return type.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment } from '../../utils/text-utils';
import { inferValueType, isTypeCompatible } from './type-checking';

/**
 * Variable type information
 */
interface VariableType {
    name: string;
    type: string; // Inferred type
}

/**
 * Check for return type mismatches in functions
 */
export function checkReturnTypeMismatch(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match functions with return type: fun name(params) returnType {
    const funcRegex = /\bfun\s+(\w+)\s*\(([^)]*)\)\s+(\w+)(\[\])?\s*\{/g;

    let match;
    while ((match = funcRegex.exec(text)) !== null) {
        if (isInComment(text, match.index)) continue;

        const returnType = match[3] + (match[4] || ''); // Include [] for array types

        // Skip void functions
        if (returnType === 'void') continue;

        const braceStart = match.index + match[0].length - 1;
        const braceEnd = findMatchingBrace(text, braceStart);
        if (braceEnd === -1) continue;

        const funcBody = text.substring(braceStart + 1, braceEnd);
        const bodyOffset = braceStart + 1;

        // Build variable type map from function body
        const variableTypes = extractVariableTypes(funcBody);

        // Find all return statements in this function (not in nested functions)
        const returnStatements = findReturnStatements(funcBody);

        for (const returnStmt of returnStatements) {
            const returnValue = returnStmt.value.trim();

            let valueType: string | null = null;

            // Special case: array literal with variable references like [result]
            // Check this BEFORE inferValueType, because [result] would return generic 'array'
            const arrayLiteralMatch = returnValue.match(/^\[([^\]]+)\]$/);
            if (arrayLiteralMatch) {
                const arrayContent = arrayLiteralMatch[1].trim();
                // Check if it's a single identifier (not a literal or complex expression)
                if (/^[a-zA-Z_]\w*$/.test(arrayContent)) {
                    const varInfo = variableTypes.find(v => v.name === arrayContent);
                    if (varInfo) {
                        // Array of that variable's type
                        valueType = varInfo.type + '[]';
                    }
                }
            }

            // If not an array with variable, try to infer the type directly from the value
            if (!valueType) {
                valueType = inferValueType(returnValue);
            }

            // If it's an identifier (not a literal), check variable types
            if (!valueType && /^[a-zA-Z_]\w*$/.test(returnValue)) {
                const varInfo = variableTypes.find(v => v.name === returnValue);
                if (varInfo) {
                    valueType = varInfo.type;
                }
            }

            // Skip if we still can't infer the type
            if (!valueType) continue;

            // Check for type mismatch
            if (!isTypeCompatible(returnType, valueType)) {
                const returnOffset = bodyOffset + returnStmt.offset;
                const valueStart = returnOffset + returnStmt.valueStartInReturn;
                const valueEnd = valueStart + returnValue.length;

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: Range.create(
                        document.positionAt(valueStart),
                        document.positionAt(valueEnd)
                    ),
                    message: `Return type mismatch: expected '${returnType}' but got '${valueType}'`,
                    source: 'kite',
                });
            }
        }
    }

    return diagnostics;
}

/**
 * Extract variable types from function body.
 * Tracks both explicit type annotations and inferred types from literal assignments.
 */
function extractVariableTypes(code: string): VariableType[] {
    const variables: VariableType[] = [];

    // Match: var [type] name = value
    // Handles both: "var name = value" and "var type name = value"
    const varRegex = /\bvar\s+(?:(\w+(?:\[\])?)\s+)?(\w+)\s*=\s*([^;\n]+)/g;

    let match;
    while ((match = varRegex.exec(code)) !== null) {
        if (isInCommentSimple(code, match.index)) continue;

        const explicitType = match[1]; // Optional type annotation
        const varName = match[2];
        let value = match[3].trim();

        // Remove inline comment if present
        const commentIndex = value.indexOf('//');
        if (commentIndex !== -1) {
            value = value.substring(0, commentIndex).trim();
        }

        // Determine the variable's type
        let varType: string | null = null;

        if (explicitType) {
            // Use explicit type annotation
            varType = explicitType;
        } else {
            // Infer type from the assigned value
            varType = inferValueType(value);
        }

        if (varType) {
            variables.push({ name: varName, type: varType });
        }
    }

    return variables;
}

/**
 * Simple comment check for variable extraction
 */
function isInCommentSimple(code: string, offset: number): boolean {
    // Check if offset is in a line comment
    const beforeOffset = code.substring(0, offset);
    const lastNewline = beforeOffset.lastIndexOf('\n');
    const currentLine = beforeOffset.substring(lastNewline + 1);
    if (currentLine.includes('//')) {
        return true;
    }

    // Check if offset is in a block comment
    let inBlockComment = false;
    for (let i = 0; i < offset; i++) {
        if (code[i] === '/' && code[i + 1] === '*') {
            inBlockComment = true;
        }
        if (code[i] === '*' && code[i + 1] === '/') {
            inBlockComment = false;
        }
    }

    return inBlockComment;
}

/**
 * Find all return statements in code (not in nested functions)
 */
interface ReturnStatement {
    offset: number; // Offset in the code
    value: string; // The returned value
    valueStartInReturn: number; // Offset of value within the return statement
}

function findReturnStatements(code: string): ReturnStatement[] {
    const returns: ReturnStatement[] = [];
    let i = 0;
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inBlockComment = false;

    while (i < code.length) {
        const char = code[i];
        const prevChar = i > 0 ? code[i - 1] : '';

        // Handle block comments
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
        if (inBlockComment) {
            i++;
            continue;
        }

        // Handle line comments
        if (!inString && char === '/' && code[i + 1] === '/') {
            inComment = true;
            i++;
            continue;
        }
        if (inComment && char === '\n') {
            inComment = false;
            i++;
            continue;
        }
        if (inComment) {
            i++;
            continue;
        }

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
        if (inString) {
            i++;
            continue;
        }

        // Track nested functions - when we see "fun ", we enter a nested function
        if (code.substring(i).match(/^\bfun\s/)) {
            // Find the opening brace of this nested function
            const funcMatch = code.substring(i).match(/^\bfun\s+\w+\s*\([^)]*\)(?:\s+\w+)?\s*\{/);
            if (funcMatch) {
                // Skip past the nested function entirely
                const nestedStart = i + funcMatch[0].length - 1; // Position of {
                const nestedEnd = findMatchingBraceSimple(code, nestedStart);
                if (nestedEnd !== -1) {
                    i = nestedEnd + 1;
                    continue;
                }
            }
        }

        // Look for return keyword - stop at newline, semicolon, brace, or comment
        const returnMatch = code.substring(i).match(/^\breturn\s+([^;\n}]+)/);
        if (returnMatch) {
            let value = returnMatch[1].trim();

            // Remove inline comment if present
            const commentIndex = value.indexOf('//');
            if (commentIndex !== -1) {
                value = value.substring(0, commentIndex).trim();
            }

            const valueStartInReturn = returnMatch[0].indexOf(returnMatch[1]);

            returns.push({
                offset: i,
                value,
                valueStartInReturn,
            });

            i += returnMatch[0].length;
            continue;
        }

        i++;
    }

    return returns;
}

/**
 * Find matching brace (simple version for nested function skipping)
 */
function findMatchingBraceSimple(code: string, start: number): number {
    if (code[start] !== '{') return -1;

    let depth = 1;
    for (let i = start + 1; i < code.length; i++) {
        if (code[i] === '{') depth++;
        if (code[i] === '}') depth--;
        if (depth === 0) return i;
    }
    return -1;
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
