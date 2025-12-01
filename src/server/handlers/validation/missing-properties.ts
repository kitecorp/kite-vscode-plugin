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

/** Schema property with default info */
interface SchemaProperty {
    name: string;
    typeName: string;
    hasDefault: boolean;
}

/** Component input with default info */
interface ComponentInput {
    name: string;
    typeName: string;
    hasDefault: boolean;
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
 */
function parseSchemaProperties(bodyText: string): SchemaProperty[] {
    const properties: SchemaProperty[] = [];

    // Match property declarations: [decorators] type name [= default]
    // Type must start with a letter (not a number) to avoid matching values like "8080"
    // Handle 'any' keyword and array types
    const propRegex = /(?:@\w+(?:\([^)]*\))?\s*)*\b(any|[a-zA-Z]\w*)(\[\])?\s+([a-zA-Z_]\w*)(\s*=)?/g;
    let propMatch;

    while ((propMatch = propRegex.exec(bodyText)) !== null) {
        const typeName = propMatch[1] + (propMatch[2] || '');
        const name = propMatch[3];
        const hasDefault = propMatch[4] !== undefined;

        // Skip if this looks like a keyword
        if (['input', 'output', 'var', 'fun', 'schema', 'component', 'resource'].includes(name)) {
            continue;
        }

        properties.push({ name, typeName, hasDefault });
    }

    return properties;
}

/**
 * Extract component definitions from document text.
 * Returns a map of component name -> array of inputs with hasDefault info.
 */
function extractComponents(text: string): Map<string, ComponentInput[]> {
    const components = new Map<string, ComponentInput[]>();

    // Match component definitions: component Name { (without instance name)
    const compStartRegex = /\bcomponent\s+(\w+)\s*\{/g;
    let match;

    while ((match = compStartRegex.exec(text)) !== null) {
        if (isInComment(text, match.index)) continue;

        const componentName = match[1];
        const braceStart = match.index + match[0].length - 1;

        // Check if this is a definition or instantiation
        // Definitions: component Name { (name directly followed by {)
        // Instantiations: component Type instanceName { (type followed by instance name)
        const beforeBrace = text.substring(match.index, braceStart).trim();
        const parts = beforeBrace.split(/\s+/);

        // Definition has exactly 2 parts: "component" and "Name"
        if (parts.length !== 2) continue;

        const braceEnd = findMatchingBrace(text, braceStart);
        if (braceEnd === -1) continue;

        const bodyText = text.substring(braceStart + 1, braceEnd);
        const inputs = parseComponentInputs(bodyText);

        components.set(componentName, inputs);
    }

    return components;
}

/**
 * Parse component inputs from body text.
 */
function parseComponentInputs(bodyText: string): ComponentInput[] {
    const inputs: ComponentInput[] = [];

    // Match input declarations: input type name [= default]
    const inputRegex = /\binput\s+(any|\w+)(\[\])?\s+(\w+)(\s*=)?/g;
    let inputMatch;

    while ((inputMatch = inputRegex.exec(bodyText)) !== null) {
        const typeName = inputMatch[1] + (inputMatch[2] || '');
        const name = inputMatch[3];
        const hasDefault = inputMatch[4] !== undefined;

        inputs.push({ name, typeName, hasDefault });
    }

    return inputs;
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

    // Extract definitions
    const schemas = extractSchemas(text);
    const components = extractComponents(text);

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
        for (const prop of schemaProps) {
            if (!prop.hasDefault && !provided.has(prop.name)) {
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

    // Check component instances: component TypeName instanceName {
    const compInstRegex = /\bcomponent\s+(\w+)\s+(\w+)\s*\{/g;
    let compMatch;

    while ((compMatch = compInstRegex.exec(text)) !== null) {
        if (isInComment(text, compMatch.index)) continue;

        const componentType = compMatch[1];
        const instanceName = compMatch[2];

        // Skip if this is a component definition (TypeName and instanceName same position check)
        const fullMatch = compMatch[0];
        const parts = fullMatch.trim().split(/\s+/);

        // Instantiation has 4 parts: "component", "Type", "instance", "{"
        // Definition has 3 parts: "component", "Name", "{"
        if (parts.length < 4) continue;

        const braceStart = compMatch.index + compMatch[0].length - 1;
        const braceEnd = findMatchingBrace(text, braceStart);

        if (braceEnd === -1) continue;

        // Get component inputs
        const compInputs = components.get(componentType);
        if (!compInputs) continue;

        // Find provided properties
        const bodyText = text.substring(braceStart + 1, braceEnd);
        const provided = findProvidedProperties(bodyText);

        // Check for missing required inputs
        for (const input of compInputs) {
            if (!input.hasDefault && !provided.has(input.name)) {
                // Find position of instance name for error highlighting
                const instanceNameStart = compMatch.index + compMatch[0].lastIndexOf(instanceName);
                const instanceNameEnd = instanceNameStart + instanceName.length;

                const data: MissingPropertyData = {
                    type: 'missing-property',
                    propertyName: input.name,
                    propertyType: input.typeName,
                    instanceType: 'component',
                    braceOffset: braceStart
                };

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: Range.create(
                        document.positionAt(instanceNameStart),
                        document.positionAt(instanceNameEnd)
                    ),
                    message: `Missing required input '${input.name}' in component '${componentType}'`,
                    source: 'kite',
                    data
                });
            }
        }
    }

    return diagnostics;
}
