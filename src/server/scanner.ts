/**
 * Document scanner for the Kite language server.
 * Scans documents to extract declarations (variables, functions, schemas, etc.)
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range, Position } from 'vscode-languageserver/node';
import { Declaration, DeclarationType } from './types';

/**
 * Scope block information for tracking variable scopes
 */
interface ScopeBlock {
    start: number;  // Opening brace offset
    end: number;    // Closing brace offset
    type: 'function' | 'component-def';
}

/**
 * Pattern configuration for matching declarations
 */
interface DeclarationPattern {
    type: DeclarationType;
    regex: RegExp;
    groups: {
        name: number;
        typeName?: number;
        schemaName?: number;
    };
}

/**
 * Scan document for all declarations.
 * This is the main parsing function that extracts all named entities.
 */
export function scanDocument(document: TextDocument): Declaration[] {
    const text = document.getText();
    const declarations: Declaration[] = [];
    const lines = text.split('\n');

    // Find all scope blocks first
    const scopeBlocks = findScopeBlocks(text);

    // Helper: Find enclosing scope for an offset
    function findEnclosingScope(offset: number): ScopeBlock | null {
        for (const scope of scopeBlocks) {
            if (offset > scope.start && offset < scope.end) {
                return scope;
            }
        }
        return null;
    }

    // Patterns for different declaration types
    const patterns: DeclarationPattern[] = [
        // var [type] name = value
        { type: 'variable', regex: /^\s*var\s+(?:(\w+)\s+)?(\w+)\s*=/, groups: { typeName: 1, name: 2 } },
        // input [type] name [= value]
        { type: 'input', regex: /^\s*input\s+(?:(\w+)\s+)?(\w+)/, groups: { typeName: 1, name: 2 } },
        // output [type] name [= value]
        { type: 'output', regex: /^\s*output\s+(?:(\w+)\s+)?(\w+)/, groups: { typeName: 1, name: 2 } },
        // resource SchemaName instanceName {
        { type: 'resource', regex: /^\s*resource\s+(\w+(?:\.\w+)*)\s+(\w+)\s*\{/, groups: { schemaName: 1, name: 2 } },
        // component TypeName [instanceName] {
        { type: 'component', regex: /^\s*component\s+(\w+)\s+(?:(\w+)\s*)?\{/, groups: { name: 1 } },
        // schema Name {
        { type: 'schema', regex: /^\s*schema\s+(\w+)\s*\{/, groups: { name: 1 } },
        // fun name(params) [returnType] {
        { type: 'function', regex: /^\s*fun\s+(\w+)\s*\(/, groups: { name: 1 } },
        // type Name = ...
        { type: 'type', regex: /^\s*type\s+(\w+)\s*=/, groups: { name: 1 } },
        // for item in ...
        { type: 'for', regex: /^\s*for\s+(\w+)\s+in\b/, groups: { name: 1 } },
    ];

    let lineOffset = 0;
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];

        for (const pattern of patterns) {
            const match = line.match(pattern.regex);
            if (match) {
                const name = match[pattern.groups.name];
                if (!name) continue;

                // Find the position of the name in the line
                const nameIndex = line.indexOf(name, line.indexOf(match[0]));
                const nameStart = Position.create(lineNum, nameIndex);
                const nameEnd = Position.create(lineNum, nameIndex + name.length);

                const decl: Declaration = {
                    name,
                    type: pattern.type,
                    range: Range.create(
                        Position.create(lineNum, 0),
                        Position.create(lineNum, line.length)
                    ),
                    nameRange: Range.create(nameStart, nameEnd),
                    uri: document.uri,
                };

                // Add scope information for variables/for loops/inputs/outputs
                if (pattern.type === 'variable' || pattern.type === 'for' ||
                    pattern.type === 'input' || pattern.type === 'output') {
                    const declOffset = lineOffset + nameIndex;
                    const scope = findEnclosingScope(declOffset);
                    if (scope) {
                        decl.scopeStart = scope.start;
                        decl.scopeEnd = scope.end;
                    }
                }

                if (pattern.groups.typeName && match[pattern.groups.typeName]) {
                    decl.typeName = match[pattern.groups.typeName];
                }
                if (pattern.groups.schemaName && match[pattern.groups.schemaName]) {
                    decl.schemaName = match[pattern.groups.schemaName];
                }

                // Handle component - check if it's a definition or instantiation
                if (pattern.type === 'component') {
                    processComponentDeclaration(decl, line, lineNum, lineOffset, scopeBlocks, findEnclosingScope);
                }

                // Handle resource - add scope if inside a component definition
                if (pattern.type === 'resource') {
                    const declOffset = lineOffset + nameIndex;
                    const scope = findEnclosingScope(declOffset);
                    if (scope && scope.type === 'component-def') {
                        decl.scopeStart = scope.start;
                        decl.scopeEnd = scope.end;
                    }
                }

                // Handle function - extract parameters and return type
                if (pattern.type === 'function') {
                    processFunctionDeclaration(
                        decl, line, lineNum, lineOffset,
                        scopeBlocks, findEnclosingScope, declarations, document.uri
                    );
                }

                // Look for preceding comment
                extractDocumentation(decl, lines, lineNum);

                declarations.push(decl);
                break;
            }
        }

        lineOffset += line.length + 1; // +1 for newline
    }

    return declarations;
}

/**
 * Find all scope blocks in the text (functions and component definitions)
 */
function findScopeBlocks(text: string): ScopeBlock[] {
    const scopeBlocks: ScopeBlock[] = [];

    // Find function scopes: fun name(...) {
    const funcScopeRegex = /\bfun\s+\w+\s*\([^)]*\)\s*\w*\s*\{/g;
    let funcMatch;
    while ((funcMatch = funcScopeRegex.exec(text)) !== null) {
        const braceStart = funcMatch.index + funcMatch[0].length - 1;
        const braceEnd = findClosingBrace(text, braceStart);
        scopeBlocks.push({ start: braceStart, end: braceEnd, type: 'function' });
    }

    // Find component definition scopes: component TypeName { (without instance name)
    const compDefRegex = /\bcomponent\s+(\w+)\s*\{/g;
    let compMatch;
    while ((compMatch = compDefRegex.exec(text)) !== null) {
        // Check if it's a definition (no instance name)
        const betweenKeywordAndBrace = text.substring(
            compMatch.index + 10,
            compMatch.index + compMatch[0].length - 1
        ).trim();
        const parts = betweenKeywordAndBrace.split(/\s+/).filter(s => s);
        if (parts.length === 1) {
            // Single identifier = component definition
            const braceStart = compMatch.index + compMatch[0].length - 1;
            const braceEnd = findClosingBrace(text, braceStart);
            scopeBlocks.push({ start: braceStart, end: braceEnd, type: 'component-def' });
        }
    }

    return scopeBlocks;
}

/**
 * Find the position of the closing brace matching an opening brace
 */
function findClosingBrace(text: string, openBracePos: number): number {
    let braceDepth = 1;
    let pos = openBracePos + 1;
    while (pos < text.length && braceDepth > 0) {
        if (text[pos] === '{') braceDepth++;
        else if (text[pos] === '}') braceDepth--;
        pos++;
    }
    return pos;
}

/**
 * Process component declaration to distinguish between definition and instantiation
 */
function processComponentDeclaration(
    decl: Declaration,
    line: string,
    lineNum: number,
    lineOffset: number,
    scopeBlocks: ScopeBlock[],
    findEnclosingScope: (offset: number) => ScopeBlock | null
): void {
    const componentMatch = line.match(/^\s*component\s+(\w+)\s+(\w+)\s*\{/);
    if (componentMatch) {
        // This is an instantiation: component Type instanceName {
        decl.componentType = componentMatch[1];
        decl.name = componentMatch[2];
        // Update nameRange for the instance name
        const instNameIndex = line.indexOf(
            componentMatch[2],
            line.indexOf(componentMatch[1]) + componentMatch[1].length
        );
        decl.nameRange = Range.create(
            Position.create(lineNum, instNameIndex),
            Position.create(lineNum, instNameIndex + componentMatch[2].length)
        );
        // Component instantiations inside a component definition are scoped
        const declOffset = lineOffset + instNameIndex;
        const scope = findEnclosingScope(declOffset);
        if (scope && scope.type === 'component-def') {
            decl.scopeStart = scope.start;
            decl.scopeEnd = scope.end;
        }
    }
    // Otherwise it's a component type definition, name is already correct
}

/**
 * Process function declaration to extract parameters and return type
 */
function processFunctionDeclaration(
    decl: Declaration,
    line: string,
    lineNum: number,
    lineOffset: number,
    scopeBlocks: ScopeBlock[],
    findEnclosingScope: (offset: number) => ScopeBlock | null,
    declarations: Declaration[],
    uri: string
): void {
    // Pattern: fun name(type1 param1, type2 param2) returnType {
    const funcMatch = line.match(/^\s*fun\s+\w+\s*\(([^)]*)\)\s*(\w+)?\s*\{?/);
    if (funcMatch) {
        const paramsStr = funcMatch[1];
        const returnType = funcMatch[2];

        decl.parameters = [];
        if (paramsStr.trim()) {
            // Parse parameters: "type1 name1, type2 name2"
            const paramParts = paramsStr.split(',');
            let paramOffset = line.indexOf('(') + 1;

            for (const part of paramParts) {
                const trimmed = part.trim();
                const paramMatch = trimmed.match(/^(\w+(?:\[\])?)\s+(\w+)$/);
                if (paramMatch) {
                    const paramType = paramMatch[1];
                    const paramName = paramMatch[2];

                    decl.parameters.push({
                        type: paramType,
                        name: paramName
                    });

                    // Find exact position of parameter name in the line
                    const paramNameIndex = line.indexOf(paramName, paramOffset);
                    if (paramNameIndex >= 0) {
                        // Find the function scope for this parameter
                        const braceIndex = line.indexOf('{');
                        let paramScope: ScopeBlock | null = null;
                        if (braceIndex >= 0) {
                            const braceOffset = lineOffset + braceIndex;
                            paramScope = scopeBlocks.find(s => s.start === braceOffset) || null;
                        }

                        // Add parameter as a declaration for Go to Definition
                        const paramDecl: Declaration = {
                            name: paramName,
                            type: 'variable',
                            typeName: paramType,
                            range: Range.create(
                                Position.create(lineNum, paramNameIndex),
                                Position.create(lineNum, paramNameIndex + paramName.length)
                            ),
                            nameRange: Range.create(
                                Position.create(lineNum, paramNameIndex),
                                Position.create(lineNum, paramNameIndex + paramName.length)
                            ),
                            uri: uri,
                            documentation: `Parameter of function \`${decl.name}\``
                        };
                        if (paramScope) {
                            paramDecl.scopeStart = paramScope.start;
                            paramDecl.scopeEnd = paramScope.end;
                        }
                        declarations.push(paramDecl);
                        paramOffset = paramNameIndex + paramName.length;
                    }
                }
            }
        }

        if (returnType) {
            decl.returnType = returnType;
        }
    }

    // Functions inside component definitions are scoped to the component
    const nameIndex = line.indexOf(decl.name);
    const funcDeclOffset = lineOffset + nameIndex;
    const funcScope = findEnclosingScope(funcDeclOffset);
    if (funcScope && funcScope.type === 'component-def') {
        decl.scopeStart = funcScope.start;
        decl.scopeEnd = funcScope.end;
    }
}

/**
 * Extract documentation comment from preceding lines
 */
function extractDocumentation(decl: Declaration, lines: string[], lineNum: number): void {
    if (lineNum > 0) {
        const prevLine = lines[lineNum - 1].trim();
        if (prevLine.startsWith('//')) {
            decl.documentation = prevLine.substring(2).trim();
        } else if (prevLine.endsWith('*/')) {
            // Try to find block comment
            const commentLines: string[] = [];
            for (let i = lineNum - 1; i >= 0; i--) {
                const cLine = lines[i].trim();
                if (cLine.startsWith('/*')) {
                    commentLines.unshift(cLine.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, ''));
                    break;
                }
                commentLines.unshift(cLine.replace(/^\*\s*/, '').replace(/\s*\*\/$/, ''));
            }
            decl.documentation = commentLines.join('\n').trim();
        }
    }
}
