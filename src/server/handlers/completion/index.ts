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
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver/node';
import { BlockContext } from '../../types';
import { getCursorContext, isInDecoratorContext, getDotAccessTarget } from '../../../parser';
import { getSnippetCompletions } from './snippets';

// Import from modular files
import { CompletionContext } from './types';
import { getDecoratorCompletions } from './decorators';
import { getPropertyAccessCompletions } from './property-access';
import { getSchemaBodyCompletions } from './schema-completions';
import { getComponentDefinitionCompletions } from './component-completions';
import { getBlockBodyCompletions, addContextAwareSuggestions } from './block-completions';
import { addKeywordCompletions, addTypeCompletions, addDeclarationCompletions } from './declaration-completions';

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

    return completions;
}
