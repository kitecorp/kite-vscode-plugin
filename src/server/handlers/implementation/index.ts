/**
 * Implementation handler for the Kite language server.
 * Finds all resources using a schema or components instantiating a component type.
 * This is the inverse of "Go to Type Definition" - from type to implementations.
 */

import {
    Location,
    Range,
    Position,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

// Re-export types
export { ImplementationContext } from './types';
import { ImplementationContext } from './types';

/**
 * Handle implementation request - find all implementations of a schema/component
 */
export function handleImplementation(
    document: TextDocument,
    position: Position,
    ctx: ImplementationContext
): Location[] {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Get word at position
    const word = getWordAtOffset(text, offset);
    if (!word) return [];

    // Skip keywords
    if (isKeyword(word)) return [];

    // Check if cursor is on a schema definition
    const schemaMatch = findSchemaDefinitionAtPosition(text, offset, word);
    if (schemaMatch) {
        return findSchemaImplementations(schemaMatch.schemaName, text, document.uri, ctx);
    }

    // Check if cursor is on a component definition
    const componentMatch = findComponentDefinitionAtPosition(text, offset, word);
    if (componentMatch) {
        return findComponentImplementations(componentMatch.componentName, text, document.uri, ctx);
    }

    return [];
}

/**
 * Find schema definition at position
 * Returns the schema name if cursor is on a schema definition
 */
function findSchemaDefinitionAtPosition(
    text: string,
    offset: number,
    word: string
): { schemaName: string } | null {
    // Match: schema SchemaName {
    // Also handles dotted names: schema AWS.S3.Bucket {
    const schemaRegex = /\bschema\s+([\w.]+)\s*\{/g;
    let match;

    while ((match = schemaRegex.exec(text)) !== null) {
        const schemaName = match[1];
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        // Check if cursor is within the schema declaration line
        if (offset >= matchStart && offset <= matchEnd) {
            // Check if the word is the schema name (or part of dotted name)
            if (schemaName === word || schemaName.includes(word)) {
                return { schemaName };
            }
        }
    }

    return null;
}

/**
 * Find component definition at position (not instantiation)
 * Returns the component name if cursor is on a component definition
 */
function findComponentDefinitionAtPosition(
    text: string,
    offset: number,
    word: string
): { componentName: string } | null {
    // Match: component ComponentName {
    // Definition has exactly 1 identifier after 'component'
    // Instantiation has 2 identifiers: component TypeName instanceName {
    const componentRegex = /\bcomponent\s+([\w.]+)(\s+\w+)?\s*\{/g;
    let match;

    while ((match = componentRegex.exec(text)) !== null) {
        const componentName = match[1];
        const instanceName = match[2]; // undefined for definitions
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        // Skip instantiations (they have 2 identifiers)
        if (instanceName && instanceName.trim()) continue;

        // Check if cursor is within the component declaration line
        if (offset >= matchStart && offset <= matchEnd) {
            // Check if the word is the component name (or part of dotted name)
            if (componentName === word || componentName.includes(word)) {
                return { componentName };
            }
        }
    }

    return null;
}

/**
 * Find all resources that use a schema
 */
function findSchemaImplementations(
    schemaName: string,
    currentText: string,
    currentUri: string,
    ctx: ImplementationContext
): Location[] {
    const implementations: Location[] = [];

    // Search current file
    const localImpls = findResourcesUsingSchemaInText(schemaName, currentText);
    for (const range of localImpls) {
        implementations.push(Location.create(currentUri, range));
    }

    // Search workspace files
    const kiteFiles = ctx.findKiteFilesInWorkspace();
    for (const filePath of kiteFiles) {
        const uri = URI.file(filePath).toString();
        if (uri === currentUri) continue;

        const content = ctx.getFileContent(filePath);
        if (!content) continue;

        const impls = findResourcesUsingSchemaInText(schemaName, content);
        for (const range of impls) {
            implementations.push(Location.create(uri, range));
        }
    }

    return implementations;
}

/**
 * Find all component instantiations of a component type
 */
function findComponentImplementations(
    componentName: string,
    currentText: string,
    currentUri: string,
    ctx: ImplementationContext
): Location[] {
    const implementations: Location[] = [];

    // Search current file
    const localImpls = findComponentInstantiationsInText(componentName, currentText);
    for (const range of localImpls) {
        implementations.push(Location.create(currentUri, range));
    }

    // Search workspace files
    const kiteFiles = ctx.findKiteFilesInWorkspace();
    for (const filePath of kiteFiles) {
        const uri = URI.file(filePath).toString();
        if (uri === currentUri) continue;

        const content = ctx.getFileContent(filePath);
        if (!content) continue;

        const impls = findComponentInstantiationsInText(componentName, content);
        for (const range of impls) {
            implementations.push(Location.create(uri, range));
        }
    }

    return implementations;
}

/**
 * Find all resources using a schema in text
 */
function findResourcesUsingSchemaInText(schemaName: string, text: string): Range[] {
    const ranges: Range[] = [];
    // Match: resource SchemaName instanceName {
    const regex = new RegExp(`\\bresource\\s+(${escapeRegex(schemaName)})\\s+\\w+\\s*\\{`, 'g');
    let match;

    while ((match = regex.exec(text)) !== null) {
        const resourceStart = match.index;
        const lines = text.substring(0, resourceStart).split('\n');
        const startLine = lines.length - 1;
        const startChar = lines[startLine].length;

        // Find the end of the resource block
        const blockEnd = findMatchingBrace(text, resourceStart + match[0].length - 1);
        const endOffset = blockEnd !== -1 ? blockEnd + 1 : resourceStart + match[0].length;

        const endLines = text.substring(0, endOffset).split('\n');
        const endLine = endLines.length - 1;
        const endChar = endLines[endLine].length;

        ranges.push(Range.create(
            Position.create(startLine, startChar),
            Position.create(endLine, endChar)
        ));
    }

    return ranges;
}

/**
 * Find all component instantiations in text
 */
function findComponentInstantiationsInText(componentName: string, text: string): Range[] {
    const ranges: Range[] = [];
    // Match: component TypeName instanceName { (instantiation has 2 identifiers)
    const regex = new RegExp(`\\bcomponent\\s+(${escapeRegex(componentName)})\\s+(\\w+)\\s*\\{`, 'g');
    let match;

    while ((match = regex.exec(text)) !== null) {
        // Verify this is an instantiation (has instance name)
        const instanceName = match[2];
        if (!instanceName) continue;

        const componentStart = match.index;
        const lines = text.substring(0, componentStart).split('\n');
        const startLine = lines.length - 1;
        const startChar = lines[startLine].length;

        // Find the end of the component block
        const blockEnd = findMatchingBrace(text, componentStart + match[0].length - 1);
        const endOffset = blockEnd !== -1 ? blockEnd + 1 : componentStart + match[0].length;

        const endLines = text.substring(0, endOffset).split('\n');
        const endLine = endLines.length - 1;
        const endChar = endLines[endLine].length;

        ranges.push(Range.create(
            Position.create(startLine, startChar),
            Position.create(endLine, endChar)
        ));
    }

    return ranges;
}

/**
 * Find matching closing brace
 */
function findMatchingBrace(text: string, startPos: number): number {
    if (text[startPos] !== '{') return -1;

    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = startPos; i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        if ((char === '"' || char === "'") && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
            continue;
        }

        if (inString) continue;

        if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }

    return -1;
}

/**
 * Get word at offset
 */
function getWordAtOffset(text: string, offset: number): string | null {
    const before = text.substring(0, offset);
    const after = text.substring(offset);

    const beforeMatch = before.match(/[a-zA-Z_][\w.]*$/);
    const afterMatch = after.match(/^[\w.]*/);

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
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
