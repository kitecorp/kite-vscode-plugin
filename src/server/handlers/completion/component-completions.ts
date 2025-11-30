/**
 * Component definition completion logic.
 * Provides completions inside component definitions.
 */

import {
    CompletionItem,
    CompletionItemKind,
} from 'vscode-languageserver/node';
import { TYPES } from '../../constants';
import { addNumberSuggestions, addStringSuggestions } from './devops-suggestions';
import { getSnippetCompletions } from './snippets';
import { isAfterEquals } from './utils';

/**
 * Get completions inside component definition body
 */
export function getComponentDefinitionCompletions(text: string, offset: number): CompletionItem[] {
    const completions: CompletionItem[] = [];
    const isValueContext = isAfterEquals(text, offset);

    if (isValueContext) {
        return getComponentDefaultValueCompletions(text, offset);
    } else {
        // Before '=' in component definition - show keywords for input/output declarations
        ['input', 'output', 'var', 'resource', 'component'].forEach(kw => {
            completions.push({ label: kw, kind: CompletionItemKind.Keyword, detail: 'keyword' });
        });
        TYPES.forEach(t => {
            completions.push({ label: t, kind: CompletionItemKind.TypeParameter, detail: 'type' });
        });

        // Add component body snippets
        const snippets = getSnippetCompletions('component-body');
        completions.push(...snippets);
    }

    return completions;
}

/**
 * Get completions for default values in component definitions
 */
export function getComponentDefaultValueCompletions(text: string, offset: number): CompletionItem[] {
    const completions: CompletionItem[] = [];
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineText = text.substring(lineStart, offset);

    const propMatch = lineText.match(/^\s*(?:input|output)\s+(\w+(?:\[\])?)\s+\w+\s*=\s*$/);
    const propType = propMatch ? propMatch[1] : null;

    const propNameMatch = lineText.match(/^\s*(?:input|output)\s+\w+(?:\[\])?\s+(\w+)\s*=\s*$/);
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
