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
    SignatureHelp,
    SignatureInformation,
    ParameterInformation,
    Diagnostic,
    DiagnosticSeverity,
    InlayHint,
    InlayHintKind,
    InlayHintParams,
    CodeAction,
    CodeActionKind,
    CodeActionParams,
    TextEdit,
    WorkspaceEdit,
    DocumentSymbol,
    SymbolKind,
    DocumentSymbolParams,
    RenameParams,
    PrepareRenameParams,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';
import { URI } from 'vscode-uri';
import {
    escapeRegex,
    isInComment,
    findComponentTypeForScope,
    getSchemaContextAtPosition,
    findComponentInstantiations,
    findResourceInstantiations,
    findPropertyAssignments,
    findPropertyAccess,
    canRenameSymbol,
    isValidNewName,
} from './rename-utils';

// Create a connection for the server using Node's IPC
const connection = createConnection(ProposedFeatures.all);

// Create a text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Declaration types in Kite
type DeclarationType = 'variable' | 'input' | 'output' | 'resource' | 'component' | 'schema' | 'function' | 'type' | 'for';

// Represents a function parameter
interface FunctionParameter {
    type: string;
    name: string;
}

// Represents a declaration found in a Kite file
interface Declaration {
    name: string;
    type: DeclarationType;
    typeName?: string;         // For var/input/output: the type (string, number, etc.)
    schemaName?: string;       // For resource: the schema type
    componentType?: string;    // For component: the type name
    parameters?: FunctionParameter[];  // For functions: parameter list
    returnType?: string;       // For functions: return type
    range: Range;
    nameRange: Range;          // Range of just the name identifier
    uri: string;
    documentation?: string;
    scopeStart?: number;       // Start offset of the scope this declaration is in (undefined = file scope)
    scopeEnd?: number;         // End offset of the scope
}

// Cache of declarations per document
const declarationCache: Map<string, Declaration[]> = new Map();

// Workspace folders for cross-file resolution
let workspaceFolders: string[] = [];

// Diagnostic data for code actions (stores import suggestions)
interface ImportSuggestion {
    symbolName: string;
    filePath: string;
    importPath: string;
}
const diagnosticData: Map<string, Map<string, ImportSuggestion>> = new Map(); // uri -> (diagnosticKey -> suggestion)

connection.onInitialize((params: InitializeParams): InitializeResult => {
    // Store workspace folders for cross-file resolution
    if (params.workspaceFolders) {
        workspaceFolders = params.workspaceFolders.map(folder => URI.parse(folder.uri).fsPath);
    } else if (params.rootUri) {
        workspaceFolders = [URI.parse(params.rootUri).fsPath];
    } else if (params.rootPath) {
        workspaceFolders = [params.rootPath];
    }

    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: ['.', '@']
            },
            signatureHelpProvider: {
                triggerCharacters: ['(', ','],
                retriggerCharacters: [',']
            },
            inlayHintProvider: true,
            definitionProvider: true,
            referencesProvider: true,
            hoverProvider: true,
            codeActionProvider: {
                codeActionKinds: ['quickfix']
            },
            documentSymbolProvider: true,
            renameProvider: {
                prepareProvider: true
            }
        }
    };
});

// Scan document for declarations when it changes
documents.onDidChangeContent(change => {
    const declarations = scanDocument(change.document);
    declarationCache.set(change.document.uri, declarations);

    // Validate document and publish diagnostics
    const diagnostics = validateDocument(change.document);
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
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
type ArgType = 'none' | 'number' | 'string' | 'array' | 'object' | 'reference' | 'named';

interface DecoratorInfo {
    name: string;
    category: 'validation' | 'resource' | 'metadata';
    description: string;
    argument?: string;     // Argument type/constraint (for display)
    argType: ArgType;      // Expected argument type (for validation)
    targets?: string;      // What it can be applied to
    appliesTo?: string;    // What types it validates (for validation decorators)
    example: string;
    snippet?: string;      // Snippet with placeholder, e.g., "minValue($1)"
    argHint?: string;      // Argument hint, e.g., "(n)" or "(regex)"
    sortOrder: number;     // For sorting within category
}

const DECORATORS: DecoratorInfo[] = [
    // Validation decorators (sortOrder 0-99)
    {
        name: 'minValue', category: 'validation',
        description: 'Minimum value constraint for numbers',
        argument: 'number (0 to 999999)', argType: 'number',
        targets: 'input, output', appliesTo: 'number',
        example: '@minValue(1)\ninput number port = 8080',
        snippet: 'minValue($1)', argHint: '(n)', sortOrder: 0
    },
    {
        name: 'maxValue', category: 'validation',
        description: 'Maximum value constraint for numbers',
        argument: 'number (0 to 999999)', argType: 'number',
        targets: 'input, output', appliesTo: 'number',
        example: '@maxValue(65535)\ninput number port = 8080',
        snippet: 'maxValue($1)', argHint: '(n)', sortOrder: 1
    },
    {
        name: 'minLength', category: 'validation',
        description: 'Minimum length constraint for strings and arrays',
        argument: 'number (0 to 999999)', argType: 'number',
        targets: 'input, output', appliesTo: 'string, array',
        example: '@minLength(3)\ninput string name',
        snippet: 'minLength($1)', argHint: '(n)', sortOrder: 2
    },
    {
        name: 'maxLength', category: 'validation',
        description: 'Maximum length constraint for strings and arrays',
        argument: 'number (0 to 999999)', argType: 'number',
        targets: 'input, output', appliesTo: 'string, array',
        example: '@maxLength(255)\ninput string name',
        snippet: 'maxLength($1)', argHint: '(n)', sortOrder: 3
    },
    {
        name: 'nonEmpty', category: 'validation',
        description: 'Ensures strings or arrays are not empty',
        argument: 'none', argType: 'none',
        targets: 'input', appliesTo: 'string, array',
        example: '@nonEmpty\ninput string name',
        sortOrder: 4
    },
    {
        name: 'validate', category: 'validation',
        description: 'Custom validation with regex pattern or preset',
        argument: 'Named: regex: string or preset: string', argType: 'named',
        targets: 'input, output', appliesTo: 'string, array',
        example: '@validate(regex: "^[a-z]+$")\ninput string name',
        snippet: 'validate(regex: "$1")', argHint: '(regex: "pattern")', sortOrder: 5
    },
    {
        name: 'allowed', category: 'validation',
        description: 'Whitelist of allowed values',
        argument: 'array of literals (1 to 256 elements)', argType: 'array',
        targets: 'input', appliesTo: 'string, number, object, array',
        example: '@allowed(["dev", "staging", "prod"])\ninput string environment = "dev"',
        snippet: 'allowed([$1])', argHint: '([values])', sortOrder: 6
    },
    {
        name: 'unique', category: 'validation',
        description: 'Ensures array elements are unique',
        argument: 'none', argType: 'none',
        targets: 'input', appliesTo: 'array',
        example: '@unique\ninput string[] tags = ["web", "api"]',
        sortOrder: 7
    },
    // Resource decorators (sortOrder 100-199)
    {
        name: 'existing', category: 'resource',
        description: 'Reference existing cloud resources by ARN, URL, or ID',
        argument: 'string (ARN, URL, EC2 instance ID, KMS alias, log group)', argType: 'string',
        targets: 'resource',
        example: '@existing("arn:aws:s3:::my-bucket")\nresource S3.Bucket existing_bucket {}',
        snippet: 'existing("$1")', argHint: '("reference")', sortOrder: 100
    },
    {
        name: 'sensitive', category: 'resource',
        description: 'Mark sensitive data (passwords, secrets, API keys)',
        argument: 'none', argType: 'none',
        targets: 'input, output',
        example: '@sensitive\ninput string api_key',
        sortOrder: 101
    },
    {
        name: 'dependsOn', category: 'resource',
        description: 'Explicit dependency declaration between resources/components',
        argument: 'resource/component reference, or array of references', argType: 'reference',
        targets: 'resource, component (instances)',
        example: '@dependsOn(subnet)\nresource EC2.Instance server { ... }',
        snippet: 'dependsOn($1)', argHint: '(resources)', sortOrder: 102
    },
    {
        name: 'tags', category: 'resource',
        description: 'Add cloud provider tags to resources',
        argument: 'object, array of strings, or string', argType: 'object',
        targets: 'resource, component (instances)',
        example: '@tags({ Environment: "prod", Team: "platform" })\nresource S3.Bucket photos { name = "photos" }',
        snippet: 'tags({ $1 })', argHint: '({key: value})', sortOrder: 103
    },
    {
        name: 'provider', category: 'resource',
        description: 'Target specific cloud providers for resource provisioning',
        argument: 'string or array of strings', argType: 'string',
        targets: 'resource, component (instances)',
        example: '@provider("aws")\nresource S3.Bucket photos { name = "photos" }',
        snippet: 'provider("$1")', argHint: '("provider")', sortOrder: 104
    },
    // Metadata decorators (sortOrder 200-299)
    {
        name: 'description', category: 'metadata',
        description: 'Documentation for any declaration',
        argument: 'string', argType: 'string',
        targets: 'resource, component, input, output, var, schema, schema property, fun',
        example: '@description("The port number for the web server")\ninput number port = 8080',
        snippet: 'description("$1")', argHint: '("text")', sortOrder: 200
    },
    {
        name: 'cloud', category: 'metadata',
        description: 'Mark schema property as cloud-provided (value set by cloud provider)',
        argument: 'none', argType: 'none',
        targets: 'schema property',
        example: 'schema Instance {\n    @cloud\n    string publicIp\n}',
        sortOrder: 201
    },
    {
        name: 'count', category: 'metadata',
        description: 'Create N instances of a resource or component. Injects count variable (0-indexed)',
        argument: 'number', argType: 'number',
        targets: 'resource, component (instances)',
        example: '@count(3)\nresource EC2.Instance server {\n    name = "server-$count"\n}',
        snippet: 'count($1)', argHint: '(n)', sortOrder: 202
    },
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
        // Detect context for filtering and prioritization
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
                sortText: String(index).padStart(3, '0'), // Preserve our sort order
                filterText: dec.name, // Filter by name only, not argHint
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: docContent
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
            if (decl.type === 'resource' && decl.schemaName) {
                // For resources, show set properties first (bold indicator), then schema properties
                const bodyProps = new Set(extractPropertiesFromBody(text, decl.name));
                const schemaProps = extractSchemaPropertyTypes(text, decl.schemaName, params.textDocument.uri);

                // First add set properties (from resource body) - shown first with indicator
                bodyProps.forEach(prop => {
                    const propType = schemaProps[prop] || 'any';
                    completions.push({
                        label: prop,
                        kind: CompletionItemKind.Property,
                        detail: `● ${propType} (set)`,
                        sortText: '0' + prop,  // Sort first
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
                            sortText: '1' + propName  // Sort after set properties
                        });
                    }
                }
            } else if (decl.type === 'component' && decl.componentType) {
                // For component instances, find the component type and show only outputs
                const outputs = extractComponentOutputs(text, decl.componentType);
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

    // Check if we're inside a schema body - only show types, not variables/functions/etc
    if (isInsideSchemaBody(text, offset)) {
        const isValueContext = isAfterEquals(text, offset);

        if (isValueContext) {
            // After '=' in schema - show default values based on property type
            // Find the property type on this line
            const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
            const lineText = text.substring(lineStart, offset);

            // Pattern: type propertyName = (cursor here)
            const propMatch = lineText.match(/^\s*(\w+(?:\[\])?)\s+\w+\s*=\s*$/);
            const propType = propMatch ? propMatch[1] : null;

            // Also extract property name for context-aware suggestions
            const propNameMatch = lineText.match(/^\s*\w+(?:\[\])?\s+(\w+)\s*=\s*$/);
            const propName = propNameMatch ? propNameMatch[1].toLowerCase() : '';

            if (propType === 'boolean') {
                completions.push({ label: 'true', kind: CompletionItemKind.Value, detail: 'boolean' });
                completions.push({ label: 'false', kind: CompletionItemKind.Value, detail: 'boolean' });
            } else if (propType === 'number') {
                // Also extract property name for context-aware number suggestions
                const numPropNameMatch = lineText.match(/^\s*number\s+(\w+)\s*=\s*$/);
                const numPropName = numPropNameMatch ? numPropNameMatch[1].toLowerCase() : '';

                const numberSuggestions: Record<string, { value: string; desc: string }[]> = {
                    'port': [
                        { value: '80', desc: 'HTTP' },
                        { value: '443', desc: 'HTTPS' },
                        { value: '22', desc: 'SSH' },
                        { value: '3000', desc: 'Dev server' },
                        { value: '3306', desc: 'MySQL' },
                        { value: '5432', desc: 'PostgreSQL' },
                        { value: '6379', desc: 'Redis' },
                        { value: '8080', desc: 'HTTP alt' },
                        { value: '27017', desc: 'MongoDB' },
                    ],
                    'timeout': [
                        { value: '30', desc: '30 seconds' },
                        { value: '60', desc: '1 minute' },
                        { value: '300', desc: '5 minutes' },
                        { value: '900', desc: '15 minutes' },
                        { value: '3600', desc: '1 hour' },
                    ],
                    'memory': [
                        { value: '128', desc: '128 MB (Lambda min)' },
                        { value: '256', desc: '256 MB' },
                        { value: '512', desc: '512 MB' },
                        { value: '1024', desc: '1 GB' },
                        { value: '2048', desc: '2 GB' },
                        { value: '4096', desc: '4 GB' },
                    ],
                    'memorysize': [
                        { value: '128', desc: '128 MB (Lambda min)' },
                        { value: '256', desc: '256 MB' },
                        { value: '512', desc: '512 MB' },
                        { value: '1024', desc: '1 GB' },
                        { value: '2048', desc: '2 GB' },
                    ],
                    'cpu': [
                        { value: '256', desc: '0.25 vCPU (ECS)' },
                        { value: '512', desc: '0.5 vCPU (ECS)' },
                        { value: '1024', desc: '1 vCPU (ECS)' },
                        { value: '2048', desc: '2 vCPU (ECS)' },
                        { value: '4096', desc: '4 vCPU (ECS)' },
                    ],
                    'replicas': [
                        { value: '1', desc: 'Single replica' },
                        { value: '2', desc: 'HA minimum' },
                        { value: '3', desc: 'Production HA' },
                        { value: '5', desc: 'High availability' },
                    ],
                    'desiredcount': [
                        { value: '1', desc: 'Single instance' },
                        { value: '2', desc: 'HA minimum' },
                        { value: '3', desc: 'Production HA' },
                    ],
                    'minsize': [
                        { value: '0', desc: 'Scale to zero' },
                        { value: '1', desc: 'Minimum 1' },
                        { value: '2', desc: 'HA minimum' },
                    ],
                    'maxsize': [
                        { value: '1', desc: 'No scaling' },
                        { value: '3', desc: 'Small scale' },
                        { value: '5', desc: 'Medium scale' },
                        { value: '10', desc: 'Large scale' },
                    ],
                    'ttl': [
                        { value: '60', desc: '1 minute' },
                        { value: '300', desc: '5 minutes' },
                        { value: '3600', desc: '1 hour' },
                        { value: '86400', desc: '1 day' },
                        { value: '604800', desc: '1 week' },
                    ],
                    'interval': [
                        { value: '5', desc: '5 seconds' },
                        { value: '10', desc: '10 seconds' },
                        { value: '30', desc: '30 seconds' },
                        { value: '60', desc: '1 minute' },
                    ],
                    'retries': [
                        { value: '0', desc: 'No retries' },
                        { value: '1', desc: 'Single retry' },
                        { value: '3', desc: 'Standard retries' },
                        { value: '5', desc: 'Extended retries' },
                    ],
                    'maxretries': [
                        { value: '1', desc: 'Single retry' },
                        { value: '3', desc: 'Standard retries' },
                        { value: '5', desc: 'Extended retries' },
                    ],
                    'capacity': [
                        { value: '5', desc: '5 GB' },
                        { value: '10', desc: '10 GB' },
                        { value: '20', desc: '20 GB' },
                        { value: '50', desc: '50 GB' },
                        { value: '100', desc: '100 GB' },
                    ],
                    'storagesize': [
                        { value: '20', desc: '20 GB (RDS min)' },
                        { value: '50', desc: '50 GB' },
                        { value: '100', desc: '100 GB' },
                        { value: '500', desc: '500 GB' },
                    ],
                    'threshold': [
                        { value: '50', desc: '50%' },
                        { value: '70', desc: '70%' },
                        { value: '80', desc: '80%' },
                        { value: '90', desc: '90%' },
                    ],
                };

                const numSuggestions = numberSuggestions[numPropName];
                if (numSuggestions) {
                    numSuggestions.forEach(s => {
                        completions.push({
                            label: s.value,
                            kind: CompletionItemKind.Value,
                            detail: s.desc
                        });
                    });
                } else {
                    // Fallback to common ports for unknown property names
                    const commonPorts = [
                        { value: '80', desc: 'HTTP' },
                        { value: '443', desc: 'HTTPS' },
                        { value: '22', desc: 'SSH' },
                        { value: '3000', desc: 'Dev server' },
                        { value: '3306', desc: 'MySQL' },
                        { value: '5432', desc: 'PostgreSQL' },
                        { value: '6379', desc: 'Redis' },
                        { value: '8080', desc: 'HTTP alt' },
                        { value: '8443', desc: 'HTTPS alt' },
                        { value: '27017', desc: 'MongoDB' },
                    ];
                    commonPorts.forEach(port => {
                        completions.push({
                            label: port.value,
                            kind: CompletionItemKind.Value,
                            detail: port.desc
                        });
                    });
                }
            } else if (propType === 'string') {
                // Context-aware string suggestions based on property name
                const stringSuggestions: Record<string, { value: string; desc: string }[]> = {
                    'environment': [
                        { value: '"dev"', desc: 'Development' },
                        { value: '"staging"', desc: 'Staging' },
                        { value: '"prod"', desc: 'Production' },
                        { value: '"production"', desc: 'Production' },
                        { value: '"test"', desc: 'Testing' },
                    ],
                    'env': [
                        { value: '"dev"', desc: 'Development' },
                        { value: '"staging"', desc: 'Staging' },
                        { value: '"prod"', desc: 'Production' },
                    ],
                    'region': [
                        { value: '"us-east-1"', desc: 'AWS US East' },
                        { value: '"us-west-2"', desc: 'AWS US West' },
                        { value: '"eu-west-1"', desc: 'AWS EU West' },
                        { value: '"ap-southeast-1"', desc: 'AWS Asia Pacific' },
                        { value: '"eu-central-1"', desc: 'AWS EU Central' },
                    ],
                    'protocol': [
                        { value: '"http"', desc: 'HTTP' },
                        { value: '"https"', desc: 'HTTPS' },
                        { value: '"tcp"', desc: 'TCP' },
                        { value: '"udp"', desc: 'UDP' },
                        { value: '"grpc"', desc: 'gRPC' },
                    ],
                    'loglevel': [
                        { value: '"debug"', desc: 'Debug level' },
                        { value: '"info"', desc: 'Info level' },
                        { value: '"warn"', desc: 'Warning level' },
                        { value: '"error"', desc: 'Error level' },
                    ],
                    'log_level': [
                        { value: '"debug"', desc: 'Debug level' },
                        { value: '"info"', desc: 'Info level' },
                        { value: '"warn"', desc: 'Warning level' },
                        { value: '"error"', desc: 'Error level' },
                    ],
                    'tier': [
                        { value: '"free"', desc: 'Free tier' },
                        { value: '"basic"', desc: 'Basic tier' },
                        { value: '"standard"', desc: 'Standard tier' },
                        { value: '"premium"', desc: 'Premium tier' },
                    ],
                    'sku': [
                        { value: '"free"', desc: 'Free SKU' },
                        { value: '"basic"', desc: 'Basic SKU' },
                        { value: '"standard"', desc: 'Standard SKU' },
                        { value: '"premium"', desc: 'Premium SKU' },
                    ],
                    'size': [
                        { value: '"small"', desc: 'Small instance' },
                        { value: '"medium"', desc: 'Medium instance' },
                        { value: '"large"', desc: 'Large instance' },
                        { value: '"xlarge"', desc: 'Extra large instance' },
                    ],
                    'host': [
                        { value: '"localhost"', desc: 'Local host' },
                        { value: '"0.0.0.0"', desc: 'All interfaces' },
                        { value: '"127.0.0.1"', desc: 'Loopback' },
                    ],
                    'hostname': [
                        { value: '"localhost"', desc: 'Local host' },
                        { value: '"0.0.0.0"', desc: 'All interfaces' },
                    ],
                    'provider': [
                        { value: '"aws"', desc: 'Amazon Web Services' },
                        { value: '"gcp"', desc: 'Google Cloud Platform' },
                        { value: '"azure"', desc: 'Microsoft Azure' },
                        { value: '"kubernetes"', desc: 'Kubernetes' },
                        { value: '"docker"', desc: 'Docker' },
                    ],
                    'cloud': [
                        { value: '"aws"', desc: 'Amazon Web Services' },
                        { value: '"gcp"', desc: 'Google Cloud Platform' },
                        { value: '"azure"', desc: 'Microsoft Azure' },
                    ],
                    'storage': [
                        { value: '"standard"', desc: 'Standard storage' },
                        { value: '"ssd"', desc: 'SSD storage' },
                        { value: '"premium"', desc: 'Premium storage' },
                    ],
                    'storageclass': [
                        { value: '"standard"', desc: 'Standard class' },
                        { value: '"ssd"', desc: 'SSD class' },
                        { value: '"premium"', desc: 'Premium class' },
                    ],
                    'restart': [
                        { value: '"always"', desc: 'Always restart' },
                        { value: '"on-failure"', desc: 'Restart on failure' },
                        { value: '"never"', desc: 'Never restart' },
                    ],
                    'restartpolicy': [
                        { value: '"Always"', desc: 'Always restart' },
                        { value: '"OnFailure"', desc: 'Restart on failure' },
                        { value: '"Never"', desc: 'Never restart' },
                    ],
                    'imagepullpolicy': [
                        { value: '"Always"', desc: 'Always pull' },
                        { value: '"IfNotPresent"', desc: 'Pull if not present' },
                        { value: '"Never"', desc: 'Never pull' },
                    ],
                    'type': [
                        { value: '"ClusterIP"', desc: 'Cluster internal' },
                        { value: '"NodePort"', desc: 'Node port' },
                        { value: '"LoadBalancer"', desc: 'Load balancer' },
                    ],
                    'cidr': [
                        { value: '"10.0.0.0/16"', desc: 'AWS VPC default (65,536 IPs)' },
                        { value: '"10.0.0.0/24"', desc: 'Small subnet (256 IPs)' },
                        { value: '"10.0.1.0/24"', desc: 'Subnet 1 (256 IPs)' },
                        { value: '"10.0.2.0/24"', desc: 'Subnet 2 (256 IPs)' },
                        { value: '"172.16.0.0/16"', desc: 'Private range B (65,536 IPs)' },
                        { value: '"192.168.0.0/16"', desc: 'Private range C (65,536 IPs)' },
                    ],
                    'cidrblock': [
                        { value: '"10.0.0.0/16"', desc: 'AWS VPC default (65,536 IPs)' },
                        { value: '"10.0.0.0/24"', desc: 'Small subnet (256 IPs)' },
                        { value: '"172.16.0.0/16"', desc: 'Private range B (65,536 IPs)' },
                        { value: '"192.168.0.0/16"', desc: 'Private range C (65,536 IPs)' },
                    ],
                    'vpccidr': [
                        { value: '"10.0.0.0/16"', desc: 'AWS VPC default (65,536 IPs)' },
                        { value: '"172.16.0.0/16"', desc: 'Private range B (65,536 IPs)' },
                        { value: '"192.168.0.0/16"', desc: 'Private range C (65,536 IPs)' },
                    ],
                    'subnetcidr': [
                        { value: '"10.0.1.0/24"', desc: 'Public subnet (256 IPs)' },
                        { value: '"10.0.2.0/24"', desc: 'Private subnet (256 IPs)' },
                        { value: '"10.0.3.0/24"', desc: 'Database subnet (256 IPs)' },
                        { value: '"10.0.128.0/20"', desc: 'Large subnet (4,096 IPs)' },
                    ],
                    'instancetype': [
                        { value: '"t2.micro"', desc: 'Free tier (1 vCPU, 1 GB)' },
                        { value: '"t2.small"', desc: '1 vCPU, 2 GB' },
                        { value: '"t3.micro"', desc: '2 vCPU, 1 GB' },
                        { value: '"t3.small"', desc: '2 vCPU, 2 GB' },
                        { value: '"t3.medium"', desc: '2 vCPU, 4 GB' },
                        { value: '"m5.large"', desc: '2 vCPU, 8 GB' },
                        { value: '"m5.xlarge"', desc: '4 vCPU, 16 GB' },
                    ],
                    'machinetype': [
                        { value: '"e2-micro"', desc: 'GCP shared-core' },
                        { value: '"e2-small"', desc: 'GCP 0.5-2 vCPU, 2 GB' },
                        { value: '"e2-medium"', desc: 'GCP 1-2 vCPU, 4 GB' },
                        { value: '"n1-standard-1"', desc: 'GCP 1 vCPU, 3.75 GB' },
                    ],
                    'availabilityzone': [
                        { value: '"us-east-1a"', desc: 'US East zone A' },
                        { value: '"us-east-1b"', desc: 'US East zone B' },
                        { value: '"us-west-2a"', desc: 'US West zone A' },
                        { value: '"eu-west-1a"', desc: 'EU West zone A' },
                    ],
                    'az': [
                        { value: '"us-east-1a"', desc: 'US East zone A' },
                        { value: '"us-east-1b"', desc: 'US East zone B' },
                        { value: '"us-west-2a"', desc: 'US West zone A' },
                    ],
                    'engine': [
                        { value: '"mysql"', desc: 'MySQL database' },
                        { value: '"postgres"', desc: 'PostgreSQL database' },
                        { value: '"mariadb"', desc: 'MariaDB database' },
                        { value: '"redis"', desc: 'Redis cache' },
                        { value: '"memcached"', desc: 'Memcached' },
                    ],
                    'engineversion': [
                        { value: '"8.0"', desc: 'MySQL 8.0' },
                        { value: '"14"', desc: 'PostgreSQL 14' },
                        { value: '"15"', desc: 'PostgreSQL 15' },
                        { value: '"7.0"', desc: 'Redis 7.0' },
                    ],
                    'schedule': [
                        { value: '"rate(1 hour)"', desc: 'Every hour' },
                        { value: '"rate(1 day)"', desc: 'Every day' },
                        { value: '"cron(0 12 * * ? *)"', desc: 'Daily at noon UTC' },
                        { value: '"cron(0 0 * * ? *)"', desc: 'Daily at midnight UTC' },
                    ],
                    'cron': [
                        { value: '"0 * * * *"', desc: 'Every hour' },
                        { value: '"0 0 * * *"', desc: 'Daily at midnight' },
                        { value: '"0 0 * * 0"', desc: 'Weekly on Sunday' },
                        { value: '"0 0 1 * *"', desc: 'Monthly on 1st' },
                    ],
                    'effect': [
                        { value: '"Allow"', desc: 'IAM Allow' },
                        { value: '"Deny"', desc: 'IAM Deny' },
                    ],
                    'action': [
                        { value: '"allow"', desc: 'Allow action' },
                        { value: '"deny"', desc: 'Deny action' },
                    ],
                    'scheme': [
                        { value: '"internet-facing"', desc: 'Public load balancer' },
                        { value: '"internal"', desc: 'Internal load balancer' },
                    ],
                    'healthcheckpath': [
                        { value: '"/health"', desc: 'Health endpoint' },
                        { value: '"/healthz"', desc: 'Kubernetes style' },
                        { value: '"/ping"', desc: 'Ping endpoint' },
                        { value: '"/"', desc: 'Root path' },
                    ],
                    'method': [
                        { value: '"GET"', desc: 'GET request' },
                        { value: '"POST"', desc: 'POST request' },
                        { value: '"PUT"', desc: 'PUT request' },
                        { value: '"DELETE"', desc: 'DELETE request' },
                        { value: '"PATCH"', desc: 'PATCH request' },
                    ],
                    'httpmethod': [
                        { value: '"GET"', desc: 'GET request' },
                        { value: '"POST"', desc: 'POST request' },
                        { value: '"PUT"', desc: 'PUT request' },
                        { value: '"DELETE"', desc: 'DELETE request' },
                    ],
                    'contenttype': [
                        { value: '"application/json"', desc: 'JSON content' },
                        { value: '"text/html"', desc: 'HTML content' },
                        { value: '"text/plain"', desc: 'Plain text' },
                        { value: '"application/xml"', desc: 'XML content' },
                    ],
                    'encryption': [
                        { value: '"AES256"', desc: 'S3 AES-256' },
                        { value: '"aws:kms"', desc: 'AWS KMS' },
                        { value: '"none"', desc: 'No encryption' },
                    ],
                    'acl': [
                        { value: '"private"', desc: 'Private access' },
                        { value: '"public-read"', desc: 'Public read access' },
                        { value: '"authenticated-read"', desc: 'Authenticated read' },
                        { value: '"bucket-owner-full-control"', desc: 'Bucket owner control' },
                    ],
                    'visibility': [
                        { value: '"public"', desc: 'Public visibility' },
                        { value: '"private"', desc: 'Private visibility' },
                    ],
                    'access': [
                        { value: '"public"', desc: 'Public access' },
                        { value: '"private"', desc: 'Private access' },
                    ],
                    'state': [
                        { value: '"enabled"', desc: 'Enabled state' },
                        { value: '"disabled"', desc: 'Disabled state' },
                    ],
                    'status': [
                        { value: '"active"', desc: 'Active status' },
                        { value: '"inactive"', desc: 'Inactive status' },
                        { value: '"enabled"', desc: 'Enabled' },
                        { value: '"disabled"', desc: 'Disabled' },
                    ],
                    'direction': [
                        { value: '"ingress"', desc: 'Inbound traffic' },
                        { value: '"egress"', desc: 'Outbound traffic' },
                    ],
                    'runtime': [
                        { value: '"nodejs18.x"', desc: 'Node.js 18' },
                        { value: '"nodejs20.x"', desc: 'Node.js 20' },
                        { value: '"python3.11"', desc: 'Python 3.11' },
                        { value: '"python3.12"', desc: 'Python 3.12' },
                        { value: '"java17"', desc: 'Java 17' },
                        { value: '"java21"', desc: 'Java 21' },
                        { value: '"go1.x"', desc: 'Go 1.x' },
                    ],
                    'architecture': [
                        { value: '"x86_64"', desc: 'Intel/AMD 64-bit' },
                        { value: '"arm64"', desc: 'ARM 64-bit (Graviton)' },
                    ],
                    'platform': [
                        { value: '"linux"', desc: 'Linux' },
                        { value: '"windows"', desc: 'Windows' },
                        { value: '"linux/amd64"', desc: 'Linux AMD64' },
                        { value: '"linux/arm64"', desc: 'Linux ARM64' },
                    ],
                };

                const suggestions = stringSuggestions[propName];
                if (suggestions) {
                    suggestions.forEach(s => {
                        completions.push({
                            label: s.value,
                            kind: CompletionItemKind.Value,
                            detail: s.desc,
                            insertText: s.value
                        });
                    });
                } else {
                    // Fallback for unknown property names
                    completions.push({ label: '""', kind: CompletionItemKind.Value, detail: 'empty string', insertText: '""' });
                }
            }
            // For other types, no suggestions
        } else {
            // Before '=' - show types for property declarations
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

            // Also show other schema names as potential types
            const declarations = declarationCache.get(params.textDocument.uri) || [];
            declarations.forEach(decl => {
                if (decl.type === 'schema' || decl.type === 'type') {
                    completions.push({
                        label: decl.name,
                        kind: decl.type === 'schema' ? CompletionItemKind.Struct : CompletionItemKind.TypeParameter,
                        detail: decl.type
                    });
                }
            });
        }

        return completions;
    }

    // Check if we're inside a component definition body - similar handling for input/output defaults
    if (isInsideComponentDefinition(text, offset)) {
        const isValueContext = isAfterEquals(text, offset);

        if (isValueContext) {
            // After '=' in component definition - show default values based on type
            const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
            const lineText = text.substring(lineStart, offset);

            // Pattern for input/output: input/output type name = (cursor here)
            const ioMatch = lineText.match(/^\s*(?:input|output)\s+(\w+(?:\[\])?)\s+(\w+)\s*=\s*$/);
            const propType = ioMatch ? ioMatch[1] : null;
            const propName = ioMatch ? ioMatch[2].toLowerCase() : '';

            if (propType === 'boolean') {
                completions.push({ label: 'true', kind: CompletionItemKind.Value, detail: 'boolean' });
                completions.push({ label: 'false', kind: CompletionItemKind.Value, detail: 'boolean' });
            } else if (propType === 'number') {
                const numberSuggestions: Record<string, { value: string; desc: string }[]> = {
                    'port': [
                        { value: '80', desc: 'HTTP' }, { value: '443', desc: 'HTTPS' }, { value: '22', desc: 'SSH' },
                        { value: '3000', desc: 'Dev server' }, { value: '3306', desc: 'MySQL' }, { value: '5432', desc: 'PostgreSQL' },
                        { value: '6379', desc: 'Redis' }, { value: '8080', desc: 'HTTP alt' }, { value: '27017', desc: 'MongoDB' },
                    ],
                    'timeout': [{ value: '30', desc: '30s' }, { value: '60', desc: '1min' }, { value: '300', desc: '5min' }, { value: '3600', desc: '1hr' }],
                    'memory': [{ value: '128', desc: '128 MB' }, { value: '256', desc: '256 MB' }, { value: '512', desc: '512 MB' }, { value: '1024', desc: '1 GB' }],
                    'replicas': [{ value: '1', desc: 'Single' }, { value: '2', desc: 'HA min' }, { value: '3', desc: 'Production' }],
                    'ttl': [{ value: '60', desc: '1 min' }, { value: '300', desc: '5 min' }, { value: '3600', desc: '1 hr' }],
                };
                const numSuggestions = numberSuggestions[propName];
                if (numSuggestions) {
                    numSuggestions.forEach(s => completions.push({ label: s.value, kind: CompletionItemKind.Value, detail: s.desc }));
                } else {
                    // Default number suggestions
                    [{ value: '0', desc: 'zero' }, { value: '1', desc: 'one' }, { value: '10', desc: 'ten' }, { value: '100', desc: 'hundred' }]
                        .forEach(s => completions.push({ label: s.value, kind: CompletionItemKind.Value, detail: s.desc }));
                }
            } else if (propType === 'string') {
                const stringSuggestions: Record<string, { value: string; desc: string }[]> = {
                    'environment': [{ value: '"dev"', desc: 'Development' }, { value: '"staging"', desc: 'Staging' }, { value: '"prod"', desc: 'Production' }],
                    'env': [{ value: '"dev"', desc: 'Development' }, { value: '"staging"', desc: 'Staging' }, { value: '"prod"', desc: 'Production' }],
                    'region': [{ value: '"us-east-1"', desc: 'AWS US East' }, { value: '"us-west-2"', desc: 'AWS US West' }, { value: '"eu-west-1"', desc: 'AWS EU' }],
                    'protocol': [{ value: '"http"', desc: 'HTTP' }, { value: '"https"', desc: 'HTTPS' }, { value: '"tcp"', desc: 'TCP' }],
                    'host': [{ value: '"localhost"', desc: 'Local' }, { value: '"0.0.0.0"', desc: 'All interfaces' }, { value: '"127.0.0.1"', desc: 'Loopback' }],
                    'hostname': [{ value: '"localhost"', desc: 'Local' }, { value: '"0.0.0.0"', desc: 'All interfaces' }],
                    'provider': [{ value: '"aws"', desc: 'AWS' }, { value: '"gcp"', desc: 'GCP' }, { value: '"azure"', desc: 'Azure' }],
                    'cidr': [{ value: '"10.0.0.0/16"', desc: 'VPC default' }, { value: '"10.0.1.0/24"', desc: 'Subnet' }],
                    'instancetype': [{ value: '"t2.micro"', desc: 'Free tier' }, { value: '"t3.small"', desc: '2 vCPU' }],
                    'runtime': [{ value: '"nodejs18.x"', desc: 'Node 18' }, { value: '"python3.11"', desc: 'Python 3.11' }],
                    'loglevel': [{ value: '"debug"', desc: 'Debug' }, { value: '"info"', desc: 'Info' }, { value: '"warn"', desc: 'Warn' }, { value: '"error"', desc: 'Error' }],
                    'name': [{ value: '""', desc: 'empty string' }],
                };
                const strSuggestions = stringSuggestions[propName];
                if (strSuggestions) {
                    strSuggestions.forEach(s => completions.push({ label: s.value, kind: CompletionItemKind.Value, detail: s.desc, insertText: s.value }));
                } else {
                    completions.push({ label: '""', kind: CompletionItemKind.Value, detail: 'empty string', insertText: '""' });
                }
            }
        } else {
            // Before '=' in component definition - show keywords for input/output declarations
            ['input', 'output', 'var', 'resource', 'component'].forEach(kw => {
                completions.push({ label: kw, kind: CompletionItemKind.Keyword, detail: 'keyword' });
            });
            TYPES.forEach(t => {
                completions.push({ label: t, kind: CompletionItemKind.TypeParameter, detail: 'type' });
            });
        }

        return completions;
    }

    // Find enclosing block context (resource or component we're inside)
    const enclosingBlock = findEnclosingBlock(text, offset);

    // Check if we're after '=' (value context - types should not be shown)
    const isValueContext = isAfterEquals(text, offset);

    // If inside a resource/component body and NOT after '=', show only schema/input properties
    if (enclosingBlock && !isValueContext) {
        // Check if we're on a line that already has a property assignment started
        // (i.e., cursor is after the property name, not at the start of a new property)
        const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
        const lineBeforeCursor = text.substring(lineStart, offset);
        const isStartOfProperty = /^\s*\w*$/.test(lineBeforeCursor);

        // Check if we're inside a nested structure (object literal, array) within the block
        // by counting unmatched braces/brackets from block start to cursor
        const isInsideNestedValue = isInsideNestedStructure(text, enclosingBlock.start, offset);

        if (isInsideNestedValue) {
            // Inside a nested structure (object literal, array) - don't show schema properties
            // Return empty to avoid cluttering with unrelated completions
            return completions;
        }

        if (!isStartOfProperty) {
            // Not at the start of a new property line, but still inside resource/component body
            // Return empty - don't fall through to general completions
            return completions;
        } else {
            // Find properties already set in this block
            const alreadySet = findAlreadySetProperties(text, enclosingBlock.start, offset);

            if (enclosingBlock.type === 'resource') {
                // Show schema properties (excluding already set ones)
                // Use cross-file resolution
                const schemaProps = extractSchemaPropertyTypes(text, enclosingBlock.typeName, params.textDocument.uri);
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
                // Always return here - don't fall through to general completions
                return completions;
            } else if (enclosingBlock.type === 'component') {
                // Show component input properties (excluding already set ones)
                // Use cross-file resolution
                const inputTypes = extractComponentInputTypes(text, enclosingBlock.typeName, params.textDocument.uri);
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
                // Always return here - don't fall through to general completions
                return completions;
            }
        }
    }

    // Add keywords only if NOT in value context
    if (!isValueContext) {
        KEYWORDS.forEach(kw => {
            completions.push({
                label: kw,
                kind: CompletionItemKind.Keyword,
                detail: 'keyword',
                sortText: '9' + kw // Keywords last
            });
        });
    }

    // Add types only if NOT in value context (right side of =)
    if (!isValueContext) {
        TYPES.forEach(t => {
            completions.push({
                label: t,
                kind: CompletionItemKind.TypeParameter,
                detail: 'type',
                sortText: '8' + t // Types before keywords
            });
            completions.push({
                label: t + '[]',
                kind: CompletionItemKind.TypeParameter,
                detail: 'array type',
                sortText: '8' + t + '[]'
            });
        });
    }

    // Priority order for value context: inputs, variables, resources, components, outputs, functions
    const valuePriority: Record<string, string> = {
        'input': '0',
        'variable': '1',
        'for': '1',      // Loop variables treated like variables
        'resource': '2',
        'component': '3',
        'output': '4',
        'function': '5',
        'schema': '6',
        'type': '7'
    };

    // Add declarations from current file (filtered based on context and scope)
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

        // Scope filtering for variables: only show if cursor is within the variable's scope
        if ((decl.type === 'variable' || decl.type === 'for') && decl.scopeStart !== undefined && decl.scopeEnd !== undefined) {
            // Variable is scoped - only visible within its scope
            if (offset < decl.scopeStart || offset > decl.scopeEnd) {
                return; // Skip - cursor is outside variable's scope
            }
        }

        // In value context, use priority sorting; otherwise alphabetical
        const priority = isValueContext ? (valuePriority[decl.type] || '9') : '';

        completions.push({
            label: decl.name,
            kind: getCompletionKind(decl.type),
            detail: decl.type + (decl.typeName ? `: ${decl.typeName}` : ''),
            sortText: priority + decl.name
        });
    });

    // Add context-aware suggestions at the end for resource/component value context
    if (isValueContext && enclosingBlock) {
        const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
        const lineText = text.substring(lineStart, offset);

        // Extract property name from line: propName = |
        const propNameMatch = lineText.match(/^\s*(\w+)\s*=\s*$/);
        const propName = propNameMatch ? propNameMatch[1].toLowerCase() : '';

        if (propName) {
            // Look up property type from schema/component definition
            let propType: string | null = null;
            if (enclosingBlock.type === 'resource') {
                const schemaProps = extractSchemaPropertyTypes(text, enclosingBlock.typeName, params.textDocument.uri);
                propType = schemaProps[propNameMatch![1]] || null;
            } else if (enclosingBlock.type === 'component') {
                const inputTypes = extractComponentInputTypes(text, enclosingBlock.typeName, params.textDocument.uri);
                propType = inputTypes[propNameMatch![1]] || null;
            }

            // Add contextual suggestions based on property type and name
            const contextSuggestions: { value: string; desc: string }[] = [];

            if (propType === 'boolean') {
                contextSuggestions.push({ value: 'true', desc: 'boolean' });
                contextSuggestions.push({ value: 'false', desc: 'boolean' });
            } else if (propType === 'number') {
                const numberSuggestions: Record<string, { value: string; desc: string }[]> = {
                    'port': [
                        { value: '80', desc: 'HTTP' }, { value: '443', desc: 'HTTPS' }, { value: '22', desc: 'SSH' },
                        { value: '3000', desc: 'Dev server' }, { value: '3306', desc: 'MySQL' }, { value: '5432', desc: 'PostgreSQL' },
                        { value: '6379', desc: 'Redis' }, { value: '8080', desc: 'HTTP alt' }, { value: '27017', desc: 'MongoDB' },
                    ],
                    'timeout': [
                        { value: '30', desc: '30 seconds' }, { value: '60', desc: '1 minute' }, { value: '300', desc: '5 minutes' },
                        { value: '900', desc: '15 minutes' }, { value: '3600', desc: '1 hour' },
                    ],
                    'memory': [
                        { value: '128', desc: '128 MB' }, { value: '256', desc: '256 MB' }, { value: '512', desc: '512 MB' },
                        { value: '1024', desc: '1 GB' }, { value: '2048', desc: '2 GB' },
                    ],
                    'replicas': [
                        { value: '1', desc: 'Single' }, { value: '2', desc: 'HA min' }, { value: '3', desc: 'Production' },
                    ],
                    'ttl': [
                        { value: '60', desc: '1 minute' }, { value: '300', desc: '5 minutes' }, { value: '3600', desc: '1 hour' },
                        { value: '86400', desc: '1 day' },
                    ],
                };
                const numSuggestions = numberSuggestions[propName];
                if (numSuggestions) {
                    contextSuggestions.push(...numSuggestions);
                }
            } else if (propType === 'string') {
                const stringSuggestions: Record<string, { value: string; desc: string }[]> = {
                    'environment': [{ value: '"dev"', desc: 'Development' }, { value: '"staging"', desc: 'Staging' }, { value: '"prod"', desc: 'Production' }],
                    'env': [{ value: '"dev"', desc: 'Development' }, { value: '"staging"', desc: 'Staging' }, { value: '"prod"', desc: 'Production' }],
                    'region': [{ value: '"us-east-1"', desc: 'AWS US East' }, { value: '"us-west-2"', desc: 'AWS US West' }, { value: '"eu-west-1"', desc: 'AWS EU' }],
                    'protocol': [{ value: '"http"', desc: 'HTTP' }, { value: '"https"', desc: 'HTTPS' }, { value: '"tcp"', desc: 'TCP' }],
                    'host': [{ value: '"localhost"', desc: 'Local' }, { value: '"0.0.0.0"', desc: 'All interfaces' }],
                    'provider': [{ value: '"aws"', desc: 'AWS' }, { value: '"gcp"', desc: 'GCP' }, { value: '"azure"', desc: 'Azure' }],
                    'cidr': [{ value: '"10.0.0.0/16"', desc: 'VPC default' }, { value: '"10.0.1.0/24"', desc: 'Subnet' }],
                    'instancetype': [{ value: '"t2.micro"', desc: 'Free tier' }, { value: '"t3.small"', desc: '2 vCPU' }, { value: '"m5.large"', desc: '2 vCPU 8GB' }],
                    'runtime': [{ value: '"nodejs18.x"', desc: 'Node 18' }, { value: '"python3.11"', desc: 'Python 3.11' }],
                    'loglevel': [{ value: '"debug"', desc: 'Debug' }, { value: '"info"', desc: 'Info' }, { value: '"warn"', desc: 'Warn' }, { value: '"error"', desc: 'Error' }],
                };
                const strSuggestions = stringSuggestions[propName];
                if (strSuggestions) {
                    contextSuggestions.push(...strSuggestions);
                }
            }

            // Add suggestions with lowest priority (shown at end)
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
    }

    return completions;
});

// Helper: Detect decorator context for prioritization
type DecoratorTarget = 'input' | 'output' | 'resource' | 'component' | 'schema' | 'schema property' | 'var' | 'fun' | null;

function getDecoratorContext(text: string, offset: number): DecoratorTarget {
    // Look at next few lines to see what declaration follows
    let lookAhead = text.substring(offset, Math.min(text.length, offset + 300));
    // Remove the current partial decorator if any
    lookAhead = lookAhead.replace(/^\w*/, '');

    // Skip other decorators that may follow
    lookAhead = lookAhead.replace(/^(\s*\n?\s*@\w+(\([^)]*\))?\s*)+/, '');

    // Check what follows - order matters (more specific first)
    if (/^\s*\n?\s*input\b/.test(lookAhead)) {
        return 'input';
    }
    if (/^\s*\n?\s*output\b/.test(lookAhead)) {
        return 'output';
    }
    if (/^\s*\n?\s*resource\b/.test(lookAhead)) {
        return 'resource';
    }
    if (/^\s*\n?\s*component\b/.test(lookAhead)) {
        return 'component';
    }
    if (/^\s*\n?\s*schema\b/.test(lookAhead)) {
        return 'schema';
    }
    if (/^\s*\n?\s*var\b/.test(lookAhead)) {
        return 'var';
    }
    if (/^\s*\n?\s*fun\b/.test(lookAhead)) {
        return 'fun';
    }
    // Check if we're inside a schema (for schema property)
    // Look backwards to see if we're inside a schema block
    const beforeCursor = text.substring(Math.max(0, offset - 500), offset);
    if (/schema\s+\w+\s*\{[^}]*$/.test(beforeCursor)) {
        return 'schema property';
    }

    return null;
}

// Helper: Check if a decorator can be applied to the given target
function decoratorAppliesToTarget(dec: DecoratorInfo, target: DecoratorTarget): boolean {
    if (!target || !dec.targets) return true; // No filtering if unknown context

    const targets = dec.targets.toLowerCase();

    // Handle special cases
    if (target === 'component') {
        // component (instances) means it applies to component instantiation
        return targets.includes('component');
    }
    if (target === 'schema property') {
        return targets.includes('schema property');
    }

    // Direct match
    return targets.includes(target);
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
    typeName: string;  // Schema name for resources, component type for components
    start: number;
    end: number;
}

function findEnclosingBlock(text: string, offset: number): BlockContext | null {
    // Find all resource/component declarations
    // Pattern: resource SchemaName instanceName { or component TypeName instanceName {
    const blockRegex = /\b(resource|component)\s+([\w.]+)\s+(\w+)\s*\{/g;
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
                name: match[3],
                type: match[1] as 'resource' | 'component',
                typeName: match[2],
                start: blockStart,
                end: blockEnd
            };
        }
    }

    return enclosing;
}

// Helper: Check if cursor is inside a schema body
function isInsideSchemaBody(text: string, offset: number): boolean {
    // Find all schema declarations: schema Name {
    const schemaRegex = /\bschema\s+\w+\s*\{/g;
    let match;

    while ((match = schemaRegex.exec(text)) !== null) {
        const openBracePos = match.index + match[0].length - 1;
        const closePos = findMatchingBraceForCompletion(text, openBracePos);

        // Check if offset is inside this schema block
        if (offset > openBracePos && offset < closePos) {
            return true;
        }
    }

    return false;
}

// Helper: Check if cursor is inside a component definition body (not instance)
function isInsideComponentDefinition(text: string, offset: number): boolean {
    // Find all component declarations: component TypeName {
    const compRegex = /\bcomponent\s+(\w+)\s*\{/g;
    let match;

    while ((match = compRegex.exec(text)) !== null) {
        // Check if this is a definition (not instantiation)
        // Definition: component TypeName { -> only one identifier before {
        // Instance: component TypeName instanceName { -> two identifiers before {
        const betweenKeywordAndBrace = text.substring(match.index + 10, match.index + match[0].length - 1).trim();
        const parts = betweenKeywordAndBrace.split(/\s+/).filter(s => s);

        if (parts.length !== 1) {
            continue; // This is an instantiation, skip
        }

        const openBracePos = match.index + match[0].length - 1;
        const closePos = findMatchingBraceForCompletion(text, openBracePos);

        // Check if offset is inside this component definition block
        if (offset > openBracePos && offset < closePos) {
            return true;
        }
    }

    return false;
}

// Helper: Find properties already set in a block
function findAlreadySetProperties(text: string, blockStart: number, currentOffset: number): Set<string> {
    const alreadySet = new Set<string>();

    // Find the opening brace
    let bracePos = text.indexOf('{', blockStart);
    if (bracePos === -1) return alreadySet;

    // Get the body text from opening brace to current position
    const bodyText = text.substring(bracePos + 1, currentOffset);

    // Find all property assignments: propertyName =
    const propRegex = /^\s*(\w+)\s*=/gm;
    let match;
    while ((match = propRegex.exec(bodyText)) !== null) {
        alreadySet.add(match[1]);
    }

    return alreadySet;
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

// Helper: Find all Kite files in the workspace
function findKiteFilesInWorkspace(): string[] {
    const kiteFiles: string[] = [];

    function scanDirectory(dir: string) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    // Skip node_modules, .git, etc.
                    if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        scanDirectory(fullPath);
                    }
                } else if (entry.isFile() && entry.name.endsWith('.kite')) {
                    kiteFiles.push(fullPath);
                }
            }
        } catch {
            // Ignore permission errors, etc.
        }
    }

    for (const folder of workspaceFolders) {
        scanDirectory(folder);
    }

    return kiteFiles;
}

// Helper: Read file content safely
function readFileContent(filePath: string): string | null {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return null;
    }
}

// Helper: Get text content for a file (from open document or file system)
function getFileContent(filePath: string, currentDocUri?: string): string | null {
    // First check if it's the current document
    if (currentDocUri) {
        const currentPath = URI.parse(currentDocUri).fsPath;
        if (currentPath === filePath) {
            const doc = documents.get(currentDocUri);
            if (doc) return doc.getText();
        }
    }

    // Check if document is open by URI
    const uri = URI.file(filePath).toString();
    const openDoc = documents.get(uri);
    if (openDoc) {
        return openDoc.getText();
    }

    // Also check all open documents by path (handles case-sensitivity and encoding differences)
    for (const doc of documents.all()) {
        try {
            const docPath = URI.parse(doc.uri).fsPath;
            if (docPath === filePath) {
                return doc.getText();
            }
        } catch {
            // Ignore URI parsing errors
        }
    }

    // Read from file system
    return readFileContent(filePath);
}

// Helper: Check if cursor is inside a nested structure (object literal or array) within a block
// Returns true if we're inside a value like `tag = { ... }` or `ips = [ ... ]`
function isInsideNestedStructure(text: string, blockStart: number, cursorOffset: number): boolean {
    // Find the opening brace of the block
    let bracePos = text.indexOf('{', blockStart);
    if (bracePos === -1 || bracePos >= cursorOffset) return false;

    // Walk from after the opening brace to cursor position, tracking depth
    // Depth 0 = at block level (where property assignments are)
    // Depth > 0 = inside a nested structure
    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = bracePos + 1; i < cursorOffset; i++) {
        const char = text[i];

        // Handle strings (don't count braces inside strings)
        if ((char === '"' || char === "'") && (i === 0 || text[i - 1] !== '\\')) {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
            continue;
        }

        if (inString) continue;

        // Track depth for braces and brackets
        if (char === '{' || char === '[') {
            depth++;
        } else if (char === '}' || char === ']') {
            depth--;
            if (depth < 0) depth = 0; // Safety
        }
    }

    return depth > 0;
}

// Helper: Represents an import statement
interface ImportInfo {
    path: string;
    symbols: string[];  // Empty array means wildcard import (import *)
}

// Helper: Extract imports from text
function extractImports(text: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    // Pattern: import * from "path"
    const wildcardRegex = /\bimport\s+\*\s+from\s+["']([^"']+)["']/g;
    let match;
    while ((match = wildcardRegex.exec(text)) !== null) {
        imports.push({ path: match[1], symbols: [] });
    }

    // Pattern: import SymbolName from "path" or import Symbol1, Symbol2 from "path"
    const namedRegex = /\bimport\s+([\w\s,]+)\s+from\s+["']([^"']+)["']/g;
    while ((match = namedRegex.exec(text)) !== null) {
        const symbolsPart = match[1].trim();
        if (symbolsPart !== '*') {
            const symbols = symbolsPart.split(',').map(s => s.trim()).filter(s => s);
            imports.push({ path: match[2], symbols });
        }
    }

    return imports;
}

// Helper: Check if a symbol from a file is imported
function isSymbolImported(imports: ImportInfo[], symbolName: string, filePath: string, currentFilePath: string): boolean {
    const currentDir = path.dirname(currentFilePath);

    for (const importInfo of imports) {
        // Handle relative imports like "common.kite" or "./common.kite"
        let resolvedPath: string;

        if (importInfo.path.startsWith('./') || importInfo.path.startsWith('../')) {
            resolvedPath = path.resolve(currentDir, importInfo.path);
        } else if (importInfo.path.endsWith('.kite')) {
            // Relative to current directory
            resolvedPath = path.resolve(currentDir, importInfo.path);
        } else {
            // Package-style path like "aws.DatabaseConfig" -> aws/DatabaseConfig.kite
            const packagePath = importInfo.path.replace(/\./g, '/') + '.kite';
            resolvedPath = path.resolve(currentDir, packagePath);
        }

        // Normalize paths for comparison
        if (path.normalize(resolvedPath) === path.normalize(filePath)) {
            // File matches - check if symbol is imported
            if (importInfo.symbols.length === 0) {
                // Wildcard import - all symbols are accessible
                return true;
            } else if (importInfo.symbols.includes(symbolName)) {
                // Named import includes this symbol
                return true;
            }
        }
    }

    return false;
}

// Helper: Find schema or component type definition
function findTypeDefinition(text: string, offset: number, word: string, currentDocUri: string): Location | null {
    // Check if this word is a type reference in a resource or component declaration
    // Pattern: resource SchemaName instanceName { - clicking on SchemaName
    // Pattern: component TypeName instanceName { - clicking on TypeName (for instantiation)

    // Find the actual start of the word (cursor could be anywhere in the word)
    let wordStart = offset;
    while (wordStart > 0 && /\w/.test(text[wordStart - 1])) {
        wordStart--;
    }

    // Look backwards from the word to see if it's preceded by 'resource' or 'component'
    const beforeWord = text.substring(Math.max(0, wordStart - 50), wordStart);

    let isSchemaRef = false;
    let isComponentRef = false;

    // Find the actual end of the word
    let wordEnd = offset;
    while (wordEnd < text.length && /\w/.test(text[wordEnd])) {
        wordEnd++;
    }

    if (/\bresource\s+$/.test(beforeWord)) {
        isSchemaRef = true;
    } else if (/\bcomponent\s+$/.test(beforeWord)) {
        // Check if this is an instantiation (has instance name after) or definition
        const afterWord = text.substring(wordEnd, Math.min(text.length, wordEnd + 50));
        if (/^\s+\w+\s*\{/.test(afterWord)) {
            // Has instance name after - this is an instantiation, word is the type
            isComponentRef = true;
        }
    }

    const currentFilePath = URI.parse(currentDocUri).fsPath;
    const imports = extractImports(text);

    if (isSchemaRef) {
        // Find schema definition in current file
        const location = findSchemaDefinition(text, word, currentDocUri);
        if (location) return location;

        // Try other files in workspace (only if imported)
        try {
            const kiteFiles = findKiteFilesInWorkspace();
            for (const filePath of kiteFiles) {
                const fileContent = getFileContent(filePath, currentDocUri);
                if (fileContent) {
                    const loc = findSchemaDefinition(fileContent, word, filePath);
                    if (loc) {
                        // Check if this symbol is imported
                        if (isSymbolImported(imports, word, filePath, currentFilePath)) {
                            return loc;
                        }
                        // Symbol not imported - diagnostic will show error with quick fix
                        return null;
                    }
                }
            }
        } catch {
            // Ignore cross-file lookup errors
        }
    }

    if (isComponentRef) {
        // Find component definition in current file
        const location = findComponentDefinition(text, word, currentDocUri);
        if (location) return location;

        // Try other files in workspace (only if imported)
        try {
            const kiteFiles = findKiteFilesInWorkspace();
            for (const filePath of kiteFiles) {
                const fileContent = getFileContent(filePath, currentDocUri);
                if (fileContent) {
                    const loc = findComponentDefinition(fileContent, word, filePath);
                    if (loc) {
                        // Check if this symbol is imported
                        if (isSymbolImported(imports, word, filePath, currentFilePath)) {
                            return loc;
                        }
                        // Symbol not imported - diagnostic will show error with quick fix
                        return null;
                    }
                }
            }
        } catch {
            // Ignore cross-file lookup errors
        }
    }

    // Check if this is a function call: functionName(
    const afterWord = text.substring(wordEnd, Math.min(text.length, wordEnd + 10));
    const isFunctionCall = /^\s*\(/.test(afterWord);

    if (isFunctionCall) {
        // Find function definition in current file
        const location = findFunctionDefinition(text, word, currentDocUri);
        if (location) return location;

        // Try other files in workspace (only if imported)
        try {
            const kiteFiles = findKiteFilesInWorkspace();
            for (const filePath of kiteFiles) {
                const fileContent = getFileContent(filePath, currentDocUri);
                if (fileContent) {
                    const loc = findFunctionDefinition(fileContent, word, filePath);
                    if (loc) {
                        // Check if this symbol is imported
                        if (isSymbolImported(imports, word, filePath, currentFilePath)) {
                            return loc;
                        }
                        // Symbol not imported - diagnostic will show error with quick fix
                        return null;
                    }
                }
            }
        } catch {
            // Ignore cross-file lookup errors
        }
    }

    return null;
}

// Helper: Find schema definition location in text
function findSchemaDefinition(text: string, schemaName: string, filePathOrUri: string): Location | null {
    const regex = new RegExp(`\\bschema\\s+(${escapeRegex(schemaName)})\\s*\\{`, 'g');
    const match = regex.exec(text);

    if (match) {
        const nameStart = match.index + match[0].indexOf(schemaName);
        const nameEnd = nameStart + schemaName.length;

        // Convert to Position
        const lines = text.substring(0, nameStart).split('\n');
        const line = lines.length - 1;
        const character = lines[lines.length - 1].length;

        const endLines = text.substring(0, nameEnd).split('\n');
        const endLine = endLines.length - 1;
        const endCharacter = endLines[endLines.length - 1].length;

        const uri = filePathOrUri.startsWith('file://') ? filePathOrUri : URI.file(filePathOrUri).toString();

        return Location.create(uri, Range.create(
            Position.create(line, character),
            Position.create(endLine, endCharacter)
        ));
    }

    return null;
}

// Helper: Find function definition location in text
function findFunctionDefinition(text: string, functionName: string, filePathOrUri: string): Location | null {
    // Function definition: fun functionName(...)
    const regex = new RegExp(`\\bfun\\s+(${escapeRegex(functionName)})\\s*\\(`, 'g');
    const match = regex.exec(text);

    if (match) {
        const nameStart = match.index + match[0].indexOf(functionName);
        const nameEnd = nameStart + functionName.length;

        // Convert to Position
        const lines = text.substring(0, nameStart).split('\n');
        const line = lines.length - 1;
        const character = lines[lines.length - 1].length;

        const endLines = text.substring(0, nameEnd).split('\n');
        const endLine = endLines.length - 1;
        const endCharacter = endLines[endLines.length - 1].length;

        const uri = filePathOrUri.startsWith('file://') ? filePathOrUri : URI.file(filePathOrUri).toString();

        return Location.create(uri, Range.create(
            Position.create(line, character),
            Position.create(endLine, endCharacter)
        ));
    }

    return null;
}

// Helper: Find component definition location in text
function findComponentDefinition(text: string, componentName: string, filePathOrUri: string): Location | null {
    // Component definition: component TypeName { (without instance name)
    const regex = new RegExp(`\\bcomponent\\s+(${escapeRegex(componentName)})\\s*\\{`, 'g');
    let match;

    while ((match = regex.exec(text)) !== null) {
        // Verify this is a definition (no instance name between type and {)
        const fullMatch = match[0];
        const afterComponent = fullMatch.substring(10); // after "component "
        const parts = afterComponent.trim().split(/\s+/);

        // Definition has: TypeName { -> parts = ["TypeName", "{"]
        // Instantiation has: TypeName instanceName { -> parts = ["TypeName", "instanceName", "{"]
        if (parts.length === 2 && parts[1] === '{') {
            // This is a definition
            const nameStart = match.index + match[0].indexOf(componentName);
            const nameEnd = nameStart + componentName.length;

            // Convert to Position
            const lines = text.substring(0, nameStart).split('\n');
            const line = lines.length - 1;
            const character = lines[lines.length - 1].length;

            const endLines = text.substring(0, nameEnd).split('\n');
            const endLine = endLines.length - 1;
            const endCharacter = endLines[endLines.length - 1].length;

            const uri = filePathOrUri.startsWith('file://') ? filePathOrUri : URI.file(filePathOrUri).toString();

            return Location.create(uri, Range.create(
                Position.create(line, character),
                Position.create(endLine, endCharacter)
            ));
        }
    }

    return null;
}

// Helper: Find schema property location in text
function findSchemaPropertyLocation(text: string, schemaName: string, propertyName: string, filePathOrUri: string): Location | null {
    // Handle dotted schema names like "VM.Instance" - just use the last part for matching
    const schemaBaseName = schemaName.includes('.') ? schemaName.split('.').pop()! : schemaName;

    // Find schema definition: schema SchemaName {
    const defRegex = new RegExp(`\\bschema\\s+${escapeRegex(schemaBaseName)}\\s*\\{`, 'g');
    let match;

    while ((match = defRegex.exec(text)) !== null) {
        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;

        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }

        const bodyStartOffset = braceStart + 1;
        const bodyText = text.substring(bodyStartOffset, pos - 1);

        // Find the property in the body
        // Properties: type propertyName [= defaultValue]
        // Note: ^\s* to handle indentation
        const propRegex = new RegExp(`^\\s*(\\w+(?:\\[\\])?)\\s+(${escapeRegex(propertyName)})(?:\\s*=.*)?$`, 'gm');
        let propMatch;

        while ((propMatch = propRegex.exec(bodyText)) !== null) {
            // Calculate the position of the property name in the original text
            const propNameOffset = bodyStartOffset + propMatch.index + propMatch[0].indexOf(propertyName);
            const propNameEndOffset = propNameOffset + propertyName.length;

            // Convert to Position
            const lines = text.substring(0, propNameOffset).split('\n');
            const line = lines.length - 1;
            const character = lines[lines.length - 1].length;

            const endLines = text.substring(0, propNameEndOffset).split('\n');
            const endLine = endLines.length - 1;
            const endCharacter = endLines[endLines.length - 1].length;

            const uri = filePathOrUri.startsWith('file://') ? filePathOrUri : URI.file(filePathOrUri).toString();

            return Location.create(uri, Range.create(
                Position.create(line, character),
                Position.create(endLine, endCharacter)
            ));
        }
    }

    return null;
}

// Helper: Find component input location in text
function findComponentInputLocation(text: string, componentTypeName: string, inputName: string, filePathOrUri: string): Location | null {
    // Find component type definition: component TypeName { (without instance name)
    const defRegex = new RegExp(`\\bcomponent\\s+${escapeRegex(componentTypeName)}\\s*\\{`, 'g');
    let match;

    while ((match = defRegex.exec(text)) !== null) {
        // Check if this is a definition (not instantiation)
        const betweenKeywordAndBrace = text.substring(match.index + 10, match.index + match[0].length - 1).trim();
        const identifiers = betweenKeywordAndBrace.split(/\s+/).filter(s => s && s !== componentTypeName);

        if (identifiers.length > 0) {
            // Has extra identifier(s), this is an instantiation, skip
            continue;
        }

        // This is a component definition - find the input
        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;

        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }

        const bodyStartOffset = braceStart + 1;
        const bodyText = text.substring(bodyStartOffset, pos - 1);

        // Find input declaration: input type inputName [= defaultValue]
        const inputRegex = new RegExp(`\\binput\\s+(\\w+(?:\\[\\])?)\\s+(${escapeRegex(inputName)})`, 'g');
        let inputMatch;

        while ((inputMatch = inputRegex.exec(bodyText)) !== null) {
            // Calculate the position of the input name in the original text
            const inputNameOffset = bodyStartOffset + inputMatch.index + inputMatch[0].lastIndexOf(inputName);
            const inputNameEndOffset = inputNameOffset + inputName.length;

            // Convert to Position
            const lines = text.substring(0, inputNameOffset).split('\n');
            const line = lines.length - 1;
            const character = lines[lines.length - 1].length;

            const endLines = text.substring(0, inputNameEndOffset).split('\n');
            const endLine = endLines.length - 1;
            const endCharacter = endLines[endLines.length - 1].length;

            const uri = filePathOrUri.startsWith('file://') ? filePathOrUri : URI.file(filePathOrUri).toString();

            return Location.create(uri, Range.create(
                Position.create(line, character),
                Position.create(endLine, endCharacter)
            ));
        }
    }

    return null;
}

// Go to Definition handler
connection.onDefinition((params: TextDocumentPositionParams): Definition | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const text = document.getText();
    const offset = document.offsetAt(params.position);
    const word = getWordAtPosition(document, params.position);
    if (!word) return null;

    // Check if this is a schema type in a resource declaration: resource SchemaName instanceName {
    // or a component type in a component instantiation: component TypeName instanceName {
    try {
        const typeRefLocation = findTypeDefinition(text, offset, word, params.textDocument.uri);
        if (typeRefLocation) {
            return typeRefLocation;
        }
    } catch {
        // Ignore errors in type definition lookup
    }

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

    // Check if this is a property assignment inside a resource/component body
    // Pattern: property = value (clicking on 'property' should go to schema/component definition)
    const enclosingBlock = findEnclosingBlock(text, offset);
    if (enclosingBlock) {
        // Check if word is followed by = (property assignment)
        let wordEnd = offset;
        while (wordEnd < text.length && /\w/.test(text[wordEnd])) {
            wordEnd++;
        }
        const afterWord = text.substring(wordEnd, Math.min(text.length, wordEnd + 10)).trim();

        if (afterWord.startsWith('=') && !afterWord.startsWith('==')) {
            // This is a property assignment - find the property in schema/component definition
            const currentFilePath = URI.parse(params.textDocument.uri).fsPath;
            const imports = extractImports(text);

            if (enclosingBlock.type === 'resource') {
                // Find schema property definition - first try current file
                const schemaLoc = findSchemaPropertyLocation(text, enclosingBlock.typeName, word, params.textDocument.uri);
                if (schemaLoc) return schemaLoc;

                // Try cross-file only if schema type is imported
                const kiteFiles = findKiteFilesInWorkspace();
                for (const filePath of kiteFiles) {
                    if (filePath === currentFilePath) continue;
                    const fileContent = getFileContent(filePath, params.textDocument.uri);
                    if (fileContent) {
                        // Check if the schema type is imported from this file
                        if (isSymbolImported(imports, enclosingBlock.typeName, filePath, currentFilePath)) {
                            const loc = findSchemaPropertyLocation(fileContent, enclosingBlock.typeName, word, filePath);
                            if (loc) return loc;
                        }
                    }
                }
            } else if (enclosingBlock.type === 'component') {
                // Find component input definition - first try current file
                const inputLoc = findComponentInputLocation(text, enclosingBlock.typeName, word, params.textDocument.uri);
                if (inputLoc) return inputLoc;

                // Try cross-file only if component type is imported
                const kiteFiles = findKiteFilesInWorkspace();
                for (const filePath of kiteFiles) {
                    if (filePath === currentFilePath) continue;
                    const fileContent = getFileContent(filePath, params.textDocument.uri);
                    if (fileContent) {
                        // Check if the component type is imported from this file
                        if (isSymbolImported(imports, enclosingBlock.typeName, filePath, currentFilePath)) {
                            const loc = findComponentInputLocation(fileContent, enclosingBlock.typeName, word, filePath);
                            if (loc) return loc;
                        }
                    }
                }
            }
        }
    }

    // Search for top-level declarations in current file first
    const declarations = declarationCache.get(params.textDocument.uri) || [];
    const decl = declarations.find(d => d.name === word);

    if (decl) {
        return Location.create(decl.uri, decl.nameRange);
    }

    // Search other files in workspace for imported symbols
    const currentFilePath = URI.parse(params.textDocument.uri).fsPath;
    const imports = extractImports(text);
    const kiteFiles = findKiteFilesInWorkspace();

    for (const filePath of kiteFiles) {
        if (filePath === currentFilePath) continue;

        // Check if symbols from this file are imported
        const fileContent = getFileContent(filePath, params.textDocument.uri);
        if (fileContent) {
            // Look for the declaration in this file
            const fileUri = URI.file(filePath).toString();

            // Check for schema definition
            const schemaRegex = new RegExp(`\\bschema\\s+(${escapeRegex(word)})\\s*\\{`);
            const schemaMatch = schemaRegex.exec(fileContent);
            if (schemaMatch) {
                // Check if imported
                if (isSymbolImported(imports, word, filePath, currentFilePath)) {
                    const nameStart = schemaMatch.index + schemaMatch[0].indexOf(word);
                    const startPos = offsetToPosition(fileContent, nameStart);
                    const endPos = offsetToPosition(fileContent, nameStart + word.length);
                    return Location.create(fileUri, Range.create(startPos, endPos));
                }
            }

            // Check for component definition
            const componentDefRegex = new RegExp(`\\bcomponent\\s+(${escapeRegex(word)})\\s*\\{`);
            const componentDefMatch = componentDefRegex.exec(fileContent);
            if (componentDefMatch) {
                // Check if this is a definition (not an instantiation)
                // If there's no instance name between component name and {, it's a definition
                const betweenKeywordAndBrace = fileContent.substring(
                    componentDefMatch.index + 10,
                    componentDefMatch.index + componentDefMatch[0].length - 1
                ).trim();
                const parts = betweenKeywordAndBrace.split(/\s+/).filter((s: string) => s);
                if (parts.length === 1) {
                    // Check if imported
                    if (isSymbolImported(imports, word, filePath, currentFilePath)) {
                        const nameStart = componentDefMatch.index + componentDefMatch[0].indexOf(word);
                        const startPos = offsetToPosition(fileContent, nameStart);
                        const endPos = offsetToPosition(fileContent, nameStart + word.length);
                        return Location.create(fileUri, Range.create(startPos, endPos));
                    }
                }
            }

            // Check for function definition
            const funcRegex = new RegExp(`\\bfun\\s+(${escapeRegex(word)})\\s*\\(`);
            const funcMatch = funcRegex.exec(fileContent);
            if (funcMatch) {
                if (isSymbolImported(imports, word, filePath, currentFilePath)) {
                    const nameStart = funcMatch.index + funcMatch[0].indexOf(word);
                    const startPos = offsetToPosition(fileContent, nameStart);
                    const endPos = offsetToPosition(fileContent, nameStart + word.length);
                    return Location.create(fileUri, Range.create(startPos, endPos));
                }
            }

            // Check for type definition
            const typeRegex = new RegExp(`\\btype\\s+(${escapeRegex(word)})\\s*=`);
            const typeMatch = typeRegex.exec(fileContent);
            if (typeMatch) {
                if (isSymbolImported(imports, word, filePath, currentFilePath)) {
                    const nameStart = typeMatch.index + typeMatch[0].indexOf(word);
                    const startPos = offsetToPosition(fileContent, nameStart);
                    const endPos = offsetToPosition(fileContent, nameStart + word.length);
                    return Location.create(fileUri, Range.create(startPos, endPos));
                }
            }

            // Check for resource/component instance (var-like declarations)
            const resourceRegex = new RegExp(`\\bresource\\s+\\w+(?:\\.\\w+)*\\s+(${escapeRegex(word)})\\s*\\{`);
            const resourceMatch = resourceRegex.exec(fileContent);
            if (resourceMatch) {
                if (isSymbolImported(imports, word, filePath, currentFilePath)) {
                    const nameStart = resourceMatch.index + resourceMatch[0].indexOf(word);
                    const startPos = offsetToPosition(fileContent, nameStart);
                    const endPos = offsetToPosition(fileContent, nameStart + word.length);
                    return Location.create(fileUri, Range.create(startPos, endPos));
                }
            }

            // Check for variable definition
            const varRegex = new RegExp(`\\bvar\\s+(?:\\w+\\s+)?(${escapeRegex(word)})\\s*=`);
            const varMatch = varRegex.exec(fileContent);
            if (varMatch) {
                if (isSymbolImported(imports, word, filePath, currentFilePath)) {
                    const nameStart = varMatch.index + varMatch[0].indexOf(word);
                    const startPos = offsetToPosition(fileContent, nameStart);
                    const endPos = offsetToPosition(fileContent, nameStart + word.length);
                    return Location.create(fileUri, Range.create(startPos, endPos));
                }
            }
        }
    }

    return null;
});

// Helper: Find property assignments and property access references in component instantiations
function findComponentPropertyReferences(
    componentTypeName: string,
    propertyName: string,
    currentDocUri: string
): Location[] {
    const locations: Location[] = [];
    const currentFilePath = URI.parse(currentDocUri).fsPath;

    const kiteFiles = findKiteFilesInWorkspace();

    for (const filePath of kiteFiles) {
        const fileContent = getFileContent(filePath, currentDocUri);
        if (!fileContent) continue;

        const fileUri = filePath === currentFilePath ? currentDocUri : URI.file(filePath).toString();
        const doc = documents.get(fileUri);

        // Find all instantiations using utility function
        const instantiations = findComponentInstantiations(fileContent, componentTypeName);

        for (const inst of instantiations) {
            // Find property assignments using utility function
            const assignments = findPropertyAssignments(fileContent, inst.bodyStart, inst.bodyEnd, propertyName);
            for (const assign of assignments) {
                const startPos = doc
                    ? doc.positionAt(assign.startOffset)
                    : offsetToPosition(fileContent, assign.startOffset);
                const endPos = doc
                    ? doc.positionAt(assign.endOffset)
                    : offsetToPosition(fileContent, assign.endOffset);
                locations.push(Location.create(fileUri, Range.create(startPos, endPos)));
            }

            // Find property access using utility function
            const accesses = findPropertyAccess(fileContent, inst.instanceName, propertyName);
            for (const access of accesses) {
                const startPos = doc
                    ? doc.positionAt(access.startOffset)
                    : offsetToPosition(fileContent, access.startOffset);
                const endPos = doc
                    ? doc.positionAt(access.endOffset)
                    : offsetToPosition(fileContent, access.endOffset);
                locations.push(Location.create(fileUri, Range.create(startPos, endPos)));
            }
        }
    }

    return locations;
}

// Helper: Find property assignments and property access in resource instantiations for a schema
function findSchemaPropertyReferences(
    schemaName: string,
    propertyName: string,
    currentDocUri: string
): Location[] {
    const locations: Location[] = [];
    const currentFilePath = URI.parse(currentDocUri).fsPath;
    const kiteFiles = findKiteFilesInWorkspace();

    for (const filePath of kiteFiles) {
        const fileContent = getFileContent(filePath, currentDocUri);
        if (!fileContent) continue;

        const fileUri = filePath === currentFilePath ? currentDocUri : URI.file(filePath).toString();
        const doc = documents.get(fileUri);

        // Use utility to find all resource instantiations of this schema type
        const resources = findResourceInstantiations(fileContent, schemaName);

        for (const res of resources) {
            // Find property assignments using utility
            const assignments = findPropertyAssignments(fileContent, res.bodyStart, res.bodyEnd, propertyName);
            for (const assign of assignments) {
                const startPos = doc
                    ? doc.positionAt(assign.startOffset)
                    : offsetToPosition(fileContent, assign.startOffset);
                const endPos = doc
                    ? doc.positionAt(assign.endOffset)
                    : offsetToPosition(fileContent, assign.endOffset);
                locations.push(Location.create(fileUri, Range.create(startPos, endPos)));
            }

            // Find property access references using utility
            const accesses = findPropertyAccess(fileContent, res.instanceName, propertyName);
            for (const access of accesses) {
                const startPos = doc
                    ? doc.positionAt(access.startOffset)
                    : offsetToPosition(fileContent, access.startOffset);
                const endPos = doc
                    ? doc.positionAt(access.endOffset)
                    : offsetToPosition(fileContent, access.endOffset);
                locations.push(Location.create(fileUri, Range.create(startPos, endPos)));
            }
        }
    }

    return locations;
}

// Helper: Find all references to a symbol across the workspace (scope-aware)
// If cursorOffset is provided, finds the declaration at that position and respects its scope
function findAllReferences(word: string, currentDocUri: string, cursorOffset?: number): Location[] {
    const locations: Location[] = [];
    const currentFilePath = URI.parse(currentDocUri).fsPath;

    // Get current document text
    const currentDoc = documents.get(currentDocUri);
    const currentText = currentDoc ? currentDoc.getText() : getFileContent(currentFilePath, currentDocUri);

    if (!currentText) {
        return locations;
    }

    // Check if we're renaming a schema property
    if (cursorOffset !== undefined) {
        const schemaContext = getSchemaContextAtPosition(currentText, cursorOffset);
        if (schemaContext) {
            // We're inside a schema definition - check if cursor is on a property name
            const bodyText = currentText.substring(schemaContext.scopeStart + 1, schemaContext.scopeEnd - 1);
            const bodyOffset = cursorOffset - schemaContext.scopeStart - 1;

            // Check if we're on a property name: type propertyName
            // Find the line containing the cursor
            const beforeCursor = bodyText.substring(0, bodyOffset);
            const lineStart = beforeCursor.lastIndexOf('\n') + 1;
            const lineEnd = bodyText.indexOf('\n', bodyOffset);
            const line = bodyText.substring(lineStart, lineEnd === -1 ? bodyText.length : lineEnd);

            // Match property definition: type propertyName [= default]
            const propDefMatch = line.match(/^\s*(\w+(?:\[\])?)\s+(\w+)(?:\s*=.*)?$/);
            if (propDefMatch && propDefMatch[2] === word) {
                // This is a schema property - find the property definition location
                const propNameIndex = line.indexOf(word, line.indexOf(propDefMatch[1]) + propDefMatch[1].length);
                const propOffset = schemaContext.scopeStart + 1 + lineStart + propNameIndex;

                const propStartPos = currentDoc
                    ? currentDoc.positionAt(propOffset)
                    : offsetToPosition(currentText, propOffset);
                const propEndPos = currentDoc
                    ? currentDoc.positionAt(propOffset + word.length)
                    : offsetToPosition(currentText, propOffset + word.length);

                locations.push(Location.create(currentDocUri, Range.create(propStartPos, propEndPos)));

                // Find all resource instantiations that use this schema
                const propRefs = findSchemaPropertyReferences(schemaContext.schemaName, word, currentDocUri);
                locations.push(...propRefs);

                return locations;
            }
        }
    }

    // Check if we're on a property access like instance.property
    if (cursorOffset !== undefined) {
        // Look for pattern: identifier.word where word is what we're renaming
        const beforeCursor = currentText.substring(Math.max(0, cursorOffset - 100), cursorOffset);
        const afterWord = currentText.substring(cursorOffset, Math.min(currentText.length, cursorOffset + word.length + 10));

        // Check if there's a dot before the word
        const dotMatch = beforeCursor.match(/(\w+)\.\s*$/);
        if (dotMatch && afterWord.startsWith(word)) {
            const instanceName = dotMatch[1];

            // Find the component instance declaration
            const declarations = declarationCache.get(currentDocUri) || [];
            const instanceDecl = declarations.find(d =>
                d.name === instanceName &&
                d.type === 'component' &&
                d.componentType
            );

            if (instanceDecl && instanceDecl.componentType) {
                // This is a property access on a component instance
                // Find the input/output declaration in the component definition
                const componentTypeName = instanceDecl.componentType;

                // Search for the component definition and find the input/output
                const kiteFiles = findKiteFilesInWorkspace();
                for (const filePath of kiteFiles) {
                    const fileContent = getFileContent(filePath, currentDocUri);
                    if (!fileContent) continue;

                    // Find component definition
                    const compDefRegex = new RegExp(`\\bcomponent\\s+${escapeRegex(componentTypeName)}\\s*\\{`);
                    const compDefMatch = compDefRegex.exec(fileContent);

                    if (compDefMatch) {
                        // Found the component definition - find the input/output
                        const braceStart = compDefMatch.index + compDefMatch[0].length - 1;
                        let braceDepth = 1;
                        let pos = braceStart + 1;

                        while (pos < fileContent.length && braceDepth > 0) {
                            if (fileContent[pos] === '{') braceDepth++;
                            else if (fileContent[pos] === '}') braceDepth--;
                            pos++;
                        }

                        const bodyStart = braceStart + 1;
                        const bodyEnd = pos - 1;
                        const bodyText = fileContent.substring(bodyStart, bodyEnd);

                        // Find input/output with this name
                        const fieldRegex = new RegExp(`(?:^|\\n)\\s*(?:input|output)\\s+\\w+(?:\\[\\])?\\s+(${escapeRegex(word)})(?:\\s*=|\\s*$)`, 'm');
                        const fieldMatch = fieldRegex.exec(bodyText);

                        if (fieldMatch) {
                            // Found the field - now do a full rename from the definition
                            const fieldOffset = bodyStart + fieldMatch.index + fieldMatch[0].indexOf(word);
                            const fileUri = URI.file(filePath).toString();
                            const doc = documents.get(fileUri);

                            const fieldStartPos = doc
                                ? doc.positionAt(fieldOffset)
                                : offsetToPosition(fileContent, fieldOffset);
                            const fieldEndPos = doc
                                ? doc.positionAt(fieldOffset + word.length)
                                : offsetToPosition(fileContent, fieldOffset + word.length);

                            locations.push(Location.create(fileUri, Range.create(fieldStartPos, fieldEndPos)));

                            // Find usages within the component definition
                            const usageRegex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g');
                            let usageMatch;
                            while ((usageMatch = usageRegex.exec(bodyText)) !== null) {
                                const usageOffset = bodyStart + usageMatch.index;
                                if (usageOffset === fieldOffset) continue; // Skip the declaration itself

                                if (isInComment(fileContent, usageOffset)) continue;

                                const usageStartPos = doc
                                    ? doc.positionAt(usageOffset)
                                    : offsetToPosition(fileContent, usageOffset);
                                const usageEndPos = doc
                                    ? doc.positionAt(usageOffset + word.length)
                                    : offsetToPosition(fileContent, usageOffset + word.length);

                                locations.push(Location.create(fileUri, Range.create(usageStartPos, usageEndPos)));
                            }

                            // Find all property references in component instantiations
                            const propRefs = findComponentPropertyReferences(componentTypeName, word, currentDocUri);
                            locations.push(...propRefs);

                            return locations;
                        }
                    }
                }
            }
        }
    }

    // Determine scope constraints based on the declaration
    let scopeStart: number | undefined;
    let scopeEnd: number | undefined;
    let isLocalScope = false;
    let searchOtherFiles = true;
    let isComponentField = false;
    let componentTypeName: string | null = null;

    // If we have a cursor position, find the declaration and its scope
    if (cursorOffset !== undefined) {
        const declarations = declarationCache.get(currentDocUri) || [];

        // First, check if the cursor is ON a declaration
        let declaration = declarations.find(d =>
            d.name === word &&
            cursorOffset >= currentDoc!.offsetAt(d.nameRange.start) &&
            cursorOffset <= currentDoc!.offsetAt(d.nameRange.end)
        );

        // If not on a declaration, find which declaration this reference belongs to
        if (!declaration) {
            // Find all declarations with this name that are visible at the cursor position
            const visibleDecls = declarations.filter(d => {
                if (d.name !== word) return false;

                // If declaration has a scope, cursor must be within it
                if (d.scopeStart !== undefined && d.scopeEnd !== undefined) {
                    return cursorOffset >= d.scopeStart && cursorOffset <= d.scopeEnd;
                }

                // File-scoped declaration is always visible
                return true;
            });

            // Prefer the most local (innermost) declaration
            if (visibleDecls.length > 0) {
                declaration = visibleDecls.reduce((best, current) => {
                    // Scoped declarations are more local than file-scoped ones
                    if (current.scopeStart !== undefined && best.scopeStart === undefined) {
                        return current;
                    }
                    if (current.scopeStart === undefined && best.scopeStart !== undefined) {
                        return best;
                    }
                    // Both scoped: prefer the one with the smaller scope (more local)
                    if (current.scopeStart !== undefined && best.scopeStart !== undefined) {
                        const currentSize = current.scopeEnd! - current.scopeStart;
                        const bestSize = best.scopeEnd! - best.scopeStart!;
                        return currentSize < bestSize ? current : best;
                    }
                    return best;
                });
            }
        }

        // If we found a declaration, use its scope
        if (declaration) {
            if (declaration.scopeStart !== undefined && declaration.scopeEnd !== undefined) {
                // Check if this is an input/output in a component definition
                if (declaration.type === 'input' || declaration.type === 'output') {
                    componentTypeName = findComponentTypeForScope(currentText, declaration.scopeStart);
                    if (componentTypeName) {
                        isComponentField = true;
                        // Still search within the component definition scope
                        scopeStart = declaration.scopeStart;
                        scopeEnd = declaration.scopeEnd;
                        isLocalScope = true;
                        searchOtherFiles = false;

                        // Include the declaration itself
                        locations.push(Location.create(currentDocUri, declaration.nameRange));

                        // Also find all property assignments in component instantiations
                        const propRefs = findComponentPropertyReferences(componentTypeName, word, currentDocUri);
                        locations.push(...propRefs);
                    } else {
                        // Regular scoped input/output (shouldn't happen, but handle gracefully)
                        scopeStart = declaration.scopeStart;
                        scopeEnd = declaration.scopeEnd;
                        isLocalScope = true;
                        searchOtherFiles = false;
                        locations.push(Location.create(currentDocUri, declaration.nameRange));
                    }
                } else {
                    // Local variable/parameter - only search within scope, don't search other files
                    scopeStart = declaration.scopeStart;
                    scopeEnd = declaration.scopeEnd;
                    isLocalScope = true;
                    searchOtherFiles = false;

                    // Always include the declaration itself (important for parameters which are
                    // declared before the function body scope starts)
                    locations.push(Location.create(currentDocUri, declaration.nameRange));
                }
            } else {
                // File-scoped or global declaration
                // For functions, schemas, components, resources, types - search all files
                // For file-scoped variables - only search current file
                if (declaration.type === 'variable') {
                    searchOtherFiles = false;
                }
            }
        }
    }

    // Track declaration location to avoid duplicates
    const declarationKey = locations.length > 0
        ? `${locations[0].range.start.line}:${locations[0].range.start.character}`
        : null;

    // Search current file
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g');
    let match;
    while ((match = regex.exec(currentText)) !== null) {
        if (isInComment(currentText, match.index)) continue;

        // If we have scope constraints, check if the match is within scope
        if (isLocalScope && scopeStart !== undefined && scopeEnd !== undefined) {
            if (match.index < scopeStart || match.index > scopeEnd) {
                continue;
            }
        }

        const startPos = currentDoc
            ? currentDoc.positionAt(match.index)
            : offsetToPosition(currentText, match.index);
        const endPos = currentDoc
            ? currentDoc.positionAt(match.index + word.length)
            : offsetToPosition(currentText, match.index + word.length);

        // Skip if this is the declaration we already added
        const matchKey = `${startPos.line}:${startPos.character}`;
        if (matchKey === declarationKey) {
            continue;
        }

        locations.push(Location.create(currentDocUri, Range.create(startPos, endPos)));
    }

    // Search other files in workspace (only for non-local symbols)
    if (searchOtherFiles) {
        const kiteFiles = findKiteFilesInWorkspace();
        for (const filePath of kiteFiles) {
            if (filePath === currentFilePath) continue;

            const fileContent = getFileContent(filePath, currentDocUri);
            if (fileContent) {
                const fileUri = URI.file(filePath).toString();
                const fileRegex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g');
                let fileMatch;
                while ((fileMatch = fileRegex.exec(fileContent)) !== null) {
                    if (isInComment(fileContent, fileMatch.index)) continue;

                    const startPos = offsetToPosition(fileContent, fileMatch.index);
                    const endPos = offsetToPosition(fileContent, fileMatch.index + word.length);
                    locations.push(Location.create(fileUri, Range.create(startPos, endPos)));
                }
            }
        }
    }

    return locations;
}

// Find References handler
connection.onReferences((params): Location[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const word = getWordAtPosition(document, params.position);
    if (!word) return [];

    const cursorOffset = document.offsetAt(params.position);
    return findAllReferences(word, params.textDocument.uri, cursorOffset);
});

// Prepare Rename handler - validates if symbol can be renamed and returns the range
connection.onPrepareRename((params: PrepareRenameParams): Range | { range: Range; placeholder: string } | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const word = getWordAtPosition(document, params.position);
    if (!word) return null;

    // Don't allow renaming keywords
    if (KEYWORDS.includes(word)) {
        return null;
    }

    // Don't allow renaming built-in types
    if (TYPES.includes(word)) {
        return null;
    }

    // Don't allow renaming decorator names (check if cursor is after @)
    const text = document.getText();
    const offset = document.offsetAt(params.position);

    // Find word boundaries to get the exact range
    let start = offset;
    let end = offset;
    while (start > 0 && /\w/.test(text[start - 1])) {
        start--;
    }
    while (end < text.length && /\w/.test(text[end])) {
        end++;
    }

    // Check if this is a decorator name (preceded by @)
    if (start > 0 && text[start - 1] === '@') {
        return null;
    }

    // Check if this is inside a string (basic check)
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const lineText = text.substring(lineStart, start);
    const doubleQuotes = (lineText.match(/"/g) || []).length;
    const singleQuotes = (lineText.match(/'/g) || []).length;
    if (doubleQuotes % 2 !== 0 || singleQuotes % 2 !== 0) {
        return null;
    }

    // Check if in a comment
    if (isInComment(text, start)) {
        return null;
    }

    // Return the range and placeholder
    const startPos = document.positionAt(start);
    const endPos = document.positionAt(end);

    return {
        range: Range.create(startPos, endPos),
        placeholder: word
    };
});

// Rename handler
connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const word = getWordAtPosition(document, params.position);
    if (!word) return null;

    // Validate the new name
    const newName = params.newName.trim();

    // Check that new name is a valid identifier
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
        return null;
    }

    // Don't allow renaming to a keyword
    if (KEYWORDS.includes(newName)) {
        return null;
    }

    // Don't allow renaming to a built-in type
    if (TYPES.includes(newName)) {
        return null;
    }

    // Find all references (scope-aware)
    const cursorOffset = document.offsetAt(params.position);
    const locations = findAllReferences(word, params.textDocument.uri, cursorOffset);

    if (locations.length === 0) {
        return null;
    }

    // Group edits by document URI
    const changes: { [uri: string]: TextEdit[] } = {};

    for (const location of locations) {
        if (!changes[location.uri]) {
            changes[location.uri] = [];
        }
        changes[location.uri].push(TextEdit.replace(location.range, newName));
    }

    // Schedule a refresh of diagnostics for all open documents after the rename is applied
    // This ensures cross-file references are properly validated after the rename
    setTimeout(() => {
        for (const doc of documents.all()) {
            const diagnostics = validateDocument(doc);
            connection.sendDiagnostics({ uri: doc.uri, diagnostics });
        }
    }, 100);

    return { changes };
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

// Signature Help handler - shows function parameter hints
connection.onSignatureHelp((params: TextDocumentPositionParams): SignatureHelp | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const text = document.getText();
    const offset = document.offsetAt(params.position);

    // Find the function call we're inside
    const callInfo = findFunctionCallAtPosition(text, offset);
    if (!callInfo) return null;

    // Find the function declaration
    const declarations = declarationCache.get(params.textDocument.uri) || [];
    const funcDecl = declarations.find(d => d.type === 'function' && d.name === callInfo.functionName);

    if (!funcDecl || !funcDecl.parameters) return null;

    // Build parameter info
    const parameters: ParameterInformation[] = funcDecl.parameters.map(p => ({
        label: `${p.type} ${p.name}`,
        documentation: undefined
    }));

    // Build signature label: "functionName(type1 param1, type2 param2): returnType"
    const paramsStr = funcDecl.parameters.map(p => `${p.type} ${p.name}`).join(', ');
    let signatureLabel = `${funcDecl.name}(${paramsStr})`;
    if (funcDecl.returnType) {
        signatureLabel += `: ${funcDecl.returnType}`;
    }

    const signature: SignatureInformation = {
        label: signatureLabel,
        documentation: funcDecl.documentation,
        parameters
    };

    return {
        signatures: [signature],
        activeSignature: 0,
        activeParameter: callInfo.activeParameter
    };
});

// Inlay Hints handler - shows inline type hints and parameter names
connection.onRequest('textDocument/inlayHint', (params: InlayHintParams): InlayHint[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const hints: InlayHint[] = [];
    const text = document.getText();
    const declarations = declarationCache.get(params.textDocument.uri) || [];

    // 1. Type hints for var declarations without explicit type
    // Pattern: var name = value (no type between var and name)
    const varRegex = /\bvar\s+(\w+)\s*=/g;
    let varMatch;
    while ((varMatch = varRegex.exec(text)) !== null) {
        const varName = varMatch[1];
        const matchStart = varMatch.index;
        const nameStart = text.indexOf(varName, matchStart + 4); // after 'var '

        // Check if this var has an explicit type by looking for 'var type name ='
        const beforeName = text.substring(matchStart + 4, nameStart).trim();
        if (beforeName && /^\w+(\[\])?$/.test(beforeName)) {
            // Has explicit type, skip
            continue;
        }

        // Infer type from the value
        const equalsPos = text.indexOf('=', nameStart);
        if (equalsPos === -1) continue;

        const valueStart = equalsPos + 1;
        const inferredType = inferTypeFromValue(text, valueStart);

        if (inferredType) {
            const pos = document.positionAt(nameStart + varName.length);
            hints.push({
                position: pos,
                label: `: ${inferredType}`,
                kind: InlayHintKind.Type,
                paddingLeft: false,
                paddingRight: true
            });
        }
    }

    // 2. Parameter hints at function call sites
    // Pattern: functionName(arg1, arg2, ...)
    const funcCallRegex = /\b(\w+)\s*\(/g;
    let callMatch;
    while ((callMatch = funcCallRegex.exec(text)) !== null) {
        const funcName = callMatch[1];
        const parenPos = callMatch.index + callMatch[0].length - 1;

        // Skip keywords that look like function calls
        if (['if', 'while', 'for', 'fun', 'switch', 'catch'].includes(funcName)) {
            continue;
        }

        // Check if this is a function declaration (preceded by 'fun')
        const beforeCall = text.substring(Math.max(0, callMatch.index - 10), callMatch.index);
        if (/\bfun\s*$/.test(beforeCall)) {
            continue; // This is a declaration, not a call
        }

        // Find the function declaration to get parameter names (including cross-file)
        let funcDecl = declarations.find(d => d.type === 'function' && d.name === funcName);

        // If not found in current file, search other files
        if (!funcDecl) {
            const kiteFiles = findKiteFilesInWorkspace();
            for (const filePath of kiteFiles) {
                const fileContent = getFileContent(filePath, params.textDocument.uri);
                if (fileContent) {
                    // Look for function definition in this file
                    const funcRegex = new RegExp(`\\bfun\\s+(${escapeRegex(funcName)})\\s*\\(([^)]*)\\)`, 'g');
                    const funcMatch = funcRegex.exec(fileContent);
                    if (funcMatch) {
                        // Parse parameters
                        const paramsStr = funcMatch[2];
                        const paramList: FunctionParameter[] = [];
                        const paramRegex = /(\w+)\s+(\w+)/g;
                        let paramMatch;
                        while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
                            paramList.push({ type: paramMatch[1], name: paramMatch[2] });
                        }
                        if (paramList.length > 0) {
                            funcDecl = {
                                name: funcName,
                                type: 'function',
                                parameters: paramList,
                                range: Range.create(Position.create(0, 0), Position.create(0, 0)),
                                nameRange: Range.create(Position.create(0, 0), Position.create(0, 0)),
                                uri: filePath
                            };
                            break;
                        }
                    }
                }
            }
        }

        if (!funcDecl || !funcDecl.parameters || funcDecl.parameters.length === 0) {
            continue;
        }

        // Parse arguments
        const args = parseArguments(text, parenPos + 1);

        // Add parameter hints for each argument
        for (let i = 0; i < Math.min(args.length, funcDecl.parameters.length); i++) {
            const arg = args[i];
            const param = funcDecl.parameters[i];

            // Skip if argument is already a named argument (name: value)
            const argText = text.substring(arg.start, arg.end).trim();
            if (/^\w+\s*:/.test(argText)) {
                continue;
            }

            // Skip simple cases where hint would be redundant
            // (e.g., passing variable with same name as parameter)
            if (argText === param.name) {
                continue;
            }

            const pos = document.positionAt(arg.start);
            hints.push({
                position: pos,
                label: `${param.name}:`,
                kind: InlayHintKind.Parameter,
                paddingLeft: false,
                paddingRight: true
            });
        }
    }

    // 3. Type hints for component instantiation property assignments
    // Pattern: component TypeName instanceName { prop = value }
    const componentInstRegex = /\bcomponent\s+(\w+)\s+(\w+)\s*\{/g;
    let compMatch;
    while ((compMatch = componentInstRegex.exec(text)) !== null) {
        const componentType = compMatch[1];
        const braceStart = compMatch.index + compMatch[0].length - 1;

        // Find the component type definition to get input types (with cross-file support)
        const inputTypes = extractComponentInputTypes(text, componentType, params.textDocument.uri);
        if (Object.keys(inputTypes).length === 0) {
            continue;
        }

        // Find the closing brace
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        const bodyEnd = pos - 1;
        const bodyText = text.substring(braceStart + 1, bodyEnd);

        // Find property assignments in the body: name = value
        const propRegex = /^\s*(\w+)\s*=/gm;
        let propMatch;
        while ((propMatch = propRegex.exec(bodyText)) !== null) {
            const propName = propMatch[1];
            const propType = inputTypes[propName];

            if (propType) {
                // Calculate absolute position
                const propNameStart = braceStart + 1 + propMatch.index + propMatch[0].indexOf(propName);
                const hintPos = document.positionAt(propNameStart + propName.length);

                hints.push({
                    position: hintPos,
                    label: `: ${propType}`,
                    kind: InlayHintKind.Type,
                    paddingLeft: false,
                    paddingRight: true
                });
            }
        }
    }

    // 4. Type hints for resource property assignments
    // Pattern: resource SchemaName instanceName { prop = value }
    const resourceInstRegex = /\bresource\s+([\w.]+)\s+(\w+)\s*\{/g;
    let resMatch;
    while ((resMatch = resourceInstRegex.exec(text)) !== null) {
        const schemaName = resMatch[1];
        const braceStart = resMatch.index + resMatch[0].length - 1;

        // Find the schema definition to get property types (with cross-file support)
        const schemaTypes = extractSchemaPropertyTypes(text, schemaName, params.textDocument.uri);
        if (Object.keys(schemaTypes).length === 0) {
            continue;
        }

        // Find the closing brace
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        const bodyEnd = pos - 1;
        const bodyText = text.substring(braceStart + 1, bodyEnd);

        // Find property assignments in the body: name = value
        const propRegex = /^\s*(\w+)\s*=/gm;
        let propMatch;
        while ((propMatch = propRegex.exec(bodyText)) !== null) {
            const propName = propMatch[1];
            const propType = schemaTypes[propName];

            if (propType) {
                // Calculate absolute position
                const propNameStart = braceStart + 1 + propMatch.index + propMatch[0].indexOf(propName);
                const hintPos = document.positionAt(propNameStart + propName.length);

                hints.push({
                    position: hintPos,
                    label: `: ${propType}`,
                    kind: InlayHintKind.Type,
                    paddingLeft: false,
                    paddingRight: true
                });
            }
        }
    }

    return hints;
});

// Helper: Infer type from value expression
function inferTypeFromValue(text: string, startPos: number): string | null {
    // Skip whitespace
    let pos = startPos;
    while (pos < text.length && /\s/.test(text[pos])) {
        pos++;
    }

    if (pos >= text.length) return null;

    const char = text[pos];

    // String literal
    if (char === '"' || char === "'") {
        return 'string';
    }

    // Number literal
    if (/\d/.test(char) || (char === '-' && /\d/.test(text[pos + 1] || ''))) {
        return 'number';
    }

    // Boolean literals
    if (text.substring(pos, pos + 4) === 'true' && !/\w/.test(text[pos + 4] || '')) {
        return 'boolean';
    }
    if (text.substring(pos, pos + 5) === 'false' && !/\w/.test(text[pos + 5] || '')) {
        return 'boolean';
    }

    // Null literal
    if (text.substring(pos, pos + 4) === 'null' && !/\w/.test(text[pos + 4] || '')) {
        return 'null';
    }

    // Array literal
    if (char === '[') {
        return 'array';
    }

    // Object literal
    if (char === '{') {
        return 'object';
    }

    return null;
}

// Helper: Parse function call arguments
interface ArgRange {
    start: number;
    end: number;
}

function parseArguments(text: string, startPos: number): ArgRange[] {
    const args: ArgRange[] = [];
    let pos = startPos;
    let depth = 1;
    let argStart = startPos;
    let inString = false;
    let stringChar = '';

    // Skip leading whitespace
    while (pos < text.length && /\s/.test(text[pos])) {
        pos++;
        argStart = pos;
    }

    // Check for empty args
    if (text[pos] === ')') {
        return args;
    }

    while (pos < text.length && depth > 0) {
        const char = text[pos];

        // Handle strings
        if ((char === '"' || char === "'") && (pos === 0 || text[pos - 1] !== '\\')) {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
        }

        if (!inString) {
            if (char === '(' || char === '[' || char === '{') {
                depth++;
            } else if (char === ')' || char === ']' || char === '}') {
                depth--;
                if (depth === 0) {
                    // End of arguments
                    const argText = text.substring(argStart, pos).trim();
                    if (argText) {
                        args.push({ start: argStart, end: pos });
                    }
                    break;
                }
            } else if (char === ',' && depth === 1) {
                // Argument separator
                const argText = text.substring(argStart, pos).trim();
                if (argText) {
                    // Find actual start (skip whitespace)
                    let actualStart = argStart;
                    while (actualStart < pos && /\s/.test(text[actualStart])) {
                        actualStart++;
                    }
                    args.push({ start: actualStart, end: pos });
                }
                argStart = pos + 1;
                // Skip whitespace after comma
                while (argStart < text.length && /\s/.test(text[argStart])) {
                    argStart++;
                }
            }
        }

        pos++;
    }

    return args;
}

// Helper: Extract input types from a component type definition (single text)
function extractComponentInputTypesFromText(text: string, componentTypeName: string): Record<string, string> {
    const inputTypes: Record<string, string> = {};

    // Find component type definition: component TypeName { (without instance name)
    // We need to distinguish between definition (one identifier) and instantiation (two identifiers)
    const defRegex = new RegExp(`\\bcomponent\\s+${escapeRegex(componentTypeName)}\\s*\\{`, 'g');
    let match;

    while ((match = defRegex.exec(text)) !== null) {
        // Check if this is a definition (not instantiation) by looking backwards
        // Instantiation: component Type instance {
        // Definition: component Type {
        const beforeBrace = text.substring(match.index, match.index + match[0].length);
        const parts = beforeBrace.trim().split(/\s+/);

        // Definition has: ['component', 'TypeName', '{'] -> parts.length should reflect just type name
        // Actually the regex only matches component TypeName { so we need to check what's between component and {
        const betweenKeywordAndBrace = text.substring(match.index + 10, match.index + match[0].length - 1).trim();
        const identifiers = betweenKeywordAndBrace.split(/\s+/).filter(s => s && s !== componentTypeName);

        if (identifiers.length > 0) {
            // Has extra identifier(s), this is an instantiation, skip
            continue;
        }

        // This is a component definition - extract inputs
        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;

        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }

        const bodyText = text.substring(braceStart + 1, pos - 1);

        // Find input declarations: input type name [= value]
        const inputRegex = /\binput\s+(\w+(?:\[\])?)\s+(\w+)/g;
        let inputMatch;
        while ((inputMatch = inputRegex.exec(bodyText)) !== null) {
            const inputType = inputMatch[1];
            const inputName = inputMatch[2];
            inputTypes[inputName] = inputType;
        }

        // Found the definition, no need to continue
        if (Object.keys(inputTypes).length > 0) {
            break;
        }
    }

    return inputTypes;
}

// Helper: Extract input types from a component type definition (with cross-file support)
function extractComponentInputTypes(text: string, componentTypeName: string, currentDocUri?: string): Record<string, string> {
    // First try current file
    let inputTypes = extractComponentInputTypesFromText(text, componentTypeName);
    if (Object.keys(inputTypes).length > 0) {
        return inputTypes;
    }

    // Try other files in workspace
    const kiteFiles = findKiteFilesInWorkspace();
    for (const filePath of kiteFiles) {
        const fileContent = getFileContent(filePath, currentDocUri);
        if (fileContent) {
            inputTypes = extractComponentInputTypesFromText(fileContent, componentTypeName);
            if (Object.keys(inputTypes).length > 0) {
                return inputTypes;
            }
        }
    }

    return {};
}

// Helper: Extract property types from a schema definition (single text)
function extractSchemaPropertyTypesFromText(text: string, schemaName: string): Record<string, string> {
    const propertyTypes: Record<string, string> = {};

    // Handle dotted schema names like "VM.Instance" - just use the last part for matching
    const schemaBaseName = schemaName.includes('.') ? schemaName.split('.').pop()! : schemaName;

    // Find schema definition: schema SchemaName {
    const defRegex = new RegExp(`\\bschema\\s+${escapeRegex(schemaBaseName)}\\s*\\{`, 'g');
    let match;

    while ((match = defRegex.exec(text)) !== null) {
        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;

        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }

        const bodyText = text.substring(braceStart + 1, pos - 1);

        // Find property declarations: type name [= value]
        // Schema properties are: type propertyName
        const lines = bodyText.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@')) {
                continue;
            }

            // Match: type propertyName [= defaultValue]
            // Types can be: string, number, boolean, any, object, CustomType, or arrays like string[]
            const propMatch = trimmed.match(/^(\w+(?:\[\])?)\s+(\w+)(?:\s*=.*)?$/);
            if (propMatch) {
                const propType = propMatch[1];
                const propName = propMatch[2];
                propertyTypes[propName] = propType;
            }
        }

        // Found the schema, no need to continue
        if (Object.keys(propertyTypes).length > 0) {
            break;
        }
    }

    return propertyTypes;
}

// Helper: Extract property types from a schema definition (with cross-file support)
function extractSchemaPropertyTypes(text: string, schemaName: string, currentDocUri?: string): Record<string, string> {
    // First try current file
    let propertyTypes = extractSchemaPropertyTypesFromText(text, schemaName);
    if (Object.keys(propertyTypes).length > 0) {
        return propertyTypes;
    }

    // Try other files in workspace
    const kiteFiles = findKiteFilesInWorkspace();
    for (const filePath of kiteFiles) {
        const fileContent = getFileContent(filePath, currentDocUri);
        if (fileContent) {
            propertyTypes = extractSchemaPropertyTypesFromText(fileContent, schemaName);
            if (Object.keys(propertyTypes).length > 0) {
                return propertyTypes;
            }
        }
    }

    return {};
}

// Helper: Find function call at cursor position and determine active parameter
interface FunctionCallInfo {
    functionName: string;
    activeParameter: number;
}

function findFunctionCallAtPosition(text: string, offset: number): FunctionCallInfo | null {
    // Walk backwards to find the opening parenthesis of a function call
    let pos = offset - 1;
    let parenDepth = 0;
    let commaCount = 0;

    while (pos >= 0) {
        const char = text[pos];

        if (char === ')') {
            parenDepth++;
        } else if (char === '(') {
            if (parenDepth === 0) {
                // Found the opening paren - now find the function name
                let nameEnd = pos - 1;
                // Skip whitespace before (
                while (nameEnd >= 0 && /\s/.test(text[nameEnd])) {
                    nameEnd--;
                }
                // Find start of identifier
                let nameStart = nameEnd;
                while (nameStart > 0 && /\w/.test(text[nameStart - 1])) {
                    nameStart--;
                }

                if (nameStart <= nameEnd) {
                    const functionName = text.substring(nameStart, nameEnd + 1);

                    // Verify this is a function call (not a declaration)
                    // Check that 'fun' doesn't precede it
                    let checkPos = nameStart - 1;
                    while (checkPos >= 0 && /\s/.test(text[checkPos])) {
                        checkPos--;
                    }
                    const beforeName = text.substring(Math.max(0, checkPos - 3), checkPos + 1);
                    if (beforeName.endsWith('fun')) {
                        return null; // This is a function declaration, not a call
                    }

                    return {
                        functionName,
                        activeParameter: commaCount
                    };
                }
                return null;
            }
            parenDepth--;
        } else if (char === ',' && parenDepth === 0) {
            commaCount++;
        } else if (char === '{' || char === '}' || char === ';') {
            // Hit a block boundary - not inside a function call
            return null;
        }

        pos--;
    }

    return null;
}

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

    // Find all scope blocks (functions, component definitions) first
    interface ScopeBlock {
        start: number;  // Opening brace offset
        end: number;    // Closing brace offset
        type: 'function' | 'component-def';
    }
    const scopeBlocks: ScopeBlock[] = [];

    // Find function scopes: fun name(...) {
    const funcScopeRegex = /\bfun\s+\w+\s*\([^)]*\)\s*\w*\s*\{/g;
    let funcMatch;
    while ((funcMatch = funcScopeRegex.exec(text)) !== null) {
        const braceStart = funcMatch.index + funcMatch[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        scopeBlocks.push({ start: braceStart, end: pos, type: 'function' });
    }

    // Find component definition scopes: component TypeName { (without instance name)
    const compDefRegex = /\bcomponent\s+(\w+)\s*\{/g;
    let compMatch;
    while ((compMatch = compDefRegex.exec(text)) !== null) {
        // Check if it's a definition (no instance name)
        const betweenKeywordAndBrace = text.substring(compMatch.index + 10, compMatch.index + compMatch[0].length - 1).trim();
        const parts = betweenKeywordAndBrace.split(/\s+/).filter(s => s);
        if (parts.length === 1) {
            // Single identifier = component definition
            const braceStart = compMatch.index + compMatch[0].length - 1;
            let braceDepth = 1;
            let pos = braceStart + 1;
            while (pos < text.length && braceDepth > 0) {
                if (text[pos] === '{') braceDepth++;
                else if (text[pos] === '}') braceDepth--;
                pos++;
            }
            scopeBlocks.push({ start: braceStart, end: pos, type: 'component-def' });
        }
    }

    // Helper: Find enclosing scope for an offset
    function findEnclosingScope(offset: number): ScopeBlock | null {
        for (const scope of scopeBlocks) {
            if (offset > scope.start && offset < scope.end) {
                return scope;
            }
        }
        return null;
    }

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

                // Add scope information for variables/for loops/inputs/outputs
                // These are scoped to their enclosing function or component definition
                if (pattern.type === 'variable' || pattern.type === 'for' || pattern.type === 'input' || pattern.type === 'output') {
                    const declOffset = lineOffset + nameIndex;
                    const scope = findEnclosingScope(declOffset);
                    if (scope) {
                        decl.scopeStart = scope.start;
                        decl.scopeEnd = scope.end;
                    }
                }

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
                        // Component instantiations inside a component definition are scoped
                        const declOffset = lineOffset + instNameIndex;
                        const scope = findEnclosingScope(declOffset);
                        if (scope && scope.type === 'component-def') {
                            decl.scopeStart = scope.start;
                            decl.scopeEnd = scope.end;
                        }
                    }
                    // Otherwise it's a component type definition, name is already correct
                }

                // Handle resource - add scope if inside a component definition
                if (pattern.type === 'resource') {
                    const declOffset = lineOffset + nameIndex;
                    const scope = findEnclosingScope(declOffset);
                    if (scope && scope.type === 'component-def') {
                        decl.scopeStart = scope.start;
                        decl.scopeEnd = scope.end;
                    }
                }

                // Handle function - extract parameters and return type
                if (pattern.type === 'function') {
                    // Pattern: fun name(type1 param1, type2 param2) returnType {
                    const funcMatch = line.match(/^\s*fun\s+\w+\s*\(([^)]*)\)\s*(\w+)?\s*\{?/);
                    if (funcMatch) {
                        const paramsStr = funcMatch[1];
                        const returnType = funcMatch[2];

                        decl.parameters = [];
                        if (paramsStr.trim()) {
                            // Parse parameters: "type1 name1, type2 name2"
                            const paramParts = paramsStr.split(',');
                            let paramOffset = line.indexOf('(') + 1;

                            for (const part of paramParts) {
                                const trimmed = part.trim();
                                const paramMatch = trimmed.match(/^(\w+(?:\[\])?)\s+(\w+)$/);
                                if (paramMatch) {
                                    const paramType = paramMatch[1];
                                    const paramName = paramMatch[2];

                                    decl.parameters.push({
                                        type: paramType,
                                        name: paramName
                                    });

                                    // Find exact position of parameter name in the line
                                    const paramNameIndex = line.indexOf(paramName, paramOffset);
                                    if (paramNameIndex >= 0) {
                                        // Find the function scope for this parameter
                                        // Parameters are before the {, so find scope that starts on this line
                                        const braceIndex = line.indexOf('{');
                                        let paramScope: ScopeBlock | null = null;
                                        if (braceIndex >= 0) {
                                            const braceOffset = lineOffset + braceIndex;
                                            // Find scope that starts at this brace
                                            paramScope = scopeBlocks.find(s => s.start === braceOffset) || null;
                                        }

                                        // Add parameter as a declaration for Go to Definition
                                        const paramDecl: Declaration = {
                                            name: paramName,
                                            type: 'variable',
                                            typeName: paramType,
                                            range: Range.create(
                                                Position.create(lineNum, paramNameIndex),
                                                Position.create(lineNum, paramNameIndex + paramName.length)
                                            ),
                                            nameRange: Range.create(
                                                Position.create(lineNum, paramNameIndex),
                                                Position.create(lineNum, paramNameIndex + paramName.length)
                                            ),
                                            uri: document.uri,
                                            documentation: `Parameter of function \`${decl.name}\``
                                        };
                                        if (paramScope) {
                                            paramDecl.scopeStart = paramScope.start;
                                            paramDecl.scopeEnd = paramScope.end;
                                        }
                                        declarations.push(paramDecl);
                                        paramOffset = paramNameIndex + paramName.length;
                                    }
                                }
                            }
                        }

                        if (returnType) {
                            decl.returnType = returnType;
                        }
                    }

                    // Functions inside component definitions are scoped to the component
                    const funcDeclOffset = lineOffset + nameIndex;
                    const funcScope = findEnclosingScope(funcDeclOffset);
                    if (funcScope && funcScope.type === 'component-def') {
                        decl.scopeStart = funcScope.start;
                        decl.scopeEnd = funcScope.end;
                    }
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

// Helper: Extract outputs from a component type definition
interface OutputInfo {
    name: string;
    type: string;
}

function extractComponentOutputs(text: string, componentTypeName: string): OutputInfo[] {
    const outputs: OutputInfo[] = [];

    // Find the component type definition: component TypeName {
    // (not an instance which would be: component TypeName instanceName {)
    const regex = new RegExp(`\\bcomponent\\s+${escapeRegex(componentTypeName)}\\s*\\{`, 'g');
    let match;

    while ((match = regex.exec(text)) !== null) {
        // Check if this is a type definition (no instance name before {)
        const beforeBrace = text.substring(match.index, match.index + match[0].length);
        // Type definition has exactly: component TypeName {
        // Instance has: component TypeName instanceName {
        const parts = beforeBrace.trim().split(/\s+/);
        if (parts.length !== 2 && parts[parts.length - 1] !== '{') {
            // Skip - this is likely an instance, not a type definition
            // Actually let's check: parts should be ['component', 'TypeName', '{']
        }

        const startIndex = match.index + match[0].length;
        let braceDepth = 1;
        let i = startIndex;

        while (i < text.length && braceDepth > 0) {
            if (text[i] === '{') braceDepth++;
            else if (text[i] === '}') braceDepth--;
            i++;
        }

        const bodyText = text.substring(startIndex, i - 1);

        // Find output declarations: output type name [= value]
        const outputRegex = /^\s*output\s+(\w+(?:\[\])?)\s+(\w+)/gm;
        let outputMatch;
        while ((outputMatch = outputRegex.exec(bodyText)) !== null) {
            const outputType = outputMatch[1];
            const outputName = outputMatch[2];
            if (!outputs.find(o => o.name === outputName)) {
                outputs.push({ name: outputName, type: outputType });
            }
        }

        // Found the component definition, no need to continue
        if (outputs.length > 0) break;
    }

    return outputs;
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
// Helper: Convert offset to Position in a text string
function offsetToPosition(text: string, offset: number): Position {
    const lines = text.substring(0, offset).split('\n');
    return Position.create(lines.length - 1, lines[lines.length - 1].length);
}

function getWordAtPosition(document: TextDocument, position: Position): string | null {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Handle case where cursor might be at the very end of a word
    let adjustedOffset = offset;
    if (adjustedOffset > 0 && !/\w/.test(text[adjustedOffset] || '') && /\w/.test(text[adjustedOffset - 1])) {
        adjustedOffset--;
    }

    // Find word boundaries
    let start = adjustedOffset;
    let end = adjustedOffset;

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

// Code Action handler - provides quick fixes
connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
    const actions: CodeAction[] = [];
    const document = documents.get(params.textDocument.uri);
    if (!document) return actions;

    const docDiagnosticData = diagnosticData.get(params.textDocument.uri);
    if (!docDiagnosticData) return actions;

    const text = document.getText();

    for (const diagnostic of params.context.diagnostics) {
        if (diagnostic.source !== 'kite') continue;
        if (!diagnostic.data) continue;

        const suggestion = docDiagnosticData.get(diagnostic.data as string);
        if (!suggestion) continue;

        // Check if there's already an import from this file
        const existingImportRegex = new RegExp(
            `^(import\\s+)([\\w\\s,]+)(\\s+from\\s+["']${escapeRegex(suggestion.importPath)}["'])`,
            'gm'
        );
        const existingMatch = existingImportRegex.exec(text);

        let edit: WorkspaceEdit;

        if (existingMatch) {
            // Add to existing import
            const existingSymbols = existingMatch[2].trim();
            if (existingSymbols === '*') {
                // Wildcard import - no action needed
                continue;
            }

            const symbolList = existingSymbols.split(',').map(s => s.trim());
            if (symbolList.includes(suggestion.symbolName)) {
                // Already imported
                continue;
            }

            const newSymbols = existingSymbols + ', ' + suggestion.symbolName;
            const newImportLine = existingMatch[1] + newSymbols + existingMatch[3];

            const matchStart = existingMatch.index;
            const matchEnd = matchStart + existingMatch[0].length;

            const beforeMatch = text.substring(0, matchStart);
            const startLine = beforeMatch.split('\n').length - 1;
            const startChar = matchStart - beforeMatch.lastIndexOf('\n') - 1;

            const beforeEnd = text.substring(0, matchEnd);
            const endLine = beforeEnd.split('\n').length - 1;
            const endChar = matchEnd - beforeEnd.lastIndexOf('\n') - 1;

            edit = {
                changes: {
                    [params.textDocument.uri]: [
                        TextEdit.replace(
                            Range.create(Position.create(startLine, startChar), Position.create(endLine, endChar)),
                            newImportLine
                        )
                    ]
                }
            };
        } else {
            // Add new import line
            const importRegex = /^import\s+.*$/gm;
            let lastImportMatch;
            let match;
            while ((match = importRegex.exec(text)) !== null) {
                lastImportMatch = match;
            }

            let insertLine = 0;
            if (lastImportMatch) {
                const beforeLastImport = text.substring(0, lastImportMatch.index + lastImportMatch[0].length);
                insertLine = beforeLastImport.split('\n').length;
            }

            const importStatement = `import ${suggestion.symbolName} from "${suggestion.importPath}"`;

            edit = {
                changes: {
                    [params.textDocument.uri]: [
                        TextEdit.insert(Position.create(insertLine, 0), importStatement + '\n')
                    ]
                }
            };
        }

        actions.push({
            title: `Import '${suggestion.symbolName}' from "${suggestion.importPath}"`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred: true,
            edit
        });
    }

    return actions;
});

// Document Symbol handler - provides outline view
connection.onDocumentSymbol((params: DocumentSymbolParams): DocumentSymbol[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const text = document.getText();
    const symbols: DocumentSymbol[] = [];

    // Helper to create a DocumentSymbol
    function createSymbol(
        name: string,
        kind: SymbolKind,
        range: Range,
        selectionRange: Range,
        detail?: string,
        children?: DocumentSymbol[]
    ): DocumentSymbol {
        return {
            name,
            kind,
            range,
            selectionRange,
            detail,
            children
        };
    }

    // Find schemas: schema Name {
    const schemaRegex = /\bschema\s+(\w+)\s*\{/g;
    let match;
    while ((match = schemaRegex.exec(text)) !== null) {
        const name = match[1];
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].indexOf(name));
        const nameEnd = document.positionAt(match.index + match[0].indexOf(name) + name.length);

        // Find the closing brace
        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        const endPos = document.positionAt(pos);

        // Find properties inside schema
        const bodyText = text.substring(braceStart + 1, pos - 1);
        const bodyOffset = braceStart + 1;
        const children: DocumentSymbol[] = [];

        const propRegex = /^\s*(\w+(?:\[\])?)\s+(\w+)/gm;
        let propMatch;
        while ((propMatch = propRegex.exec(bodyText)) !== null) {
            const propType = propMatch[1];
            const propName = propMatch[2];
            const propStart = document.positionAt(bodyOffset + propMatch.index);
            const propNameStart = document.positionAt(bodyOffset + propMatch.index + propMatch[0].indexOf(propName));
            const propNameEnd = document.positionAt(bodyOffset + propMatch.index + propMatch[0].indexOf(propName) + propName.length);
            const propEnd = propNameEnd;

            children.push(createSymbol(
                propName,
                SymbolKind.Property,
                Range.create(propStart, propEnd),
                Range.create(propNameStart, propNameEnd),
                propType
            ));
        }

        symbols.push(createSymbol(
            name,
            SymbolKind.Struct,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            'schema',
            children.length > 0 ? children : undefined
        ));
    }

    // Find component definitions: component TypeName { (without instance name)
    const compDefRegex = /\bcomponent\s+(\w+)\s*\{/g;
    while ((match = compDefRegex.exec(text)) !== null) {
        // Check if definition (not instance)
        const betweenKeywordAndBrace = text.substring(match.index + 10, match.index + match[0].length - 1).trim();
        const parts = betweenKeywordAndBrace.split(/\s+/).filter(s => s);
        if (parts.length !== 1) continue; // Instance, skip

        const name = match[1];
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].indexOf(name));
        const nameEnd = document.positionAt(match.index + match[0].indexOf(name) + name.length);

        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        const endPos = document.positionAt(pos);

        // Find inputs/outputs inside component
        const bodyText = text.substring(braceStart + 1, pos - 1);
        const bodyOffset = braceStart + 1;
        const children: DocumentSymbol[] = [];

        const ioRegex = /\b(input|output)\s+(\w+(?:\[\])?)\s+(\w+)/g;
        let ioMatch;
        while ((ioMatch = ioRegex.exec(bodyText)) !== null) {
            const ioKind = ioMatch[1];
            const ioType = ioMatch[2];
            const ioName = ioMatch[3];
            const ioStart = document.positionAt(bodyOffset + ioMatch.index);
            const ioNameStart = document.positionAt(bodyOffset + ioMatch.index + ioMatch[0].lastIndexOf(ioName));
            const ioNameEnd = document.positionAt(bodyOffset + ioMatch.index + ioMatch[0].lastIndexOf(ioName) + ioName.length);

            children.push(createSymbol(
                ioName,
                ioKind === 'input' ? SymbolKind.Property : SymbolKind.Event,
                Range.create(ioStart, ioNameEnd),
                Range.create(ioNameStart, ioNameEnd),
                `${ioKind}: ${ioType}`
            ));
        }

        symbols.push(createSymbol(
            name,
            SymbolKind.Class,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            'component',
            children.length > 0 ? children : undefined
        ));
    }

    // Find resources: resource SchemaName instanceName {
    const resourceRegex = /\bresource\s+([\w.]+)\s+(\w+)\s*\{/g;
    while ((match = resourceRegex.exec(text)) !== null) {
        const schemaName = match[1];
        const instanceName = match[2];
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].lastIndexOf(instanceName));
        const nameEnd = document.positionAt(match.index + match[0].lastIndexOf(instanceName) + instanceName.length);

        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        const endPos = document.positionAt(pos);

        symbols.push(createSymbol(
            instanceName,
            SymbolKind.Object,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            `resource: ${schemaName}`
        ));
    }

    // Find component instances: component TypeName instanceName {
    const compInstRegex = /\bcomponent\s+(\w+)\s+(\w+)\s*\{/g;
    while ((match = compInstRegex.exec(text)) !== null) {
        const typeName = match[1];
        const instanceName = match[2];
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].lastIndexOf(instanceName));
        const nameEnd = document.positionAt(match.index + match[0].lastIndexOf(instanceName) + instanceName.length);

        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        const endPos = document.positionAt(pos);

        symbols.push(createSymbol(
            instanceName,
            SymbolKind.Object,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            `component: ${typeName}`
        ));
    }

    // Find functions: fun name(params) returnType {
    const funcRegex = /\bfun\s+(\w+)\s*\(([^)]*)\)\s*(\w+)?\s*\{/g;
    while ((match = funcRegex.exec(text)) !== null) {
        const name = match[1];
        const params = match[2];
        const returnType = match[3] || 'void';
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].indexOf(name));
        const nameEnd = document.positionAt(match.index + match[0].indexOf(name) + name.length);

        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        const endPos = document.positionAt(pos);

        symbols.push(createSymbol(
            name,
            SymbolKind.Function,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            `(${params}) → ${returnType}`
        ));
    }

    // Find type aliases: type Name = ...
    const typeRegex = /\btype\s+(\w+)\s*=/g;
    while ((match = typeRegex.exec(text)) !== null) {
        const name = match[1];
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].indexOf(name));
        const nameEnd = document.positionAt(match.index + match[0].indexOf(name) + name.length);

        // Find end of line
        let endIdx = text.indexOf('\n', match.index);
        if (endIdx === -1) endIdx = text.length;
        const endPos = document.positionAt(endIdx);

        symbols.push(createSymbol(
            name,
            SymbolKind.TypeParameter,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            'type alias'
        ));
    }

    // Find top-level variables: var [type] name =
    const varRegex = /^var\s+(?:(\w+)\s+)?(\w+)\s*=/gm;
    while ((match = varRegex.exec(text)) !== null) {
        const varType = match[1] || 'any';
        const name = match[2];
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].indexOf(name));
        const nameEnd = document.positionAt(match.index + match[0].indexOf(name) + name.length);

        // Find end of line
        let endIdx = text.indexOf('\n', match.index);
        if (endIdx === -1) endIdx = text.length;
        const endPos = document.positionAt(endIdx);

        symbols.push(createSymbol(
            name,
            SymbolKind.Variable,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            varType
        ));
    }

    // Find inputs (top-level): input type name
    const inputRegex = /^input\s+(\w+(?:\[\])?)\s+(\w+)/gm;
    while ((match = inputRegex.exec(text)) !== null) {
        const inputType = match[1];
        const name = match[2];
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].lastIndexOf(name));
        const nameEnd = document.positionAt(match.index + match[0].lastIndexOf(name) + name.length);

        let endIdx = text.indexOf('\n', match.index);
        if (endIdx === -1) endIdx = text.length;
        const endPos = document.positionAt(endIdx);

        symbols.push(createSymbol(
            name,
            SymbolKind.Property,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            `input: ${inputType}`
        ));
    }

    // Find outputs (top-level): output type name
    const outputRegex = /^output\s+(\w+(?:\[\])?)\s+(\w+)/gm;
    while ((match = outputRegex.exec(text)) !== null) {
        const outputType = match[1];
        const name = match[2];
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].lastIndexOf(name));
        const nameEnd = document.positionAt(match.index + match[0].lastIndexOf(name) + name.length);

        let endIdx = text.indexOf('\n', match.index);
        if (endIdx === -1) endIdx = text.length;
        const endPos = document.positionAt(endIdx);

        symbols.push(createSymbol(
            name,
            SymbolKind.Event,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            `output: ${outputType}`
        ));
    }

    return symbols;
});

// Validate document and return diagnostics
function validateDocument(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Find all decorator usages: @decoratorName or @decoratorName(args)
    const decoratorRegex = /@(\w+)(\s*\(([^)]*)\))?/g;
    let match;

    while ((match = decoratorRegex.exec(text)) !== null) {
        const decoratorName = match[1];
        const hasParens = match[2] !== undefined;
        const argsStr = match[3]?.trim() || '';

        // Find the decorator definition
        const decoratorDef = DECORATORS.find(d => d.name === decoratorName);

        if (!decoratorDef) {
            // Unknown decorator - could add a warning but skip for now
            continue;
        }

        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        const range = Range.create(startPos, endPos);

        // Validate based on expected argument type
        const expectedType = decoratorDef.argType;

        if (expectedType === 'none') {
            // Should not have arguments
            if (hasParens && argsStr) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `@${decoratorName} does not take arguments`,
                    source: 'kite'
                });
            }
        } else if (expectedType === 'number') {
            if (!hasParens || !argsStr) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `@${decoratorName} requires a number argument`,
                    source: 'kite'
                });
            } else if (!/^\d+$/.test(argsStr) && !/^\w+$/.test(argsStr)) {
                // Allow numbers or variable references
                if (/^".*"$/.test(argsStr) || /^'.*'$/.test(argsStr)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range,
                        message: `@${decoratorName} expects a number, got string`,
                        source: 'kite'
                    });
                } else if (/^\[/.test(argsStr)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range,
                        message: `@${decoratorName} expects a number, got array`,
                        source: 'kite'
                    });
                } else if (/^\{/.test(argsStr)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range,
                        message: `@${decoratorName} expects a number, got object`,
                        source: 'kite'
                    });
                }
            }
        } else if (expectedType === 'string') {
            if (!hasParens || !argsStr) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `@${decoratorName} requires a string argument`,
                    source: 'kite'
                });
            } else if (!/^".*"$/.test(argsStr) && !/^'.*'$/.test(argsStr) && !/^\w+$/.test(argsStr)) {
                // Allow string literals or variable references
                if (/^\d+$/.test(argsStr)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range,
                        message: `@${decoratorName} expects a string, got number`,
                        source: 'kite'
                    });
                } else if (/^\[/.test(argsStr)) {
                    // Allow arrays for @provider(["aws", "azure"])
                    if (decoratorName !== 'provider') {
                        diagnostics.push({
                            severity: DiagnosticSeverity.Error,
                            range,
                            message: `@${decoratorName} expects a string, got array`,
                            source: 'kite'
                        });
                    }
                } else if (/^\{/.test(argsStr)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range,
                        message: `@${decoratorName} expects a string, got object`,
                        source: 'kite'
                    });
                }
            }
        } else if (expectedType === 'array') {
            if (!hasParens || !argsStr) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `@${decoratorName} requires an array argument`,
                    source: 'kite'
                });
            } else if (!/^\[/.test(argsStr) && !/^\w+$/.test(argsStr)) {
                // Must start with [ or be a variable reference
                if (/^".*"$/.test(argsStr) || /^'.*'$/.test(argsStr)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range,
                        message: `@${decoratorName} expects an array, got string`,
                        source: 'kite'
                    });
                } else if (/^\d+$/.test(argsStr)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range,
                        message: `@${decoratorName} expects an array, got number`,
                        source: 'kite'
                    });
                } else if (/^\{/.test(argsStr)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range,
                        message: `@${decoratorName} expects an array, got object`,
                        source: 'kite'
                    });
                }
            }
        } else if (expectedType === 'object') {
            if (!hasParens || !argsStr) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `@${decoratorName} requires an argument`,
                    source: 'kite'
                });
            }
            // @tags accepts object, array, or string - so we allow all for it
        } else if (expectedType === 'named') {
            // Named arguments like @validate(regex: "pattern")
            if (!hasParens || !argsStr) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `@${decoratorName} requires named arguments (e.g., regex: "pattern")`,
                    source: 'kite'
                });
            } else if (!/\w+\s*:/.test(argsStr)) {
                // Must have named argument format
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `@${decoratorName} requires named arguments (e.g., regex: "pattern")`,
                    source: 'kite'
                });
            }
        }
        // 'reference' type is flexible - accepts identifiers or arrays
    }

    // Validate resource schema types
    const currentFilePath = URI.parse(document.uri).fsPath;
    const currentDir = path.dirname(currentFilePath);
    const imports = extractImports(text);

    // Clear previous diagnostic data for this document
    diagnosticData.set(document.uri, new Map());
    const docDiagnosticData = diagnosticData.get(document.uri)!;

    // Helper to check if position is inside a comment
    function isInsideComment(pos: number): boolean {
        // Check for single-line comment
        const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
        const lineBeforePos = text.substring(lineStart, pos);
        if (lineBeforePos.includes('//')) {
            return true;
        }

        // Check for multi-line comment
        const textBefore = text.substring(0, pos);
        const lastBlockCommentStart = textBefore.lastIndexOf('/*');
        if (lastBlockCommentStart !== -1) {
            const lastBlockCommentEnd = textBefore.lastIndexOf('*/');
            if (lastBlockCommentEnd < lastBlockCommentStart) {
                return true; // Inside block comment
            }
        }
        return false;
    }

    // Check resource declarations: resource SchemaName instanceName {
    const resourceRegex = /\bresource\s+([\w.]+)\s+(\w+)\s*\{/g;
    let resourceMatch;
    while ((resourceMatch = resourceRegex.exec(text)) !== null) {
        // Skip if inside a comment
        if (isInsideComment(resourceMatch.index)) continue;

        const schemaName = resourceMatch[1];
        const instanceName = resourceMatch[2];
        // Find the actual position of the schema name in the match
        const matchText = resourceMatch[0];
        const schemaOffsetInMatch = matchText.indexOf(schemaName);
        const schemaStart = resourceMatch.index + schemaOffsetInMatch;
        const schemaEnd = schemaStart + schemaName.length;

        // Check if schema exists in current file
        const schemaInCurrentFile = findSchemaDefinition(text, schemaName, document.uri);
        if (schemaInCurrentFile) continue;

        // Check if schema is imported
        let foundInFile: string | null = null;
        const kiteFiles = findKiteFilesInWorkspace();
        for (const filePath of kiteFiles) {
            if (filePath === currentFilePath) continue;
            const fileContent = getFileContent(filePath, document.uri);
            if (fileContent) {
                const loc = findSchemaDefinition(fileContent, schemaName, filePath);
                if (loc) {
                    foundInFile = filePath;
                    break;
                }
            }
        }

        const startPos = document.positionAt(schemaStart);
        const endPos = document.positionAt(schemaEnd);
        const range = Range.create(startPos, endPos);

        if (foundInFile) {
            // Schema exists but might not be imported
            if (!isSymbolImported(imports, schemaName, foundInFile, currentFilePath)) {
                // Calculate import path
                let importPath = path.relative(currentDir, foundInFile);
                importPath = importPath.replace(/\\/g, '/');

                const diagnosticKey = `${startPos.line}:${startPos.character}:${schemaName}`;
                docDiagnosticData.set(diagnosticKey, {
                    symbolName: schemaName,
                    filePath: foundInFile,
                    importPath
                });

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `Schema '${schemaName}' is not imported. Found in '${path.basename(foundInFile)}'.`,
                    source: 'kite',
                    data: diagnosticKey
                });
            }
        } else {
            // Schema not found anywhere
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range,
                message: `Cannot resolve schema '${schemaName}'`,
                source: 'kite'
            });
        }
    }

    // Check component instantiations: component TypeName instanceName {
    // Must have TWO identifiers (type and instance name) - definitions only have one
    const componentInstRegex = /\bcomponent\s+(\w+)\s+(\w+)\s*\{/g;
    let componentMatch;
    while ((componentMatch = componentInstRegex.exec(text)) !== null) {
        // Skip if inside a comment
        if (isInsideComment(componentMatch.index)) continue;

        const componentType = componentMatch[1];
        const instanceName = componentMatch[2];
        // Find the actual position of the type name in the match
        const matchText = componentMatch[0];
        const typeOffsetInMatch = matchText.indexOf(componentType);
        const typeStart = componentMatch.index + typeOffsetInMatch;
        const typeEnd = typeStart + componentType.length;

        // Check if component exists in current file
        const componentInCurrentFile = findComponentDefinition(text, componentType, document.uri);
        if (componentInCurrentFile) continue;

        // Check if component is in other files
        let foundInFile: string | null = null;
        const kiteFiles = findKiteFilesInWorkspace();
        for (const filePath of kiteFiles) {
            if (filePath === currentFilePath) continue;
            const fileContent = getFileContent(filePath, document.uri);
            if (fileContent) {
                const loc = findComponentDefinition(fileContent, componentType, filePath);
                if (loc) {
                    foundInFile = filePath;
                    break;
                }
            }
        }

        const startPos = document.positionAt(typeStart);
        const endPos = document.positionAt(typeEnd);
        const range = Range.create(startPos, endPos);

        if (foundInFile) {
            // Component exists but might not be imported
            if (!isSymbolImported(imports, componentType, foundInFile, currentFilePath)) {
                // Calculate import path
                let importPath = path.relative(currentDir, foundInFile);
                importPath = importPath.replace(/\\/g, '/');

                const diagnosticKey = `${startPos.line}:${startPos.character}:${componentType}`;
                docDiagnosticData.set(diagnosticKey, {
                    symbolName: componentType,
                    filePath: foundInFile,
                    importPath
                });

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `Component '${componentType}' is not imported. Found in '${path.basename(foundInFile)}'.`,
                    source: 'kite',
                    data: diagnosticKey
                });
            }
        } else {
            // Component not found anywhere
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range,
                message: `Cannot resolve component '${componentType}'`,
                source: 'kite'
            });
        }
    }

    // Check function calls: functionName(
    // We need to find function calls that are NOT definitions and NOT in declarations cache
    const functionCallRegex = /\b([a-z]\w*)\s*\(/g;
    let funcMatch;
    const localDeclarations = declarationCache.get(document.uri) || [];
    const localFunctionNames = new Set(localDeclarations.filter(d => d.type === 'function').map(d => d.name));
    // Also get all other local names to exclude (inputs, outputs, variables, etc.)
    const localNames = new Set(localDeclarations.map(d => d.name));

    // Built-in functions to ignore
    const builtinFunctions = new Set(['println', 'print', 'len', 'toString', 'toNumber', 'typeof']);

    while ((funcMatch = functionCallRegex.exec(text)) !== null) {
        // Skip if inside a comment
        if (isInsideComment(funcMatch.index)) continue;

        const funcName = funcMatch[1];

        // Skip if it's a builtin function
        if (builtinFunctions.has(funcName)) continue;

        // Skip if it's a local declaration (function, variable, input, output, etc.)
        if (localNames.has(funcName)) continue;

        // Skip if it's a keyword that might be followed by (
        if (['if', 'while', 'for', 'fun', 'return'].includes(funcName)) continue;

        // Skip function definitions: fun funcName(
        const beforeMatch = text.substring(Math.max(0, funcMatch.index - 20), funcMatch.index);
        if (/\bfun\s+$/.test(beforeMatch)) continue;

        // Skip decorators: @decoratorName(
        if (/@\s*$/.test(beforeMatch)) continue;

        // Find the position
        const funcStart = funcMatch.index;
        const funcEnd = funcStart + funcName.length;

        // Check if function exists in current file
        const funcInCurrentFile = findFunctionDefinition(text, funcName, document.uri);
        if (funcInCurrentFile) continue;

        // Check if function is in other files
        let foundInFile: string | null = null;
        const kiteFiles = findKiteFilesInWorkspace();
        for (const filePath of kiteFiles) {
            if (filePath === currentFilePath) continue;
            const fileContent = getFileContent(filePath, document.uri);
            if (fileContent) {
                const loc = findFunctionDefinition(fileContent, funcName, filePath);
                if (loc) {
                    foundInFile = filePath;
                    break;
                }
            }
        }

        const startPos = document.positionAt(funcStart);
        const endPos = document.positionAt(funcEnd);
        const range = Range.create(startPos, endPos);

        if (foundInFile) {
            // Function exists but might not be imported
            if (!isSymbolImported(imports, funcName, foundInFile, currentFilePath)) {
                // Calculate import path
                let importPath = path.relative(currentDir, foundInFile);
                importPath = importPath.replace(/\\/g, '/');

                const diagnosticKey = `${startPos.line}:${startPos.character}:${funcName}`;
                docDiagnosticData.set(diagnosticKey, {
                    symbolName: funcName,
                    filePath: foundInFile,
                    importPath
                });

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `Function '${funcName}' is not imported. Found in '${path.basename(foundInFile)}'.`,
                    source: 'kite',
                    data: diagnosticKey
                });
            }
        } else {
            // Function not found anywhere - could be undefined or a method call
            // Only show error if it looks like a standalone function call
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range,
                message: `Cannot resolve function '${funcName}'`,
                source: 'kite'
            });
        }
    }

    // Validate unique names within component definitions
    // Find all component definitions: component TypeName { (without instance name)
    const compDefRegex = /\bcomponent\s+(\w+)\s*\{/g;
    let compDefMatch;
    while ((compDefMatch = compDefRegex.exec(text)) !== null) {
        // Check if this is a definition (not instantiation) by looking for instance name
        const fullMatch = compDefMatch[0];
        const afterComponent = fullMatch.substring(10).trim(); // after "component "
        const parts = afterComponent.split(/\s+/);

        // Definition has: TypeName { -> parts = ["TypeName", "{"]
        // Instantiation has: TypeName instanceName { -> parts = ["TypeName", "instanceName", "{"]
        if (parts.length !== 2 || parts[1] !== '{') {
            continue; // This is an instantiation, skip
        }

        const componentName = compDefMatch[1];
        const braceStart = compDefMatch.index + compDefMatch[0].length - 1;

        // Find matching closing brace
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        const braceEnd = pos;
        const bodyText = text.substring(braceStart + 1, braceEnd - 1);
        const bodyOffset = braceStart + 1;

        // Track all names within this component with their positions
        interface NameDecl {
            name: string;
            type: string;
            offset: number;
        }
        const nameDeclarations: NameDecl[] = [];

        // Find inputs: input type name
        const inputRegex = /\binput\s+\w+(?:\[\])?\s+(\w+)/g;
        let inputMatch;
        while ((inputMatch = inputRegex.exec(bodyText)) !== null) {
            const nameOffset = bodyOffset + inputMatch.index + inputMatch[0].lastIndexOf(inputMatch[1]);
            nameDeclarations.push({ name: inputMatch[1], type: 'input', offset: nameOffset });
        }

        // Find outputs: output type name
        const outputRegex = /\boutput\s+\w+(?:\[\])?\s+(\w+)/g;
        let outputMatch;
        while ((outputMatch = outputRegex.exec(bodyText)) !== null) {
            const nameOffset = bodyOffset + outputMatch.index + outputMatch[0].lastIndexOf(outputMatch[1]);
            nameDeclarations.push({ name: outputMatch[1], type: 'output', offset: nameOffset });
        }

        // Find variables: var [type] name =
        const varRegex = /\bvar\s+(?:\w+\s+)?(\w+)\s*=/g;
        let varMatch;
        while ((varMatch = varRegex.exec(bodyText)) !== null) {
            const nameOffset = bodyOffset + varMatch.index + varMatch[0].indexOf(varMatch[1]);
            nameDeclarations.push({ name: varMatch[1], type: 'variable', offset: nameOffset });
        }

        // Find resources: resource Schema name {
        const resRegex = /\bresource\s+[\w.]+\s+(\w+)\s*\{/g;
        let resMatch;
        while ((resMatch = resRegex.exec(bodyText)) !== null) {
            const nameOffset = bodyOffset + resMatch.index + resMatch[0].lastIndexOf(resMatch[1]);
            nameDeclarations.push({ name: resMatch[1], type: 'resource', offset: nameOffset });
        }

        // Find nested component instances: component Type name {
        const nestedCompRegex = /\bcomponent\s+\w+\s+(\w+)\s*\{/g;
        let nestedCompMatch;
        while ((nestedCompMatch = nestedCompRegex.exec(bodyText)) !== null) {
            const nameOffset = bodyOffset + nestedCompMatch.index + nestedCompMatch[0].lastIndexOf(nestedCompMatch[1]);
            nameDeclarations.push({ name: nestedCompMatch[1], type: 'component', offset: nameOffset });
        }

        // Check for duplicates
        const seenNames = new Map<string, NameDecl>();
        for (const decl of nameDeclarations) {
            const existing = seenNames.get(decl.name);
            if (existing) {
                // Duplicate found - report error on the second occurrence
                const startPos = document.positionAt(decl.offset);
                const endPos = document.positionAt(decl.offset + decl.name.length);
                const range = Range.create(startPos, endPos);

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `Duplicate name '${decl.name}' in component '${componentName}'. Already declared as ${existing.type}.`,
                    source: 'kite'
                });
            } else {
                seenNames.set(decl.name, decl);
            }
        }
    }

    return diagnostics;
}

// Start the server
documents.listen(connection);
connection.listen();
