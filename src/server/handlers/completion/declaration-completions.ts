/**
 * Declaration completion logic.
 * Provides completions for keywords, types, and declarations.
 */

import {
    CompletionItem,
    CompletionItemKind,
    InsertTextFormat,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { BlockContext, Declaration } from '../../types';
import { KEYWORDS, TYPES } from '../../constants';
import { getCompletionKind } from '../../utils/text-utils';
import { CompletionContext } from './types';
import { isIndexedResource, getAccessPatternSuggestion } from '../../utils/indexed-resources';

/**
 * Add keyword completions
 */
export function addKeywordCompletions(completions: CompletionItem[]): void {
    KEYWORDS.forEach(kw => {
        completions.push({
            label: kw,
            kind: CompletionItemKind.Keyword,
            detail: 'keyword',
            sortText: '9' + kw
        });
    });
}

/**
 * Add type completions
 */
export function addTypeCompletions(completions: CompletionItem[]): void {
    TYPES.forEach(t => {
        completions.push({
            label: t,
            kind: CompletionItemKind.TypeParameter,
            detail: 'type',
            sortText: '8' + t
        });
        completions.push({
            label: t + '[]',
            kind: CompletionItemKind.TypeParameter,
            detail: 'array type',
            sortText: '8' + t + '[]'
        });
    });
}

/**
 * Add declaration completions from the current file
 */
export function addDeclarationCompletions(
    completions: CompletionItem[],
    document: TextDocument,
    offset: number,
    enclosingBlock: BlockContext | null,
    isValueContext: boolean,
    ctx: CompletionContext
): void {
    const valuePriority: Record<string, string> = {
        'input': '0',
        'variable': '1',
        'for': '1',
        'resource': '2',
        'component': '3',
        'output': '4',
        'function': '5',
        'schema': '6',
        'type': '7'
    };

    const declarations = ctx.getDeclarations(document.uri) || [];
    declarations.forEach(decl => {
        // Skip outputs from the same enclosing block
        if (enclosingBlock && decl.type === 'output') {
            const outputOffset = document.offsetAt(decl.range.start);
            if (outputOffset >= enclosingBlock.start && outputOffset <= enclosingBlock.end) {
                return;
            }
        }

        // Scope filtering for variables
        if ((decl.type === 'variable' || decl.type === 'for') &&
            decl.scopeStart !== undefined && decl.scopeEnd !== undefined) {
            if (offset < decl.scopeStart || offset > decl.scopeEnd) {
                return;
            }
        }

        const priority = isValueContext ? (valuePriority[decl.type] || '9') : '';

        // Build detail text
        let detail = decl.type + (decl.typeName ? `: ${decl.typeName}` : '');
        const accessPattern = getAccessPatternSuggestion(decl);
        if (accessPattern) {
            detail += ` (indexed)`;
        }

        // Add base completion
        completions.push({
            label: decl.name,
            kind: getCompletionKind(decl.type),
            detail,
            documentation: accessPattern || undefined,
            sortText: priority + decl.name
        });

        // For indexed resources in value context, also add indexed access completions
        if (isValueContext && isIndexedResource(decl)) {
            addIndexedAccessCompletions(completions, decl, priority);
        }
    });
}

/**
 * Add indexed access completions for an indexed resource/component.
 * Adds completions like `server[0]`, `server[1]`, or `data["prod"]`.
 */
function addIndexedAccessCompletions(
    completions: CompletionItem[],
    decl: Declaration,
    priority: string
): void {
    if (!decl.indexedBy) return;

    const info = decl.indexedBy;

    if (info.indexType === 'numeric') {
        // Add numeric index completions
        const indices = getNumericIndices(info);
        indices.forEach((index, i) => {
            completions.push({
                label: `${decl.name}[${index}]`,
                kind: getCompletionKind(decl.type),
                detail: `${decl.type} instance #${index}`,
                sortText: priority + decl.name + String(i).padStart(4, '0'),
            });
        });
    } else {
        // Add string key completions
        if (info.stringKeys && info.stringKeys.length > 0) {
            info.stringKeys.forEach((key, i) => {
                completions.push({
                    label: `${decl.name}["${key}"]`,
                    kind: getCompletionKind(decl.type),
                    detail: `${decl.type} instance "${key}"`,
                    sortText: priority + decl.name + String(i).padStart(4, '0'),
                });
            });
        }
    }
}

/**
 * Get numeric indices for an indexed resource
 */
function getNumericIndices(info: Declaration['indexedBy']): number[] {
    if (!info) return [];

    if (info.countValue !== undefined) {
        return Array.from({ length: info.countValue }, (_, i) => i);
    }

    if (info.rangeStart !== undefined && info.rangeEnd !== undefined) {
        const indices: number[] = [];
        for (let i = info.rangeStart; i < info.rangeEnd; i++) {
            indices.push(i);
        }
        return indices;
    }

    // Default: suggest first few indices
    return [0, 1, 2];
}
