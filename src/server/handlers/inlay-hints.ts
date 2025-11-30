/**
 * Inlay Hints handler for the Kite language server.
 * Provides inline type hints and parameter names.
 */

import {
    InlayHint,
    InlayHintKind,
    Range,
    Position,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Declaration, FunctionParameter, ArgRange } from '../types';
import { escapeRegex } from '../rename-utils';

/**
 * Context for inlay hints - provides access to cross-file functions
 */
export interface InlayHintContext {
    findKiteFilesInWorkspace: () => string[];
    getFileContent: (filePath: string, currentDocUri?: string) => string | null | undefined;
}

/**
 * Handle inlay hints request
 */
export function handleInlayHints(
    document: TextDocument,
    declarations: Declaration[],
    ctx: InlayHintContext
): InlayHint[] {
    const hints: InlayHint[] = [];
    const text = document.getText();
    const docUri = document.uri;

    // 1. Type hints for var declarations without explicit type
    // Pattern: var name = value (no type between var and name)
    const varRegex = /\bvar\s+(\w+)\s*=/g;
    let varMatch;
    while ((varMatch = varRegex.exec(text)) !== null) {
        const varName = varMatch[1];
        const matchStart = varMatch.index;
        const nameStart = text.indexOf(varName, matchStart + 4); // after 'var '

        // Check if this var has an explicit type by looking for 'var type name ='
        const beforeName = text.substring(matchStart + 4, nameStart).trim();
        if (beforeName && /^\w+(\[\])?$/.test(beforeName)) {
            // Has explicit type, skip
            continue;
        }

        // Infer type from the value
        const equalsPos = text.indexOf('=', nameStart);
        if (equalsPos === -1) continue;

        const valueStart = equalsPos + 1;
        const inferredType = inferTypeFromValue(text, valueStart);

        if (inferredType) {
            const pos = document.positionAt(nameStart + varName.length);
            hints.push({
                position: pos,
                label: `: ${inferredType}`,
                kind: InlayHintKind.Type,
                paddingLeft: false,
                paddingRight: true
            });
        }
    }

    // 2. Parameter hints at function call sites
    // Pattern: functionName(arg1, arg2, ...)
    const funcCallRegex = /\b(\w+)\s*\(/g;
    let callMatch;
    while ((callMatch = funcCallRegex.exec(text)) !== null) {
        const funcName = callMatch[1];
        const parenPos = callMatch.index + callMatch[0].length - 1;

        // Skip keywords that look like function calls
        if (['if', 'while', 'for', 'fun', 'switch', 'catch'].includes(funcName)) {
            continue;
        }

        // Check if this is a function declaration (preceded by 'fun')
        const beforeCall = text.substring(Math.max(0, callMatch.index - 10), callMatch.index);
        if (/\bfun\s*$/.test(beforeCall)) {
            continue; // This is a declaration, not a call
        }

        // Find the function declaration to get parameter names (including cross-file)
        let funcDecl = declarations.find(d => d.type === 'function' && d.name === funcName);

        // If not found in current file, search other files
        if (!funcDecl) {
            const kiteFiles = ctx.findKiteFilesInWorkspace();
            for (const filePath of kiteFiles) {
                const fileContent = ctx.getFileContent(filePath, docUri);
                if (fileContent) {
                    // Look for function definition in this file
                    const funcRegex = new RegExp(`\\bfun\\s+(${escapeRegex(funcName)})\\s*\\(([^)]*)\\)`, 'g');
                    const funcMatch = funcRegex.exec(fileContent);
                    if (funcMatch) {
                        // Parse parameters
                        const paramsStr = funcMatch[2];
                        const paramList: FunctionParameter[] = [];
                        const paramRegex = /(\w+)\s+(\w+)/g;
                        let paramMatch;
                        while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
                            paramList.push({ type: paramMatch[1], name: paramMatch[2] });
                        }
                        if (paramList.length > 0) {
                            funcDecl = {
                                name: funcName,
                                type: 'function',
                                parameters: paramList,
                                range: Range.create(Position.create(0, 0), Position.create(0, 0)),
                                nameRange: Range.create(Position.create(0, 0), Position.create(0, 0)),
                                uri: filePath
                            };
                            break;
                        }
                    }
                }
            }
        }

        if (!funcDecl || !funcDecl.parameters || funcDecl.parameters.length === 0) {
            continue;
        }

        // Parse arguments
        const args = parseArguments(text, parenPos + 1);

        // Add parameter hints for each argument
        for (let i = 0; i < Math.min(args.length, funcDecl.parameters.length); i++) {
            const arg = args[i];
            const param = funcDecl.parameters[i];

            // Skip if argument is already a named argument (name: value)
            const argText = text.substring(arg.start, arg.end).trim();
            if (/^\w+\s*:/.test(argText)) {
                continue;
            }

            // Skip simple cases where hint would be redundant
            // (e.g., passing variable with same name as parameter)
            if (argText === param.name) {
                continue;
            }

            const pos = document.positionAt(arg.start);
            hints.push({
                position: pos,
                label: `${param.name}:`,
                kind: InlayHintKind.Parameter,
                paddingLeft: false,
                paddingRight: true
            });
        }
    }

    // 3. Type hints for component instantiation property assignments
    // Pattern: component TypeName instanceName { prop = value }
    const componentInstRegex = /\bcomponent\s+(\w+)\s+(\w+)\s*\{/g;
    let compMatch;
    while ((compMatch = componentInstRegex.exec(text)) !== null) {
        const componentType = compMatch[1];
        const braceStart = compMatch.index + compMatch[0].length - 1;

        // Find the component type definition to get input types (with cross-file support)
        const inputTypes = extractComponentInputTypes(text, componentType, ctx, docUri);
        if (Object.keys(inputTypes).length === 0) {
            continue;
        }

        // Find the closing brace
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        const bodyEnd = pos - 1;
        const bodyText = text.substring(braceStart + 1, bodyEnd);

        // Find property assignments in the body: name = value
        const propRegex = /^\s*(\w+)\s*=/gm;
        let propMatch;
        while ((propMatch = propRegex.exec(bodyText)) !== null) {
            const propName = propMatch[1];
            const propType = inputTypes[propName];

            if (propType) {
                // Calculate absolute position
                const propNameStart = braceStart + 1 + propMatch.index + propMatch[0].indexOf(propName);
                const hintPos = document.positionAt(propNameStart + propName.length);

                hints.push({
                    position: hintPos,
                    label: `: ${propType}`,
                    kind: InlayHintKind.Type,
                    paddingLeft: false,
                    paddingRight: true
                });
            }
        }
    }

    // 4. Type hints for resource property assignments
    // Pattern: resource SchemaName instanceName { prop = value }
    const resourceInstRegex = /\bresource\s+([\w.]+)\s+(\w+)\s*\{/g;
    let resMatch;
    while ((resMatch = resourceInstRegex.exec(text)) !== null) {
        const schemaName = resMatch[1];
        const braceStart = resMatch.index + resMatch[0].length - 1;

        // Find the schema definition to get property types (with cross-file support)
        const schemaTypes = extractSchemaPropertyTypes(text, schemaName, ctx, docUri);
        if (Object.keys(schemaTypes).length === 0) {
            continue;
        }

        // Find the closing brace
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        const bodyEnd = pos - 1;
        const bodyText = text.substring(braceStart + 1, bodyEnd);

        // Find property assignments in the body: name = value
        const propRegex = /^\s*(\w+)\s*=/gm;
        let propMatch;
        while ((propMatch = propRegex.exec(bodyText)) !== null) {
            const propName = propMatch[1];
            const propType = schemaTypes[propName];

            if (propType) {
                // Calculate absolute position
                const propNameStart = braceStart + 1 + propMatch.index + propMatch[0].indexOf(propName);
                const hintPos = document.positionAt(propNameStart + propName.length);

                hints.push({
                    position: hintPos,
                    label: `: ${propType}`,
                    kind: InlayHintKind.Type,
                    paddingLeft: false,
                    paddingRight: true
                });
            }
        }
    }

    return hints;
}

/**
 * Infer type from value expression
 */
function inferTypeFromValue(text: string, startPos: number): string | null {
    // Skip whitespace
    let pos = startPos;
    while (pos < text.length && /\s/.test(text[pos])) {
        pos++;
    }

    if (pos >= text.length) return null;

    const char = text[pos];

    // String literal
    if (char === '"' || char === "'") {
        return 'string';
    }

    // Number literal
    if (/\d/.test(char) || (char === '-' && /\d/.test(text[pos + 1] || ''))) {
        return 'number';
    }

    // Boolean literals
    if (text.substring(pos, pos + 4) === 'true' && !/\w/.test(text[pos + 4] || '')) {
        return 'boolean';
    }
    if (text.substring(pos, pos + 5) === 'false' && !/\w/.test(text[pos + 5] || '')) {
        return 'boolean';
    }

    // Null literal
    if (text.substring(pos, pos + 4) === 'null' && !/\w/.test(text[pos + 4] || '')) {
        return 'null';
    }

    // Array literal
    if (char === '[') {
        return 'array';
    }

    // Object literal
    if (char === '{') {
        return 'object';
    }

    return null;
}

/**
 * Parse function call arguments
 */
function parseArguments(text: string, startPos: number): ArgRange[] {
    const args: ArgRange[] = [];
    let pos = startPos;
    let depth = 1;
    let argStart = startPos;
    let inString = false;
    let stringChar = '';

    // Skip leading whitespace
    while (pos < text.length && /\s/.test(text[pos])) {
        pos++;
        argStart = pos;
    }

    // Check for empty args
    if (text[pos] === ')') {
        return args;
    }

    while (pos < text.length && depth > 0) {
        const char = text[pos];

        // Handle strings
        if ((char === '"' || char === "'") && (pos === 0 || text[pos - 1] !== '\\')) {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
        }

        if (!inString) {
            if (char === '(' || char === '[' || char === '{') {
                depth++;
            } else if (char === ')' || char === ']' || char === '}') {
                depth--;
                if (depth === 0) {
                    // End of arguments
                    const argText = text.substring(argStart, pos).trim();
                    if (argText) {
                        args.push({ start: argStart, end: pos });
                    }
                    break;
                }
            } else if (char === ',' && depth === 1) {
                // Argument separator
                const argText = text.substring(argStart, pos).trim();
                if (argText) {
                    // Find actual start (skip whitespace)
                    let actualStart = argStart;
                    while (actualStart < pos && /\s/.test(text[actualStart])) {
                        actualStart++;
                    }
                    args.push({ start: actualStart, end: pos });
                }
                argStart = pos + 1;
                // Skip whitespace after comma
                while (argStart < text.length && /\s/.test(text[argStart])) {
                    argStart++;
                }
            }
        }

        pos++;
    }

    return args;
}

/**
 * Extract input types from a component type definition (single text)
 */
function extractComponentInputTypesFromText(text: string, componentTypeName: string): Record<string, string> {
    const inputTypes: Record<string, string> = {};

    // Find component type definition: component TypeName { (without instance name)
    // We need to distinguish between definition (one identifier) and instantiation (two identifiers)
    const defRegex = new RegExp(`\\bcomponent\\s+${escapeRegex(componentTypeName)}\\s*\\{`, 'g');
    let match;

    while ((match = defRegex.exec(text)) !== null) {
        // Check if this is a definition (not instantiation) by looking backwards
        // Instantiation: component Type instance {
        // Definition: component Type {
        const betweenKeywordAndBrace = text.substring(match.index + 10, match.index + match[0].length - 1).trim();
        const identifiers = betweenKeywordAndBrace.split(/\s+/).filter(s => s && s !== componentTypeName);

        if (identifiers.length > 0) {
            // Has extra identifier(s), this is an instantiation, skip
            continue;
        }

        // This is a component definition - extract inputs
        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;

        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }

        const bodyText = text.substring(braceStart + 1, pos - 1);

        // Find input declarations: input type name [= value]
        const inputRegex = /\binput\s+(\w+(?:\[\])?)\s+(\w+)/g;
        let inputMatch;
        while ((inputMatch = inputRegex.exec(bodyText)) !== null) {
            const inputType = inputMatch[1];
            const inputName = inputMatch[2];
            inputTypes[inputName] = inputType;
        }

        // Found the definition, no need to continue
        if (Object.keys(inputTypes).length > 0) {
            break;
        }
    }

    return inputTypes;
}

/**
 * Extract input types from a component type definition (with cross-file support)
 */
export function extractComponentInputTypes(
    text: string,
    componentTypeName: string,
    ctx: InlayHintContext,
    currentDocUri?: string
): Record<string, string> {
    // First try current file
    let inputTypes = extractComponentInputTypesFromText(text, componentTypeName);
    if (Object.keys(inputTypes).length > 0) {
        return inputTypes;
    }

    // Try other files in workspace
    const kiteFiles = ctx.findKiteFilesInWorkspace();
    for (const filePath of kiteFiles) {
        const fileContent = ctx.getFileContent(filePath, currentDocUri);
        if (fileContent) {
            inputTypes = extractComponentInputTypesFromText(fileContent, componentTypeName);
            if (Object.keys(inputTypes).length > 0) {
                return inputTypes;
            }
        }
    }

    return {};
}

/**
 * Extract property types from a schema definition (single text)
 */
function extractSchemaPropertyTypesFromText(text: string, schemaName: string): Record<string, string> {
    const propertyTypes: Record<string, string> = {};

    // Handle dotted schema names like "VM.Instance" - just use the last part for matching
    const schemaBaseName = schemaName.includes('.') ? schemaName.split('.').pop()! : schemaName;

    // Find schema definition: schema SchemaName {
    const defRegex = new RegExp(`\\bschema\\s+${escapeRegex(schemaBaseName)}\\s*\\{`, 'g');
    let match;

    while ((match = defRegex.exec(text)) !== null) {
        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;

        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }

        const bodyText = text.substring(braceStart + 1, pos - 1);

        // Find property declarations: type name [= value]
        // Schema properties are: type propertyName
        const lines = bodyText.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@')) {
                continue;
            }

            // Match: type propertyName [= defaultValue]
            // Types can be: string, number, boolean, any, object, CustomType, or arrays like string[]
            const propMatch = trimmed.match(/^(\w+(?:\[\])?)\s+(\w+)(?:\s*=.*)?$/);
            if (propMatch) {
                const propType = propMatch[1];
                const propName = propMatch[2];
                propertyTypes[propName] = propType;
            }
        }

        // Found the schema, no need to continue
        if (Object.keys(propertyTypes).length > 0) {
            break;
        }
    }

    return propertyTypes;
}

/**
 * Extract property types from a schema definition (with cross-file support)
 */
export function extractSchemaPropertyTypes(
    text: string,
    schemaName: string,
    ctx: InlayHintContext,
    currentDocUri?: string
): Record<string, string> {
    // First try current file
    let propertyTypes = extractSchemaPropertyTypesFromText(text, schemaName);
    if (Object.keys(propertyTypes).length > 0) {
        return propertyTypes;
    }

    // Try other files in workspace
    const kiteFiles = ctx.findKiteFilesInWorkspace();
    for (const filePath of kiteFiles) {
        const fileContent = ctx.getFileContent(filePath, currentDocUri);
        if (fileContent) {
            propertyTypes = extractSchemaPropertyTypesFromText(fileContent, schemaName);
            if (Object.keys(propertyTypes).length > 0) {
                return propertyTypes;
            }
        }
    }

    return {};
}
