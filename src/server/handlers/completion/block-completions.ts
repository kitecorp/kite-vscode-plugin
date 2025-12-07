/**
 * Block body completion logic.
 * Provides completions inside resource/component instantiation bodies.
 */

import {
    CompletionItem,
    CompletionItemKind,
} from 'vscode-languageserver/node';
import { BlockContext } from '../../types';
import { extractSchemaPropertyTypes, extractSchemaPropertyTypesForCompletion, extractComponentInputTypes, InlayHintContext } from '../inlay-hints';
import { getNumberSuggestionsForProp, getStringSuggestionsForProp } from './devops-suggestions';
import { CompletionContext } from './types';
import { isInsideNestedStructure } from './utils';

/**
 * Get completions inside resource/component block body
 */
export function getBlockBodyCompletions(
    text: string,
    offset: number,
    enclosingBlock: BlockContext,
    alreadySet: Set<string>,
    uri: string,
    ctx: CompletionContext
): CompletionItem[] | null {
    // Check if we're on a line that already has a property assignment started
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineBeforeCursor = text.substring(lineStart, offset);
    const isStartOfProperty = /^\s*\w*$/.test(lineBeforeCursor);

    // Check if we're inside a nested structure
    const isInsideNestedValue = isInsideNestedStructure(text, enclosingBlock.start, offset);

    if (isInsideNestedValue) {
        return [];
    }

    if (!isStartOfProperty) {
        return [];
    }

    const completions: CompletionItem[] = [];
    const inlayCtx: InlayHintContext = {
        findKiteFilesInWorkspace: ctx.findKiteFilesInWorkspace,
        getFileContent: ctx.getFileContent
    };

    if (enclosingBlock.type === 'resource') {
        // Use ForCompletion variant to exclude @cloud properties (they are set by cloud provider)
        const schemaProps = extractSchemaPropertyTypesForCompletion(text, enclosingBlock.typeName, inlayCtx, uri);
        for (const [propName, propType] of Object.entries(schemaProps)) {
            if (!alreadySet.has(propName)) {
                completions.push({
                    label: propName,
                    kind: CompletionItemKind.Property,
                    detail: propType,
                    insertText: `${propName} = `
                });
            }
        }
        return completions;
    } else if (enclosingBlock.type === 'component') {
        const inputTypes = extractComponentInputTypes(text, enclosingBlock.typeName, inlayCtx, uri);
        for (const [inputName, inputType] of Object.entries(inputTypes)) {
            if (!alreadySet.has(inputName)) {
                completions.push({
                    label: inputName,
                    kind: CompletionItemKind.Property,
                    detail: inputType,
                    insertText: `${inputName} = `
                });
            }
        }
        return completions;
    }

    return null; // Fall through to general completions
}

/**
 * Add context-aware suggestions for value context in resource/component bodies
 */
export function addContextAwareSuggestions(
    completions: CompletionItem[],
    text: string,
    offset: number,
    enclosingBlock: BlockContext,
    uri: string,
    ctx: CompletionContext
): void {
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineText = text.substring(lineStart, offset);

    const propNameMatch = lineText.match(/^\s*(\w+)\s*=\s*$/);
    if (!propNameMatch) return;

    const propName = propNameMatch[1].toLowerCase();
    const inlayCtx: InlayHintContext = {
        findKiteFilesInWorkspace: ctx.findKiteFilesInWorkspace,
        getFileContent: ctx.getFileContent
    };

    let propType: string | null = null;
    if (enclosingBlock.type === 'resource') {
        const schemaProps = extractSchemaPropertyTypes(text, enclosingBlock.typeName, inlayCtx, uri);
        propType = schemaProps[propNameMatch[1]] || null;
    } else if (enclosingBlock.type === 'component') {
        const inputTypes = extractComponentInputTypes(text, enclosingBlock.typeName, inlayCtx, uri);
        propType = inputTypes[propNameMatch[1]] || null;
    }

    const contextSuggestions: { value: string; desc: string }[] = [];

    if (propType === 'boolean') {
        contextSuggestions.push({ value: 'true', desc: 'boolean' });
        contextSuggestions.push({ value: 'false', desc: 'boolean' });
    } else if (propType === 'number') {
        const numSuggestions = getNumberSuggestionsForProp(propName);
        if (numSuggestions) {
            contextSuggestions.push(...numSuggestions);
        }
    } else if (propType === 'string') {
        const strSuggestions = getStringSuggestionsForProp(propName);
        if (strSuggestions) {
            contextSuggestions.push(...strSuggestions);
        }
    }

    contextSuggestions.forEach((s, index) => {
        completions.push({
            label: s.value,
            kind: CompletionItemKind.Value,
            detail: `💡 ${s.desc}`,
            sortText: '8' + String(index).padStart(2, '0'),
            insertText: s.value
        });
    });
}
