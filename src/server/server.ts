import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    InitializeResult,
    TextDocumentSyncKind,
    CompletionItem,
    TextDocumentPositionParams,
    Definition,
    Location,
    Hover,
    Range,
    SignatureHelp,
    InlayHint,
    InlayHintParams,
    CodeAction,
    CodeActionParams,
    WorkspaceEdit,
    DocumentSymbol,
    DocumentSymbolParams,
    RenameParams,
    PrepareRenameParams,
    DocumentFormattingParams,
    TextEdit,
    DocumentHighlight,
    DocumentHighlightParams,
    SelectionRange,
    SelectionRangeParams,
    CodeLens,
    CodeLensParams,
    SymbolInformation,
    WorkspaceSymbolParams,
    SemanticTokens,
    SemanticTokensParams,
    FoldingRange,
    FoldingRangeParams,
    CallHierarchyItem,
    CallHierarchyIncomingCall,
    CallHierarchyOutgoingCall,
    CallHierarchyIncomingCallsParams,
    CallHierarchyOutgoingCallsParams,
    CallHierarchyPrepareParams,
    LinkedEditingRanges,
    LinkedEditingRangeParams,
    DocumentLink,
    DocumentLinkParams,
    DocumentOnTypeFormattingParams,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';
import { URI } from 'vscode-uri';
import {
    Declaration,
    ImportSuggestion,
} from './types';
import { getWordAtPosition, readFileContent, findEnclosingBlock } from './utils/text-utils';
import { extractImports, isSymbolImported, resolveImportPath } from './utils/import-utils';
import { validateDocument, ValidationContext } from './handlers/validation';
import { handleDocumentSymbol } from './handlers/document-symbols';
import { handleHover } from './handlers/hover';
import { handleCodeAction } from './handlers/code-actions';
import { handleSignatureHelp } from './handlers/signature-help';
import { handleInlayHints, InlayHintContext } from './handlers/inlay-hints';
import { handleDefinition, DefinitionContext, findSchemaDefinition, findComponentDefinition, findFunctionDefinition } from './handlers/definition';
import { handleReferences, ReferencesContext } from './handlers/references';
import { handlePrepareRename, handleRename, RenameContext } from './handlers/rename';
import { handleCompletion, CompletionContext } from './handlers/completion';
import { formatDocument } from './handlers/formatting';
import { handleDocumentHighlight } from './handlers/document-highlight';
import { handleSelectionRange } from './handlers/selection-range';
import { handleCodeLens, CodeLensContext } from './handlers/code-lens';
import { handleWorkspaceSymbols, WorkspaceSymbolsContext } from './handlers/workspace-symbols';
import { handleSemanticTokens, semanticTokensLegend } from './handlers/semantic-tokens';
import { handleFoldingRange } from './handlers/folding-range';
import { prepareCallHierarchy, getIncomingCalls, getOutgoingCalls, CallHierarchyContext } from './handlers/call-hierarchy';
import { handleLinkedEditingRange } from './handlers/linked-editing-range';
import { handleDocumentLinks, DocumentLinksContext } from './handlers/document-links';
import { handleOnTypeFormatting } from './handlers/on-type-formatting';
import { handleTypeDefinition, TypeDefinitionContext } from './handlers/type-definition';
import { handleImplementation, ImplementationContext } from './handlers/implementation';
import { scanDocumentAST } from '../parser';

// Create a connection for the server using Node's IPC
const connection = createConnection(ProposedFeatures.all);

// Log that server started
connection.console.log('[Kite] Server module loaded');

// Create a text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Cache of declarations per document
const declarationCache: Map<string, Declaration[]> = new Map();

// Workspace folders for cross-file resolution
let workspaceFolders: string[] = [];

// Diagnostic data for code actions (stores import suggestions)
const diagnosticData: Map<string, Map<string, ImportSuggestion>> = new Map(); // uri -> (diagnosticKey -> suggestion)

// Create validation context (lazily references functions defined later in the file)
function createValidationContext(): ValidationContext {
    return {
        getDeclarations: (uri: string) => declarationCache.get(uri),
        getDiagnosticData: (uri: string) => {
            if (!diagnosticData.has(uri)) {
                diagnosticData.set(uri, new Map());
            }
            return diagnosticData.get(uri)!;
        },
        clearDiagnosticData: (uri: string) => diagnosticData.set(uri, new Map()),
        findKiteFilesInWorkspace,
        getFileContent,
        extractImports,
        isSymbolImported,
        findSchemaDefinition,
        findComponentDefinition,
        findFunctionDefinition,
    };
}

connection.onInitialize((params: InitializeParams): InitializeResult => {
    connection.console.log('[Kite] Server initializing...');
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
                codeActionKinds: ['quickfix', 'source.organizeImports']
            },
            documentSymbolProvider: true,
            renameProvider: {
                prepareProvider: true
            },
            documentFormattingProvider: true,
            documentHighlightProvider: true,
            selectionRangeProvider: true,
            codeLensProvider: {
                resolveProvider: false
            },
            workspaceSymbolProvider: true,
            semanticTokensProvider: {
                legend: semanticTokensLegend,
                full: true,
            },
            foldingRangeProvider: true,
            callHierarchyProvider: true,
            linkedEditingRangeProvider: true,
            documentLinkProvider: {
                resolveProvider: false
            },
            documentOnTypeFormattingProvider: {
                firstTriggerCharacter: '\n',
                moreTriggerCharacter: ['}']
            },
            typeDefinitionProvider: true,
            implementationProvider: true
        }
    };
});

// Scan document for declarations when it changes
documents.onDidChangeContent(change => {
    const declarations = scanDocumentAST(change.document);
    declarationCache.set(change.document.uri, declarations);

    // Validate document and publish diagnostics
    const diagnostics = validateDocument(change.document, createValidationContext());
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});

documents.onDidClose(e => {
    declarationCache.delete(e.document.uri);
});

// Completion handler
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    const ctx: CompletionContext = {
        getDeclarations: (uri) => declarationCache.get(uri),
        findKiteFilesInWorkspace,
        getFileContent,
        findEnclosingBlock,
    };
    return handleCompletion(document, params.position, ctx);
});

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

// Go to Definition handler
connection.onDefinition((params: TextDocumentPositionParams): Definition | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const ctx: DefinitionContext = {
        findKiteFilesInWorkspace,
        getFileContent,
        extractImports,
        isSymbolImported,
        findEnclosingBlock,
        getDeclarations: (uri) => declarationCache.get(uri)
    };
    return handleDefinition(params, document, ctx);
});


// Find References handler
connection.onReferences((params): Location[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const word = getWordAtPosition(document, params.position);
    if (!word) return [];

    const cursorOffset = document.offsetAt(params.position);
    const ctx: ReferencesContext = {
        getDocument: (uri) => documents.get(uri),
        getDeclarations: (uri) => declarationCache.get(uri),
        findKiteFilesInWorkspace,
        getFileContent,
    };
    return handleReferences(document, word, cursorOffset, ctx);
});

// Prepare Rename handler - validates if symbol can be renamed and returns the range
connection.onPrepareRename((params: PrepareRenameParams): Range | { range: Range; placeholder: string } | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    return handlePrepareRename(document, params.position);
});

// Rename handler
connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const ctx: RenameContext = {
        getDocument: (uri) => documents.get(uri),
        getDeclarations: (uri) => declarationCache.get(uri),
        findKiteFilesInWorkspace,
        getFileContent,
        refreshDiagnostics: () => {
            const validationCtx = createValidationContext();
            for (const doc of documents.all()) {
                const diagnostics = validateDocument(doc, validationCtx);
                connection.sendDiagnostics({ uri: doc.uri, diagnostics });
            }
        },
    };
    return handleRename(document, params.position, params.newName, ctx);
});

// Hover handler
connection.onHover((params: TextDocumentPositionParams): Hover | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const declarations = declarationCache.get(params.textDocument.uri) || [];
    return handleHover(document, params.position, declarations);
});

// Signature Help handler - shows function parameter hints
connection.onSignatureHelp((params: TextDocumentPositionParams): SignatureHelp | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const declarations = declarationCache.get(params.textDocument.uri) || [];
    return handleSignatureHelp(document, params.position, declarations);
});

// Inlay Hints handler - shows inline type hints and parameter names
connection.onRequest('textDocument/inlayHint', (params: InlayHintParams): InlayHint[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    const declarations = declarationCache.get(params.textDocument.uri) || [];
    const ctx: InlayHintContext = {
        findKiteFilesInWorkspace,
        getFileContent
    };
    return handleInlayHints(document, declarations, ctx);
});


// Code Action handler - provides quick fixes
connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    const docDiagnosticData = diagnosticData.get(params.textDocument.uri) || new Map();
    const wildcardCtx = {
        findKiteFilesInWorkspace,
        getFileContent
    };
    return handleCodeAction(params, document, docDiagnosticData, wildcardCtx);
});

// Document Symbol handler - provides outline view
connection.onDocumentSymbol((params: DocumentSymbolParams): DocumentSymbol[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    return handleDocumentSymbol(document);
});

// Document Formatting handler - provides code formatting
connection.onDocumentFormatting((params: DocumentFormattingParams): TextEdit[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    return formatDocument(document, {
        tabSize: params.options.tabSize,
        insertSpaces: params.options.insertSpaces
    });
});

// Document Highlight handler - highlights all occurrences of symbol under cursor
connection.onDocumentHighlight((params: DocumentHighlightParams): DocumentHighlight[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    return handleDocumentHighlight(document, params.position);
});

// Selection Range handler - provides smart expand selection (Cmd+Shift+→)
connection.onSelectionRanges((params: SelectionRangeParams): SelectionRange[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    return handleSelectionRange(document, params.positions);
});

// Code Lens handler - shows "X references" above declarations
connection.onCodeLens((params: CodeLensParams): CodeLens[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    const ctx: CodeLensContext = {
        findKiteFilesInWorkspace,
        getFileContent,
    };
    return handleCodeLens(document, ctx);
});

// Workspace Symbols handler - provides global "Go to Symbol" (Cmd+T)
connection.onWorkspaceSymbol((params: WorkspaceSymbolParams): SymbolInformation[] => {
    const ctx: WorkspaceSymbolsContext = {
        findKiteFilesInWorkspace,
        getFileContent,
    };
    return handleWorkspaceSymbols(params.query, ctx);
});

// Semantic Tokens handler - provides enhanced syntax highlighting
connection.onRequest('textDocument/semanticTokens/full', (params: SemanticTokensParams): SemanticTokens => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return { data: [] };
    return handleSemanticTokens(document);
});

// Folding Range handler - provides custom code folding regions
connection.onFoldingRanges((params: FoldingRangeParams): FoldingRange[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    return handleFoldingRange(document);
});

// Call Hierarchy handlers - show incoming/outgoing calls for functions
connection.onRequest('textDocument/prepareCallHierarchy', (params: CallHierarchyPrepareParams): CallHierarchyItem[] | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    return prepareCallHierarchy(document, params.position);
});

connection.onRequest('callHierarchy/incomingCalls', (params: CallHierarchyIncomingCallsParams): CallHierarchyIncomingCall[] => {
    const document = documents.get(params.item.uri);
    if (!document) return [];
    const ctx: CallHierarchyContext = {
        findKiteFilesInWorkspace,
        getFileContent,
    };
    return getIncomingCalls(params.item, document, ctx);
});

connection.onRequest('callHierarchy/outgoingCalls', (params: CallHierarchyOutgoingCallsParams): CallHierarchyOutgoingCall[] => {
    const document = documents.get(params.item.uri);
    if (!document) return [];
    const ctx: CallHierarchyContext = {
        findKiteFilesInWorkspace,
        getFileContent,
    };
    return getOutgoingCalls(params.item, document, ctx);
});

// Linked Editing Range handler - simultaneous editing of related ranges
connection.onRequest('textDocument/linkedEditingRange', (params: LinkedEditingRangeParams): LinkedEditingRanges | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    return handleLinkedEditingRange(document, params.position);
});

// Document Links handler - makes import paths clickable
connection.onDocumentLinks((params: DocumentLinkParams): DocumentLink[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    const currentFilePath = URI.parse(document.uri).fsPath;
    const currentDir = path.dirname(currentFilePath);
    const ctx: DocumentLinksContext = {
        findKiteFilesInWorkspace,
        resolveImportPath: (importPath: string) => resolveImportPath(importPath, currentDir),
    };
    return handleDocumentLinks(document, ctx);
});

// On Type Formatting handler - auto-format as you type
connection.onDocumentOnTypeFormatting((params: DocumentOnTypeFormattingParams): TextEdit[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    return handleOnTypeFormatting(document, params.position, params.ch, {
        tabSize: params.options.tabSize,
        insertSpaces: params.options.insertSpaces,
    });
});

// Type Definition handler - navigate to type definition
connection.onTypeDefinition((params: TextDocumentPositionParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const ctx: TypeDefinitionContext = {
        findKiteFilesInWorkspace,
        getFileContent,
    };
    return handleTypeDefinition(document, params.position, ctx);
});

// Implementation handler - find all implementations of a schema/component
connection.onImplementation((params: TextDocumentPositionParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    const ctx: ImplementationContext = {
        findKiteFilesInWorkspace,
        getFileContent,
    };
    return handleImplementation(document, params.position, ctx);
});

// Start the server
documents.listen(connection);
connection.listen();
