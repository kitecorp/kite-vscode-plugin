/**
 * Undefined symbol detection for the Kite language server.
 * Reports errors for variable references that are not declared.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Declaration } from '../../types';
import { isInComment, isInString } from '../../utils/text-utils';

/** Built-in types that should not be reported as undefined */
const BUILTIN_TYPES = new Set([
    'string', 'number', 'boolean', 'any', 'object', 'void', 'null',
]);

/** Keywords and literals that should not be reported as undefined */
const KEYWORDS_AND_LITERALS = new Set([
    // Keywords
    'if', 'else', 'for', 'while', 'in', 'return',
    'var', 'fun', 'schema', 'component', 'resource',
    'input', 'output', 'type', 'import', 'from', 'init', 'this',
    // Literals
    'true', 'false', 'null',
]);

/** Built-in functions */
const BUILTIN_FUNCTIONS = new Set([
    'println', 'print', 'len', 'toString', 'toNumber', 'typeof',
]);

/**
 * Check for undefined symbol references in a document
 */
export function checkUndefinedSymbols(
    document: TextDocument,
    declarations: Declaration[]
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Build a set of declared names for quick lookup
    const declaredNames = new Set(declarations.map(d => d.name));

    // Find all identifier references
    // An identifier is a word that starts with a letter or underscore
    const identifierRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    let match;

    while ((match = identifierRegex.exec(text)) !== null) {
        const identifier = match[1];
        const offset = match.index;

        // Skip if in comment
        if (isInComment(text, offset)) continue;

        // Skip if in string (but not in interpolation)
        if (isInStringNotInterpolation(text, offset)) continue;

        // Skip keywords and built-in types
        if (KEYWORDS_AND_LITERALS.has(identifier)) continue;
        if (BUILTIN_TYPES.has(identifier)) continue;
        if (BUILTIN_FUNCTIONS.has(identifier)) continue;

        // Skip if it's a declared name
        if (declaredNames.has(identifier)) continue;

        // Skip if it's a declaration context (after var, input, output, etc.)
        if (isDeclarationContext(text, offset, identifier)) continue;

        // Skip if it's after a dot (property access)
        if (isPropertyAccess(text, offset)) continue;

        // Skip if it's a type annotation position
        if (isTypePosition(text, offset, identifier)) continue;

        // Skip if it's a schema/component/resource type name
        if (isTypeNamePosition(text, offset)) continue;

        // Skip if it's a function parameter definition
        if (isFunctionParameterDefinition(text, offset, identifier)) continue;

        // Skip if it's a for loop variable definition
        if (isForLoopVariableDefinition(text, offset, identifier)) continue;

        // Skip if it's an object literal key (e.g., { key: value })
        if (isObjectLiteralKey(text, offset, identifier)) continue;

        // This is an undefined symbol
        const startPos = document.positionAt(offset);
        const endPos = document.positionAt(offset + identifier.length);

        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: Range.create(startPos, endPos),
            message: `Cannot resolve symbol '${identifier}'`,
            source: 'kite',
        });
    }

    return diagnostics;
}

/**
 * Check if position is inside a string but NOT inside an interpolation
 */
function isInStringNotInterpolation(text: string, offset: number): boolean {
    // First check if we're in a string at all
    if (!isInString(text, offset)) return false;

    // Check if we're inside an interpolation ${...}
    // Look backwards for ${ and forwards for }
    let depth = 0;
    for (let i = offset; i >= 0; i--) {
        if (text[i] === '}' && i < offset) depth++;
        if (text[i] === '{' && i > 0 && text[i - 1] === '$') {
            if (depth === 0) {
                // We're inside an interpolation, check if we're still in it
                for (let j = offset; j < text.length; j++) {
                    if (text[j] === '}') {
                        return false; // Inside interpolation
                    }
                    if (text[j] === '"' || text[j] === '\n') break;
                }
            }
            depth--;
        }
    }

    return true; // In string but not in interpolation
}

/**
 * Check if identifier is in a declaration context
 * e.g., after 'var', 'input', 'output', 'fun', 'schema', 'component', 'resource'
 */
function isDeclarationContext(text: string, offset: number, identifier: string): boolean {
    // Look backwards to find what comes before this identifier
    const beforeText = text.substring(Math.max(0, offset - 50), offset).trim();

    // Declaration patterns
    const patterns = [
        /\bvar\s*$/,                    // var name
        /\bvar\s+\w+\s*$/,              // var type name
        /\bvar\s+\w+\[\]\s*$/,          // var type[] name
        /\binput\s+\w+\s*$/,            // input type name
        /\binput\s+\w+\[\]\s*$/,        // input type[] name
        /\boutput\s+\w+\s*$/,           // output type name
        /\boutput\s+\w+\[\]\s*$/,       // output type[] name
        /\bfun\s*$/,                    // fun name
        /\bschema\s*$/,                 // schema name
        /\bcomponent\s*$/,              // component name
        /\bcomponent\s+\w+\s*$/,        // component Type name
        /\bresource\s+[\w.]+\s*$/,      // resource Schema name
        /\btype\s*$/,                   // type name
    ];

    for (const pattern of patterns) {
        if (pattern.test(beforeText)) return true;
    }

    return false;
}

/**
 * Check if identifier is after a dot (property access)
 */
function isPropertyAccess(text: string, offset: number): boolean {
    // Look for a dot immediately before this identifier (allowing whitespace)
    let i = offset - 1;
    while (i >= 0 && /\s/.test(text[i])) i--;
    return i >= 0 && text[i] === '.';
}

/**
 * Check if identifier is in a type position (after 'var', 'input', 'output' but before the name)
 */
function isTypePosition(text: string, offset: number, identifier: string): boolean {
    const beforeText = text.substring(Math.max(0, offset - 30), offset).trim();
    const afterText = text.substring(offset + identifier.length, offset + identifier.length + 30).trim();

    // Check if this is: var TYPE name = or input TYPE name or output TYPE name
    // The type is followed by an identifier (the variable name)
    if (/\b(var|input|output)\s*$/.test(beforeText)) {
        // This could be the type if followed by another identifier
        if (/^(\[\])?\s+[a-zA-Z_]/.test(afterText)) {
            return true;
        }
    }

    return false;
}

/**
 * Check if identifier is a type name position (schema/component/resource type)
 */
function isTypeNamePosition(text: string, offset: number): boolean {
    const beforeText = text.substring(Math.max(0, offset - 30), offset).trim();

    // resource SchemaName or component TypeName (for instantiation)
    if (/\b(resource|component)\s*$/.test(beforeText)) {
        return true;
    }

    return false;
}

/**
 * Check if identifier is a function parameter definition
 * e.g., fun name(type PARAM) or fun name(type PARAM, type PARAM2)
 */
function isFunctionParameterDefinition(text: string, offset: number, identifier: string): boolean {
    // Look backwards for pattern: type followed by this identifier within parentheses
    const beforeText = text.substring(Math.max(0, offset - 150), offset);

    // Check if we're inside function parameter list
    // Look for 'fun name(' before us with no closing paren
    const funMatch = beforeText.match(/\bfun\s+\w+\s*\([^)]*$/);
    if (!funMatch) return false;

    // We're inside a function parameter list
    // Check if this identifier comes after a type (parameter name position)
    const paramSection = beforeText.substring(beforeText.lastIndexOf('('));

    // Pattern: (type name or , type name - the identifier after a type is a parameter name
    if (/[\(,]\s*\w+\s*$/.test(paramSection)) {
        return true;
    }

    return false;
}

/**
 * Check if identifier is an object literal key
 * e.g., { key: value } or { key = value }
 */
function isObjectLiteralKey(text: string, offset: number, identifier: string): boolean {
    // Look at what comes after the identifier
    const afterStart = offset + identifier.length;
    const afterText = text.substring(afterStart, afterStart + 10).trim();

    // If followed by ':' or '=', it's a key
    if (afterText.startsWith(':') || afterText.startsWith('=')) {
        // Make sure we're inside braces (rough check)
        const beforeText = text.substring(Math.max(0, offset - 100), offset);
        const lastOpen = beforeText.lastIndexOf('{');
        const lastClose = beforeText.lastIndexOf('}');

        // If there's an unclosed brace before us, we're inside an object
        if (lastOpen > lastClose) {
            return true;
        }
    }

    return false;
}

/**
 * Check if identifier is a for loop variable definition
 * e.g., for (ITEM in items)
 */
function isForLoopVariableDefinition(text: string, offset: number, identifier: string): boolean {
    const beforeText = text.substring(Math.max(0, offset - 30), offset).trim();

    // for (item or for item
    if (/\bfor\s*\(?\s*$/.test(beforeText)) {
        return true;
    }

    return false;
}
