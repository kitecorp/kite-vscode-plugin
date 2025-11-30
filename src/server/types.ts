/**
 * Shared types for the Kite language server.
 */

import { Range, Location } from 'vscode-languageserver/node';

// Declaration types in Kite
export type DeclarationType = 'variable' | 'input' | 'output' | 'resource' | 'component' | 'schema' | 'function' | 'type' | 'for';

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
export type DecoratorTarget = 'input' | 'output' | 'resource' | 'component' | 'schema' | 'schema property' | 'var' | 'fun' | null;

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
