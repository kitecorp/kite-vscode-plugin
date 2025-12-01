/**
 * Property access completion logic.
 * Provides completions after dot (e.g., instance.property).
 */

import {
    CompletionItem,
    CompletionItemKind,
} from 'vscode-languageserver/node';
import { OutputInfo } from '../../types';
import { escapeRegex } from '../../utils/text-utils';
import { extractSchemaPropertyTypes, InlayHintContext } from '../inlay-hints';
import { CompletionContext } from './types';
import { extractPropertiesFromBody } from './utils';

/**
 * Get completions for property access (after dot)
 */
export function getPropertyAccessCompletions(
    objectName: string,
    text: string,
    uri: string,
    ctx: CompletionContext
): CompletionItem[] {
    const completions: CompletionItem[] = [];
    const declarations = ctx.getDeclarations(uri) || [];
    const decl = declarations.find(d => d.name === objectName);

    if (decl) {
        if (decl.type === 'resource' && decl.schemaName) {
            const bodyProps = new Set(extractPropertiesFromBody(text, decl.name));
            const inlayCtx: InlayHintContext = {
                findKiteFilesInWorkspace: ctx.findKiteFilesInWorkspace,
                getFileContent: ctx.getFileContent
            };
            const schemaProps = extractSchemaPropertyTypes(text, decl.schemaName, inlayCtx, uri);

            // First add set properties (from resource body) - shown first with indicator
            bodyProps.forEach(prop => {
                const propType = schemaProps[prop] || 'any';
                completions.push({
                    label: prop,
                    kind: CompletionItemKind.Property,
                    detail: `● ${propType} (set)`,
                    sortText: '0' + prop,
                    labelDetails: { description: '●' }
                });
            });

            // Then add unset schema properties
            for (const [propName, propType] of Object.entries(schemaProps)) {
                if (!bodyProps.has(propName)) {
                    completions.push({
                        label: propName,
                        kind: CompletionItemKind.Property,
                        detail: propType,
                        sortText: '1' + propName
                    });
                }
            }
        } else if (decl.type === 'component' && decl.componentType) {
            const outputs = extractComponentOutputs(text, decl.componentType, ctx);
            outputs.forEach(output => {
                completions.push({
                    label: output.name,
                    kind: CompletionItemKind.Property,
                    detail: `output: ${output.type}`
                });
            });
        }
    }

    return completions;
}

/**
 * Extract component outputs from a component definition
 */
export function extractComponentOutputs(
    text: string,
    componentTypeName: string,
    ctx: CompletionContext
): OutputInfo[] {
    const outputs: OutputInfo[] = [];

    // Try local file first
    const componentRegex = new RegExp(`\\bcomponent\\s+${escapeRegex(componentTypeName)}\\s*\\{`, 'g');
    let match = componentRegex.exec(text);

    if (!match) {
        // Search in other files
        const kiteFiles = ctx.findKiteFilesInWorkspace();
        for (const filePath of kiteFiles) {
            const fileContent = ctx.getFileContent(filePath);
            if (fileContent) {
                match = componentRegex.exec(fileContent);
                if (match) {
                    text = fileContent;
                    break;
                }
            }
        }
    }

    if (!match) return outputs;

    const braceStart = match.index + match[0].length - 1;
    let depth = 1;
    let pos = braceStart + 1;

    while (pos < text.length && depth > 0) {
        if (text[pos] === '{') depth++;
        else if (text[pos] === '}') depth--;
        pos++;
    }

    const bodyText = text.substring(braceStart + 1, pos - 1);
    const outputRegex = /output\s+(\w+(?:\[\])?)\s+(\w+)(?:\s*=\s*[^\n]+)?/g;
    let outputMatch;

    while ((outputMatch = outputRegex.exec(bodyText)) !== null) {
        outputs.push({
            name: outputMatch[2],
            type: outputMatch[1]
        });
    }

    return outputs;
}
