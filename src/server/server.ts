import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    InitializeResult,
    TextDocumentSyncKind,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    Definition,
    Location,
    Hover,
    MarkupKind,
    Range,
    Position,
    InsertTextFormat,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

// Create a connection for the server using Node's IPC
const connection = createConnection(ProposedFeatures.all);

// Create a text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Declaration types in Kite
type DeclarationType = 'variable' | 'input' | 'output' | 'resource' | 'component' | 'schema' | 'function' | 'type' | 'for';

// Represents a declaration found in a Kite file
interface Declaration {
    name: string;
    type: DeclarationType;
    typeName?: string;         // For var/input/output: the type (string, number, etc.)
    schemaName?: string;       // For resource: the schema type
    componentType?: string;    // For component: the type name
    range: Range;
    nameRange: Range;          // Range of just the name identifier
    uri: string;
    documentation?: string;
}

// Cache of declarations per document
const declarationCache: Map<string, Declaration[]> = new Map();

connection.onInitialize((_params: InitializeParams): InitializeResult => {
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: ['.', '@']
            },
            definitionProvider: true,
            referencesProvider: true,
            hoverProvider: true,
        }
    };
});

// Scan document for declarations when it changes
documents.onDidChangeContent(change => {
    const declarations = scanDocument(change.document);
    declarationCache.set(change.document.uri, declarations);
});

documents.onDidClose(e => {
    declarationCache.delete(e.document.uri);
});

// Keywords for completion
const KEYWORDS = [
    'resource', 'component', 'schema', 'input', 'output',
    'if', 'else', 'while', 'for', 'in', 'return',
    'import', 'from', 'fun', 'var', 'type', 'init', 'this',
    'true', 'false', 'null'
];

const TYPES = ['string', 'number', 'boolean', 'any', 'object', 'void'];

// Built-in decorators with descriptions (from DECORATORS.md)
interface DecoratorInfo {
    name: string;
    category: 'validation' | 'resource' | 'metadata';
    description: string;
    example: string;
    snippet?: string;      // Snippet with placeholder, e.g., "minValue($1)"
    argHint?: string;      // Argument hint, e.g., "(n)" or "(regex)"
    sortOrder: number;     // For sorting within category
}

const DECORATORS: DecoratorInfo[] = [
    // Validation decorators (sortOrder 0-99)
    { name: 'allowed', category: 'validation', description: 'Whitelist of allowed values', example: '@allowed(["dev", "prod"])', snippet: 'allowed([$1])', argHint: '([values])', sortOrder: 0 },
    { name: 'minValue', category: 'validation', description: 'Minimum value for numbers/arrays', example: '@minValue(1)', snippet: 'minValue($1)', argHint: '(n)', sortOrder: 1 },
    { name: 'maxValue', category: 'validation', description: 'Maximum value for numbers/arrays', example: '@maxValue(100)', snippet: 'maxValue($1)', argHint: '(n)', sortOrder: 2 },
    { name: 'minLength', category: 'validation', description: 'Minimum length for strings/arrays', example: '@minLength(3)', snippet: 'minLength($1)', argHint: '(n)', sortOrder: 3 },
    { name: 'maxLength', category: 'validation', description: 'Maximum length for strings/arrays', example: '@maxLength(255)', snippet: 'maxLength($1)', argHint: '(n)', sortOrder: 4 },
    { name: 'validate', category: 'validation', description: 'Custom validation with regex', example: '@validate(regex: "^[a-z]+$")', snippet: 'validate(regex: "$1")', argHint: '(regex)', sortOrder: 5 },
    { name: 'nonEmpty', category: 'validation', description: 'Ensures strings/arrays are not empty', example: '@nonEmpty', sortOrder: 6 },
    { name: 'unique', category: 'validation', description: 'Ensures array elements are unique', example: '@unique', sortOrder: 7 },
    // Resource decorators (sortOrder 100-199)
    { name: 'existing', category: 'resource', description: 'Reference existing cloud resources', example: '@existing', sortOrder: 100 },
    { name: 'sensitive', category: 'resource', description: 'Mark sensitive data', example: '@sensitive', sortOrder: 101 },
    { name: 'cloud', category: 'resource', description: 'Property is set by cloud provider', example: '@cloud', sortOrder: 102 },
    { name: 'dependsOn', category: 'resource', description: 'Explicit dependency declaration', example: '@dependsOn(["vpc"])', snippet: 'dependsOn([$1])', argHint: '([resources])', sortOrder: 103 },
    { name: 'tags', category: 'resource', description: 'Add cloud provider tags', example: '@tags({env: "prod"})', snippet: 'tags({$1})', argHint: '({key: value})', sortOrder: 104 },
    { name: 'provisionOn', category: 'resource', description: 'Target specific cloud providers', example: '@provisionOn(["aws"])', snippet: 'provisionOn([$1])', argHint: '([providers])', sortOrder: 105 },
    // Metadata decorators (sortOrder 200-299)
    { name: 'description', category: 'metadata', description: 'Documentation for inputs/outputs', example: '@description("Port number")', snippet: 'description("$1")', argHint: '("text")', sortOrder: 200 },
    { name: 'count', category: 'metadata', description: 'Create N instances (injects $count)', example: '@count(3)', snippet: 'count($1)', argHint: '(n)', sortOrder: 201 },
];

// Completion handler
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const completions: CompletionItem[] = [];
    const text = document.getText();
    const offset = document.offsetAt(params.position);
    const beforeCursor = text.substring(Math.max(0, offset - 100), offset);

    // Check if we're after @ (decorator context)
    if (beforeCursor.match(/@\s*\w*$/)) {
        // Detect context for prioritization
        const context = getDecoratorContext(text, offset);

        // Sort decorators: prioritize by context, then by sortOrder
        const sortedDecorators = [...DECORATORS].sort((a, b) => {
            // Prioritize decorators matching the context
            const aContextMatch = context && a.category === context ? -1000 : 0;
            const bContextMatch = context && b.category === context ? -1000 : 0;
            return (a.sortOrder + aContextMatch) - (b.sortOrder + bContextMatch);
        });

        sortedDecorators.forEach((dec, index) => {
            const item: CompletionItem = {
                label: dec.argHint ? `${dec.name}${dec.argHint}` : dec.name,
                kind: CompletionItemKind.Event,
                detail: dec.description,
                sortText: String(index).padStart(3, '0'), // Preserve our sort order
                filterText: dec.name, // Filter by name only, not argHint
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: dec.example
                }
            };

            // Use snippet if available, otherwise plain text
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

    // Check if we're after a dot (property access)
    const dotMatch = beforeCursor.match(/(\w+)\.\s*$/);

    if (dotMatch) {
        // Property access completion
        const objectName = dotMatch[1];
        const declarations = declarationCache.get(params.textDocument.uri) || [];
        const decl = declarations.find(d => d.name === objectName);

        if (decl) {
            // Add properties based on declaration type
            if (decl.type === 'resource' || decl.type === 'component') {
                // For resources/components, suggest properties from their body
                const bodyProps = extractPropertiesFromBody(text, decl.name);
                bodyProps.forEach(prop => {
                    completions.push({
                        label: prop,
                        kind: CompletionItemKind.Property,
                        detail: 'property'
                    });
                });
            }
        }
        return completions;
    }

    // Find enclosing block context (resource or component we're inside)
    const enclosingBlock = findEnclosingBlock(text, offset);

    // Check if we're after '=' (value context - types should not be shown)
    const isValueContext = isAfterEquals(text, offset);

    // Add keywords
    KEYWORDS.forEach(kw => {
        completions.push({
            label: kw,
            kind: CompletionItemKind.Keyword,
            detail: 'keyword'
        });
    });

    // Add types only if NOT in value context (right side of =)
    if (!isValueContext) {
        TYPES.forEach(t => {
            completions.push({
                label: t,
                kind: CompletionItemKind.TypeParameter,
                detail: 'type'
            });
            completions.push({
                label: t + '[]',
                kind: CompletionItemKind.TypeParameter,
                detail: 'array type'
            });
        });
    }

    // Add declarations from current file (filtered based on context)
    const declarations = declarationCache.get(params.textDocument.uri) || [];
    declarations.forEach(decl => {
        // Skip outputs from the same enclosing block
        if (enclosingBlock && decl.type === 'output') {
            // Check if this output is defined inside the same block we're in
            const outputOffset = document.offsetAt(decl.range.start);
            if (outputOffset >= enclosingBlock.start && outputOffset <= enclosingBlock.end) {
                return; // Skip - this output is from the same block
            }
        }

        completions.push({
            label: decl.name,
            kind: getCompletionKind(decl.type),
            detail: decl.type + (decl.typeName ? `: ${decl.typeName}` : '')
        });
    });

    return completions;
});

// Helper: Detect decorator context for prioritization
function getDecoratorContext(text: string, offset: number): 'validation' | 'resource' | 'metadata' | null {
    // Look at the lines around the cursor to determine context
    // Find start of current line
    let lineStart = offset;
    while (lineStart > 0 && text[lineStart - 1] !== '\n') {
        lineStart--;
    }

    // Look at next few lines to see what declaration follows
    let lookAhead = text.substring(offset, Math.min(text.length, offset + 200));
    // Remove the current partial decorator if any
    lookAhead = lookAhead.replace(/^\w*/, '');

    // Check what follows
    if (/^\s*\n?\s*(input|output)\b/.test(lookAhead)) {
        return 'validation'; // input/output -> prioritize validation decorators
    }
    if (/^\s*\n?\s*(resource|component)\b/.test(lookAhead)) {
        return 'resource'; // resource/component -> prioritize resource decorators
    }
    if (/^\s*\n?\s*(schema)\b/.test(lookAhead)) {
        return 'metadata';
    }

    return null;
}

// Helper: Check if we're after '=' on the same line (value context)
function isAfterEquals(text: string, offset: number): boolean {
    // Walk backwards to find '=' or newline
    let pos = offset - 1;
    while (pos >= 0) {
        const char = text[pos];
        if (char === '\n') {
            return false; // Hit newline before finding '='
        }
        if (char === '=') {
            // Make sure it's not == or !=
            if (pos > 0 && (text[pos - 1] === '=' || text[pos - 1] === '!')) {
                pos--;
                continue;
            }
            return true;
        }
        pos--;
    }
    return false;
}

// Helper: Find the enclosing resource/component block
interface BlockContext {
    name: string;
    type: 'resource' | 'component';
    start: number;
    end: number;
}

function findEnclosingBlock(text: string, offset: number): BlockContext | null {
    // Find all resource/component declarations
    const blockRegex = /\b(resource|component)\s+\w+(?:\.\w+)*\s+(\w+)\s*\{/g;
    let match;
    let enclosing: BlockContext | null = null;

    while ((match = blockRegex.exec(text)) !== null) {
        const blockStart = match.index;
        const openBracePos = blockStart + match[0].length - 1;
        const blockEnd = findMatchingBraceForCompletion(text, openBracePos);

        // Check if offset is inside this block
        if (offset > openBracePos && offset < blockEnd) {
            // Found a block containing our position
            // Keep searching for nested blocks (most specific)
            enclosing = {
                name: match[2],
                type: match[1] as 'resource' | 'component',
                start: blockStart,
                end: blockEnd
            };
        }
    }

    return enclosing;
}

// Helper for completion (separate from the other one to avoid conflicts)
function findMatchingBraceForCompletion(text: string, openBracePos: number): number {
    let braceDepth = 1;
    let pos = openBracePos + 1;

    while (pos < text.length && braceDepth > 0) {
        if (text[pos] === '{') braceDepth++;
        else if (text[pos] === '}') braceDepth--;
        pos++;
    }

    return pos;
}

// Go to Definition handler
connection.onDefinition((params: TextDocumentPositionParams): Definition | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const text = document.getText();
    const offset = document.offsetAt(params.position);
    const word = getWordAtPosition(document, params.position);
    if (!word) return null;

    // Check if this is a property access (e.g., server.tag.New.a)
    const propertyAccess = getPropertyAccessContext(text, offset, word);
    if (propertyAccess) {
        // Find the root object declaration
        const declarations = declarationCache.get(params.textDocument.uri) || [];
        const rootName = propertyAccess.chain[0];
        const objectDecl = declarations.find(d => d.name === rootName);

        if (objectDecl && (objectDecl.type === 'resource' || objectDecl.type === 'component')) {
            // Find the property definition following the chain
            const propertyLocation = findPropertyInChain(document, text, propertyAccess.chain);
            if (propertyLocation) {
                return propertyLocation;
            }
        }
    }

    // Search for top-level declarations
    const declarations = declarationCache.get(params.textDocument.uri) || [];
    const decl = declarations.find(d => d.name === word);

    if (decl) {
        return Location.create(decl.uri, decl.nameRange);
    }

    return null;
});

// Find References handler
connection.onReferences((params): Location[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const word = getWordAtPosition(document, params.position);
    if (!word) return [];

    const locations: Location[] = [];
    const text = document.getText();

    // Find all occurrences of the word
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g');
    let match;
    while ((match = regex.exec(text)) !== null) {
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + word.length);
        locations.push(Location.create(params.textDocument.uri, Range.create(startPos, endPos)));
    }

    return locations;
});

// Hover handler
connection.onHover((params: TextDocumentPositionParams): Hover | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const word = getWordAtPosition(document, params.position);
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
    const declarations = declarationCache.get(params.textDocument.uri) || [];
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
});

// Helper: Check if cursor is on a property in a property access (e.g., server.tag.New.a)
interface PropertyAccessContext {
    chain: string[];      // Full chain: ['server', 'tag', 'New', 'a']
    propertyName: string; // The property being accessed (last in chain)
}

function getPropertyAccessContext(text: string, offset: number, currentWord: string): PropertyAccessContext | null {
    // Find start of current word
    let wordStart = offset;
    while (wordStart > 0 && /\w/.test(text[wordStart - 1])) {
        wordStart--;
    }

    // Build the full property chain by walking backwards
    const chain: string[] = [currentWord];
    let pos = wordStart - 1;

    while (pos >= 0) {
        // Skip whitespace
        while (pos >= 0 && /\s/.test(text[pos])) {
            pos--;
        }

        // Check for dot
        if (pos >= 0 && text[pos] === '.') {
            pos--; // skip the dot

            // Skip whitespace before dot
            while (pos >= 0 && /\s/.test(text[pos])) {
                pos--;
            }

            // Find the identifier before the dot
            let identEnd = pos;
            while (pos > 0 && /\w/.test(text[pos - 1])) {
                pos--;
            }
            let identStart = pos;

            if (identStart <= identEnd) {
                const ident = text.substring(identStart, identEnd + 1);
                chain.unshift(ident);
                pos = identStart - 1;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    // Need at least object.property (2 elements)
    if (chain.length >= 2) {
        return {
            chain,
            propertyName: currentWord
        };
    }

    return null;
}

// Helper: Find a property definition following a property chain (e.g., server.tag.New.a)
function findPropertyInChain(document: TextDocument, text: string, chain: string[]): Location | null {
    if (chain.length < 2) return null;

    const declarationName = chain[0];
    const propertyPath = chain.slice(1); // ['tag', 'New', 'a']

    // Find the declaration (resource or component) with this name
    // Pattern: resource Type name { or component Type name {
    const declRegex = new RegExp(`\\b(?:resource|component)\\s+\\w+(?:\\.\\w+)*\\s+${escapeRegex(declarationName)}\\s*\\{`, 'g');
    const declMatch = declRegex.exec(text);

    if (!declMatch) return null;

    // Start searching from the declaration body
    let searchStart = declMatch.index + declMatch[0].length;
    let searchEnd = findMatchingBrace(text, searchStart - 1);

    // Navigate through the property path
    for (let i = 0; i < propertyPath.length; i++) {
        const propName = propertyPath[i];
        const isLast = i === propertyPath.length - 1;

        const result = findPropertyInRange(document, text, searchStart, searchEnd, propName);

        if (!result) return null;

        if (isLast) {
            // This is the target property, return its location
            return result.location;
        } else {
            // Navigate into the nested object
            if (result.valueStart !== undefined && result.valueEnd !== undefined) {
                searchStart = result.valueStart;
                searchEnd = result.valueEnd;
            } else {
                return null;
            }
        }
    }

    return null;
}

// Helper: Find a property within a range of text and return its location and value range
interface PropertyResult {
    location: Location;
    valueStart?: number;  // Start of the value (for nested objects)
    valueEnd?: number;    // End of the value
}

function findPropertyInRange(document: TextDocument, text: string, rangeStart: number, rangeEnd: number, propertyName: string): PropertyResult | null {
    const searchText = text.substring(rangeStart, rangeEnd);

    // Pattern: propertyName = { or propertyName = value or propertyName: value
    // We need to find propertyName at the start of a line (within braces) followed by = or :
    const propRegex = new RegExp(`(?:^|\\n)\\s*(${escapeRegex(propertyName)})\\s*[=:]`, 'g');
    let propMatch;

    while ((propMatch = propRegex.exec(searchText)) !== null) {
        // Calculate absolute position of the property name
        const propNameStartInSearch = propMatch.index + propMatch[0].indexOf(propertyName);
        const propOffset = rangeStart + propNameStartInSearch;

        const startPos = document.positionAt(propOffset);
        const endPos = document.positionAt(propOffset + propertyName.length);
        const location = Location.create(document.uri, Range.create(startPos, endPos));

        // Find the value after = or :
        const afterPropName = rangeStart + propMatch.index + propMatch[0].length;

        // Skip whitespace
        let valueStart = afterPropName;
        while (valueStart < rangeEnd && /\s/.test(text[valueStart])) {
            valueStart++;
        }

        // Check if value is an object literal
        if (text[valueStart] === '{') {
            const valueEnd = findMatchingBrace(text, valueStart);
            return {
                location,
                valueStart: valueStart + 1, // Inside the braces
                valueEnd: valueEnd - 1
            };
        }

        return { location };
    }

    // Also check for input/output declarations
    const memberRegex = new RegExp(`(?:^|\\n)\\s*(?:input|output)\\s+\\w+\\s+(${escapeRegex(propertyName)})\\b`, 'g');
    const memberMatch = memberRegex.exec(searchText);

    if (memberMatch) {
        const memberOffset = rangeStart + memberMatch.index + memberMatch[0].lastIndexOf(propertyName);
        const startPos = document.positionAt(memberOffset);
        const endPos = document.positionAt(memberOffset + propertyName.length);

        return { location: Location.create(document.uri, Range.create(startPos, endPos)) };
    }

    return null;
}

// Helper: Find the matching closing brace
function findMatchingBrace(text: string, openBracePos: number): number {
    let braceDepth = 1;
    let pos = openBracePos + 1;

    while (pos < text.length && braceDepth > 0) {
        if (text[pos] === '{') braceDepth++;
        else if (text[pos] === '}') braceDepth--;
        pos++;
    }

    return pos;
}

// Helper: Scan document for declarations
function scanDocument(document: TextDocument): Declaration[] {
    const text = document.getText();
    const declarations: Declaration[] = [];
    const lines = text.split('\n');

    // Patterns for different declaration types
    const patterns: { type: DeclarationType; regex: RegExp; groups: { name: number; typeName?: number; schemaName?: number } }[] = [
        // var [type] name = value
        { type: 'variable', regex: /^\s*var\s+(?:(\w+)\s+)?(\w+)\s*=/, groups: { typeName: 1, name: 2 } },
        // input [type] name [= value]
        { type: 'input', regex: /^\s*input\s+(?:(\w+)\s+)?(\w+)/, groups: { typeName: 1, name: 2 } },
        // output [type] name [= value]
        { type: 'output', regex: /^\s*output\s+(?:(\w+)\s+)?(\w+)/, groups: { typeName: 1, name: 2 } },
        // resource SchemaName instanceName {
        { type: 'resource', regex: /^\s*resource\s+(\w+(?:\.\w+)*)\s+(\w+)\s*\{/, groups: { schemaName: 1, name: 2 } },
        // component TypeName [instanceName] {
        { type: 'component', regex: /^\s*component\s+(\w+)\s+(?:(\w+)\s*)?\{/, groups: { name: 1 } },
        // schema Name {
        { type: 'schema', regex: /^\s*schema\s+(\w+)\s*\{/, groups: { name: 1 } },
        // fun name(params) [returnType] {
        { type: 'function', regex: /^\s*fun\s+(\w+)\s*\(/, groups: { name: 1 } },
        // type Name = ...
        { type: 'type', regex: /^\s*type\s+(\w+)\s*=/, groups: { name: 1 } },
        // for item in ...
        { type: 'for', regex: /^\s*for\s+(\w+)\s+in\b/, groups: { name: 1 } },
    ];

    let lineOffset = 0;
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];

        for (const pattern of patterns) {
            const match = line.match(pattern.regex);
            if (match) {
                const name = match[pattern.groups.name];
                if (!name) continue;

                // Find the position of the name in the line
                const nameIndex = line.indexOf(name, line.indexOf(match[0]));
                const nameStart = Position.create(lineNum, nameIndex);
                const nameEnd = Position.create(lineNum, nameIndex + name.length);

                const decl: Declaration = {
                    name,
                    type: pattern.type,
                    range: Range.create(
                        Position.create(lineNum, 0),
                        Position.create(lineNum, line.length)
                    ),
                    nameRange: Range.create(nameStart, nameEnd),
                    uri: document.uri,
                };

                if (pattern.groups.typeName && match[pattern.groups.typeName]) {
                    decl.typeName = match[pattern.groups.typeName];
                }
                if (pattern.groups.schemaName && match[pattern.groups.schemaName]) {
                    decl.schemaName = match[pattern.groups.schemaName];
                }

                // Handle component - check if it's a definition or instantiation
                if (pattern.type === 'component') {
                    const componentMatch = line.match(/^\s*component\s+(\w+)\s+(\w+)\s*\{/);
                    if (componentMatch) {
                        // This is an instantiation: component Type instanceName {
                        decl.componentType = componentMatch[1];
                        decl.name = componentMatch[2];
                        // Update nameRange for the instance name
                        const instNameIndex = line.indexOf(componentMatch[2], line.indexOf(componentMatch[1]) + componentMatch[1].length);
                        decl.nameRange = Range.create(
                            Position.create(lineNum, instNameIndex),
                            Position.create(lineNum, instNameIndex + componentMatch[2].length)
                        );
                    }
                    // Otherwise it's a component type definition, name is already correct
                }

                // Look for preceding comment
                if (lineNum > 0) {
                    const prevLine = lines[lineNum - 1].trim();
                    if (prevLine.startsWith('//')) {
                        decl.documentation = prevLine.substring(2).trim();
                    } else if (prevLine.endsWith('*/')) {
                        // Try to find block comment
                        let commentLines: string[] = [];
                        for (let i = lineNum - 1; i >= 0; i--) {
                            const cLine = lines[i].trim();
                            if (cLine.startsWith('/*')) {
                                commentLines.unshift(cLine.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, ''));
                                break;
                            }
                            commentLines.unshift(cLine.replace(/^\*\s*/, '').replace(/\s*\*\/$/, ''));
                        }
                        decl.documentation = commentLines.join('\n').trim();
                    }
                }

                declarations.push(decl);
                break;
            }
        }

        lineOffset += line.length + 1; // +1 for newline
    }

    return declarations;
}

// Helper: Extract properties from a declaration body
function extractPropertiesFromBody(text: string, declarationName: string): string[] {
    const properties: string[] = [];

    // Find the declaration and its body
    const regex = new RegExp(`\\b(?:resource|component)\\s+\\w+\\s+${escapeRegex(declarationName)}\\s*\\{`, 'g');
    const match = regex.exec(text);

    if (match) {
        const startIndex = match.index + match[0].length;
        let braceDepth = 1;
        let i = startIndex;

        while (i < text.length && braceDepth > 0) {
            if (text[i] === '{') braceDepth++;
            else if (text[i] === '}') braceDepth--;
            i++;
        }

        const bodyText = text.substring(startIndex, i - 1);

        // Find property assignments: identifier = or identifier:
        const propRegex = /^\s*(\w+)\s*[=:]/gm;
        let propMatch;
        while ((propMatch = propRegex.exec(bodyText)) !== null) {
            if (!properties.includes(propMatch[1])) {
                properties.push(propMatch[1]);
            }
        }

        // Also find input/output declarations
        const memberRegex = /^\s*(?:input|output)\s+\w+\s+(\w+)/gm;
        let memberMatch;
        while ((memberMatch = memberRegex.exec(bodyText)) !== null) {
            if (!properties.includes(memberMatch[1])) {
                properties.push(memberMatch[1]);
            }
        }
    }

    return properties;
}

// Helper: Get word at position
function getWordAtPosition(document: TextDocument, position: Position): string | null {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Find word boundaries
    let start = offset;
    let end = offset;

    while (start > 0 && /\w/.test(text[start - 1])) {
        start--;
    }
    while (end < text.length && /\w/.test(text[end])) {
        end++;
    }

    if (start === end) return null;
    return text.substring(start, end);
}

// Helper: Get completion item kind for declaration type
function getCompletionKind(type: DeclarationType): CompletionItemKind {
    switch (type) {
        case 'variable': return CompletionItemKind.Variable;
        case 'input': return CompletionItemKind.Field;
        case 'output': return CompletionItemKind.Field;
        case 'resource': return CompletionItemKind.Class;
        case 'component': return CompletionItemKind.Module;
        case 'schema': return CompletionItemKind.Interface;
        case 'function': return CompletionItemKind.Function;
        case 'type': return CompletionItemKind.TypeParameter;
        case 'for': return CompletionItemKind.Variable;
        default: return CompletionItemKind.Text;
    }
}

// Helper: Escape regex special characters
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Start the server
documents.listen(connection);
connection.listen();
