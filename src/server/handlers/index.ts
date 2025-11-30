/**
 * Re-exports all handlers for convenient importing.
 */

// Code Actions
export { handleCodeAction } from './code-actions';

// Completion
export {
    handleCompletion,
    CompletionContext,
    isAfterEquals,
    isInsideNestedStructure,
} from './completion';
export { addNumberSuggestions, addStringSuggestions } from './completion/devops-suggestions';
export { getSnippetCompletions, SNIPPETS } from './completion/snippets';

// Definition
export {
    handleDefinition,
    findSchemaDefinition,
    findFunctionDefinition,
    findComponentDefinition,
    DefinitionContext,
} from './definition';

// Document Symbols
export { handleDocumentSymbol } from './document-symbols';

// Formatting
export { formatDocument, FormatOptions } from './formatting';

// Hover
export { handleHover } from './hover';

// Inlay Hints
export {
    handleInlayHints,
    extractSchemaPropertyTypes,
    extractComponentInputTypes,
    InlayHintContext,
} from './inlay-hints';

// References
export {
    handleReferences,
    findAllReferences,
    findComponentPropertyReferences,
    findSchemaPropertyReferences,
    ReferencesContext,
} from './references';

// Rename
export {
    handlePrepareRename,
    handleRename,
    RenameContext,
    PrepareRenameResult,
} from './rename';

// Signature Help
export {
    handleSignatureHelp,
    findFunctionCallAtPosition,
} from './signature-help';

// Validation
export {
    validateDocument,
    ValidationContext,
} from './validation';
export { checkTypeMismatches, inferValueType, isTypeCompatible } from './validation/type-checking';
