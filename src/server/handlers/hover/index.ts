/**
 * Hover handler for the Kite language server.
 * Provides hover documentation for symbols.
 */

import {
    Hover,
    MarkupKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver/node';
import { Declaration } from '../../types';
import { KEYWORDS, TYPES } from '../../constants';
import { getWordAtPosition } from '../../utils/text-utils';

/**
 * Handle hover request
 */
export function handleHover(
    document: TextDocument,
    position: Position,
    declarations: Declaration[]
): Hover | null {
    const word = getWordAtPosition(document, position);
    if (!word) return null;

    // Check if it's a keyword
    if (KEYWORDS.includes(word)) {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `**keyword** \`${word}\``
            }
        };
    }

    // Check if it's a type
    if (TYPES.includes(word)) {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `**type** \`${word}\``
            }
        };
    }

    // Check declarations
    const decl = declarations.find(d => d.name === word);

    if (decl) {
        let content = `**${decl.type}** \`${decl.name}\``;
        if (decl.typeName) {
            content += `\n\nType: \`${decl.typeName}\``;
        }
        if (decl.schemaName) {
            content += `\n\nSchema: \`${decl.schemaName}\``;
        }
        if (decl.componentType) {
            content += `\n\nComponent Type: \`${decl.componentType}\``;
        }
        if (decl.documentation) {
            content += `\n\n${decl.documentation}`;
        }

        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: content
            }
        };
    }

    return null;
}
