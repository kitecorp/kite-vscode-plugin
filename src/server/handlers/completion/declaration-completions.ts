/**
 * Declaration completion logic.
 * Provides completions for keywords, types, and declarations.
 */

import {
    CompletionItem,
    CompletionItemKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { BlockContext } from '../../types';
import { KEYWORDS, TYPES } from '../../constants';
import { getCompletionKind } from '../../utils/text-utils';
import { CompletionContext } from './types';

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

        completions.push({
            label: decl.name,
            kind: getCompletionKind(decl.type),
            detail: decl.type + (decl.typeName ? `: ${decl.typeName}` : ''),
            sortText: priority + decl.name
        });
    });
}
