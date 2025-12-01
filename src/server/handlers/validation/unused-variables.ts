/**
 * Unused variables detection for the Kite language server.
 * Provides warnings for declared variables that are never used.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
    DiagnosticTag,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Variable declaration info
 */
interface VariableDecl {
    name: string;
    type: 'var' | 'input' | 'output' | 'loop' | 'function-param';
    startOffset: number;
    endOffset: number;
    scopeStart: number;
    scopeEnd: number;
}

/**
 * Check for unused variables in a document.
 */
export function checkUnusedVariables(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Find all variable declarations and their scopes
    const declarations = findVariableDeclarations(text);

    // For each declaration, check if it's used in its scope
    for (const decl of declarations) {
        const scopeText = text.substring(decl.scopeStart, decl.scopeEnd);

        // Skip the declaration itself when checking for uses
        const declTextLength = decl.endOffset - decl.startOffset;
        const declOffsetInScope = decl.startOffset - decl.scopeStart;

        // Check if variable is used anywhere in scope (other than declaration)
        if (!isVariableUsed(scopeText, decl.name, declOffsetInScope, declTextLength)) {
            // Output variables are expected to be consumed by callers, so only warn at hint level
            const severity = decl.type === 'output'
                ? DiagnosticSeverity.Hint
                : DiagnosticSeverity.Warning;

            const prefix = getTypePrefix(decl.type);

            diagnostics.push({
                severity,
                range: Range.create(
                    document.positionAt(decl.startOffset),
                    document.positionAt(decl.endOffset)
                ),
                message: `${prefix}'${decl.name}' is declared but never used`,
                source: 'kite',
                tags: [DiagnosticTag.Unnecessary],
            });
        }
    }

    return diagnostics;
}

/**
 * Get prefix for diagnostic message based on variable type
 */
function getTypePrefix(type: VariableDecl['type']): string {
    switch (type) {
        case 'var': return 'Variable ';
        case 'input': return 'Input ';
        case 'output': return 'Output ';
        case 'loop': return 'Loop variable ';
        case 'function-param': return 'Parameter ';
    }
}

/**
 * Find all variable declarations in the document.
 */
function findVariableDeclarations(text: string): VariableDecl[] {
    const declarations: VariableDecl[] = [];

    // Find var declarations: var [type] name = value
    const varRegex = /\bvar\s+(?:(\w+)(?:\[\])?\s+)?(\w+)\s*=/g;
    let match;

    while ((match = varRegex.exec(text)) !== null) {
        if (isInsideComment(text, match.index) || isInsideString(text, match.index)) continue;

        const name = match[2];
        const nameStart = match.index + match[0].lastIndexOf(name);
        const nameEnd = nameStart + name.length;

        // Find scope (enclosing block or document)
        const scope = findEnclosingScope(text, match.index);

        declarations.push({
            name,
            type: 'var',
            startOffset: nameStart,
            endOffset: nameEnd,
            scopeStart: scope.start,
            scopeEnd: scope.end,
        });
    }

    // Find input declarations: input type name
    const inputRegex = /\binput\s+\w+(?:\[\])?\s+(\w+)/g;
    while ((match = inputRegex.exec(text)) !== null) {
        if (isInsideComment(text, match.index) || isInsideString(text, match.index)) continue;

        const name = match[1];
        const nameStart = match.index + match[0].lastIndexOf(name);
        const nameEnd = nameStart + name.length;

        // Input scope is the enclosing component
        const scope = findEnclosingScope(text, match.index);

        declarations.push({
            name,
            type: 'input',
            startOffset: nameStart,
            endOffset: nameEnd,
            scopeStart: scope.start,
            scopeEnd: scope.end,
        });
    }

    // Find output declarations: output type name
    const outputRegex = /\boutput\s+\w+(?:\[\])?\s+(\w+)/g;
    while ((match = outputRegex.exec(text)) !== null) {
        if (isInsideComment(text, match.index) || isInsideString(text, match.index)) continue;

        const name = match[1];
        const nameStart = match.index + match[0].lastIndexOf(name);
        const nameEnd = nameStart + name.length;

        // Output scope is the enclosing component
        const scope = findEnclosingScope(text, match.index);

        declarations.push({
            name,
            type: 'output',
            startOffset: nameStart,
            endOffset: nameEnd,
            scopeStart: scope.start,
            scopeEnd: scope.end,
        });
    }

    // Find loop variables: for name in ...
    const forRegex = /\bfor\s+(\w+)\s+in\s+/g;
    while ((match = forRegex.exec(text)) !== null) {
        if (isInsideComment(text, match.index) || isInsideString(text, match.index)) continue;

        const name = match[1];
        const nameStart = match.index + match[0].indexOf(name);
        const nameEnd = nameStart + name.length;

        // Loop variable scope is the loop body
        const loopBodyScope = findLoopBodyScope(text, match.index);

        declarations.push({
            name,
            type: 'loop',
            startOffset: nameStart,
            endOffset: nameEnd,
            scopeStart: loopBodyScope.start,
            scopeEnd: loopBodyScope.end,
        });
    }

    // Find function parameters: fun name(type param1, type param2)
    const funcRegex = /\bfun\s+\w+\s*\(([^)]*)\)/g;
    while ((match = funcRegex.exec(text)) !== null) {
        if (isInsideComment(text, match.index) || isInsideString(text, match.index)) continue;

        const paramsStr = match[1];
        if (!paramsStr.trim()) continue;

        // Find function body scope
        const funcBodyScope = findFunctionBodyScope(text, match.index + match[0].length);

        // Parse parameters: type name, type name, ...
        const paramRegex = /(\w+)(?:\[\])?\s+(\w+)/g;
        let paramMatch;

        while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
            const name = paramMatch[2];
            const paramStartInParams = paramMatch.index + paramMatch[0].lastIndexOf(name);
            const paramsStartInMatch = match[0].indexOf('(') + 1;
            const nameStart = match.index + paramsStartInMatch + paramStartInParams;
            const nameEnd = nameStart + name.length;

            declarations.push({
                name,
                type: 'function-param',
                startOffset: nameStart,
                endOffset: nameEnd,
                scopeStart: funcBodyScope.start,
                scopeEnd: funcBodyScope.end,
            });
        }
    }

    return declarations;
}

/**
 * Check if a variable is used in the given text (excluding declaration position).
 */
function isVariableUsed(
    text: string,
    varName: string,
    declOffset: number,
    declLength: number
): boolean {
    // Find all occurrences of the variable name with word boundaries
    const regex = new RegExp(`\\b${escapeRegex(varName)}\\b`, 'g');
    let match;

    while ((match = regex.exec(text)) !== null) {
        // Skip if this is the declaration itself
        if (match.index >= declOffset && match.index < declOffset + declLength) {
            continue;
        }

        // Skip if inside comment
        if (isInsideComment(text, match.index)) {
            continue;
        }

        // Check if inside string interpolation (which is a valid use)
        if (isInsideStringInterpolation(text, match.index)) {
            // This is a valid usage!
            return true;
        }

        // Skip if inside regular string (not interpolation)
        if (isInsideString(text, match.index)) {
            continue;
        }

        // Found a usage!
        return true;
    }

    return false;
}

/**
 * Find the enclosing scope (block or document) for a position.
 */
function findEnclosingScope(text: string, pos: number): { start: number; end: number } {
    // Find nearest opening brace before position
    let braceCount = 0;
    let scopeStart = 0;

    for (let i = pos - 1; i >= 0; i--) {
        if (text[i] === '}') braceCount++;
        else if (text[i] === '{') {
            if (braceCount === 0) {
                scopeStart = i + 1;
                break;
            }
            braceCount--;
        }
    }

    // Find matching closing brace
    braceCount = 0;
    let scopeEnd = text.length;

    for (let i = pos; i < text.length; i++) {
        if (text[i] === '{') braceCount++;
        else if (text[i] === '}') {
            if (braceCount === 0) {
                scopeEnd = i;
                break;
            }
            braceCount--;
        }
    }

    return { start: scopeStart, end: scopeEnd };
}

/**
 * Find the loop body scope for a for loop.
 */
function findLoopBodyScope(text: string, forPos: number): { start: number; end: number } {
    // Find the opening brace after the for statement
    const braceStart = text.indexOf('{', forPos);
    if (braceStart === -1) return { start: forPos, end: text.length };

    // Find matching closing brace
    let braceCount = 1;
    let pos = braceStart + 1;

    while (pos < text.length && braceCount > 0) {
        if (text[pos] === '{') braceCount++;
        else if (text[pos] === '}') braceCount--;
        pos++;
    }

    return { start: braceStart + 1, end: pos - 1 };
}

/**
 * Find the function body scope.
 */
function findFunctionBodyScope(text: string, afterParamsPos: number): { start: number; end: number } {
    // Find the opening brace after parameters
    const braceStart = text.indexOf('{', afterParamsPos);
    if (braceStart === -1) return { start: afterParamsPos, end: text.length };

    // Find matching closing brace
    let braceCount = 1;
    let pos = braceStart + 1;

    while (pos < text.length && braceCount > 0) {
        if (text[pos] === '{') braceCount++;
        else if (text[pos] === '}') braceCount--;
        pos++;
    }

    return { start: braceStart + 1, end: pos - 1 };
}

/**
 * Check if position is inside a comment.
 */
function isInsideComment(text: string, pos: number): boolean {
    // Check for single-line comment
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    const lineBeforePos = text.substring(lineStart, pos);
    if (lineBeforePos.includes('//')) {
        return true;
    }

    // Check for multi-line comment
    const textBefore = text.substring(0, pos);
    const lastBlockStart = textBefore.lastIndexOf('/*');
    if (lastBlockStart !== -1) {
        const lastBlockEnd = textBefore.lastIndexOf('*/');
        if (lastBlockEnd < lastBlockStart) {
            return true;
        }
    }

    return false;
}

/**
 * Check if position is inside a string literal.
 */
function isInsideString(text: string, pos: number): boolean {
    let inDouble = false;
    let inSingle = false;

    for (let i = 0; i < pos; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        if (char === '"' && !inSingle && prevChar !== '\\') {
            inDouble = !inDouble;
        } else if (char === "'" && !inDouble && prevChar !== '\\') {
            inSingle = !inSingle;
        }
    }

    return inDouble || inSingle;
}

/**
 * Check if position is inside a string interpolation ${...}.
 */
function isInsideStringInterpolation(text: string, pos: number): boolean {
    // Look backwards for ${ without closing }
    const textBefore = text.substring(0, pos);

    // Find the last ${ before position
    let lastInterpolationStart = -1;
    for (let i = textBefore.length - 2; i >= 0; i--) {
        if (textBefore[i] === '$' && textBefore[i + 1] === '{') {
            lastInterpolationStart = i;
            break;
        }
    }

    if (lastInterpolationStart === -1) return false;

    // Check if there's a closing } between the ${ and position
    const afterInterpolation = textBefore.substring(lastInterpolationStart + 2);
    const closingBrace = afterInterpolation.indexOf('}');

    // If no closing brace found, we're inside interpolation
    // Also check if position is before the closing brace
    return closingBrace === -1 || closingBrace > pos - lastInterpolationStart - 2;
}

/**
 * Escape special regex characters.
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
