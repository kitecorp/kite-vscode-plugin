/**
 * Decorator completion logic.
 * Provides completions for @decorator context.
 */

import {
    CompletionItem,
    CompletionItemKind,
    MarkupKind,
    InsertTextFormat,
} from 'vscode-languageserver/node';
import { DecoratorInfo, DecoratorTarget } from '../../types';
import { DECORATORS } from '../../constants';

/**
 * Get completions for decorator context (after @)
 */
export function getDecoratorCompletions(text: string, offset: number): CompletionItem[] {
    const completions: CompletionItem[] = [];
    const context = getDecoratorContext(text, offset);

    // Filter decorators that apply to the current context, then sort by sortOrder
    const applicableDecorators = DECORATORS
        .filter(dec => decoratorAppliesToTarget(dec, context))
        .sort((a, b) => a.sortOrder - b.sortOrder);

    applicableDecorators.forEach((dec, index) => {
        // Build detailed documentation for second Ctrl+Space
        let docContent = '';
        if (dec.argument) {
            docContent += `**Argument:** ${dec.argument}\n\n`;
        }
        if (dec.targets) {
            docContent += `**Targets:** ${dec.targets}\n\n`;
        }
        if (dec.appliesTo) {
            docContent += `**Applies to:** ${dec.appliesTo}\n\n`;
        }
        docContent += '```kite\n' + dec.example + '\n```';

        const item: CompletionItem = {
            label: dec.argHint ? `${dec.name}${dec.argHint}` : dec.name,
            kind: CompletionItemKind.Event,
            detail: dec.description,
            sortText: String(index).padStart(3, '0'),
            filterText: dec.name,
            documentation: {
                kind: MarkupKind.Markdown,
                value: docContent
            }
        };

        if (dec.snippet) {
            item.insertText = dec.snippet;
            item.insertTextFormat = InsertTextFormat.Snippet;
            item.commitCharacters = ['('];
        } else {
            item.insertText = dec.name;
        }

        completions.push(item);
    });

    return completions;
}

/**
 * Detect decorator context for prioritization
 */
export function getDecoratorContext(text: string, offset: number): DecoratorTarget {
    let lookAhead = text.substring(offset, Math.min(text.length, offset + 300));
    lookAhead = lookAhead.replace(/^\w*/, '');
    lookAhead = lookAhead.replace(/^(\s*\n?\s*@\w+(\([^)]*\))?\s*)+/, '');

    if (/^\s*input\s+/.test(lookAhead)) {
        return 'input';
    } else if (/^\s*output\s+/.test(lookAhead)) {
        return 'output';
    } else if (/^\s*resource\s+/.test(lookAhead)) {
        return 'resource';
    } else if (/^\s*component\s+\w+\s*\{/.test(lookAhead)) {
        return 'component';
    } else if (/^\s*schema\s+/.test(lookAhead)) {
        return 'schema';
    } else if (/^\s*var\s+/.test(lookAhead)) {
        return 'var';
    } else if (/^\s*fun\s+/.test(lookAhead)) {
        return 'fun';
    }

    // Check if we're inside a schema (for schema property)
    const beforeCursor = text.substring(Math.max(0, offset - 500), offset);
    if (/schema\s+\w+\s*\{[^}]*$/.test(beforeCursor)) {
        return 'schema property';
    }

    return null;
}

/**
 * Check if decorator applies to target
 */
export function decoratorAppliesToTarget(dec: DecoratorInfo, target: DecoratorTarget): boolean {
    if (!target || !dec.targets) return true; // No filtering if unknown context

    const targets = dec.targets.toLowerCase();

    // Handle special cases
    switch (target) {
        case 'input':
            return targets.includes('input') || targets.includes('any');
        case 'output':
            return targets.includes('output') || targets.includes('any');
        case 'resource':
            return targets.includes('resource') || targets.includes('schema') || targets.includes('any');
        case 'component':
            return targets.includes('component') || targets.includes('any');
        case 'schema':
            return targets.includes('schema') || targets.includes('any');
        case 'struct':
            return targets.includes('struct') || targets.includes('any');
        case 'var':
            return targets.includes('var') || targets.includes('any');
        case 'fun':
            return targets.includes('fun') || targets.includes('function') || targets.includes('any');
        case 'schema property':
            return targets.includes('property') || targets.includes('any');
        case 'struct property':
            return targets.includes('property') || targets.includes('any');
        default:
            return true;
    }
}
