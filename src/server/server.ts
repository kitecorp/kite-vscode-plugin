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

connection.onInitialize((params: InitializeParams): InitializeResult => {
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

// Completion handler
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const completions: CompletionItem[] = [];
    const text = document.getText();
    const offset = document.offsetAt(params.position);

    // Check if we're after a dot (property access)
    const beforeCursor = text.substring(Math.max(0, offset - 50), offset);
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

    // Add keywords
    KEYWORDS.forEach(kw => {
        completions.push({
            label: kw,
            kind: CompletionItemKind.Keyword,
            detail: 'keyword'
        });
    });

    // Add types
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

    // Add declarations from current file
    const declarations = declarationCache.get(params.textDocument.uri) || [];
    declarations.forEach(decl => {
        completions.push({
            label: decl.name,
            kind: getCompletionKind(decl.type),
            detail: decl.type + (decl.typeName ? `: ${decl.typeName}` : '')
        });
    });

    return completions;
});

// Go to Definition handler
connection.onDefinition((params: TextDocumentPositionParams): Definition | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const word = getWordAtPosition(document, params.position);
    if (!word) return null;

    // Search in current document
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
