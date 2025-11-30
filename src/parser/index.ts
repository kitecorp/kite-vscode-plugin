/**
 * ANTLR-generated parser for the Kite language.
 * Generated from grammar/*.g4 files using: npm run generate-parser
 */

// Generated parser classes (default exports)
export { default as KiteLexer } from './grammar/KiteLexer';
export { default as KiteParser } from './grammar/KiteParser';
export { default as KiteParserVisitor } from './grammar/KiteParserVisitor';
export { default as KiteParserListener } from './grammar/KiteParserListener';

// Parser context types (for AST node types)
export * from './grammar/KiteParser';

// Utility functions
export {
    parseKite,
    tokenize,
    getTokenAtOffset,
    positionToOffset,
    offsetToPosition,
    ParseResult,
    SyntaxError
} from './parse-utils';

// AST-based scanner
export { scanDocumentAST } from './ast-scanner';

// AST context utilities (re-exported from focused modules via ast-context)
export {
    // Cursor context
    getCursorContext,
    isInDecoratorContext,
    getDotAccessTarget,
    CursorContext,
    CursorContextType,
    // Definition lookup
    findDefinitionAST,
    DeclarationType,
    findSchemaByName,
    findComponentDefByName,
    findSchemaDefinitionAST,
    findComponentDefinitionAST,
    findFunctionDefinitionAST,
    findTypeDefinitionAST,
    findSchemaPropertyAST,
    findComponentInputAST,
    DefinitionLocation,
    // Import utilities
    extractImportsAST,
    findLastImportLineAST,
    findImportByPathAST,
    ImportInfo,
    // Property extraction
    extractSchemaPropertiesAST,
    extractComponentInputsAST,
    extractComponentOutputsAST,
    SchemaProperty,
    ComponentInput,
    ComponentOutput,
} from './ast-context';
