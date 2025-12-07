/**
 * Missing required properties detection for the Kite language server.
 * Reports errors when resource instances or component instantiations
 * are missing required properties/inputs.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment } from '../../utils/text-utils';
import { MissingPropertyData } from '../code-actions/generate-properties';

/** Schema property with default and cloud info */
interface SchemaProperty {
    name: string;
    typeName: string;
    hasDefault: boolean;
    isCloud: boolean;  // Properties marked with @cloud are set by cloud provider
}


/**
 * Extract schema definitions from document text.
 * Returns a map of schema name -> array of properties with hasDefault info.
 */
function extractSchemas(text: string): Map<string, SchemaProperty[]> {
    const schemas = new Map<string, SchemaProperty[]>();

    // Match schema declarations: schema Name { ... }
    // Use a more careful approach to handle nested braces
    const schemaStartRegex = /\bschema\s+([\w.]+)\s*\{/g;
    let match;

    while ((match = schemaStartRegex.exec(text)) !== null) {
        if (isInComment(text, match.index)) continue;

        const schemaName = match[1];
        const braceStart = match.index + match[0].length - 1;
        const braceEnd = findMatchingBrace(text, braceStart);

        if (braceEnd === -1) continue;

        const bodyText = text.substring(braceStart + 1, braceEnd);
        const properties = parseSchemaProperties(bodyText);

        schemas.set(schemaName, properties);
    }

    return schemas;
}

/**
 * Parse schema properties from body text.
 * Handles: type name, type name = default, type[] name, type[] name = default
 * Also detects @cloud decorator which marks properties as cloud-generated.
 */
function parseSchemaProperties(bodyText: string): SchemaProperty[] {
    const properties: SchemaProperty[] = [];

    // Remove comments to avoid matching text in comments
    const bodyWithoutComments = removeComments(bodyText);

    // Match property declarations: [decorators] type name [= default]
    // Type must start with a letter (not a number) to avoid matching values like "8080"
    // Handle 'any' keyword and array types
    // Capture decorators in group 1 to check for @cloud
    const propRegex = /((?:@\w+(?:\([^)]*\))?\s*)*)\b(any|[a-zA-Z]\w*)(\[\])?\s+([a-zA-Z_]\w*)(\s*=)?/g;
    let propMatch;

    while ((propMatch = propRegex.exec(bodyWithoutComments)) !== null) {
        const decorators = propMatch[1] || '';
        const typeName = propMatch[2] + (propMatch[3] || '');
        const name = propMatch[4];
        const hasDefault = propMatch[5] !== undefined;

        // Skip if this looks like a keyword
        if (['input', 'output', 'var', 'fun', 'schema', 'component', 'resource'].includes(name)) {
            continue;
        }

        // Check if property has @cloud decorator (with optional arguments)
        const isCloud = /@cloud(?:\s*\([^)]*\))?/.test(decorators);

        properties.push({ name, typeName, hasDefault, isCloud });
    }

    return properties;
}

/**
 * Remove comments from text
 */
function removeComments(text: string): string {
    let result = '';
    let inString = false;
    let stringChar = '';
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';
        const nextChar = i < text.length - 1 ? text[i + 1] : '';

        // Handle strings
        if ((char === '"' || char === "'") && prevChar !== '\\') {
            if (!inLineComment && !inBlockComment) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
                result += char;
            }
            continue;
        }

        if (inString) {
            result += char;
            continue;
        }

        // Handle line comments
        if (!inBlockComment && char === '/' && nextChar === '/') {
            inLineComment = true;
            i++; // Skip next char
            continue;
        }

        if (inLineComment) {
            if (char === '\n') {
                inLineComment = false;
                result += char; // Keep newline
            }
            continue;
        }

        // Handle block comments
        if (!inLineComment && char === '/' && nextChar === '*') {
            inBlockComment = true;
            i++; // Skip next char
            continue;
        }

        if (inBlockComment) {
            if (char === '*' && nextChar === '/') {
                inBlockComment = false;
                i++; // Skip next char
            }
            continue;
        }

        result += char;
    }

    return result;
}

/**
 * Find provided property names in a resource/component body.
 */
function findProvidedProperties(bodyText: string): Set<string> {
    const provided = new Set<string>();

    // Match property assignments: name = value or name: value
    const assignRegex = /\b(\w+)\s*[=:]/g;
    let assignMatch;

    while ((assignMatch = assignRegex.exec(bodyText)) !== null) {
        provided.add(assignMatch[1]);
    }

    return provided;
}

/**
 * Find matching closing brace for an opening brace.
 */
function findMatchingBrace(text: string, startPos: number): number {
    if (text[startPos] !== '{') return -1;

    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = startPos; i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        // Handle string literals
        if ((char === '"' || char === "'") && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
            continue;
        }

        if (inString) continue;

        if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }

    return -1;
}

/**
 * Check for missing required properties in resources and component instances.
 */
export function checkMissingProperties(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Extract schema definitions
    const schemas = extractSchemas(text);

    // Check resource instances: resource SchemaName instanceName {
    const resourceRegex = /\bresource\s+([\w.]+)\s+(\w+)\s*\{/g;
    let resourceMatch;

    while ((resourceMatch = resourceRegex.exec(text)) !== null) {
        if (isInComment(text, resourceMatch.index)) continue;

        const schemaName = resourceMatch[1];
        const instanceName = resourceMatch[2];
        const braceStart = resourceMatch.index + resourceMatch[0].length - 1;
        const braceEnd = findMatchingBrace(text, braceStart);

        if (braceEnd === -1) continue;

        // Get schema properties
        const schemaProps = schemas.get(schemaName);
        if (!schemaProps) continue;

        // Find provided properties
        const bodyText = text.substring(braceStart + 1, braceEnd);
        const provided = findProvidedProperties(bodyText);

        // Check for missing required properties
        // Skip @cloud properties - they are set by the cloud provider, not the user
        for (const prop of schemaProps) {
            if (!prop.hasDefault && !prop.isCloud && !provided.has(prop.name)) {
                // Find position of instance name for error highlighting
                const instanceNameStart = resourceMatch.index + resourceMatch[0].indexOf(instanceName);
                const instanceNameEnd = instanceNameStart + instanceName.length;

                const data: MissingPropertyData = {
                    type: 'missing-property',
                    propertyName: prop.name,
                    propertyType: prop.typeName,
                    instanceType: 'resource',
                    braceOffset: braceStart
                };

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: Range.create(
                        document.positionAt(instanceNameStart),
                        document.positionAt(instanceNameEnd)
                    ),
                    message: `Missing required property '${prop.name}' in resource '${schemaName}'`,
                    source: 'kite',
                    data
                });
            }
        }
    }

    // Note: Component inputs are NOT checked here because all inputs are optional.
    // When not specified, users are prompted at runtime via CLI.

    return diagnostics;
}
