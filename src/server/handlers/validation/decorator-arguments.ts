/**
 * Decorator argument validation for the Kite language server.
 * Validates that decorator arguments match expected types.
 */

import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Argument type requirements for decorators
 */
type ArgType = 'number' | 'string' | 'array' | 'object' | 'identifier' | 'none' | 'named';

interface DecoratorArgConfig {
    /** Expected argument type(s) - multiple means any of these is valid */
    types: ArgType[];
    /** For 'named' type - the required named parameter keys */
    namedParams?: string[];
    /** Error message when wrong type is provided */
    errorMessage?: string;
}

/**
 * Decorator argument requirements based on DECORATORS.md
 */
const DECORATOR_ARGS: Record<string, DecoratorArgConfig> = {
    // Number arguments
    minValue: { types: ['number', 'identifier'], errorMessage: '@minValue requires a number argument' },
    maxValue: { types: ['number', 'identifier'], errorMessage: '@maxValue requires a number argument' },
    minLength: { types: ['number', 'identifier'], errorMessage: '@minLength requires a number argument' },
    maxLength: { types: ['number', 'identifier'], errorMessage: '@maxLength requires a number argument' },
    count: { types: ['number', 'identifier'], errorMessage: '@count requires a number argument' },

    // String arguments
    description: { types: ['string'], errorMessage: '@description requires a string argument' },
    existing: { types: ['string'], errorMessage: '@existing requires a string argument (ARN, URL, or ID)' },

    // Array arguments
    allowed: { types: ['array'], errorMessage: '@allowed requires an array argument' },

    // No arguments
    nonEmpty: { types: ['none'], errorMessage: '@nonEmpty takes no arguments' },
    sensitive: { types: ['none'], errorMessage: '@sensitive takes no arguments' },
    unique: { types: ['none'], errorMessage: '@unique takes no arguments' },

    // Flexible types
    tags: { types: ['object', 'array', 'string'], errorMessage: '@tags requires an object, array, or string argument' },
    provider: { types: ['string', 'array'], errorMessage: '@provider requires a string or array argument' },
    dependsOn: { types: ['identifier', 'array'], errorMessage: '@dependsOn requires a resource reference or array of references' },

    // Named arguments
    validate: { types: ['named'], namedParams: ['regex', 'preset'], errorMessage: '@validate requires named argument: regex: or preset:' },
};

/**
 * Check decorator arguments in a document
 */
export function checkDecoratorArguments(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Match decorators with optional arguments: @name or @name(...)
    const decoratorRegex = /@(\w+)(?:\s*\(([^)]*)\))?/g;
    let match;

    while ((match = decoratorRegex.exec(text)) !== null) {
        const decoratorName = match[1];
        const argsString = match[2];
        const decoratorStart = match.index;

        // Skip if in comment
        if (isInComment(text, decoratorStart)) {
            continue;
        }

        // Check if this is a known decorator
        const config = DECORATOR_ARGS[decoratorName];
        if (!config) {
            // Unknown decorator - skip validation
            continue;
        }

        const argType = parseArgumentType(argsString);
        const isValid = validateArgument(config, argType, argsString);

        if (!isValid) {
            const startPos = document.positionAt(decoratorStart);
            const endPos = document.positionAt(decoratorStart + match[0].length);

            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: Range.create(startPos, endPos),
                message: config.errorMessage || `Invalid argument for @${decoratorName}`,
                source: 'kite',
            });
        }
    }

    return diagnostics;
}

/**
 * Determine the type of an argument string
 */
function parseArgumentType(argsString: string | undefined): ArgType | null {
    if (argsString === undefined) {
        // No parentheses at all - no arguments
        return null;
    }

    const trimmed = argsString.trim();

    if (trimmed === '') {
        // Empty parentheses - like @minValue()
        return null;
    }

    // Check for named argument (contains ':')
    if (/^\w+\s*:/.test(trimmed)) {
        return 'named';
    }

    // Check for array literal
    if (trimmed.startsWith('[')) {
        return 'array';
    }

    // Check for object literal
    if (trimmed.startsWith('{')) {
        return 'object';
    }

    // Check for string literal
    if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
        return 'string';
    }

    // Check for number literal
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return 'number';
    }

    // Check for boolean
    if (trimmed === 'true' || trimmed === 'false') {
        return 'identifier'; // treat as identifier for validation purposes
    }

    // Must be an identifier (variable reference)
    if (/^[a-zA-Z_]\w*$/.test(trimmed)) {
        return 'identifier';
    }

    // Unknown - probably an expression
    return 'identifier';
}

/**
 * Validate that the argument matches the expected type
 */
function validateArgument(config: DecoratorArgConfig, argType: ArgType | null, argsString?: string): boolean {
    // Handle 'none' type - should have no arguments
    if (config.types.includes('none')) {
        return argType === null;
    }

    // All other types require arguments
    if (argType === null) {
        return false;
    }

    // Handle named arguments
    if (config.types.includes('named')) {
        if (argType !== 'named') {
            return false;
        }
        // Check if a valid named parameter is present
        if (config.namedParams && argsString) {
            const hasValidParam = config.namedParams.some(param =>
                new RegExp(`\\b${param}\\s*:`).test(argsString)
            );
            return hasValidParam;
        }
        return true;
    }

    // Check if argument type matches any allowed type
    return config.types.includes(argType);
}

/**
 * Check if position is inside a comment
 */
function isInComment(text: string, position: number): boolean {
    // Check for line comment
    const lineStart = text.lastIndexOf('\n', position) + 1;
    const linePrefix = text.substring(lineStart, position);
    if (linePrefix.includes('//')) {
        return true;
    }

    // Check for block comment (simplified)
    const beforeText = text.substring(0, position);
    const lastBlockStart = beforeText.lastIndexOf('/*');
    const lastBlockEnd = beforeText.lastIndexOf('*/');
    if (lastBlockStart > lastBlockEnd) {
        return true;
    }

    return false;
}
