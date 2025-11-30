/**
 * Go to Definition handler for the Kite language server.
 * Provides navigation to symbol definitions.
 * Uses AST-based parsing for accurate definition lookup.
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
import { Declaration, BlockContext, ImportInfo, PropertyAccessContext, PropertyResult, BaseContext } from '../types';
import { escapeRegex } from '../utils/rename-utils';
import { getWordAtPosition, findMatchingBrace } from '../utils/text-utils';
import {
    parseKite,
    findSchemaDefinitionAST,
    findComponentDefinitionAST,
    findFunctionDefinitionAST,
    findTypeDefinitionAST,
    findSchemaPropertyAST,
    findComponentInputAST,
    DefinitionLocation,
} from '../../parser';

/**
 * Context for definition handler - provides access to shared functions
 */
export interface DefinitionContext extends BaseContext {
    extractImports: (text: string) => ImportInfo[];
    isSymbolImported: (imports: ImportInfo[], symbolName: string, filePath: string, currentFilePath: string) => boolean;
    findEnclosingBlock: (text: string, offset: number) => BlockContext | null;
}

/**
 * Handle go to definition request
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
    // Pattern: property = value (clicking on 'property' should go to schema/component definition)
    const enclosingBlock = ctx.findEnclosingBlock(text, offset);
    if (enclosingBlock) {
        // Check if word is followed by = (property assignment)
        let wordEnd = offset;
        while (wordEnd < text.length && /\w/.test(text[wordEnd])) {
            wordEnd++;
        }
        const afterWord = text.substring(wordEnd, Math.min(text.length, wordEnd + 10)).trim();

        if (afterWord.startsWith('=') && !afterWord.startsWith('==')) {
            // This is a property assignment - find the property in schema/component definition
            const currentFilePath = URI.parse(params.textDocument.uri).fsPath;
            const imports = ctx.extractImports(text);

            if (enclosingBlock.type === 'resource') {
                // Find schema property definition - first try current file
                const schemaLoc = findSchemaPropertyLocation(text, enclosingBlock.typeName, word, params.textDocument.uri);
                if (schemaLoc) return schemaLoc;

                // Try cross-file only if schema type is imported
                const kiteFiles = ctx.findKiteFilesInWorkspace();
                for (const filePath of kiteFiles) {
                    if (filePath === currentFilePath) continue;
                    const fileContent = ctx.getFileContent(filePath, params.textDocument.uri);
                    if (fileContent) {
                        // Check if the schema type is imported from this file
                        if (ctx.isSymbolImported(imports, enclosingBlock.typeName, filePath, currentFilePath)) {
                            const loc = findSchemaPropertyLocation(fileContent, enclosingBlock.typeName, word, filePath);
                            if (loc) return loc;
                        }
                    }
                }
            } else if (enclosingBlock.type === 'component') {
                // Find component input definition - first try current file
                const inputLoc = findComponentInputLocation(text, enclosingBlock.typeName, word, params.textDocument.uri);
                if (inputLoc) return inputLoc;

                // Try cross-file only if component type is imported
                const kiteFiles = ctx.findKiteFilesInWorkspace();
                for (const filePath of kiteFiles) {
                    if (filePath === currentFilePath) continue;
                    const fileContent = ctx.getFileContent(filePath, params.textDocument.uri);
                    if (fileContent) {
                        // Check if the component type is imported from this file
                        if (ctx.isSymbolImported(imports, enclosingBlock.typeName, filePath, currentFilePath)) {
                            const loc = findComponentInputLocation(fileContent, enclosingBlock.typeName, word, filePath);
                            if (loc) return loc;
                        }
                    }
                }
            }
        }
    }

    // Search for top-level declarations in current file first
    const declarations = ctx.getDeclarations(params.textDocument.uri) || [];
    const decl = declarations.find(d => d.name === word);

    if (decl) {
        return Location.create(decl.uri, decl.nameRange);
    }

    // Search other files in workspace for imported symbols
    const currentFilePath = URI.parse(params.textDocument.uri).fsPath;
    const imports = ctx.extractImports(text);
    const kiteFiles = ctx.findKiteFilesInWorkspace();

    for (const filePath of kiteFiles) {
        if (filePath === currentFilePath) continue;

        // Check if symbols from this file are imported
        const fileContent = ctx.getFileContent(filePath, params.textDocument.uri);
        if (fileContent) {
            // Look for the declaration in this file
            const fileUri = URI.file(filePath).toString();

            // Check for schema definition
            const schemaRegex = new RegExp(`\\bschema\\s+(${escapeRegex(word)})\\s*\\{`);
            const schemaMatch = schemaRegex.exec(fileContent);
            if (schemaMatch) {
                // Check if imported
                if (ctx.isSymbolImported(imports, word, filePath, currentFilePath)) {
                    const nameStart = schemaMatch.index + schemaMatch[0].indexOf(word);
                    const startPos = offsetToPosition(fileContent, nameStart);
                    const endPos = offsetToPosition(fileContent, nameStart + word.length);
                    return Location.create(fileUri, Range.create(startPos, endPos));
                }
            }

            // Check for component definition
            const componentDefRegex = new RegExp(`\\bcomponent\\s+(${escapeRegex(word)})\\s*\\{`);
            const componentDefMatch = componentDefRegex.exec(fileContent);
            if (componentDefMatch) {
                // Check if this is a definition (not an instantiation)
                // If there's no instance name between component name and {, it's a definition
                const betweenKeywordAndBrace = fileContent.substring(
                    componentDefMatch.index + 10,
                    componentDefMatch.index + componentDefMatch[0].length - 1
                ).trim();
                const parts = betweenKeywordAndBrace.split(/\s+/).filter((s: string) => s);
                if (parts.length === 1) {
                    // Check if imported
                    if (ctx.isSymbolImported(imports, word, filePath, currentFilePath)) {
                        const nameStart = componentDefMatch.index + componentDefMatch[0].indexOf(word);
                        const startPos = offsetToPosition(fileContent, nameStart);
                        const endPos = offsetToPosition(fileContent, nameStart + word.length);
                        return Location.create(fileUri, Range.create(startPos, endPos));
                    }
                }
            }

            // Check for function definition
            const funcRegex = new RegExp(`\\bfun\\s+(${escapeRegex(word)})\\s*\\(`);
            const funcMatch = funcRegex.exec(fileContent);
            if (funcMatch) {
                if (ctx.isSymbolImported(imports, word, filePath, currentFilePath)) {
                    const nameStart = funcMatch.index + funcMatch[0].indexOf(word);
                    const startPos = offsetToPosition(fileContent, nameStart);
                    const endPos = offsetToPosition(fileContent, nameStart + word.length);
                    return Location.create(fileUri, Range.create(startPos, endPos));
                }
            }

            // Check for type definition
            const typeRegex = new RegExp(`\\btype\\s+(${escapeRegex(word)})\\s*=`);
            const typeMatch = typeRegex.exec(fileContent);
            if (typeMatch) {
                if (ctx.isSymbolImported(imports, word, filePath, currentFilePath)) {
                    const nameStart = typeMatch.index + typeMatch[0].indexOf(word);
                    const startPos = offsetToPosition(fileContent, nameStart);
                    const endPos = offsetToPosition(fileContent, nameStart + word.length);
                    return Location.create(fileUri, Range.create(startPos, endPos));
                }
            }

            // Check for resource/component instance (var-like declarations)
            const resourceRegex = new RegExp(`\\bresource\\s+\\w+(?:\\.\\w+)*\\s+(${escapeRegex(word)})\\s*\\{`);
            const resourceMatch = resourceRegex.exec(fileContent);
            if (resourceMatch) {
                if (ctx.isSymbolImported(imports, word, filePath, currentFilePath)) {
                    const nameStart = resourceMatch.index + resourceMatch[0].indexOf(word);
                    const startPos = offsetToPosition(fileContent, nameStart);
                    const endPos = offsetToPosition(fileContent, nameStart + word.length);
                    return Location.create(fileUri, Range.create(startPos, endPos));
                }
            }

            // Check for variable definition
            const varRegex = new RegExp(`\\bvar\\s+(?:\\w+\\s+)?(${escapeRegex(word)})\\s*=`);
            const varMatch = varRegex.exec(fileContent);
            if (varMatch) {
                if (ctx.isSymbolImported(imports, word, filePath, currentFilePath)) {
                    const nameStart = varMatch.index + varMatch[0].indexOf(word);
                    const startPos = offsetToPosition(fileContent, nameStart);
                    const endPos = offsetToPosition(fileContent, nameStart + word.length);
                    return Location.create(fileUri, Range.create(startPos, endPos));
                }
            }
        }
    }

    return null;
}

/**
 * Convert offset to Position
 */
function offsetToPosition(text: string, offset: number): Position {
    const lines = text.substring(0, offset).split('\n');
    return Position.create(lines.length - 1, lines[lines.length - 1].length);
}

/**
 * Find type definition (schema, component, function)
 */
function findTypeDefinition(
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

/**
 * Find schema property location in text using AST parsing.
 */
function findSchemaPropertyLocation(text: string, schemaName: string, propertyName: string, filePathOrUri: string): Location | null {
    const uri = filePathOrUri.startsWith('file://') ? filePathOrUri : URI.file(filePathOrUri).toString();
    const result = parseKite(text);
    if (!result.tree) return null;

    const propLoc = findSchemaPropertyAST(result.tree, schemaName, propertyName);
    if (!propLoc) return null;

    return Location.create(uri, Range.create(
        Position.create(propLoc.line, propLoc.column),
        Position.create(propLoc.line, propLoc.column + propertyName.length)
    ));
}

/**
 * Find component input location in text using AST parsing.
 */
function findComponentInputLocation(text: string, componentTypeName: string, inputName: string, filePathOrUri: string): Location | null {
    const uri = filePathOrUri.startsWith('file://') ? filePathOrUri : URI.file(filePathOrUri).toString();
    const result = parseKite(text);
    if (!result.tree) return null;

    const inputLoc = findComponentInputAST(result.tree, componentTypeName, inputName);
    if (!inputLoc) return null;

    return Location.create(uri, Range.create(
        Position.create(inputLoc.line, inputLoc.column),
        Position.create(inputLoc.line, inputLoc.column + inputName.length)
    ));
}

/**
 * Get property access context (e.g., server.tag.New.a)
 */
function getPropertyAccessContext(text: string, offset: number, currentWord: string): PropertyAccessContext | null {
    // Find start of current word
    let wordStart = offset;
    while (wordStart > 0 && /\w/.test(text[wordStart - 1])) {
        wordStart--;
    }

    // Build the full property chain by walking backwards
    const chain: string[] = [currentWord];
    let pos = wordStart - 1;

    while (pos >= 0) {
        // Skip whitespace
        while (pos >= 0 && /\s/.test(text[pos])) {
            pos--;
        }

        // Check for dot
        if (pos >= 0 && text[pos] === '.') {
            pos--; // skip the dot

            // Skip whitespace before dot
            while (pos >= 0 && /\s/.test(text[pos])) {
                pos--;
            }

            // Find the identifier before the dot
            const identEnd = pos;
            while (pos > 0 && /\w/.test(text[pos - 1])) {
                pos--;
            }
            const identStart = pos;

            if (identStart <= identEnd) {
                const ident = text.substring(identStart, identEnd + 1);
                chain.unshift(ident);
                pos = identStart - 1;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    // Need at least object.property (2 elements)
    if (chain.length >= 2) {
        return {
            chain,
            propertyName: currentWord
        };
    }

    return null;
}

/**
 * Find a property definition following a property chain (e.g., server.tag.New.a)
 */
function findPropertyInChain(document: TextDocument, text: string, chain: string[]): Location | null {
    if (chain.length < 2) return null;

    const declarationName = chain[0];
    const propertyPath = chain.slice(1); // ['tag', 'New', 'a']

    // Find the declaration (resource or component) with this name
    const declRegex = new RegExp(`\\b(?:resource|component)\\s+\\w+(?:\\.\\w+)*\\s+${escapeRegex(declarationName)}\\s*\\{`, 'g');
    const declMatch = declRegex.exec(text);

    if (!declMatch) return null;

    // Start searching from the declaration body
    let searchStart = declMatch.index + declMatch[0].length;
    let searchEnd = findMatchingBrace(text, searchStart - 1);

    // Navigate through the property path
    for (let i = 0; i < propertyPath.length; i++) {
        const propName = propertyPath[i];
        const isLast = i === propertyPath.length - 1;

        const result = findPropertyInRange(document, text, searchStart, searchEnd, propName);

        if (!result) return null;

        if (isLast) {
            return result.location;
        } else {
            if (result.valueStart !== undefined && result.valueEnd !== undefined) {
                searchStart = result.valueStart;
                searchEnd = result.valueEnd;
            } else {
                return null;
            }
        }
    }

    return null;
}

/**
 * Find list comprehension variable definition.
 * For expressions like: [for x in items: if x > 10 { x }]
 * When clicking on 'x' (reference), find the 'x' in 'for x in' (declaration)
 */
function findListComprehensionVariable(
    document: TextDocument,
    text: string,
    offset: number,
    word: string
): Location | null {
    // Find the enclosing list comprehension brackets
    const bracketRange = findEnclosingBrackets(text, offset);
    if (!bracketRange) return null;

    const { start: bracketStart, end: bracketEnd } = bracketRange;
    const comprehensionText = text.substring(bracketStart, bracketEnd + 1);

    // Check if this is a list comprehension (contains 'for ... in')
    const forInMatch = comprehensionText.match(/\bfor\s+(\w+)\s+in\b/);
    if (!forInMatch) return null;

    const loopVar = forInMatch[1];

    // Check if the word we're looking for matches the loop variable
    if (word !== loopVar) return null;

    // Check if the cursor is on the declaration itself (for x in) - if so, don't navigate
    const forVarOffset = bracketStart + forInMatch.index! + forInMatch[0].indexOf(loopVar);
    const forVarEnd = forVarOffset + loopVar.length;
    if (offset >= forVarOffset && offset < forVarEnd) {
        // Cursor is on the declaration, return null or return itself
        return null;
    }

    // Return the location of the loop variable declaration
    const startPos = document.positionAt(forVarOffset);
    const endPos = document.positionAt(forVarEnd);

    return Location.create(document.uri, Range.create(startPos, endPos));
}

/**
 * Find the enclosing square brackets for a list comprehension
 */
function findEnclosingBrackets(text: string, offset: number): { start: number; end: number } | null {
    // Walk backwards to find opening bracket
    let depth = 0;
    let start = -1;

    for (let i = offset; i >= 0; i--) {
        const char = text[i];
        if (char === ']') {
            depth++;
        } else if (char === '[') {
            if (depth === 0) {
                start = i;
                break;
            }
            depth--;
        }
    }

    if (start === -1) return null;

    // Walk forward to find closing bracket
    depth = 0;
    let end = -1;

    for (let i = start; i < text.length; i++) {
        const char = text[i];
        if (char === '[') {
            depth++;
        } else if (char === ']') {
            depth--;
            if (depth === 0) {
                end = i;
                break;
            }
        }
    }

    if (end === -1) return null;

    return { start, end };
}

/**
 * Find a property within a range of text and return its location and value range
 */
function findPropertyInRange(document: TextDocument, text: string, rangeStart: number, rangeEnd: number, propertyName: string): PropertyResult | null {
    const searchText = text.substring(rangeStart, rangeEnd);

    const propRegex = new RegExp(`(?:^|\\n)\\s*(${escapeRegex(propertyName)})\\s*[=:]`, 'g');
    let propMatch;

    while ((propMatch = propRegex.exec(searchText)) !== null) {
        const propNameStartInSearch = propMatch.index + propMatch[0].indexOf(propertyName);
        const propOffset = rangeStart + propNameStartInSearch;

        const startPos = document.positionAt(propOffset);
        const endPos = document.positionAt(propOffset + propertyName.length);
        const location = Location.create(document.uri, Range.create(startPos, endPos));

        // Find the value after = or :
        const afterPropName = rangeStart + propMatch.index + propMatch[0].length;

        // Skip whitespace
        let valueStart = afterPropName;
        while (valueStart < rangeEnd && /\s/.test(text[valueStart])) {
            valueStart++;
        }

        // Check if value is an object literal
        if (text[valueStart] === '{') {
            const valueEnd = findMatchingBrace(text, valueStart);
            return {
                location,
                valueStart: valueStart + 1,
                valueEnd: valueEnd - 1
            };
        }

        return { location };
    }

    // Also check for input/output declarations
    const memberRegex = new RegExp(`(?:^|\\n)\\s*(?:input|output)\\s+\\w+\\s+(${escapeRegex(propertyName)})\\b`, 'g');
    const memberMatch = memberRegex.exec(searchText);

    if (memberMatch) {
        const memberOffset = rangeStart + memberMatch.index + memberMatch[0].lastIndexOf(propertyName);
        const startPos = document.positionAt(memberOffset);
        const endPos = document.positionAt(memberOffset + propertyName.length);

        return { location: Location.create(document.uri, Range.create(startPos, endPos)) };
    }

    return null;
}
