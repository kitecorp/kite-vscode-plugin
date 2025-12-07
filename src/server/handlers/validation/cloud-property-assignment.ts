/**
 * Cloud property assignment detection for the Kite language server.
 * Reports errors when users try to set @cloud properties in resource instances.
 * @cloud properties are set by the cloud provider after resource creation.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment } from '../../utils/text-utils';
import { parseKite, findSchemaByName, extractSchemaPropertiesAST } from '../../../parser';

/**
 * Check for @cloud property assignments in resource instances.
 */
export function checkCloudPropertyAssignment(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Extract all @cloud properties from schemas in this file
    const cloudPropertiesBySchema = extractCloudProperties(text);

    // Check resource instances for @cloud property assignments
    const resourceRegex = /\bresource\s+([\w.]+)\s+(\w+)\s*\{/g;
    let resourceMatch;

    while ((resourceMatch = resourceRegex.exec(text)) !== null) {
        if (isInComment(text, resourceMatch.index)) continue;

        const schemaName = resourceMatch[1];
        const instanceName = resourceMatch[2];
        const braceStart = resourceMatch.index + resourceMatch[0].length - 1;
        const braceEnd = findMatchingBrace(text, braceStart);

        if (braceEnd === -1) continue;

        // Get @cloud properties for this schema
        const cloudProps = cloudPropertiesBySchema.get(schemaName);
        if (!cloudProps || cloudProps.size === 0) continue;

        // Check if any @cloud property is being set
        const bodyText = text.substring(braceStart + 1, braceEnd);
        const bodyOffset = braceStart + 1;

        // Find property assignments: name = value
        const assignRegex = /\b(\w+)\s*=/g;
        let assignMatch;

        while ((assignMatch = assignRegex.exec(bodyText)) !== null) {
            const propName = assignMatch[1];
            const propNameOffset = bodyOffset + assignMatch.index;

            if (cloudProps.has(propName)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: Range.create(
                        document.positionAt(propNameOffset),
                        document.positionAt(propNameOffset + propName.length)
                    ),
                    message: `Cannot set '@cloud' property '${propName}' - it is set by the cloud provider`,
                    source: 'kite'
                });
            }
        }
    }

    return diagnostics;
}

/**
 * Extract @cloud property names for each schema in the text.
 * Uses AST-based parsing.
 */
function extractCloudProperties(text: string): Map<string, Set<string>> {
    const cloudPropertiesBySchema = new Map<string, Set<string>>();

    const result = parseKite(text);
    if (!result.tree) return cloudPropertiesBySchema;

    // Find all schema declarations
    const schemaRegex = /\bschema\s+([\w.]+)\s*\{/g;
    let schemaMatch;

    while ((schemaMatch = schemaRegex.exec(text)) !== null) {
        const schemaName = schemaMatch[1];
        const schemaBaseName = schemaName.includes('.') ? schemaName.split('.').pop()! : schemaName;

        // Try full name first, then base name
        let schema = findSchemaByName(result.tree, schemaName);
        if (!schema) {
            schema = findSchemaByName(result.tree, schemaBaseName);
        }
        if (!schema) continue;

        const props = extractSchemaPropertiesAST(schema);
        const cloudProps = new Set<string>();

        for (const prop of props) {
            if (prop.isCloud) {
                cloudProps.add(prop.name);
            }
        }

        if (cloudProps.size > 0) {
            // Store by full name (e.g., "AWS.EC2.Instance")
            cloudPropertiesBySchema.set(schemaName, cloudProps);
            // Also store by base name for lookups (e.g., "Instance")
            if (schemaName !== schemaBaseName) {
                cloudPropertiesBySchema.set(schemaBaseName, cloudProps);
            }
        }
    }

    return cloudPropertiesBySchema;
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
