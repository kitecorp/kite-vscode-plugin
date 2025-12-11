/**
 * Shared types for the Kite language server.
 */

import { Range, Location } from 'vscode-languageserver/node';

// Declaration types in Kite
export type DeclarationType = 'variable' | 'input' | 'output' | 'resource' | 'component' | 'schema' | 'struct' | 'function' | 'type' | 'for' | 'import';

/**
 * Index type for resources created inside loops or with @count.
 * - 'numeric': Indexed by numbers (0, 1, 2...) - from @count or range loops (0..n)
 * - 'string': Indexed by string keys - from array loops (["a", "b"])
 */
export type IndexType = 'numeric' | 'string';

/**
 * Information about how a resource is indexed when created inside a loop or with @count.
 */
export interface IndexedResourceInfo {
    /** The type of index (numeric for @count/ranges, string for array loops) */
    indexType: IndexType;
    /** The loop variable name (for loops) or 'count' (for @count) */
    loopVariable?: string;
    /** For @count: the count value if static, undefined if dynamic */
    countValue?: number;
    /** For string-indexed: the known string keys */
    stringKeys?: string[];
    /** For range loops: the start and end values */
    rangeStart?: number;
    rangeEnd?: number;
}

// Represents a function parameter
export interface FunctionParameter {
    type: string;
    name: string;
}

// Represents a declaration found in a Kite file
export interface Declaration {
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
    importPath?: string;       // For import: the file path being imported from
    indexedBy?: IndexedResourceInfo; // For resources/components created inside loops or with @count
}

// Diagnostic data for code actions (stores import suggestions)
export interface ImportSuggestion {
    symbolName: string;
    filePath: string;
    importPath: string;
}

// Decorator argument types
export type ArgType = 'none' | 'number' | 'string' | 'array' | 'object' | 'reference' | 'named';

// Decorator metadata
export interface DecoratorInfo {
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

// Decorator target types
export type DecoratorTarget = 'input' | 'output' | 'resource' | 'component' | 'schema' | 'struct' | 'schema property' | 'struct property' | 'var' | 'fun' | null;

// Block context for resource/component instantiations
export interface BlockContext {
    name: string;
    type: 'resource' | 'component';
    typeName: string;  // Schema name for resources, component type for components
    start: number;
    end: number;
}

// Import statement information
export interface ImportInfo {
    path: string;
    symbols: string[];  // Empty array means wildcard import (import *)
}

// Function argument range
export interface ArgRange {
    start: number;
    end: number;
}

// Function call context for signature help
export interface FunctionCallInfo {
    functionName: string;
    activeParameter: number;
}

// Property access chain context
export interface PropertyAccessContext {
    chain: string[];      // Full chain: ['server', 'tag', 'New', 'a']
    propertyName: string; // The property being accessed (last in chain)
}

// Property lookup result
export interface PropertyResult {
    location: Location;
    valueStart?: number;  // Start of the value (for nested objects)
    valueEnd?: number;    // End of the value
}

// Component output information
export interface OutputInfo {
    name: string;
    type: string;
}

/**
 * Base context interface with common dependencies used by most handlers.
 * Handler-specific contexts can extend this interface.
 */
export interface BaseContext {
    /** Get declarations from cache for a URI */
    getDeclarations: (uri: string) => Declaration[] | undefined;
    /** Find all .kite files in workspace */
    findKiteFilesInWorkspace: () => string[];
    /** Get file content by path (from open document or file system) */
    getFileContent: (filePath: string, currentDocUri?: string) => string | null;
}
