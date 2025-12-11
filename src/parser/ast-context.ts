/**
 * AST-based context utilities for the Kite language server.
 *
 * This file re-exports from focused modules for backwards compatibility.
 * New code should import from the specific modules directly:
 * - ast-cursor: getCursorContext, isInDecoratorContext, getDotAccessTarget
 * - ast-definitions: findDefinitionAST, findSchemaByName, findComponentDefByName, etc.
 * - ast-imports: extractImportsAST, findLastImportLineAST, findImportByPathAST
 * - ast-properties: extractSchemaPropertiesAST, extractComponentInputsAST, extractComponentOutputsAST
 */

// Re-export cursor context utilities
export {
    CursorContextType,
    CursorContext,
    getCursorContext,
    isInDecoratorContext,
    getDotAccessTarget,
} from './ast-cursor';

// Re-export definition lookup utilities
export {
    DefinitionLocation,
    DeclarationType,
    findDefinitionAST,
    findSchemaByName,
    findStructByName,
    findComponentDefByName,
    findSchemaPropertyAST,
    findStructPropertyAST,
    findComponentInputAST,
} from './ast-definitions';

// Re-export import utilities
export {
    ImportInfo,
    extractImportsAST,
    findLastImportLineAST,
    findImportByPathAST,
} from './ast-imports';

// Re-export property extraction utilities
export {
    SchemaProperty,
    StructProperty,
    ComponentInput,
    ComponentOutput,
    extractSchemaPropertiesAST,
    extractStructPropertiesAST,
    extractComponentInputsAST,
    extractComponentOutputsAST,
} from './ast-properties';

// Convenience aliases for specific definition finders (backwards compatibility)
import { findDefinitionAST } from './ast-definitions';
import type { ProgramContext } from './grammar/KiteParser';
import type { DefinitionLocation } from './ast-definitions';

/**
 * Find schema definition location in the AST
 */
export function findSchemaDefinitionAST(tree: ProgramContext, schemaName: string): DefinitionLocation | null {
    return findDefinitionAST(tree, 'schema', schemaName);
}

/**
 * Find struct definition location in the AST
 */
export function findStructDefinitionAST(tree: ProgramContext, structName: string): DefinitionLocation | null {
    return findDefinitionAST(tree, 'struct', structName);
}

/**
 * Find component definition location in the AST
 */
export function findComponentDefinitionAST(tree: ProgramContext, componentName: string): DefinitionLocation | null {
    return findDefinitionAST(tree, 'component', componentName);
}

/**
 * Find function definition location in the AST
 */
export function findFunctionDefinitionAST(tree: ProgramContext, functionName: string): DefinitionLocation | null {
    return findDefinitionAST(tree, 'function', functionName);
}

/**
 * Find type alias definition location in the AST
 */
export function findTypeDefinitionAST(tree: ProgramContext, typeName: string): DefinitionLocation | null {
    return findDefinitionAST(tree, 'type', typeName);
}
