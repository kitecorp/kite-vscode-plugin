/**
 * Type checking handler for the Kite language server.
 * Provides type mismatch detection for variable declarations and resource properties.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Infer the type of a literal value from its string representation.
 * Returns null for identifier references (can't determine type without context).
 */
export function inferValueType(value: string): string | null {
    const trimmed = value.trim();

    // Empty value
    if (!trimmed) return null;

    // String literals (double or single quoted)
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return 'string';
    }

    // Boolean literals
    if (trimmed === 'true' || trimmed === 'false') {
        return 'boolean';
    }

    // Null literal
    if (trimmed === 'null') {
        return 'null';
    }

    // Number literals (integer or decimal, optionally negative)
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return 'number';
    }

    // Object literals (starts with {)
    if (trimmed.startsWith('{')) {
        return 'object';
    }

    // Array literals (starts with [)
    if (trimmed.startsWith('[')) {
        return 'array';
    }

    // Identifier reference - can't determine type
    return null;
}

/**
 * Check if a value type is compatible with a declared type.
 */
export function isTypeCompatible(declaredType: string, valueType: string): boolean {
    const normalizedDeclared = declaredType.toLowerCase();
    const normalizedValue = valueType.toLowerCase();

    // Exact match
    if (normalizedDeclared === normalizedValue) {
        return true;
    }

    // 'any' accepts everything (but not any[] - that requires an array)
    if (normalizedDeclared === 'any') {
        return true;
    }

    // Array types (e.g., string[], number[], any[]) require array values
    if (normalizedDeclared.endsWith('[]')) {
        // null is compatible with any array type
        if (normalizedValue === 'null') {
            return true;
        }

        // Generic 'array' is compatible with any typed array (we don't know the element type)
        if (normalizedValue === 'array') {
            return true;
        }

        // If valueType is also a typed array, check if element types match
        if (normalizedValue.endsWith('[]')) {
            const declaredElementType = normalizedDeclared.slice(0, -2);
            const valueElementType = normalizedValue.slice(0, -2);

            // any[] accepts any array
            if (declaredElementType === 'any') {
                return true;
            }

            // Element types must match
            return declaredElementType === valueElementType;
        }

        return false;
    }

    // null is compatible with any type (nullable)
    if (normalizedValue === 'null') {
        return true;
    }

    // Custom types (non-built-in) - be lenient with primitives and objects
    // Type aliases like `type Region = "us-east-1" | "us-west-2"` should accept string values
    // Struct/schema types should accept object literals
    if (!isBuiltinType(normalizedDeclared)) {
        if (normalizedValue === 'string' || normalizedValue === 'number' || normalizedValue === 'boolean') {
            return true;
        }
        // Object literals can be assigned to struct/schema types
        if (normalizedValue === 'object') {
            return true;
        }
    }

    return false;
}

/**
 * Check if a type name is a built-in type.
 */
function isBuiltinType(typeName: string): boolean {
    const builtins = ['string', 'number', 'boolean', 'any', 'object', 'void', 'null', 'array'];
    return builtins.includes(typeName.toLowerCase());
}

/**
 * Schema property definition
 */
interface SchemaProperty {
    name: string;
    type: string;
}

/**
 * Extract schema definitions from document text.
 * Returns a map of schema name -> array of properties
 */
function extractSchemas(text: string): Map<string, SchemaProperty[]> {
    const schemas = new Map<string, SchemaProperty[]>();

    // Match schema declarations: schema Name { ... }
    const schemaRegex = /\bschema\s+(\w+)\s*\{([^}]*)\}/g;
    let match;

    while ((match = schemaRegex.exec(text)) !== null) {
        const schemaName = match[1];
        const bodyText = match[2];
        const properties: SchemaProperty[] = [];

        // Parse properties: type name or type[] name
        // Handle 'any' keyword specially
        const propRegex = /\b(any|\w+)(\[\])?\s+(\w+)/g;
        let propMatch;

        while ((propMatch = propRegex.exec(bodyText)) !== null) {
            const type = propMatch[1] + (propMatch[2] || '');
            const name = propMatch[3];
            properties.push({ name, type });
        }

        schemas.set(schemaName, properties);
    }

    return schemas;
}

/**
 * Check for type mismatches in a document.
 */
export function checkTypeMismatches(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Extract schema definitions for resource property checking
    const schemas = extractSchemas(text);

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
                return true;
            }
        }
        return false;
    }

    // Helper to check if position is inside a string
    function isInsideString(pos: number): boolean {
        const textBefore = text.substring(0, pos);
        let inDouble = false;
        let inSingle = false;

        for (let i = 0; i < textBefore.length; i++) {
            const char = textBefore[i];
            if (char === '"' && !inSingle && (i === 0 || textBefore[i - 1] !== '\\')) {
                inDouble = !inDouble;
            } else if (char === "'" && !inDouble && (i === 0 || textBefore[i - 1] !== '\\')) {
                inSingle = !inSingle;
            }
        }

        return inDouble || inSingle;
    }

    // Check variable/input/output declarations with explicit types
    // Pattern: (var|input|output) type name = value
    const declRegex = /\b(var|input|output)\s+(\w+)(\[\])?\s+(\w+)\s*=\s*([^\n;]+)/g;
    let declMatch;

    while ((declMatch = declRegex.exec(text)) !== null) {
        if (isInsideComment(declMatch.index) || isInsideString(declMatch.index)) {
            continue;
        }

        const keyword = declMatch[1];
        const declaredType = declMatch[2] + (declMatch[3] || '');
        const varName = declMatch[4];
        const valueText = declMatch[5].trim();

        // Infer the value type
        const valueType = inferValueType(valueText);

        // If we can't infer the type (e.g., identifier reference), skip
        if (!valueType) continue;

        // Check for type mismatch
        if (!isTypeCompatible(declaredType, valueType)) {
            // Find position of the value for error highlighting
            const valueStart = declMatch.index + declMatch[0].indexOf(valueText);
            const valueEnd = valueStart + valueText.length;

            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: Range.create(
                    document.positionAt(valueStart),
                    document.positionAt(valueEnd)
                ),
                message: `Type mismatch: expected '${declaredType}' but got '${valueType}'`,
                source: 'kite'
            });
        }
    }

    // Check resource property type mismatches against schema definitions
    // Pattern: resource SchemaName instanceName { ... }
    const resourceRegex = /\bresource\s+(\w+)\s+\w+\s*\{([^}]*)\}/g;
    let resourceMatch;

    while ((resourceMatch = resourceRegex.exec(text)) !== null) {
        if (isInsideComment(resourceMatch.index)) continue;

        const schemaName = resourceMatch[1];
        const bodyText = resourceMatch[2];
        const bodyOffset = resourceMatch.index + resourceMatch[0].indexOf('{') + 1;

        // Get schema properties
        const schemaProps = schemas.get(schemaName);
        if (!schemaProps) continue;

        // Create property type map
        const propTypes = new Map<string, string>();
        for (const prop of schemaProps) {
            propTypes.set(prop.name, prop.type);
        }

        // Find property assignments in resource body: name = value
        const propAssignRegex = /\b(\w+)\s*=\s*([^\n,}]+)/g;
        let propMatch;

        while ((propMatch = propAssignRegex.exec(bodyText)) !== null) {
            const propName = propMatch[1];
            const valueText = propMatch[2].trim();

            // Get expected type from schema
            const expectedType = propTypes.get(propName);
            if (!expectedType) continue;

            // Infer value type
            const valueType = inferValueType(valueText);
            if (!valueType) continue;

            // Check for mismatch
            if (!isTypeCompatible(expectedType, valueType)) {
                const valueStart = bodyOffset + propMatch.index + propMatch[0].indexOf(valueText);
                const valueEnd = valueStart + valueText.length;

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: Range.create(
                        document.positionAt(valueStart),
                        document.positionAt(valueEnd)
                    ),
                    message: `Type mismatch: property '${propName}' expects '${expectedType}' but got '${valueType}'`,
                    source: 'kite'
                });
            }
        }
    }

    return diagnostics;
}
