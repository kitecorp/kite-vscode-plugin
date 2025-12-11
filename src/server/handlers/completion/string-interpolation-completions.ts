/**
 * String interpolation completion logic.
 * Provides completions for property/method access inside string interpolations.
 *
 * Examples:
 * - "Hello ${name.???" → suggest string methods (toUpperCase, toLowerCase, etc.)
 * - "Count: ${items.???" → suggest array methods (length, join, etc.)
 * - "Value: ${num.???" → suggest number methods (toString, toFixed, etc.)
 */

import {
    CompletionItem,
    CompletionItemKind,
} from 'vscode-languageserver/node';
import { Declaration } from '../../types';

/**
 * String methods available in Kite
 */
const STRING_METHODS: CompletionItem[] = [
    { label: 'length', kind: CompletionItemKind.Property, detail: 'number', documentation: 'The length of the string' },
    { label: 'toUpperCase', kind: CompletionItemKind.Method, detail: '() → string', documentation: 'Converts to uppercase' },
    { label: 'toLowerCase', kind: CompletionItemKind.Method, detail: '() → string', documentation: 'Converts to lowercase' },
    { label: 'trim', kind: CompletionItemKind.Method, detail: '() → string', documentation: 'Removes leading/trailing whitespace' },
    { label: 'trimStart', kind: CompletionItemKind.Method, detail: '() → string', documentation: 'Removes leading whitespace' },
    { label: 'trimEnd', kind: CompletionItemKind.Method, detail: '() → string', documentation: 'Removes trailing whitespace' },
    { label: 'split', kind: CompletionItemKind.Method, detail: '(separator: string) → string[]', documentation: 'Splits into array by separator' },
    { label: 'substring', kind: CompletionItemKind.Method, detail: '(start: number, end?: number) → string', documentation: 'Extracts a portion of the string' },
    { label: 'replace', kind: CompletionItemKind.Method, detail: '(search: string, replacement: string) → string', documentation: 'Replaces first occurrence' },
    { label: 'replaceAll', kind: CompletionItemKind.Method, detail: '(search: string, replacement: string) → string', documentation: 'Replaces all occurrences' },
    { label: 'includes', kind: CompletionItemKind.Method, detail: '(search: string) → boolean', documentation: 'Checks if string contains search' },
    { label: 'startsWith', kind: CompletionItemKind.Method, detail: '(prefix: string) → boolean', documentation: 'Checks if starts with prefix' },
    { label: 'endsWith', kind: CompletionItemKind.Method, detail: '(suffix: string) → boolean', documentation: 'Checks if ends with suffix' },
    { label: 'indexOf', kind: CompletionItemKind.Method, detail: '(search: string) → number', documentation: 'Returns index of first occurrence, -1 if not found' },
    { label: 'lastIndexOf', kind: CompletionItemKind.Method, detail: '(search: string) → number', documentation: 'Returns index of last occurrence, -1 if not found' },
    { label: 'charAt', kind: CompletionItemKind.Method, detail: '(index: number) → string', documentation: 'Returns character at index' },
    { label: 'concat', kind: CompletionItemKind.Method, detail: '(...strings: string[]) → string', documentation: 'Concatenates strings' },
    { label: 'repeat', kind: CompletionItemKind.Method, detail: '(count: number) → string', documentation: 'Repeats string count times' },
    { label: 'padStart', kind: CompletionItemKind.Method, detail: '(length: number, pad?: string) → string', documentation: 'Pads start to reach length' },
    { label: 'padEnd', kind: CompletionItemKind.Method, detail: '(length: number, pad?: string) → string', documentation: 'Pads end to reach length' },
];

/**
 * Array methods available in Kite
 */
const ARRAY_METHODS: CompletionItem[] = [
    { label: 'length', kind: CompletionItemKind.Property, detail: 'number', documentation: 'The number of elements' },
    { label: 'join', kind: CompletionItemKind.Method, detail: '(separator?: string) → string', documentation: 'Joins elements into a string' },
    { label: 'includes', kind: CompletionItemKind.Method, detail: '(element: T) → boolean', documentation: 'Checks if array contains element' },
    { label: 'indexOf', kind: CompletionItemKind.Method, detail: '(element: T) → number', documentation: 'Returns index of element, -1 if not found' },
    { label: 'lastIndexOf', kind: CompletionItemKind.Method, detail: '(element: T) → number', documentation: 'Returns last index of element' },
    { label: 'slice', kind: CompletionItemKind.Method, detail: '(start?: number, end?: number) → T[]', documentation: 'Returns a portion of the array' },
    { label: 'concat', kind: CompletionItemKind.Method, detail: '(...arrays: T[][]) → T[]', documentation: 'Concatenates arrays' },
    { label: 'reverse', kind: CompletionItemKind.Method, detail: '() → T[]', documentation: 'Reverses the array' },
    { label: 'sort', kind: CompletionItemKind.Method, detail: '() → T[]', documentation: 'Sorts the array' },
    { label: 'first', kind: CompletionItemKind.Method, detail: '() → T', documentation: 'Returns the first element' },
    { label: 'last', kind: CompletionItemKind.Method, detail: '() → T', documentation: 'Returns the last element' },
    { label: 'isEmpty', kind: CompletionItemKind.Method, detail: '() → boolean', documentation: 'Checks if array is empty' },
    { label: 'contains', kind: CompletionItemKind.Method, detail: '(element: T) → boolean', documentation: 'Checks if array contains element' },
    { label: 'filter', kind: CompletionItemKind.Method, detail: '(predicate: (T) → boolean) → T[]', documentation: 'Filters elements by predicate' },
    { label: 'map', kind: CompletionItemKind.Method, detail: '(fn: (T) → U) → U[]', documentation: 'Maps elements to new values' },
    { label: 'find', kind: CompletionItemKind.Method, detail: '(predicate: (T) → boolean) → T?', documentation: 'Finds first element matching predicate' },
    { label: 'findIndex', kind: CompletionItemKind.Method, detail: '(predicate: (T) → boolean) → number', documentation: 'Finds index of first matching element' },
    { label: 'every', kind: CompletionItemKind.Method, detail: '(predicate: (T) → boolean) → boolean', documentation: 'Checks if all elements match predicate' },
    { label: 'some', kind: CompletionItemKind.Method, detail: '(predicate: (T) → boolean) → boolean', documentation: 'Checks if any element matches predicate' },
    { label: 'reduce', kind: CompletionItemKind.Method, detail: '(fn: (acc, T) → U, initial: U) → U', documentation: 'Reduces array to single value' },
];

/**
 * Number methods available in Kite
 */
const NUMBER_METHODS: CompletionItem[] = [
    { label: 'toString', kind: CompletionItemKind.Method, detail: '() → string', documentation: 'Converts to string' },
    { label: 'toFixed', kind: CompletionItemKind.Method, detail: '(digits: number) → string', documentation: 'Formats with fixed decimal places' },
    { label: 'toPrecision', kind: CompletionItemKind.Method, detail: '(precision: number) → string', documentation: 'Formats with specified precision' },
    { label: 'toExponential', kind: CompletionItemKind.Method, detail: '(digits?: number) → string', documentation: 'Formats in exponential notation' },
    { label: 'abs', kind: CompletionItemKind.Method, detail: '() → number', documentation: 'Returns absolute value' },
    { label: 'ceil', kind: CompletionItemKind.Method, detail: '() → number', documentation: 'Rounds up to integer' },
    { label: 'floor', kind: CompletionItemKind.Method, detail: '() → number', documentation: 'Rounds down to integer' },
    { label: 'round', kind: CompletionItemKind.Method, detail: '() → number', documentation: 'Rounds to nearest integer' },
];

/**
 * Boolean methods available in Kite
 */
const BOOLEAN_METHODS: CompletionItem[] = [
    { label: 'toString', kind: CompletionItemKind.Method, detail: '() → string', documentation: 'Converts to "true" or "false"' },
];

/**
 * Object/any methods available in Kite
 */
const OBJECT_METHODS: CompletionItem[] = [
    { label: 'toString', kind: CompletionItemKind.Method, detail: '() → string', documentation: 'Converts to string representation' },
    { label: 'keys', kind: CompletionItemKind.Method, detail: '() → string[]', documentation: 'Returns array of property names' },
    { label: 'values', kind: CompletionItemKind.Method, detail: '() → any[]', documentation: 'Returns array of property values' },
    { label: 'entries', kind: CompletionItemKind.Method, detail: '() → [string, any][]', documentation: 'Returns array of [key, value] pairs' },
    { label: 'hasKey', kind: CompletionItemKind.Method, detail: '(key: string) → boolean', documentation: 'Checks if object has key' },
];

/**
 * Check if cursor is inside a string interpolation `${...}`
 * Returns the interpolation content before cursor, or null if not in interpolation
 */
export function getStringInterpolationContext(text: string, offset: number): { content: string; startOffset: number } | null {
    // Find if we're inside a double-quoted string
    let inString = false;
    let stringStart = -1;

    for (let i = 0; i < offset && i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        // Handle escape sequences
        if (prevChar === '\\') continue;

        // Track double-quoted strings (single quotes don't support interpolation)
        if (char === '"') {
            if (!inString) {
                inString = true;
                stringStart = i;
            } else {
                inString = false;
                stringStart = -1;
            }
        }
    }

    if (!inString || stringStart === -1) {
        return null;
    }

    // Now check if we're inside an interpolation `${...}`
    const stringContent = text.substring(stringStart + 1, offset);

    // Find the last `${` that isn't closed
    let depth = 0;
    let interpStart = -1;

    for (let i = 0; i < stringContent.length; i++) {
        if (stringContent[i] === '$' && stringContent[i + 1] === '{') {
            if (depth === 0) {
                interpStart = i + 2; // After `${`
            }
            depth++;
            i++; // Skip `{`
        } else if (stringContent[i] === '}') {
            depth--;
            if (depth === 0) {
                interpStart = -1; // Interpolation closed
            }
        }
    }

    if (interpStart === -1) {
        return null;
    }

    // Return the content inside the interpolation before cursor
    const interpContent = stringContent.substring(interpStart);
    return {
        content: interpContent,
        startOffset: stringStart + 1 + interpStart,
    };
}

/**
 * Get the variable name before a dot in string interpolation
 */
export function getInterpolationDotTarget(interpContent: string): string | null {
    // Match: identifier. at the end
    const match = interpContent.match(/(\w+)\.\s*$/);
    return match ? match[1] : null;
}

/**
 * Get completions for property/method access inside string interpolation
 */
export function getStringInterpolationCompletions(
    text: string,
    offset: number,
    declarations: Declaration[]
): CompletionItem[] | null {
    // Check if we're inside a string interpolation
    const interpCtx = getStringInterpolationContext(text, offset);
    if (!interpCtx) {
        return null;
    }

    // Check if we're after a dot
    const varName = getInterpolationDotTarget(interpCtx.content);
    if (!varName) {
        return null;
    }

    // Find the declaration for this variable
    const decl = declarations.find(d => d.name === varName);
    if (!decl) {
        // Unknown variable - provide generic completions
        return [...STRING_METHODS, ...ARRAY_METHODS, ...NUMBER_METHODS];
    }

    // Provide type-appropriate completions based on typeName (for var/input/output)
    return getMethodsForType(decl.typeName || 'any');
}

/**
 * Get methods for a given type
 */
export function getMethodsForType(dataType: string): CompletionItem[] {
    const normalizedType = dataType.toLowerCase();

    if (normalizedType === 'string') {
        return STRING_METHODS;
    }

    if (normalizedType.endsWith('[]') || normalizedType.startsWith('array')) {
        return ARRAY_METHODS;
    }

    if (normalizedType === 'number') {
        return NUMBER_METHODS;
    }

    if (normalizedType === 'boolean') {
        return BOOLEAN_METHODS;
    }

    if (normalizedType === 'object' || normalizedType === 'any') {
        // For object/any, show all methods
        return [
            ...OBJECT_METHODS,
            ...STRING_METHODS.slice(0, 5),  // Subset of common methods
            ...ARRAY_METHODS.slice(0, 5),
        ];
    }

    // For custom types (schemas), show object methods
    return OBJECT_METHODS;
}
