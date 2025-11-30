/**
 * References handler for the Kite language server.
 * Provides "Find All References" functionality with scope awareness.
 * Uses AST-based parsing for definition lookup where beneficial.
 */

import {
    Location,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import {
    escapeRegex,
    isInComment,
    findComponentTypeForScope,
    getSchemaContextAtPosition,
    findComponentInstantiations,
    findResourceInstantiations,
    findPropertyAssignments,
    findPropertyAccess,
} from '../../utils/rename-utils';
import { Declaration, BaseContext } from '../../types';
import { offsetToPosition } from '../../utils/text-utils';
import {
    parseKite,
    findComponentDefByName,
    findComponentInputAST,
} from '../../../parser';

/**
 * Context interface for dependency injection into references handler.
 * This allows the handler to access server-scoped resources without direct coupling.
 */
export interface ReferencesContext extends BaseContext {
    /** Get document by URI */
    getDocument: (uri: string) => TextDocument | undefined;
}

/**
 * Handle references request - finds all references to a symbol
 */
export function handleReferences(
    document: TextDocument,
    word: string,
    cursorOffset: number,
    ctx: ReferencesContext
): Location[] {
    return findAllReferences(word, document.uri, cursorOffset, ctx);
}

/**
 * Find property assignments and property access references in component instantiations
 */
export function findComponentPropertyReferences(
    componentTypeName: string,
    propertyName: string,
    currentDocUri: string,
    ctx: ReferencesContext
): Location[] {
    const locations: Location[] = [];
    const currentFilePath = URI.parse(currentDocUri).fsPath;

    const kiteFiles = ctx.findKiteFilesInWorkspace();

    for (const filePath of kiteFiles) {
        const fileContent = ctx.getFileContent(filePath, currentDocUri);
        if (!fileContent) continue;

        const fileUri = filePath === currentFilePath ? currentDocUri : URI.file(filePath).toString();
        const doc = ctx.getDocument(fileUri);

        // Find all instantiations using utility function
        const instantiations = findComponentInstantiations(fileContent, componentTypeName);

        for (const inst of instantiations) {
            // Find property assignments using utility function
            const assignments = findPropertyAssignments(fileContent, inst.bodyStart, inst.bodyEnd, propertyName);
            for (const assign of assignments) {
                const startPos = doc
                    ? doc.positionAt(assign.startOffset)
                    : offsetToPosition(fileContent, assign.startOffset);
                const endPos = doc
                    ? doc.positionAt(assign.endOffset)
                    : offsetToPosition(fileContent, assign.endOffset);
                locations.push(Location.create(fileUri, Range.create(startPos, endPos)));
            }

            // Find property access using utility function
            const accesses = findPropertyAccess(fileContent, inst.instanceName, propertyName);
            for (const access of accesses) {
                const startPos = doc
                    ? doc.positionAt(access.startOffset)
                    : offsetToPosition(fileContent, access.startOffset);
                const endPos = doc
                    ? doc.positionAt(access.endOffset)
                    : offsetToPosition(fileContent, access.endOffset);
                locations.push(Location.create(fileUri, Range.create(startPos, endPos)));
            }
        }
    }

    return locations;
}

/**
 * Find property assignments and property access in resource instantiations for a schema
 */
export function findSchemaPropertyReferences(
    schemaName: string,
    propertyName: string,
    currentDocUri: string,
    ctx: ReferencesContext
): Location[] {
    const locations: Location[] = [];
    const currentFilePath = URI.parse(currentDocUri).fsPath;
    const kiteFiles = ctx.findKiteFilesInWorkspace();

    for (const filePath of kiteFiles) {
        const fileContent = ctx.getFileContent(filePath, currentDocUri);
        if (!fileContent) continue;

        const fileUri = filePath === currentFilePath ? currentDocUri : URI.file(filePath).toString();
        const doc = ctx.getDocument(fileUri);

        // Use utility to find all resource instantiations of this schema type
        const resources = findResourceInstantiations(fileContent, schemaName);

        for (const res of resources) {
            // Find property assignments using utility
            const assignments = findPropertyAssignments(fileContent, res.bodyStart, res.bodyEnd, propertyName);
            for (const assign of assignments) {
                const startPos = doc
                    ? doc.positionAt(assign.startOffset)
                    : offsetToPosition(fileContent, assign.startOffset);
                const endPos = doc
                    ? doc.positionAt(assign.endOffset)
                    : offsetToPosition(fileContent, assign.endOffset);
                locations.push(Location.create(fileUri, Range.create(startPos, endPos)));
            }

            // Find property access references using utility
            const accesses = findPropertyAccess(fileContent, res.instanceName, propertyName);
            for (const access of accesses) {
                const startPos = doc
                    ? doc.positionAt(access.startOffset)
                    : offsetToPosition(fileContent, access.startOffset);
                const endPos = doc
                    ? doc.positionAt(access.endOffset)
                    : offsetToPosition(fileContent, access.endOffset);
                locations.push(Location.create(fileUri, Range.create(startPos, endPos)));
            }
        }
    }

    return locations;
}

/**
 * Find all references to a symbol across the workspace (scope-aware).
 * If cursorOffset is provided, finds the declaration at that position and respects its scope.
 */
export function findAllReferences(
    word: string,
    currentDocUri: string,
    cursorOffset: number | undefined,
    ctx: ReferencesContext
): Location[] {
    const locations: Location[] = [];
    const currentFilePath = URI.parse(currentDocUri).fsPath;

    // Get current document text
    const currentDoc = ctx.getDocument(currentDocUri);
    const currentText = currentDoc ? currentDoc.getText() : ctx.getFileContent(currentFilePath, currentDocUri);

    if (!currentText) {
        return locations;
    }

    // Check if we're renaming a loop variable (for x in ...)
    if (cursorOffset !== undefined) {
        const loopVarScope = findLoopVariableScope(currentText, cursorOffset, word);
        if (loopVarScope) {
            // Find all references to the loop variable within its scope
            return findReferencesInScope(currentText, word, loopVarScope.scopeStart, loopVarScope.scopeEnd, currentDocUri, currentDoc);
        }
    }

    // Check if we're renaming a schema property
    if (cursorOffset !== undefined) {
        const schemaContext = getSchemaContextAtPosition(currentText, cursorOffset);
        if (schemaContext) {
            // We're inside a schema definition - check if cursor is on a property name
            const bodyText = currentText.substring(schemaContext.scopeStart + 1, schemaContext.scopeEnd - 1);
            const bodyOffset = cursorOffset - schemaContext.scopeStart - 1;

            // Check if we're on a property name: type propertyName
            // Find the line containing the cursor
            const beforeCursor = bodyText.substring(0, bodyOffset);
            const lineStart = beforeCursor.lastIndexOf('\n') + 1;
            const lineEnd = bodyText.indexOf('\n', bodyOffset);
            const line = bodyText.substring(lineStart, lineEnd === -1 ? bodyText.length : lineEnd);

            // Match property definition: type propertyName [= default]
            const propDefMatch = line.match(/^\s*(\w+(?:\[\])?)\s+(\w+)(?:\s*=.*)?$/);
            if (propDefMatch && propDefMatch[2] === word) {
                // This is a schema property - find the property definition location
                const propNameIndex = line.indexOf(word, line.indexOf(propDefMatch[1]) + propDefMatch[1].length);
                const propOffset = schemaContext.scopeStart + 1 + lineStart + propNameIndex;

                const propStartPos = currentDoc
                    ? currentDoc.positionAt(propOffset)
                    : offsetToPosition(currentText, propOffset);
                const propEndPos = currentDoc
                    ? currentDoc.positionAt(propOffset + word.length)
                    : offsetToPosition(currentText, propOffset + word.length);

                locations.push(Location.create(currentDocUri, Range.create(propStartPos, propEndPos)));

                // Find all resource instantiations that use this schema
                const propRefs = findSchemaPropertyReferences(schemaContext.schemaName, word, currentDocUri, ctx);
                locations.push(...propRefs);

                return locations;
            }
        }
    }

    // Check if we're on a property access like instance.property
    if (cursorOffset !== undefined) {
        // Look for pattern: identifier.word where word is what we're renaming
        const beforeCursor = currentText.substring(Math.max(0, cursorOffset - 100), cursorOffset);
        const afterWord = currentText.substring(cursorOffset, Math.min(currentText.length, cursorOffset + word.length + 10));

        // Check if there's a dot before the word
        const dotMatch = beforeCursor.match(/(\w+)\.\s*$/);
        if (dotMatch && afterWord.startsWith(word)) {
            const instanceName = dotMatch[1];

            // Find the component instance declaration
            const declarations = ctx.getDeclarations(currentDocUri) || [];
            const instanceDecl = declarations.find(d =>
                d.name === instanceName &&
                d.type === 'component' &&
                d.componentType
            );

            if (instanceDecl && instanceDecl.componentType) {
                // This is a property access on a component instance
                // Find the input/output declaration in the component definition
                const componentTypeName = instanceDecl.componentType;

                // Search for the component definition and find the input/output
                const kiteFiles = ctx.findKiteFilesInWorkspace();
                for (const filePath of kiteFiles) {
                    const fileContent = ctx.getFileContent(filePath, currentDocUri);
                    if (!fileContent) continue;

                    const fileUri = URI.file(filePath).toString();
                    const doc = ctx.getDocument(fileUri);

                    // Use AST-based lookup
                    const parseResult = parseKite(fileContent);
                    if (!parseResult.tree) continue;

                    const inputLoc = findComponentInputAST(parseResult.tree, componentTypeName, word);
                    if (!inputLoc) continue;

                    // Found the input/output declaration
                    const fieldStartPos = doc
                        ? doc.positionAt(inputLoc.nameStart)
                        : offsetToPosition(fileContent, inputLoc.nameStart);
                    const fieldEndPos = doc
                        ? doc.positionAt(inputLoc.nameEnd)
                        : offsetToPosition(fileContent, inputLoc.nameEnd);

                    locations.push(Location.create(fileUri, Range.create(fieldStartPos, fieldEndPos)));

                    // Find usages within the component definition body
                    const compDef = findComponentDefByName(parseResult.tree, componentTypeName);
                    if (compDef) {
                        const blockExpr = compDef.blockExpression();
                        if (blockExpr) {
                            const bodyStart = (blockExpr.start?.start ?? 0) + 1;
                            const bodyEnd = (blockExpr.stop?.stop ?? 0);
                            const bodyText = fileContent.substring(bodyStart, bodyEnd);

                            // Find usages within the component definition
                            const usageRegex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g');
                            let usageMatch;
                            while ((usageMatch = usageRegex.exec(bodyText)) !== null) {
                                const usageOffset = bodyStart + usageMatch.index;
                                if (usageOffset === inputLoc.nameStart) continue; // Skip the declaration itself

                                if (isInComment(fileContent, usageOffset)) continue;

                                const usageStartPos = doc
                                    ? doc.positionAt(usageOffset)
                                    : offsetToPosition(fileContent, usageOffset);
                                const usageEndPos = doc
                                    ? doc.positionAt(usageOffset + word.length)
                                    : offsetToPosition(fileContent, usageOffset + word.length);

                                locations.push(Location.create(fileUri, Range.create(usageStartPos, usageEndPos)));
                            }

                            // Find all property references in component instantiations
                            const propRefs = findComponentPropertyReferences(componentTypeName, word, currentDocUri, ctx);
                            locations.push(...propRefs);

                            return locations;
                        }
                    }
                }
            }
        }
    }

    // Determine scope constraints based on the declaration
    let scopeStart: number | undefined;
    let scopeEnd: number | undefined;
    let isLocalScope = false;
    let searchOtherFiles = true;
    let componentTypeName: string | null = null;

    // If we have a cursor position, find the declaration and its scope
    if (cursorOffset !== undefined) {
        const declarations = ctx.getDeclarations(currentDocUri) || [];

        // First, check if the cursor is ON a declaration
        let declaration = declarations.find(d =>
            d.name === word &&
            cursorOffset >= currentDoc!.offsetAt(d.nameRange.start) &&
            cursorOffset <= currentDoc!.offsetAt(d.nameRange.end)
        );

        // If not on a declaration, find which declaration this reference belongs to
        if (!declaration) {
            // Find all declarations with this name that are visible at the cursor position
            const visibleDecls = declarations.filter(d => {
                if (d.name !== word) return false;

                // If declaration has a scope, cursor must be within it
                if (d.scopeStart !== undefined && d.scopeEnd !== undefined) {
                    return cursorOffset >= d.scopeStart && cursorOffset <= d.scopeEnd;
                }

                // File-scoped declaration is always visible
                return true;
            });

            // Prefer the most local (innermost) declaration
            if (visibleDecls.length > 0) {
                declaration = visibleDecls.reduce((best, current) => {
                    // Scoped declarations are more local than file-scoped ones
                    if (current.scopeStart !== undefined && best.scopeStart === undefined) {
                        return current;
                    }
                    if (current.scopeStart === undefined && best.scopeStart !== undefined) {
                        return best;
                    }
                    // Both scoped: prefer the one with the smaller scope (more local)
                    if (current.scopeStart !== undefined && best.scopeStart !== undefined) {
                        const currentSize = current.scopeEnd! - current.scopeStart;
                        const bestSize = best.scopeEnd! - best.scopeStart!;
                        return currentSize < bestSize ? current : best;
                    }
                    return best;
                });
            }
        }

        // If we found a declaration, use its scope
        if (declaration) {
            if (declaration.scopeStart !== undefined && declaration.scopeEnd !== undefined) {
                // Check if this is an input/output in a component definition
                if (declaration.type === 'input' || declaration.type === 'output') {
                    componentTypeName = findComponentTypeForScope(currentText, declaration.scopeStart);
                    if (componentTypeName) {
                        // Still search within the component definition scope
                        scopeStart = declaration.scopeStart;
                        scopeEnd = declaration.scopeEnd;
                        isLocalScope = true;
                        searchOtherFiles = false;

                        // Include the declaration itself
                        locations.push(Location.create(currentDocUri, declaration.nameRange));

                        // Also find all property assignments in component instantiations
                        const propRefs = findComponentPropertyReferences(componentTypeName, word, currentDocUri, ctx);
                        locations.push(...propRefs);
                    } else {
                        // Regular scoped input/output (shouldn't happen, but handle gracefully)
                        scopeStart = declaration.scopeStart;
                        scopeEnd = declaration.scopeEnd;
                        isLocalScope = true;
                        searchOtherFiles = false;
                        locations.push(Location.create(currentDocUri, declaration.nameRange));
                    }
                } else {
                    // Local variable/parameter - only search within scope, don't search other files
                    scopeStart = declaration.scopeStart;
                    scopeEnd = declaration.scopeEnd;
                    isLocalScope = true;
                    searchOtherFiles = false;

                    // Always include the declaration itself (important for parameters which are
                    // declared before the function body scope starts)
                    locations.push(Location.create(currentDocUri, declaration.nameRange));
                }
            } else {
                // File-scoped or global declaration
                // For functions, schemas, components, resources, types - search all files
                // For file-scoped variables - only search current file
                if (declaration.type === 'variable') {
                    searchOtherFiles = false;
                }
            }
        }
    }

    // Track declaration location to avoid duplicates
    const declarationKey = locations.length > 0
        ? `${locations[0].range.start.line}:${locations[0].range.start.character}`
        : null;

    // Search current file
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g');
    let match;
    while ((match = regex.exec(currentText)) !== null) {
        if (isInComment(currentText, match.index)) continue;

        // If we have scope constraints, check if the match is within scope
        if (isLocalScope && scopeStart !== undefined && scopeEnd !== undefined) {
            if (match.index < scopeStart || match.index > scopeEnd) {
                continue;
            }
        }

        const startPos = currentDoc
            ? currentDoc.positionAt(match.index)
            : offsetToPosition(currentText, match.index);
        const endPos = currentDoc
            ? currentDoc.positionAt(match.index + word.length)
            : offsetToPosition(currentText, match.index + word.length);

        // Skip if this is the declaration we already added
        const matchKey = `${startPos.line}:${startPos.character}`;
        if (matchKey === declarationKey) {
            continue;
        }

        locations.push(Location.create(currentDocUri, Range.create(startPos, endPos)));
    }

    // Search other files in workspace (only for non-local symbols)
    if (searchOtherFiles) {
        const kiteFiles = ctx.findKiteFilesInWorkspace();
        for (const filePath of kiteFiles) {
            if (filePath === currentFilePath) continue;

            const fileContent = ctx.getFileContent(filePath, currentDocUri);
            if (fileContent) {
                const fileUri = URI.file(filePath).toString();
                const fileRegex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g');
                let fileMatch;
                while ((fileMatch = fileRegex.exec(fileContent)) !== null) {
                    if (isInComment(fileContent, fileMatch.index)) continue;

                    const startPos = offsetToPosition(fileContent, fileMatch.index);
                    const endPos = offsetToPosition(fileContent, fileMatch.index + word.length);
                    locations.push(Location.create(fileUri, Range.create(startPos, endPos)));
                }
            }
        }
    }

    return locations;
}

/**
 * Find the scope of a loop variable if the cursor is on one.
 * Returns the scope boundaries where the loop variable is valid.
 *
 * Handles patterns like:
 * - [for x in items: { ... }] - list comprehension
 * - [for env in environments] resource S3.Bucket data { ... } - for-prefixed statement
 */
function findLoopVariableScope(
    text: string,
    cursorOffset: number,
    word: string
): { scopeStart: number; scopeEnd: number } | null {
    // Check if cursor is on a loop variable declaration in a for expression
    // Pattern: [for <variable> in ...
    const forPattern = /\[\s*for\s+(\w+)\s+in\s+/g;
    let forMatch;

    while ((forMatch = forPattern.exec(text)) !== null) {
        const varName = forMatch[1];
        if (varName !== word) continue;

        const varStart = forMatch.index + forMatch[0].indexOf(varName, 5);
        const varEnd = varStart + varName.length;

        // Check if cursor is on this variable declaration
        if (cursorOffset >= varStart && cursorOffset <= varEnd) {
            // Find the scope - look for the closing bracket of the for expression
            const bracketStart = forMatch.index;

            // Check if this is a list comprehension [for x in items: { ... }]
            // or a for-prefixed statement [for x in items] resource ... { }
            const afterFor = text.substring(bracketStart);
            const closingBracketIdx = findMatchingBracket(afterFor, 0);

            if (closingBracketIdx === -1) continue;

            const closingBracketPos = bracketStart + closingBracketIdx;

            // Check what follows the closing bracket
            const afterBracket = text.substring(closingBracketPos + 1).trimStart();

            if (afterBracket.startsWith('resource') || afterBracket.startsWith('component')) {
                // For-prefixed statement: scope is the following resource/component block
                const blockMatch = afterBracket.match(/^(resource|component)\s+\S+\s+\S+\s*\{/);
                if (blockMatch) {
                    const blockStartInAfter = afterBracket.indexOf('{');
                    const blockStartInText = closingBracketPos + 1 + (text.substring(closingBracketPos + 1).indexOf('{'));
                    const scopeEnd = findMatchingBrace(text, blockStartInText);
                    if (scopeEnd !== -1) {
                        return { scopeStart: bracketStart, scopeEnd: scopeEnd + 1 };
                    }
                }
            } else {
                // List comprehension: scope is within the brackets
                return { scopeStart: bracketStart, scopeEnd: closingBracketPos + 1 };
            }
        }
    }

    // Also check if cursor is on a reference to the loop variable within scope
    // We need to find all loop variables and check if cursor is in their scope
    forPattern.lastIndex = 0;
    while ((forMatch = forPattern.exec(text)) !== null) {
        const varName = forMatch[1];
        if (varName !== word) continue;

        const bracketStart = forMatch.index;
        const afterFor = text.substring(bracketStart);
        const closingBracketIdx = findMatchingBracket(afterFor, 0);

        if (closingBracketIdx === -1) continue;

        const closingBracketPos = bracketStart + closingBracketIdx;
        const afterBracket = text.substring(closingBracketPos + 1).trimStart();

        let scopeStart = bracketStart;
        let scopeEnd: number;

        if (afterBracket.startsWith('resource') || afterBracket.startsWith('component')) {
            // For-prefixed statement
            const blockStartInText = closingBracketPos + 1 + (text.substring(closingBracketPos + 1).indexOf('{'));
            const blockEnd = findMatchingBrace(text, blockStartInText);
            if (blockEnd === -1) continue;
            scopeEnd = blockEnd + 1;
        } else {
            // List comprehension
            scopeEnd = closingBracketPos + 1;
        }

        // Check if cursor is within this scope
        if (cursorOffset >= scopeStart && cursorOffset <= scopeEnd) {
            return { scopeStart, scopeEnd };
        }
    }

    return null;
}

/**
 * Find the matching closing bracket for an opening bracket at position 0.
 * Handles nested brackets.
 */
function findMatchingBracket(text: string, startPos: number): number {
    if (text[startPos] !== '[') return -1;

    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = startPos; i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        // Handle string literals
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

        if (char === '[') {
            depth++;
        } else if (char === ']') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }

    return -1;
}

/**
 * Find the matching closing brace for an opening brace.
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
 * Find all references to a word within a specific scope.
 * Handles string interpolation correctly.
 */
function findReferencesInScope(
    text: string,
    word: string,
    scopeStart: number,
    scopeEnd: number,
    docUri: string,
    doc: TextDocument | undefined
): Location[] {
    const locations: Location[] = [];
    const scopeText = text.substring(scopeStart, scopeEnd);
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g');

    let match;
    while ((match = regex.exec(scopeText)) !== null) {
        const offset = scopeStart + match.index;

        // Skip if in comment
        if (isInComment(text, offset)) continue;

        // Check if this is in a regular string literal (not in interpolation)
        if (isInStringLiteral(text, offset) && !isInInterpolation(text, offset)) {
            continue;
        }

        const startPos = doc
            ? doc.positionAt(offset)
            : offsetToPosition(text, offset);
        const endPos = doc
            ? doc.positionAt(offset + word.length)
            : offsetToPosition(text, offset + word.length);

        locations.push(Location.create(docUri, Range.create(startPos, endPos)));
    }

    return locations;
}

/**
 * Check if an offset is inside a string literal.
 */
function isInStringLiteral(text: string, offset: number): boolean {
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < offset; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        if ((char === '"' || char === "'") && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
        }
    }

    return inString;
}

/**
 * Check if an offset is inside a ${...} interpolation within a string.
 */
function isInInterpolation(text: string, offset: number): boolean {
    // Look backwards for ${ that hasn't been closed by }
    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < offset; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';
        const nextChar = i < text.length - 1 ? text[i + 1] : '';

        // Track string state
        if ((char === '"' || char === "'") && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                // Check if we're in an interpolation before ending the string
                if (depth > 0) continue;
                inString = false;
            }
            continue;
        }

        // Only check for interpolation inside double-quoted strings
        if (inString && stringChar === '"') {
            if (char === '$' && nextChar === '{') {
                depth++;
            } else if (char === '}' && depth > 0) {
                depth--;
            }
        }
    }

    return depth > 0;
}
