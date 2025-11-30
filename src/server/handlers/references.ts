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
} from '../utils/rename-utils';
import { Declaration, BaseContext } from '../types';
import { offsetToPosition } from '../utils/text-utils';
import {
    parseKite,
    findComponentDefByName,
    findComponentInputAST,
} from '../../parser';

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

                    // Try AST-based lookup first
                    const parseResult = parseKite(fileContent);
                    if (parseResult.tree) {
                        const inputLoc = findComponentInputAST(parseResult.tree, componentTypeName, word);
                        if (inputLoc) {
                            // Found via AST
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

                    // Fallback to regex for partial/invalid files
                    const compDefRegex = new RegExp(`\\bcomponent\\s+${escapeRegex(componentTypeName)}\\s*\\{`);
                    const compDefMatch = compDefRegex.exec(fileContent);

                    if (compDefMatch) {
                        // Found the component definition - find the input/output
                        const braceStart = compDefMatch.index + compDefMatch[0].length - 1;
                        let braceDepth = 1;
                        let pos = braceStart + 1;

                        while (pos < fileContent.length && braceDepth > 0) {
                            if (fileContent[pos] === '{') braceDepth++;
                            else if (fileContent[pos] === '}') braceDepth--;
                            pos++;
                        }

                        const bodyStart = braceStart + 1;
                        const bodyEnd = pos - 1;
                        const bodyText = fileContent.substring(bodyStart, bodyEnd);

                        // Find input/output with this name
                        const fieldRegex = new RegExp(`(?:^|\\n)\\s*(?:input|output)\\s+\\w+(?:\\[\\])?\\s+(${escapeRegex(word)})(?:\\s*=|\\s*$)`, 'm');
                        const fieldMatch = fieldRegex.exec(bodyText);

                        if (fieldMatch) {
                            // Found the field - now do a full rename from the definition
                            const fieldOffset = bodyStart + fieldMatch.index + fieldMatch[0].indexOf(word);

                            const fieldStartPos = doc
                                ? doc.positionAt(fieldOffset)
                                : offsetToPosition(fileContent, fieldOffset);
                            const fieldEndPos = doc
                                ? doc.positionAt(fieldOffset + word.length)
                                : offsetToPosition(fileContent, fieldOffset + word.length);

                            locations.push(Location.create(fileUri, Range.create(fieldStartPos, fieldEndPos)));

                            // Find usages within the component definition
                            const usageRegex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g');
                            let usageMatch;
                            while ((usageMatch = usageRegex.exec(bodyText)) !== null) {
                                const usageOffset = bodyStart + usageMatch.index;
                                if (usageOffset === fieldOffset) continue; // Skip the declaration itself

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
