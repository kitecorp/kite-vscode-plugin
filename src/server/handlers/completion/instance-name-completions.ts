/**
 * Instance name completions for resource and component declarations.
 * Suggests smart instance names when typing after 'resource TypeName ' or 'component TypeName '.
 */

import {
    CompletionItem,
    CompletionItemKind,
} from 'vscode-languageserver/node';

/**
 * Context for instance name completion
 */
export interface InstanceNameContext {
    keyword: 'resource' | 'component';
    typeName: string;
    partialName?: string;
}

/**
 * Common abbreviations for type name parts
 */
const ABBREVIATIONS: Record<string, string[]> = {
    'database': ['db'],
    'config': ['cfg', 'config'],
    'configuration': ['cfg', 'config'],
    'server': ['srv', 'server'],
    'service': ['svc'],
    'function': ['func', 'fn'],
    'instance': ['inst'],
    'bucket': ['bucket'],
    'table': ['tbl'],
    'queue': ['queue', 'q'],
    'topic': ['topic'],
    'role': ['role'],
    'policy': ['policy'],
    'lambda': ['lambda', 'fn'],
    'gateway': ['gateway', 'gw'],
    'cluster': ['cluster'],
    'container': ['container'],
    'repository': ['repo'],
    'registry': ['registry'],
    'network': ['net', 'network'],
    'subnet': ['subnet'],
    'vpc': ['vpc'],
    'security': ['sec'],
    'group': ['grp'],
    'load': ['lb'],
    'balancer': ['lb'],
};

/**
 * Prefixes for generating alternative names
 */
const PREFIXES = ['my', 'main', 'primary'];

/**
 * Role-based suggestions for Instance types
 */
const INSTANCE_ROLES = ['web', 'api', 'app', 'worker', 'bastion', 'nat'];

/**
 * Detect if cursor is in instance name context.
 * Returns context info if after 'resource TypeName ' or 'component TypeName '.
 */
export function isInstanceNameContext(text: string, offset: number): InstanceNameContext | null {
    // Get text before cursor
    const beforeCursor = text.substring(0, offset);

    // Check if we're inside a comment
    const lastNewline = beforeCursor.lastIndexOf('\n');
    const currentLine = lastNewline === -1 ? beforeCursor : beforeCursor.substring(lastNewline + 1);
    if (currentLine.trim().startsWith('//')) {
        return null;
    }

    // Check if we're inside a string
    const quoteCount = (beforeCursor.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
        return null;
    }

    // Pattern: (resource|component) TypeName [partialName]
    // TypeName can be PascalCase or namespaced (AWS.EC2.Instance or aws.Lambda.Function)
    // Must have at least one space after TypeName
    // Allow lowercase or uppercase start for namespaced types
    const pattern = /\b(resource|component)\s+([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)*)\s+([a-z][a-zA-Z0-9]*)?$/;

    const match = beforeCursor.match(pattern);
    if (!match) {
        return null;
    }

    const keyword = match[1] as 'resource' | 'component';
    const typeName = match[2];
    const partialName = match[3];

    // Check if there's already a { after this (would make it a definition for component)
    // This is a simple check - look ahead in remaining text for { before newline
    const afterCursor = text.substring(offset);
    const nextBrace = afterCursor.indexOf('{');
    const nextNewline = afterCursor.indexOf('\n');

    // If { appears before newline or end, and no identifier follows, might be a definition
    if (keyword === 'component' && nextBrace !== -1) {
        // Check if the { is right after cursor (with optional whitespace)
        const beforeBrace = afterCursor.substring(0, nextBrace).trim();
        if (beforeBrace === '') {
            // component WebServer { - this is a definition, not instantiation
            // But only if there was no partial name typed yet
            if (!partialName) {
                return null;
            }
        }
    }

    return {
        keyword,
        typeName,
        partialName,
    };
}

/**
 * Generate smart instance name suggestions from a type name.
 * Includes camelCase, abbreviations, and prefixed versions.
 */
export function generateInstanceNameSuggestions(typeName: string): string[] {
    const suggestions: string[] = [];
    const seen = new Set<string>();

    const addSuggestion = (name: string) => {
        if (!seen.has(name)) {
            seen.add(name);
            suggestions.push(name);
        }
    };

    // Handle namespaced types (AWS.EC2.Instance -> Instance)
    const lastDotIndex = typeName.lastIndexOf('.');
    const baseName = lastDotIndex === -1 ? typeName : typeName.substring(lastDotIndex + 1);

    // 1. Primary suggestion: camelCase of the type name
    const camelCase = toCamelCase(baseName);
    addSuggestion(camelCase);

    // 2. For namespaced types, also add the lowercase base name
    if (lastDotIndex !== -1) {
        addSuggestion(baseName.toLowerCase());
    }

    // 3. Add abbreviations based on type name parts
    const words = splitPascalCase(baseName).map(w => w.toLowerCase());
    for (const word of words) {
        if (ABBREVIATIONS[word]) {
            for (const abbrev of ABBREVIATIONS[word]) {
                addSuggestion(abbrev);
            }
        }
    }

    // 4. Add role-based suggestions for Instance types
    if (baseName.toLowerCase().includes('instance')) {
        for (const role of INSTANCE_ROLES) {
            addSuggestion(role);
        }
    }

    // 5. Add prefixed versions
    for (const prefix of PREFIXES) {
        addSuggestion(prefix + baseName);
    }

    return suggestions;
}

/**
 * Get instance name completions for current position.
 * Returns null if not in instance name context.
 */
export function getInstanceNameCompletions(text: string, offset: number): CompletionItem[] | null {
    const context = isInstanceNameContext(text, offset);
    if (!context) {
        return null;
    }

    const suggestions = generateInstanceNameSuggestions(context.typeName);

    // Filter by partial name if present
    const filtered = context.partialName
        ? suggestions.filter(s => s.toLowerCase().startsWith(context.partialName!.toLowerCase()))
        : suggestions;

    return filtered.map((name, index) => ({
        label: name,
        kind: CompletionItemKind.Variable,
        detail: `${context.keyword} instance name`,
        sortText: String(index).padStart(4, '0'),
        documentation: `Suggested name for ${context.typeName} ${context.keyword}`,
    }));
}

/**
 * Convert PascalCase to camelCase
 */
function toCamelCase(str: string): string {
    if (!str) return str;
    return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Split a PascalCase string into words
 * e.g., "DatabaseConnectionPool" -> ["Database", "Connection", "Pool"]
 */
function splitPascalCase(str: string): string[] {
    return str.split(/(?=[A-Z])/).filter(s => s.length > 0);
}
