/**
 * Completion handler for the Kite language server.
 * Provides intelligent code completion with context awareness.
 *
 * This module re-exports functionality from:
 * - types.ts: CompletionContext interface
 * - utils.ts: Helper utilities (isAfterEquals, isInsideNestedStructure, etc.)
 * - decorators.ts: Decorator completion logic
 * - property-access.ts: Property access completions (after dot)
 * - schema-completions.ts: Schema body completions
 * - component-completions.ts: Component definition completions
 * - block-completions.ts: Block body completions (resource/component instantiations)
 * - declaration-completions.ts: Keyword, type, and declaration completions
 */

import {
    CompletionItem,
    CompletionItemKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import * as path from 'path';
import { BlockContext } from '../../types';
import { getCursorContext, isInDecoratorContext, getDotAccessTarget } from '../../../parser';
import { getSnippetCompletions } from './snippets';
import { resolveImportPath } from '../../utils/import-utils';

// Import from modular files
import { CompletionContext } from './types';
import { getDecoratorCompletions } from './decorators';
import { getPropertyAccessCompletions } from './property-access';
import { getSchemaBodyCompletions } from './schema-completions';
import { getComponentDefinitionCompletions } from './component-completions';
import { getBlockBodyCompletions, addContextAwareSuggestions } from './block-completions';
import { addKeywordCompletions, addTypeCompletions, addDeclarationCompletions } from './declaration-completions';
import { getAutoImportCompletions } from './auto-import-completions';
import { getIndexCompletions, isIndexedResource } from '../../utils/indexed-resources';
import { getInstanceNameCompletions } from './instance-name-completions';
import { getStringInterpolationCompletions } from './string-interpolation-completions';

// Re-export types and utilities
export { CompletionContext } from './types';
export { isAfterEquals, isInsideNestedStructure } from './utils';

/**
 * Handle completion request - main entry point called by the language server.
 */
export function handleCompletion(
    document: TextDocument,
    position: Position,
    ctx: CompletionContext
): CompletionItem[] {
    const completions: CompletionItem[] = [];
    const text = document.getText();
    const offset = document.offsetAt(position);
    const uri = document.uri;

    // Get AST-based cursor context
    const cursorCtx = getCursorContext(text, offset);

    // Check if we're after @ (decorator context) - use AST utility
    if (isInDecoratorContext(text, offset)) {
        return getDecoratorCompletions(text, offset);
    }

    // Check if we're in instance name position (after 'resource TypeName ' or 'component TypeName ')
    const instanceNameCompletions = getInstanceNameCompletions(text, offset);
    if (instanceNameCompletions !== null) {
        return instanceNameCompletions;
    }

    // Check if we're after [ (indexed resource access)
    const indexedAccessCompletions = getIndexedResourceAccessCompletions(text, offset, uri, ctx);
    if (indexedAccessCompletions !== null) {
        return indexedAccessCompletions;
    }

    // Check if we're in an import statement symbol position
    const importCompletions = getImportSymbolCompletions(text, offset, uri, ctx);
    if (importCompletions !== null) {
        return importCompletions;
    }

    // Check if we're inside a string interpolation (e.g., "${name.???}")
    const declarations = ctx.getDeclarations(uri) || [];
    const interpCompletions = getStringInterpolationCompletions(text, offset, declarations);
    if (interpCompletions !== null) {
        return interpCompletions;
    }

    // Check if we're after a dot (property access) - use AST utility
    const dotTarget = getDotAccessTarget(text, offset);
    if (dotTarget) {
        return getPropertyAccessCompletions(dotTarget, text, uri, ctx);
    }

    // Check if we're inside a schema body - only show types, not variables/functions/etc
    if (cursorCtx.type === 'schema-body') {
        return getSchemaBodyCompletions(text, offset);
    }

    // Check if we're inside a component definition body
    if (cursorCtx.type === 'component-def-body') {
        return getComponentDefinitionCompletions(text, offset);
    }

    // Find enclosing block context (resource or component we're inside)
    // Use AST context if available, fall back to regex-based detection
    let enclosingBlock: BlockContext | null = null;
    if (cursorCtx.enclosingDeclaration &&
        (cursorCtx.type === 'resource-body' || cursorCtx.type === 'component-inst-body')) {
        enclosingBlock = {
            type: cursorCtx.type === 'resource-body' ? 'resource' : 'component',
            name: cursorCtx.enclosingDeclaration.name,
            typeName: cursorCtx.enclosingDeclaration.typeName || '',
            start: cursorCtx.enclosingDeclaration.bodyStart,
            end: cursorCtx.enclosingDeclaration.bodyEnd,
        };
    } else {
        enclosingBlock = ctx.findEnclosingBlock(text, offset);
    }

    // Use AST-based value context detection
    const isValueContext = cursorCtx.isValueContext;

    // If inside a resource/component body and NOT after '=', show only schema/input properties
    if (enclosingBlock && !isValueContext) {
        const result = getBlockBodyCompletions(text, offset, enclosingBlock, cursorCtx.alreadySetProperties, uri, ctx);
        if (result !== null) {
            return result;
        }
    }

    // Add keywords only if NOT in value context
    if (!isValueContext) {
        addKeywordCompletions(completions);
    }

    // Add types only if NOT in value context (right side of =)
    if (!isValueContext) {
        addTypeCompletions(completions);
    }

    // Add snippet completions at top-level (not inside blocks or in value context)
    if (!isValueContext && !enclosingBlock) {
        const snippets = getSnippetCompletions('top-level');
        completions.push(...snippets);
    }

    // Add declarations from current file (filtered based on context and scope)
    addDeclarationCompletions(completions, document, offset, enclosingBlock, isValueContext, ctx);

    // Add context-aware suggestions at the end for resource/component value context
    if (isValueContext && enclosingBlock) {
        addContextAwareSuggestions(completions, text, offset, enclosingBlock, uri, ctx);
    }

    // Add auto-import completions for symbols from other files
    // Only show in type positions (not in value context like after '=')
    if (!isValueContext) {
        const declarations = ctx.getDeclarations(uri) || [];
        const localNames = new Set(declarations.map(d => d.name));
        const autoImportCompletions = getAutoImportCompletions(text, uri, localNames, ctx);
        completions.push(...autoImportCompletions);
    }

    return completions;
}

/**
 * Get completions for import statement (symbol position or path position).
 * Returns null if not in import context, empty array if in import but no completions.
 */
function getImportSymbolCompletions(
    text: string,
    offset: number,
    currentDocUri: string,
    ctx: CompletionContext
): CompletionItem[] | null {
    // Match: import <symbols> from "path" - with possibly empty/partial path
    const importRegex = /\bimport\s+([\w\s,*]*)\s+from\s+(["'])([^"']*)\2?/g;

    let match;
    while ((match = importRegex.exec(text)) !== null) {
        const importStart = match.index;
        const importEnd = match.index + match[0].length;

        // Check if cursor is within or right after this import statement
        if (offset < importStart || offset > importEnd + 1) {
            continue;
        }

        // Find positions
        const importKeywordEnd = importStart + 'import '.length;
        const fromIndex = text.indexOf(' from ', importStart);
        if (fromIndex === -1) continue;

        const fromKeywordEnd = fromIndex + ' from '.length;
        const quoteChar = match[2];
        const pathStart = fromKeywordEnd + 1; // After opening quote
        const pathContent = match[3];
        const pathEnd = pathStart + pathContent.length;

        // Check if cursor is in the path string (between quotes after 'from')
        if (offset >= pathStart && offset <= pathEnd) {
            return getImportPathCompletions(currentDocUri, ctx);
        }

        // Check if cursor is in the symbol position (between 'import ' and ' from')
        if (offset >= importKeywordEnd && offset <= fromIndex) {
            return getSymbolsFromImportedFile(pathContent, currentDocUri, ctx);
        }
    }

    return null; // Not in import context
}

/**
 * Get file path completions for import statement.
 */
function getImportPathCompletions(
    currentDocUri: string,
    ctx: CompletionContext
): CompletionItem[] {
    const completions: CompletionItem[] = [];
    const currentFilePath = URI.parse(currentDocUri).fsPath;
    const currentDir = path.dirname(currentFilePath);

    const kiteFiles = ctx.findKiteFilesInWorkspace();

    for (const filePath of kiteFiles) {
        // Skip current file
        if (filePath === currentFilePath) {
            continue;
        }

        // Get relative path from current directory
        let relativePath = path.relative(currentDir, filePath);

        // Normalize path separators for display
        relativePath = relativePath.replace(/\\/g, '/');

        completions.push({
            label: relativePath,
            kind: CompletionItemKind.File,
            detail: 'Kite file',
        });
    }

    return completions;
}

/**
 * Resolve import path and get symbols from the file.
 */
function getSymbolsFromImportedFile(
    importPath: string,
    currentDocUri: string,
    ctx: CompletionContext
): CompletionItem[] {
    const completions: CompletionItem[] = [];

    // Resolve import path
    const currentFilePath = URI.parse(currentDocUri).fsPath;
    const currentDir = path.dirname(currentFilePath);
    const resolvedPath = resolveImportPath(importPath, currentDir);

    // Get file content
    const fileContent = ctx.getFileContent(resolvedPath, currentDocUri);
    if (!fileContent) {
        return completions;
    }

    // Extract symbols from the file
    // Schemas
    const schemaRegex = /\bschema\s+(\w+)\s*\{/g;
    let m;
    while ((m = schemaRegex.exec(fileContent)) !== null) {
        completions.push({
            label: m[1],
            kind: CompletionItemKind.Struct,
            detail: 'schema',
        });
    }

    // Components (definitions only - single name before {)
    const componentRegex = /\bcomponent\s+(\w+)\s*\{/g;
    while ((m = componentRegex.exec(fileContent)) !== null) {
        completions.push({
            label: m[1],
            kind: CompletionItemKind.Module,
            detail: 'component',
        });
    }

    // Functions
    const funcRegex = /\bfun\s+(\w+)\s*\(/g;
    while ((m = funcRegex.exec(fileContent)) !== null) {
        completions.push({
            label: m[1],
            kind: CompletionItemKind.Function,
            detail: 'function',
        });
    }

    // Type aliases
    const typeRegex = /\btype\s+(\w+)\s*=/g;
    while ((m = typeRegex.exec(fileContent)) !== null) {
        completions.push({
            label: m[1],
            kind: CompletionItemKind.TypeParameter,
            detail: 'type',
        });
    }

    return completions;
}

/**
 * Get completions for indexed resource access.
 * Triggered when typing `[` after an indexed resource name.
 * Returns null if not in indexed access context, completions array otherwise.
 */
function getIndexedResourceAccessCompletions(
    text: string,
    offset: number,
    currentDocUri: string,
    ctx: CompletionContext
): CompletionItem[] | null {
    // Check if we just typed `[` after an identifier
    if (offset < 2) return null;

    // Look for pattern: identifier[
    const beforeCursor = text.substring(Math.max(0, offset - 100), offset);
    const bracketMatch = beforeCursor.match(/(\w+)\[$/);
    if (!bracketMatch) return null;

    const resourceName = bracketMatch[1];

    // Find the declaration
    const declarations = ctx.getDeclarations(currentDocUri) || [];
    const decl = declarations.find(d => d.name === resourceName);
    if (!decl) return null;

    // Check if it's an indexed resource
    if (!isIndexedResource(decl) || !decl.indexedBy) {
        return null;
    }

    const completions: CompletionItem[] = [];
    const indices = getIndexCompletions(decl);

    indices.forEach((index, i) => {
        completions.push({
            label: index,
            kind: CompletionItemKind.Value,
            detail: `Index for ${resourceName}`,
            sortText: String(i).padStart(4, '0'),
        });
    });

    return completions;
}
