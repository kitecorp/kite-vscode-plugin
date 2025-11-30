/**
 * Schema body completion logic.
 * Provides completions inside schema definitions.
 */

import {
    CompletionItem,
    CompletionItemKind,
} from 'vscode-languageserver/node';
import { TYPES } from '../../constants';
import { addNumberSuggestions, addStringSuggestions } from './devops-suggestions';
import { isAfterEquals } from './utils';

/**
 * Get completions inside schema body
 */
export function getSchemaBodyCompletions(text: string, offset: number): CompletionItem[] {
    const completions: CompletionItem[] = [];
    const isValueContext = isAfterEquals(text, offset);

    if (isValueContext) {
        return getSchemaDefaultValueCompletions(text, offset);
    } else {
        // Before '=' in schema - show types for property declarations
        TYPES.forEach(t => {
            completions.push({ label: t, kind: CompletionItemKind.TypeParameter, detail: 'type' });
            completions.push({ label: t + '[]', kind: CompletionItemKind.TypeParameter, detail: 'array type' });
        });
    }

    return completions;
}

/**
 * Get completions for default values in schema definitions
 */
export function getSchemaDefaultValueCompletions(text: string, offset: number): CompletionItem[] {
    const completions: CompletionItem[] = [];
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineText = text.substring(lineStart, offset);

    const propMatch = lineText.match(/^\s*(\w+(?:\[\])?)\s+\w+\s*=\s*$/);
    const propType = propMatch ? propMatch[1] : null;

    const propNameMatch = lineText.match(/^\s*\w+(?:\[\])?\s+(\w+)\s*=\s*$/);
    const propName = propNameMatch ? propNameMatch[1].toLowerCase() : '';

    if (propType === 'boolean') {
        completions.push({ label: 'true', kind: CompletionItemKind.Value, detail: 'boolean' });
        completions.push({ label: 'false', kind: CompletionItemKind.Value, detail: 'boolean' });
    } else if (propType === 'number') {
        addNumberSuggestions(completions, propName);
    } else if (propType === 'string') {
        addStringSuggestions(completions, propName);
    }

    return completions;
}
