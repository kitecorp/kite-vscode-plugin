/**
 * Type Definition handler for the Kite language server.
 * Navigates from a variable/resource/component instance to its type definition (schema/component).
 */

import {
    Location,
    Range,
    Position,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

export interface TypeDefinitionContext {
    findKiteFilesInWorkspace: () => string[];
    getFileContent: (filePath: string) => string | null;
}

/**
 * Handle type definition request - navigate to type definition
 */
export function handleTypeDefinition(
    document: TextDocument,
    position: Position,
    ctx: TypeDefinitionContext
): Location | null {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Get word at position
    const word = getWordAtOffset(text, offset);
    if (!word) return null;

    // Skip keywords
    if (isKeyword(word)) return null;

    // Check if this is a resource instance or schema reference
    const resourceMatch = findResourceAtPosition(text, offset, word);
    if (resourceMatch) {
        return findSchemaDefinition(resourceMatch.schemaName, text, document.uri, ctx);
    }

    // Check if this is a component instance or type reference
    const componentMatch = findComponentInstanceAtPosition(text, offset, word);
    if (componentMatch) {
        return findComponentDefinition(componentMatch.componentType, text, document.uri, ctx);
    }

    // Check if this is a typed variable (var Type name = ...)
    const varMatch = findTypedVariableAtPosition(text, offset, word);
    if (varMatch && !isBuiltinType(varMatch.typeName)) {
        return findSchemaDefinition(varMatch.typeName, text, document.uri, ctx);
    }

    // Check if this is an input/output with custom type
    const inputOutputMatch = findTypedInputOutputAtPosition(text, offset, word);
    if (inputOutputMatch && !isBuiltinType(inputOutputMatch.typeName)) {
        return findSchemaDefinition(inputOutputMatch.typeName, text, document.uri, ctx);
    }

    return null;
}

/**
 * Find resource declaration at position
 */
function findResourceAtPosition(
    text: string,
    offset: number,
    word: string
): { schemaName: string; instanceName: string } | null {
    // Match: resource SchemaName instanceName {
    const resourceRegex = /\bresource\s+(\w+)\s+(\w+)\s*\{/g;
    let match;

    while ((match = resourceRegex.exec(text)) !== null) {
        const schemaName = match[1];
        const instanceName = match[2];
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        // Check if cursor is on schema name or instance name
        if (offset >= matchStart && offset <= matchEnd) {
            if (word === schemaName || word === instanceName) {
                return { schemaName, instanceName };
            }
        }
    }

    return null;
}

/**
 * Find component instance at position
 */
function findComponentInstanceAtPosition(
    text: string,
    offset: number,
    word: string
): { componentType: string; instanceName: string } | null {
    // Match: component TypeName instanceName { (instantiation, not definition)
    const componentRegex = /\bcomponent\s+(\w+)\s+(\w+)\s*\{/g;
    let match;

    while ((match = componentRegex.exec(text)) !== null) {
        const typeName = match[1];
        const instanceName = match[2];
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        // Check if cursor is on type name or instance name
        if (offset >= matchStart && offset <= matchEnd) {
            if (word === typeName || word === instanceName) {
                return { componentType: typeName, instanceName };
            }
        }
    }

    return null;
}

/**
 * Find typed variable declaration at position
 */
function findTypedVariableAtPosition(
    text: string,
    offset: number,
    word: string
): { typeName: string; varName: string } | null {
    // Match: var Type varName = ...
    const varRegex = /\bvar\s+(\w+)(\[\])?\s+(\w+)\s*=/g;
    let match;

    while ((match = varRegex.exec(text)) !== null) {
        const typeName = match[1];
        const varName = match[3];
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        // Check if cursor is on type name or variable name
        if (offset >= matchStart && offset <= matchEnd) {
            if (word === typeName || word === varName) {
                return { typeName, varName };
            }
        }
    }

    return null;
}

/**
 * Find typed input/output at position
 */
function findTypedInputOutputAtPosition(
    text: string,
    offset: number,
    word: string
): { typeName: string; name: string } | null {
    // Match: input Type name or output Type name
    const ioRegex = /\b(input|output)\s+(\w+)(\[\])?\s+(\w+)/g;
    let match;

    while ((match = ioRegex.exec(text)) !== null) {
        const typeName = match[2];
        const name = match[4];
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        // Check if cursor is on type name or name
        if (offset >= matchStart && offset <= matchEnd) {
            if (word === typeName || word === name) {
                return { typeName, name };
            }
        }
    }

    return null;
}

/**
 * Find schema definition in current file or workspace
 */
function findSchemaDefinition(
    schemaName: string,
    currentText: string,
    currentUri: string,
    ctx: TypeDefinitionContext
): Location | null {
    // First check current file
    const localDef = findSchemaInText(schemaName, currentText);
    if (localDef) {
        return Location.create(currentUri, localDef);
    }

    // Search workspace files
    const kiteFiles = ctx.findKiteFilesInWorkspace();
    for (const filePath of kiteFiles) {
        const uri = URI.file(filePath).toString();
        if (uri === currentUri) continue;

        const content = ctx.getFileContent(filePath);
        if (!content) continue;

        const def = findSchemaInText(schemaName, content);
        if (def) {
            return Location.create(uri, def);
        }
    }

    return null;
}

/**
 * Find component definition in current file or workspace
 */
function findComponentDefinition(
    componentName: string,
    currentText: string,
    currentUri: string,
    ctx: TypeDefinitionContext
): Location | null {
    // First check current file
    const localDef = findComponentInText(componentName, currentText);
    if (localDef) {
        return Location.create(currentUri, localDef);
    }

    // Search workspace files
    const kiteFiles = ctx.findKiteFilesInWorkspace();
    for (const filePath of kiteFiles) {
        const uri = URI.file(filePath).toString();
        if (uri === currentUri) continue;

        const content = ctx.getFileContent(filePath);
        if (!content) continue;

        const def = findComponentInText(componentName, content);
        if (def) {
            return Location.create(uri, def);
        }
    }

    return null;
}

/**
 * Find schema definition in text
 */
function findSchemaInText(schemaName: string, text: string): Range | null {
    const regex = new RegExp(`\\bschema\\s+(${escapeRegex(schemaName)})\\s*\\{`, 'g');
    const match = regex.exec(text);

    if (match) {
        const schemaKeywordStart = match.index;
        const lines = text.substring(0, schemaKeywordStart).split('\n');
        const startLine = lines.length - 1;
        const startChar = lines[startLine].length;

        // Find the end of the schema block
        let braceCount = 0;
        let foundOpen = false;
        let endOffset = match.index + match[0].length;

        for (let i = match.index; i < text.length; i++) {
            if (text[i] === '{') {
                braceCount++;
                foundOpen = true;
            } else if (text[i] === '}') {
                braceCount--;
                if (foundOpen && braceCount === 0) {
                    endOffset = i + 1;
                    break;
                }
            }
        }

        const endLines = text.substring(0, endOffset).split('\n');
        const endLine = endLines.length - 1;
        const endChar = endLines[endLine].length;

        return Range.create(
            Position.create(startLine, startChar),
            Position.create(endLine, endChar)
        );
    }

    return null;
}

/**
 * Find component definition (not instantiation) in text
 */
function findComponentInText(componentName: string, text: string): Range | null {
    // Match component definitions: component Name {
    // NOT instantiations: component Name instanceName {
    // Definition has exactly the component name followed by {
    const regex = new RegExp(`\\bcomponent\\s+(${escapeRegex(componentName)})\\s*\\{`, 'g');
    let match;

    while ((match = regex.exec(text)) !== null) {
        // Check what comes between 'component' and '{'
        // Get the text from 'component' to '{'
        const componentKeywordEnd = match.index + 'component'.length;
        const bracePos = match.index + match[0].length - 1;
        const betweenText = text.substring(componentKeywordEnd, bracePos).trim();

        // Definition: just the component name (e.g., "WebServer")
        // Instantiation: component name + instance name (e.g., "WebServer api")
        const parts = betweenText.split(/\s+/).filter(p => p);

        // Definition has exactly 1 part (just the name)
        if (parts.length !== 1) continue;

        const componentKeywordStart = match.index;
        const lines = text.substring(0, componentKeywordStart).split('\n');
        const startLine = lines.length - 1;
        const startChar = lines[startLine].length;

        // Find the end of the component block
        let braceCount = 0;
        let foundOpen = false;
        let endOffset = match.index + match[0].length;

        for (let i = match.index; i < text.length; i++) {
            if (text[i] === '{') {
                braceCount++;
                foundOpen = true;
            } else if (text[i] === '}') {
                braceCount--;
                if (foundOpen && braceCount === 0) {
                    endOffset = i + 1;
                    break;
                }
            }
        }

        const endLines = text.substring(0, endOffset).split('\n');
        const endLine = endLines.length - 1;
        const endChar = endLines[endLine].length;

        return Range.create(
            Position.create(startLine, startChar),
            Position.create(endLine, endChar)
        );
    }

    return null;
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
 * Check if type is a built-in type
 */
function isBuiltinType(typeName: string): boolean {
    const builtins = ['string', 'number', 'boolean', 'any', 'object', 'void', 'null'];
    return builtins.includes(typeName.toLowerCase());
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
