/**
 * Utilities for working with indexed resources.
 *
 * Indexed resources are created by:
 * - @count decorator: Creates resources with numeric indices (server[0], server[1], ...)
 * - Range loops (for i in 0..n): Creates resources with numeric indices
 * - Array loops (for x in ["a", "b"]): Creates resources with string indices (server["a"], server["b"])
 */

import { Declaration, IndexedResourceInfo, IndexType } from '../types';

/**
 * Result of parsing an indexed access expression like `server[0]` or `data["prod"]`
 */
export interface IndexedAccessInfo {
    /** The base resource/component name */
    baseName: string;
    /** The index type (numeric or string) */
    indexType: IndexType;
    /** For numeric: the index value */
    numericIndex?: number;
    /** For string: the string key */
    stringKey?: string;
    /** The full text of the access expression */
    fullText: string;
}

/**
 * Parse an indexed access expression from text at a given offset.
 * Handles patterns like: server[0], data["prod"], items[i]
 *
 * @param text The source text
 * @param offset The cursor offset
 * @returns IndexedAccessInfo if cursor is in an indexed access, null otherwise
 */
export function parseIndexedAccess(text: string, offset: number): IndexedAccessInfo | null {
    // Look backwards from the offset to find the start of an identifier
    let start = offset;
    // Include characters that could be part of an indexed access expression
    while (start > 0 && /[\w\[\]"'0-9]/.test(text[start - 1])) {
        start--;
    }

    // Look forwards from the offset to find the end
    let end = offset;
    while (end < text.length && /[\w\[\]"'0-9]/.test(text[end])) {
        end++;
    }

    const segment = text.substring(start, end);

    // Match patterns: identifier[number] or identifier["string"] or identifier['string']
    const numericMatch = segment.match(/^(\w+)\[(\d+)\]$/);
    if (numericMatch) {
        return {
            baseName: numericMatch[1],
            indexType: 'numeric',
            numericIndex: parseInt(numericMatch[2], 10),
            fullText: segment,
        };
    }

    const stringMatch = segment.match(/^(\w+)\[["']([^"']+)["']\]$/);
    if (stringMatch) {
        return {
            baseName: stringMatch[1],
            indexType: 'string',
            stringKey: stringMatch[2],
            fullText: segment,
        };
    }

    // Check for partial matches (e.g., server[)
    const partialMatch = segment.match(/^(\w+)\[$/);
    if (partialMatch) {
        return {
            baseName: partialMatch[1],
            indexType: 'numeric', // Default to numeric when unknown
            fullText: segment,
        };
    }

    return null;
}

/**
 * Check if a declaration represents an indexed resource.
 */
export function isIndexedResource(decl: Declaration): boolean {
    return decl.indexedBy !== undefined;
}

/**
 * Get the index type for a declaration.
 * Returns undefined if not an indexed resource.
 */
export function getIndexType(decl: Declaration): IndexType | undefined {
    return decl.indexedBy?.indexType;
}

/**
 * Get completion suggestions for indexed access.
 *
 * @param decl The declaration to get completions for
 * @returns Array of suggested indices (as strings)
 */
export function getIndexCompletions(decl: Declaration): string[] {
    if (!decl.indexedBy) return [];

    const info = decl.indexedBy;

    if (info.indexType === 'numeric') {
        // For numeric, suggest indices based on count/range
        const suggestions: string[] = [];

        if (info.countValue !== undefined) {
            for (let i = 0; i < info.countValue; i++) {
                suggestions.push(String(i));
            }
        } else if (info.rangeStart !== undefined && info.rangeEnd !== undefined) {
            for (let i = info.rangeStart; i < info.rangeEnd; i++) {
                suggestions.push(String(i));
            }
        } else {
            // Unknown range, suggest common indices
            suggestions.push('0', '1', '2');
        }

        return suggestions;
    } else {
        // For string indices, suggest known keys
        if (info.stringKeys && info.stringKeys.length > 0) {
            return info.stringKeys.map(k => `"${k}"`);
        }
        // No known keys
        return [];
    }
}

/**
 * Validate that an indexed access matches the declaration's index type.
 *
 * @param access The parsed access info
 * @param decl The declaration being accessed
 * @returns Error message if invalid, null if valid
 */
export function validateIndexedAccess(access: IndexedAccessInfo, decl: Declaration): string | null {
    if (!decl.indexedBy) {
        return `'${decl.name}' is not an indexed resource. Remove the index accessor.`;
    }

    const info = decl.indexedBy;

    // Check type mismatch
    if (access.indexType !== info.indexType) {
        if (info.indexType === 'numeric') {
            return `'${decl.name}' uses numeric indices (e.g., ${decl.name}[0]), not string keys.`;
        } else {
            const exampleKey = info.stringKeys?.[0] || 'key';
            return `'${decl.name}' uses string keys (e.g., ${decl.name}["${exampleKey}"]), not numeric indices.`;
        }
    }

    // Check bounds for numeric indices
    if (access.indexType === 'numeric' && access.numericIndex !== undefined) {
        if (info.countValue !== undefined && access.numericIndex >= info.countValue) {
            return `Index ${access.numericIndex} is out of bounds. '${decl.name}' has ${info.countValue} instances (0-${info.countValue - 1}).`;
        }
        if (info.rangeEnd !== undefined && access.numericIndex >= info.rangeEnd) {
            return `Index ${access.numericIndex} is out of bounds. '${decl.name}' range is ${info.rangeStart || 0}..${info.rangeEnd}.`;
        }
    }

    // Check valid keys for string indices
    if (access.indexType === 'string' && access.stringKey !== undefined) {
        if (info.stringKeys && info.stringKeys.length > 0) {
            if (!info.stringKeys.includes(access.stringKey)) {
                return `Key "${access.stringKey}" is not valid. '${decl.name}' accepts: ${info.stringKeys.map(k => `"${k}"`).join(', ')}.`;
            }
        }
    }

    return null;
}

/**
 * Format indexed resource info for hover documentation.
 */
export function formatIndexedResourceInfo(info: IndexedResourceInfo): string {
    if (info.indexType === 'numeric') {
        if (info.countValue !== undefined) {
            return `Indexed resource with ${info.countValue} instances (0-${info.countValue - 1}) via @count(${info.countValue})`;
        }
        if (info.rangeStart !== undefined && info.rangeEnd !== undefined) {
            return `Indexed resource with indices ${info.rangeStart}..${info.rangeEnd - 1} via for loop`;
        }
        return `Indexed resource with numeric indices via ${info.loopVariable || '@count'}`;
    } else {
        if (info.stringKeys && info.stringKeys.length > 0) {
            return `Indexed resource with keys: ${info.stringKeys.map(k => `"${k}"`).join(', ')}`;
        }
        return `Indexed resource with string keys via for loop`;
    }
}

/**
 * Get the access pattern suggestion for an indexed resource.
 * Example: "Use server[0], server[1], server[2]" or "Use data["dev"], data["prod"]"
 */
export function getAccessPatternSuggestion(decl: Declaration): string | null {
    if (!decl.indexedBy) return null;

    const info = decl.indexedBy;
    const name = decl.name;

    if (info.indexType === 'numeric') {
        const indices = getIndexCompletions(decl);
        if (indices.length > 0) {
            const examples = indices.slice(0, 3).map(i => `${name}[${i}]`).join(', ');
            const more = indices.length > 3 ? ', ...' : '';
            return `Access using: ${examples}${more}`;
        }
        return `Access using: ${name}[index]`;
    } else {
        const keys = getIndexCompletions(decl);
        if (keys.length > 0) {
            const examples = keys.slice(0, 3).map(k => `${name}[${k}]`).join(', ');
            const more = keys.length > 3 ? ', ...' : '';
            return `Access using: ${examples}${more}`;
        }
        return `Access using: ${name}["key"]`;
    }
}
