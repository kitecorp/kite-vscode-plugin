/**
 * Go to Definition handler for the Kite language server.
 * Provides navigation to symbol definitions.
 *
 * This module re-exports functionality from:
 * - types.ts: DefinitionContext interface
 * - utils.ts: Helper utilities (offsetToPosition, getPropertyAccessContext, etc.)
 * - type-definitions.ts: Schema, component, function definition lookup
 * - property-definitions.ts: Property definition lookup in schemas/components
 * - loop-variables.ts: List comprehension variable lookup
 */

import {
    Definition,
    Location,
    Range,
    Position,
    TextDocumentPositionParams,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { escapeRegex } from '../../utils/rename-utils';
import { getWordAtPosition } from '../../utils/text-utils';

// Import from modular files
import { DefinitionContext } from './types';
import { offsetToPosition, getPropertyAccessContext } from './utils';
import { findTypeDefinition, findSchemaDefinition, findFunctionDefinition, findComponentDefinition } from './type-definitions';
import { findSchemaPropertyLocation, findComponentInputLocation, findPropertyInChain } from './property-definitions';
import { findListComprehensionVariable } from './loop-variables';

// Re-export types and utilities
export { DefinitionContext } from './types';
export { findSchemaDefinition, findFunctionDefinition, findComponentDefinition } from './type-definitions';

/**
 * Handle go to definition request - main entry point called by the language server.
 */
export function handleDefinition(
    params: TextDocumentPositionParams,
    document: TextDocument,
    ctx: DefinitionContext
): Definition | null {
    const text = document.getText();
    const offset = document.offsetAt(params.position);
    const word = getWordAtPosition(document, params.position);
    if (!word) return null;

    // Check if this is a loop variable reference in a list comprehension
    const listCompLocation = findListComprehensionVariable(document, text, offset, word);
    if (listCompLocation) {
        return listCompLocation;
    }

    // Check if this is a schema type in a resource declaration: resource SchemaName instanceName {
    // or a component type in a component instantiation: component TypeName instanceName {
    try {
        const typeRefLocation = findTypeDefinition(text, offset, word, params.textDocument.uri, ctx);
        if (typeRefLocation) {
            return typeRefLocation;
        }
    } catch {
        // Ignore errors in type definition lookup
    }

    // Check if this is a property access (e.g., server.tag.New.a)
    const propertyAccess = getPropertyAccessContext(text, offset, word);
    if (propertyAccess) {
        // Find the root object declaration
        const declarations = ctx.getDeclarations(params.textDocument.uri) || [];
        const rootName = propertyAccess.chain[0];
        const objectDecl = declarations.find(d => d.name === rootName);

        if (objectDecl && (objectDecl.type === 'resource' || objectDecl.type === 'component')) {
            // Find the property definition following the chain
            const propertyLocation = findPropertyInChain(document, text, propertyAccess.chain);
            if (propertyLocation) {
                return propertyLocation;
            }
        }
    }

    // Check if this is a property assignment inside a resource/component body
    const enclosingBlock = ctx.findEnclosingBlock(text, offset);
    if (enclosingBlock) {
        const propertyLocation = findPropertyAssignmentDefinition(
            text, offset, word, params.textDocument.uri, enclosingBlock, ctx
        );
        if (propertyLocation) {
            return propertyLocation;
        }
    }

    // Search for top-level declarations in current file first
    const declarations = ctx.getDeclarations(params.textDocument.uri) || [];
    const decl = declarations.find(d => d.name === word);

    if (decl) {
        return Location.create(decl.uri, decl.nameRange);
    }

    // Search other files in workspace for imported symbols
    return findCrossFileDefinition(text, word, params.textDocument.uri, ctx);
}

/**
 * Find property assignment definition (property = value clicking on 'property').
 */
function findPropertyAssignmentDefinition(
    text: string,
    offset: number,
    word: string,
    currentDocUri: string,
    enclosingBlock: { type: string; typeName: string },
    ctx: DefinitionContext
): Location | null {
    // Check if word is followed by = (property assignment)
    let wordEnd = offset;
    while (wordEnd < text.length && /\w/.test(text[wordEnd])) {
        wordEnd++;
    }
    const afterWord = text.substring(wordEnd, Math.min(text.length, wordEnd + 10)).trim();

    if (!afterWord.startsWith('=') || afterWord.startsWith('==')) {
        return null;
    }

    // This is a property assignment - find the property in schema/component definition
    const currentFilePath = URI.parse(currentDocUri).fsPath;
    const imports = ctx.extractImports(text);

    if (enclosingBlock.type === 'resource') {
        // Find schema property definition - first try current file
        const schemaLoc = findSchemaPropertyLocation(text, enclosingBlock.typeName, word, currentDocUri);
        if (schemaLoc) return schemaLoc;

        // Try cross-file only if schema type is imported
        const kiteFiles = ctx.findKiteFilesInWorkspace();
        for (const filePath of kiteFiles) {
            if (filePath === currentFilePath) continue;
            const fileContent = ctx.getFileContent(filePath, currentDocUri);
            if (fileContent) {
                if (ctx.isSymbolImported(imports, enclosingBlock.typeName, filePath, currentFilePath)) {
                    const loc = findSchemaPropertyLocation(fileContent, enclosingBlock.typeName, word, filePath);
                    if (loc) return loc;
                }
            }
        }
    } else if (enclosingBlock.type === 'component') {
        // Find component input definition - first try current file
        const inputLoc = findComponentInputLocation(text, enclosingBlock.typeName, word, currentDocUri);
        if (inputLoc) return inputLoc;

        // Try cross-file only if component type is imported
        const kiteFiles = ctx.findKiteFilesInWorkspace();
        for (const filePath of kiteFiles) {
            if (filePath === currentFilePath) continue;
            const fileContent = ctx.getFileContent(filePath, currentDocUri);
            if (fileContent) {
                if (ctx.isSymbolImported(imports, enclosingBlock.typeName, filePath, currentFilePath)) {
                    const loc = findComponentInputLocation(fileContent, enclosingBlock.typeName, word, filePath);
                    if (loc) return loc;
                }
            }
        }
    }

    return null;
}

/**
 * Find definition in other files for imported symbols.
 */
function findCrossFileDefinition(
    text: string,
    word: string,
    currentDocUri: string,
    ctx: DefinitionContext
): Location | null {
    const currentFilePath = URI.parse(currentDocUri).fsPath;
    const imports = ctx.extractImports(text);
    const kiteFiles = ctx.findKiteFilesInWorkspace();

    for (const filePath of kiteFiles) {
        if (filePath === currentFilePath) continue;

        const fileContent = ctx.getFileContent(filePath, currentDocUri);
        if (!fileContent) continue;

        const fileUri = URI.file(filePath).toString();

        // Check for various declaration types
        const location = findDeclarationInFile(fileContent, word, fileUri, imports, filePath, currentFilePath, ctx);
        if (location) return location;
    }

    return null;
}

/**
 * Find a declaration in a file content.
 */
function findDeclarationInFile(
    fileContent: string,
    word: string,
    fileUri: string,
    imports: ReturnType<DefinitionContext['extractImports']>,
    filePath: string,
    currentFilePath: string,
    ctx: DefinitionContext
): Location | null {
    // Check for schema definition
    const schemaRegex = new RegExp(`\\bschema\\s+(${escapeRegex(word)})\\s*\\{`);
    const schemaMatch = schemaRegex.exec(fileContent);
    if (schemaMatch && ctx.isSymbolImported(imports, word, filePath, currentFilePath)) {
        const nameStart = schemaMatch.index + schemaMatch[0].indexOf(word);
        return createLocation(fileContent, fileUri, nameStart, word.length);
    }

    // Check for component definition
    const componentDefRegex = new RegExp(`\\bcomponent\\s+(${escapeRegex(word)})\\s*\\{`);
    const componentDefMatch = componentDefRegex.exec(fileContent);
    if (componentDefMatch) {
        const betweenKeywordAndBrace = fileContent.substring(
            componentDefMatch.index + 10,
            componentDefMatch.index + componentDefMatch[0].length - 1
        ).trim();
        const parts = betweenKeywordAndBrace.split(/\s+/).filter((s: string) => s);
        if (parts.length === 1 && ctx.isSymbolImported(imports, word, filePath, currentFilePath)) {
            const nameStart = componentDefMatch.index + componentDefMatch[0].indexOf(word);
            return createLocation(fileContent, fileUri, nameStart, word.length);
        }
    }

    // Check for function definition
    const funcRegex = new RegExp(`\\bfun\\s+(${escapeRegex(word)})\\s*\\(`);
    const funcMatch = funcRegex.exec(fileContent);
    if (funcMatch && ctx.isSymbolImported(imports, word, filePath, currentFilePath)) {
        const nameStart = funcMatch.index + funcMatch[0].indexOf(word);
        return createLocation(fileContent, fileUri, nameStart, word.length);
    }

    // Check for type definition
    const typeRegex = new RegExp(`\\btype\\s+(${escapeRegex(word)})\\s*=`);
    const typeMatch = typeRegex.exec(fileContent);
    if (typeMatch && ctx.isSymbolImported(imports, word, filePath, currentFilePath)) {
        const nameStart = typeMatch.index + typeMatch[0].indexOf(word);
        return createLocation(fileContent, fileUri, nameStart, word.length);
    }

    // Check for resource instance
    const resourceRegex = new RegExp(`\\bresource\\s+\\w+(?:\\.\\w+)*\\s+(${escapeRegex(word)})\\s*\\{`);
    const resourceMatch = resourceRegex.exec(fileContent);
    if (resourceMatch && ctx.isSymbolImported(imports, word, filePath, currentFilePath)) {
        const nameStart = resourceMatch.index + resourceMatch[0].indexOf(word);
        return createLocation(fileContent, fileUri, nameStart, word.length);
    }

    // Check for variable definition
    const varRegex = new RegExp(`\\bvar\\s+(?:\\w+\\s+)?(${escapeRegex(word)})\\s*=`);
    const varMatch = varRegex.exec(fileContent);
    if (varMatch && ctx.isSymbolImported(imports, word, filePath, currentFilePath)) {
        const nameStart = varMatch.index + varMatch[0].indexOf(word);
        return createLocation(fileContent, fileUri, nameStart, word.length);
    }

    return null;
}

/**
 * Create a Location from file content, URI, and offset.
 */
function createLocation(fileContent: string, fileUri: string, nameStart: number, nameLength: number): Location {
    const startPos = offsetToPosition(fileContent, nameStart);
    const endPos = offsetToPosition(fileContent, nameStart + nameLength);
    return Location.create(fileUri, Range.create(startPos, endPos));
}
