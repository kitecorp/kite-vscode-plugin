/**
 * Rename utilities for the Kite language server.
 * These functions are extracted for testability.
 */

export interface ScopeBlock {
    start: number;
    end: number;
    type: 'function' | 'component-def' | 'schema';
}

export interface ReferenceLocation {
    startOffset: number;
    endOffset: number;
    uri?: string;
}

/**
 * Escape special regex characters in a string
 */
export function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if a position is inside a comment
 */
export function isInComment(text: string, pos: number): boolean {
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    const lineBeforePos = text.substring(lineStart, pos);
    if (lineBeforePos.includes('//')) return true;

    const textBefore = text.substring(0, pos);
    const lastBlockStart = textBefore.lastIndexOf('/*');
    if (lastBlockStart !== -1) {
        const lastBlockEnd = textBefore.lastIndexOf('*/');
        if (lastBlockEnd < lastBlockStart) return true;
    }
    return false;
}

/**
 * Find all scope blocks (functions, component definitions, schemas) in text
 */
export function findScopeBlocks(text: string): ScopeBlock[] {
    const scopeBlocks: ScopeBlock[] = [];

    // Find function scopes: fun name(...) {
    const funcScopeRegex = /\bfun\s+\w+\s*\([^)]*\)\s*\w*\s*\{/g;
    let funcMatch;
    while ((funcMatch = funcScopeRegex.exec(text)) !== null) {
        const braceStart = funcMatch.index + funcMatch[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        scopeBlocks.push({ start: braceStart, end: pos, type: 'function' });
    }

    // Find component definition scopes: component TypeName { (without instance name)
    const compDefRegex = /\bcomponent\s+(\w+)\s*\{/g;
    let compMatch;
    while ((compMatch = compDefRegex.exec(text)) !== null) {
        // Check if this is a definition (not instantiation)
        const afterComponent = text.substring(compMatch.index + 10, compMatch.index + compMatch[0].length);
        const parts = afterComponent.trim().split(/\s+/);
        // Definition: component TypeName { -> single word before {
        // Instantiation: component TypeName instanceName { -> two words before {
        if (parts.length === 2 && parts[1] === '{') {
            const braceStart = compMatch.index + compMatch[0].length - 1;
            let braceDepth = 1;
            let pos = braceStart + 1;
            while (pos < text.length && braceDepth > 0) {
                if (text[pos] === '{') braceDepth++;
                else if (text[pos] === '}') braceDepth--;
                pos++;
            }
            scopeBlocks.push({ start: braceStart, end: pos, type: 'component-def' });
        }
    }

    // Find schema scopes
    const schemaRegex = /\bschema\s+\w+\s*\{/g;
    let schemaMatch;
    while ((schemaMatch = schemaRegex.exec(text)) !== null) {
        const braceStart = schemaMatch.index + schemaMatch[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        scopeBlocks.push({ start: braceStart, end: pos, type: 'schema' });
    }

    return scopeBlocks;
}

/**
 * Find the enclosing scope for a given offset
 */
export function findEnclosingScope(scopeBlocks: ScopeBlock[], offset: number): ScopeBlock | null {
    for (const scope of scopeBlocks) {
        if (offset > scope.start && offset < scope.end) {
            return scope;
        }
    }
    return null;
}

/**
 * Find the component type name that contains a given scope
 */
export function findComponentTypeForScope(text: string, scopeStart: number): string | null {
    const beforeScope = text.substring(0, scopeStart + 1);
    const allCompDefs = [...beforeScope.matchAll(/\bcomponent\s+(\w+)\s*\{/g)];
    if (allCompDefs.length > 0) {
        const lastMatch = allCompDefs[allCompDefs.length - 1];
        const bracePos = lastMatch.index! + lastMatch[0].length - 1;
        if (bracePos === scopeStart) {
            return lastMatch[1];
        }
    }
    return null;
}

/**
 * Find the schema name that contains a given scope
 */
export function findSchemaNameForScope(text: string, scopeStart: number): string | null {
    const beforeScope = text.substring(0, scopeStart + 1);
    const allSchemaDefs = [...beforeScope.matchAll(/\bschema\s+(\w+)\s*\{/g)];
    if (allSchemaDefs.length > 0) {
        const lastMatch = allSchemaDefs[allSchemaDefs.length - 1];
        const bracePos = lastMatch.index! + lastMatch[0].length - 1;
        if (bracePos === scopeStart) {
            return lastMatch[1];
        }
    }
    return null;
}

/**
 * Check if position is inside a schema definition and return schema info
 */
export function getSchemaContextAtPosition(text: string, offset: number): { schemaName: string; scopeStart: number; scopeEnd: number } | null {
    const schemaRegex = /\bschema\s+(\w+)\s*\{/g;
    let match;

    while ((match = schemaRegex.exec(text)) !== null) {
        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;

        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }

        const scopeEnd = pos;

        if (offset > braceStart && offset < scopeEnd) {
            return {
                schemaName: match[1],
                scopeStart: braceStart,
                scopeEnd: scopeEnd
            };
        }
    }

    return null;
}

/**
 * Find all occurrences of a word in text, excluding comments
 */
export function findWordOccurrences(text: string, word: string): ReferenceLocation[] {
    const locations: ReferenceLocation[] = [];
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g');
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (isInComment(text, match.index)) continue;
        locations.push({
            startOffset: match.index,
            endOffset: match.index + word.length
        });
    }

    return locations;
}

/**
 * Find all occurrences of a word within a specific scope
 */
export function findWordOccurrencesInScope(
    text: string,
    word: string,
    scopeStart: number,
    scopeEnd: number
): ReferenceLocation[] {
    const locations: ReferenceLocation[] = [];
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'g');
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index < scopeStart || match.index > scopeEnd) continue;
        if (isInComment(text, match.index)) continue;
        locations.push({
            startOffset: match.index,
            endOffset: match.index + word.length
        });
    }

    return locations;
}

/**
 * Find component instantiations and their property assignments
 */
export function findComponentInstantiations(
    text: string,
    componentTypeName: string
): Array<{ instanceName: string; bodyStart: number; bodyEnd: number }> {
    const instantiations: Array<{ instanceName: string; bodyStart: number; bodyEnd: number }> = [];
    const instRegex = new RegExp(`\\bcomponent\\s+${escapeRegex(componentTypeName)}\\s+(\\w+)\\s*\\{`, 'g');
    let match;

    while ((match = instRegex.exec(text)) !== null) {
        const instanceName = match[1];
        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;

        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }

        instantiations.push({
            instanceName,
            bodyStart: braceStart + 1,
            bodyEnd: pos - 1
        });
    }

    return instantiations;
}

/**
 * Find resource instantiations of a schema type
 */
export function findResourceInstantiations(
    text: string,
    schemaName: string
): Array<{ instanceName: string; bodyStart: number; bodyEnd: number }> {
    const instantiations: Array<{ instanceName: string; bodyStart: number; bodyEnd: number }> = [];
    const schemaPattern = schemaName.includes('.')
        ? schemaName.replace(/\./g, '\\.')
        : escapeRegex(schemaName);
    const resRegex = new RegExp(`\\bresource\\s+${schemaPattern}\\s+(\\w+)\\s*\\{`, 'g');
    let match;

    while ((match = resRegex.exec(text)) !== null) {
        const instanceName = match[1];
        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;

        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }

        instantiations.push({
            instanceName,
            bodyStart: braceStart + 1,
            bodyEnd: pos - 1
        });
    }

    return instantiations;
}

/**
 * Find property assignments inside a body text
 */
export function findPropertyAssignments(
    text: string,
    bodyStart: number,
    bodyEnd: number,
    propertyName: string
): ReferenceLocation[] {
    const locations: ReferenceLocation[] = [];
    const bodyText = text.substring(bodyStart, bodyEnd);
    const propRegex = new RegExp(`(?:^|\\n)\\s*(${escapeRegex(propertyName)})\\s*=(?!=)`, 'g');
    let match;

    while ((match = propRegex.exec(bodyText)) !== null) {
        const propNameStart = bodyStart + match.index + match[0].indexOf(propertyName);
        locations.push({
            startOffset: propNameStart,
            endOffset: propNameStart + propertyName.length
        });
    }

    return locations;
}

/**
 * Find property access patterns like instance.property
 */
export function findPropertyAccess(
    text: string,
    instanceName: string,
    propertyName: string
): ReferenceLocation[] {
    const locations: ReferenceLocation[] = [];
    const accessRegex = new RegExp(`\\b${escapeRegex(instanceName)}\\.(${escapeRegex(propertyName)})\\b`, 'g');
    let match;

    while ((match = accessRegex.exec(text)) !== null) {
        if (isInComment(text, match.index)) continue;
        const propNameStart = match.index + instanceName.length + 1;
        locations.push({
            startOffset: propNameStart,
            endOffset: propNameStart + propertyName.length
        });
    }

    return locations;
}

/**
 * Check if a word is a Kite keyword
 */
export const KEYWORDS = [
    'resource', 'component', 'schema', 'input', 'output',
    'if', 'else', 'while', 'for', 'in', 'return',
    'import', 'from', 'fun', 'var', 'type', 'init', 'this',
    'true', 'false', 'null'
];

/**
 * Check if a word is a built-in type
 */
export const TYPES = ['string', 'number', 'boolean', 'any', 'object', 'void'];

/**
 * Validate if a symbol can be renamed
 */
export function canRenameSymbol(word: string, text: string, offset: number): { canRename: boolean; reason?: string } {
    // Don't allow renaming keywords
    if (KEYWORDS.includes(word)) {
        return { canRename: false, reason: 'Cannot rename keyword' };
    }

    // Don't allow renaming built-in types
    if (TYPES.includes(word)) {
        return { canRename: false, reason: 'Cannot rename built-in type' };
    }

    // Find word boundaries
    let start = offset;
    while (start > 0 && /\w/.test(text[start - 1])) {
        start--;
    }

    // Check if this is a decorator name (preceded by @)
    if (start > 0 && text[start - 1] === '@') {
        return { canRename: false, reason: 'Cannot rename decorator' };
    }

    // Check if in a comment
    if (isInComment(text, start)) {
        return { canRename: false, reason: 'Cannot rename inside comment' };
    }

    // Check if inside a string (basic check)
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const lineText = text.substring(lineStart, start);
    const doubleQuotes = (lineText.match(/"/g) || []).length;
    const singleQuotes = (lineText.match(/'/g) || []).length;
    if (doubleQuotes % 2 !== 0 || singleQuotes % 2 !== 0) {
        return { canRename: false, reason: 'Cannot rename inside string' };
    }

    return { canRename: true };
}

/**
 * Validate if a new name is valid
 */
export function isValidNewName(newName: string): { valid: boolean; reason?: string } {
    const trimmed = newName.trim();

    // Check that new name is a valid identifier
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
        return { valid: false, reason: 'Invalid identifier' };
    }

    // Don't allow renaming to a keyword
    if (KEYWORDS.includes(trimmed)) {
        return { valid: false, reason: 'Cannot rename to keyword' };
    }

    // Don't allow renaming to a built-in type
    if (TYPES.includes(trimmed)) {
        return { valid: false, reason: 'Cannot rename to built-in type' };
    }

    return { valid: true };
}
