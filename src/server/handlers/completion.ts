/**
 * Completion handler for the Kite language server.
 * Provides intelligent code completion with context awareness.
 */

import {
    CompletionItem,
    CompletionItemKind,
    MarkupKind,
    InsertTextFormat,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver/node';
import { Declaration, DecoratorInfo, DecoratorTarget, BlockContext, OutputInfo, BaseContext } from '../types';
import { KEYWORDS, TYPES, DECORATORS } from '../constants';
import { getCompletionKind } from '../utils/text-utils';
import { extractSchemaPropertyTypes, extractComponentInputTypes, InlayHintContext } from './inlay-hints';
import { addNumberSuggestions, addStringSuggestions, getNumberSuggestionsForProp, getStringSuggestionsForProp } from './devops-suggestions';
import { getCursorContext, isInDecoratorContext, getDotAccessTarget } from '../../parser';
import { escapeRegex } from '../utils/rename-utils';
import { getSnippetCompletions } from './snippets';

/**
 * Context interface for dependency injection into completion handler.
 */
export interface CompletionContext extends BaseContext {
    /** Find enclosing block (resource or component) */
    findEnclosingBlock: (text: string, offset: number) => BlockContext | null;
}

/**
 * Handle completion request
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

/**
 * Get completions for decorator context (after @)
 */
function getDecoratorCompletions(text: string, offset: number): CompletionItem[] {
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
 * Get completions for property access (after dot)
 */
function getPropertyAccessCompletions(
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
 * Get completions inside schema body
 */
function getSchemaBodyCompletions(text: string, offset: number): CompletionItem[] {
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
function getSchemaDefaultValueCompletions(text: string, offset: number): CompletionItem[] {
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

/**
 * Get completions inside component definition body
 */
function getComponentDefinitionCompletions(text: string, offset: number): CompletionItem[] {
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
function getComponentDefaultValueCompletions(text: string, offset: number): CompletionItem[] {
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

/**
 * Get completions inside resource/component block body
 */
function getBlockBodyCompletions(
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
        const schemaProps = extractSchemaPropertyTypes(text, enclosingBlock.typeName, inlayCtx, uri);
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
 * Add keyword completions
 */
function addKeywordCompletions(completions: CompletionItem[]): void {
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
function addTypeCompletions(completions: CompletionItem[]): void {
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
 * Add declaration completions
 */
function addDeclarationCompletions(
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

/**
 * Add context-aware suggestions for value context
 */
function addContextAwareSuggestions(
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

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Detect decorator context for prioritization
 */
function getDecoratorContext(text: string, offset: number): DecoratorTarget {
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
function decoratorAppliesToTarget(dec: DecoratorInfo, target: DecoratorTarget): boolean {
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
        case 'var':
            return targets.includes('var') || targets.includes('any');
        case 'fun':
            return targets.includes('fun') || targets.includes('function') || targets.includes('any');
        case 'schema property':
            return targets.includes('property') || targets.includes('any');
        default:
            return true;
    }
}

/**
 * Check if cursor is after '=' sign (assignment, not comparison)
 */
export function isAfterEquals(text: string, offset: number): boolean {
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineBeforeCursor = text.substring(lineStart, offset);

    const equalsIndex = lineBeforeCursor.indexOf('=');
    if (equalsIndex === -1) return false;

    // Check it's not ==, !=, <=, or >=
    const charBefore = lineBeforeCursor[equalsIndex - 1];
    const charAfter = lineBeforeCursor[equalsIndex + 1];
    if (charBefore === '=' || charBefore === '!' || charBefore === '<' || charBefore === '>') {
        return false;
    }
    if (charAfter === '=') {
        return false;
    }

    const afterEquals = lineBeforeCursor.substring(equalsIndex + 1).trim();
    return afterEquals === '' || /^[\w"'\[\{]/.test(afterEquals) === false;
}

/**
 * Check if cursor is inside a nested structure
 */
export function isInsideNestedStructure(text: string, blockStart: number, cursorOffset: number): boolean {
    const bodyText = text.substring(blockStart, cursorOffset);
    let braceDepth = 0;
    let bracketDepth = 0;

    for (let i = 0; i < bodyText.length; i++) {
        const char = bodyText[i];
        if (char === '{') braceDepth++;
        else if (char === '}') braceDepth--;
        else if (char === '[') bracketDepth++;
        else if (char === ']') bracketDepth--;
    }

    return braceDepth > 1 || bracketDepth > 0;
}

/**
 * Extract component outputs
 */
function extractComponentOutputs(
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

/**
 * Extract properties from body
 */
function extractPropertiesFromBody(text: string, declarationName: string): string[] {
    const properties: string[] = [];

    const regex = new RegExp(`\\b(?:resource|component)\\s+\\w+\\s+${escapeRegex(declarationName)}\\s*\\{`, 'g');
    const match = regex.exec(text);
    if (!match) return properties;

    const braceStart = match.index + match[0].length - 1;
    const braceEnd = findMatchingBraceForCompletion(text, braceStart);
    if (braceEnd === -1) return properties;

    const bodyText = text.substring(braceStart + 1, braceEnd);
    const propRegex = /^\s*(\w+)\s*=/gm;
    let propMatch;

    while ((propMatch = propRegex.exec(bodyText)) !== null) {
        properties.push(propMatch[1]);
    }

    return properties;
}

/**
 * Find matching brace for completion
 */
function findMatchingBraceForCompletion(text: string, openBracePos: number): number {
    let depth = 1;
    let pos = openBracePos + 1;

    while (pos < text.length && depth > 0) {
        if (text[pos] === '{') depth++;
        else if (text[pos] === '}') depth--;
        pos++;
    }

    return depth === 0 ? pos - 1 : -1;
}

