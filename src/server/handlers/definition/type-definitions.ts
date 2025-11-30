/**
 * Type definition lookup (schema, component, function, type).
 * Handles finding definitions of types referenced in resource/component declarations.
 */

import { Location, Range, Position } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import {
    parseKite,
    findSchemaDefinitionAST,
    findComponentDefinitionAST,
    findFunctionDefinitionAST,
} from '../../../parser';
import { DefinitionContext } from './types';

/**
 * Find type definition (schema, component, function).
 * Determines the type of reference based on context and searches for the definition.
 */
export function findTypeDefinition(
    text: string,
    offset: number,
    word: string,
    currentDocUri: string,
    ctx: DefinitionContext
): Location | null {
    // Find the actual start of the word (cursor could be anywhere in the word)
    let wordStart = offset;
    while (wordStart > 0 && /\w/.test(text[wordStart - 1])) {
        wordStart--;
    }

    // Look backwards from the word to see if it's preceded by 'resource' or 'component'
    const beforeWord = text.substring(Math.max(0, wordStart - 50), wordStart);

    let isSchemaRef = false;
    let isComponentRef = false;

    // Find the actual end of the word
    let wordEnd = offset;
    while (wordEnd < text.length && /\w/.test(text[wordEnd])) {
        wordEnd++;
    }

    if (/\bresource\s+$/.test(beforeWord)) {
        isSchemaRef = true;
    } else if (/\bcomponent\s+$/.test(beforeWord)) {
        // Check if this is an instantiation (has instance name after) or definition
        const afterWord = text.substring(wordEnd, Math.min(text.length, wordEnd + 50));
        if (/^\s+\w+\s*\{/.test(afterWord)) {
            // Has instance name after - this is an instantiation, word is the type
            isComponentRef = true;
        }
    }

    const currentFilePath = URI.parse(currentDocUri).fsPath;
    const imports = ctx.extractImports(text);

    if (isSchemaRef) {
        // Find schema definition in current file
        const location = findSchemaDefinition(text, word, currentDocUri);
        if (location) return location;

        // Try other files in workspace (only if imported)
        try {
            const kiteFiles = ctx.findKiteFilesInWorkspace();
            for (const filePath of kiteFiles) {
                const fileContent = ctx.getFileContent(filePath, currentDocUri);
                if (fileContent) {
                    const loc = findSchemaDefinition(fileContent, word, filePath);
                    if (loc) {
                        // Check if this symbol is imported
                        if (ctx.isSymbolImported(imports, word, filePath, currentFilePath)) {
                            return loc;
                        }
                        // Symbol not imported - diagnostic will show error with quick fix
                        return null;
                    }
                }
            }
        } catch {
            // Ignore cross-file lookup errors
        }
    }

    if (isComponentRef) {
        // Find component definition in current file
        const location = findComponentDefinition(text, word, currentDocUri);
        if (location) return location;

        // Try other files in workspace (only if imported)
        try {
            const kiteFiles = ctx.findKiteFilesInWorkspace();
            for (const filePath of kiteFiles) {
                const fileContent = ctx.getFileContent(filePath, currentDocUri);
                if (fileContent) {
                    const loc = findComponentDefinition(fileContent, word, filePath);
                    if (loc) {
                        // Check if this symbol is imported
                        if (ctx.isSymbolImported(imports, word, filePath, currentFilePath)) {
                            return loc;
                        }
                        // Symbol not imported - diagnostic will show error with quick fix
                        return null;
                    }
                }
            }
        } catch {
            // Ignore cross-file lookup errors
        }
    }

    // Check if this is a function call: functionName(
    const afterWord = text.substring(wordEnd, Math.min(text.length, wordEnd + 10));
    const isFunctionCall = /^\s*\(/.test(afterWord);

    if (isFunctionCall) {
        // Find function definition in current file
        const location = findFunctionDefinition(text, word, currentDocUri);
        if (location) return location;

        // Try other files in workspace (only if imported)
        try {
            const kiteFiles = ctx.findKiteFilesInWorkspace();
            for (const filePath of kiteFiles) {
                const fileContent = ctx.getFileContent(filePath, currentDocUri);
                if (fileContent) {
                    const loc = findFunctionDefinition(fileContent, word, filePath);
                    if (loc) {
                        // Check if this symbol is imported
                        if (ctx.isSymbolImported(imports, word, filePath, currentFilePath)) {
                            return loc;
                        }
                        // Symbol not imported - diagnostic will show error with quick fix
                        return null;
                    }
                }
            }
        } catch {
            // Ignore cross-file lookup errors
        }
    }

    return null;
}

/**
 * Find schema definition location in text using AST parsing.
 */
export function findSchemaDefinition(text: string, schemaName: string, filePathOrUri: string): Location | null {
    const uri = filePathOrUri.startsWith('file://') ? filePathOrUri : URI.file(filePathOrUri).toString();
    const result = parseKite(text);
    if (!result.tree) return null;

    const defLoc = findSchemaDefinitionAST(result.tree, schemaName);
    if (!defLoc) return null;

    return Location.create(uri, Range.create(
        Position.create(defLoc.line, defLoc.column),
        Position.create(defLoc.line, defLoc.column + schemaName.length)
    ));
}

/**
 * Find function definition location in text using AST parsing.
 */
export function findFunctionDefinition(text: string, functionName: string, filePathOrUri: string): Location | null {
    const uri = filePathOrUri.startsWith('file://') ? filePathOrUri : URI.file(filePathOrUri).toString();
    const result = parseKite(text);
    if (!result.tree) return null;

    const defLoc = findFunctionDefinitionAST(result.tree, functionName);
    if (!defLoc) return null;

    return Location.create(uri, Range.create(
        Position.create(defLoc.line, defLoc.column),
        Position.create(defLoc.line, defLoc.column + functionName.length)
    ));
}

/**
 * Find component definition location in text using AST parsing.
 */
export function findComponentDefinition(text: string, componentName: string, filePathOrUri: string): Location | null {
    const uri = filePathOrUri.startsWith('file://') ? filePathOrUri : URI.file(filePathOrUri).toString();
    const result = parseKite(text);
    if (!result.tree) return null;

    const defLoc = findComponentDefinitionAST(result.tree, componentName);
    if (!defLoc) return null;

    return Location.create(uri, Range.create(
        Position.create(defLoc.line, defLoc.column),
        Position.create(defLoc.line, defLoc.column + componentName.length)
    ));
}
