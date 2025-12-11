/**
 * Decorator argument validation for the Kite language server.
 * Validates that decorator arguments match expected types.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DECORATORS } from '../../constants';
import { isInComment } from '../../utils/text-utils';

/**
 * Validate decorator arguments and return diagnostics
 */
export function checkDecoratorArguments(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Find all decorator usages: @decoratorName or @decoratorName(args)
    const decoratorRegex = /@(\w+)(\s*\(([^)]*)\))?/g;
    let match;

    while ((match = decoratorRegex.exec(text)) !== null) {
        // Skip if inside a comment
        if (isInComment(text, match.index)) continue;

        const decoratorName = match[1];
        const hasParens = match[2] !== undefined;
        const argsStr = match[3]?.trim() || '';

        // Find the decorator definition
        const decoratorDef = DECORATORS.find(d => d.name === decoratorName);

        if (!decoratorDef) {
            // Unknown decorator - handled by unknown-decorator check
            continue;
        }

        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        const range = Range.create(startPos, endPos);

        // Validate based on expected argument type
        const diagnostic = validateDecoratorArg(decoratorName, decoratorDef.argType, hasParens, argsStr, range);
        if (diagnostic) {
            diagnostics.push(diagnostic);
        }
    }

    return diagnostics;
}

/**
 * Validate a single decorator's argument against expected type
 */
function validateDecoratorArg(
    decoratorName: string,
    expectedType: string,
    hasParens: boolean,
    argsStr: string,
    range: Range
): Diagnostic | null {
    if (expectedType === 'none') {
        // Should not have arguments
        if (hasParens && argsStr) {
            return {
                severity: DiagnosticSeverity.Error,
                range,
                message: `@${decoratorName} does not take arguments`,
                source: 'kite'
            };
        }
    } else if (expectedType === 'number') {
        return validateNumberArg(decoratorName, hasParens, argsStr, range);
    } else if (expectedType === 'string') {
        return validateStringArg(decoratorName, hasParens, argsStr, range);
    } else if (expectedType === 'array') {
        return validateArrayArg(decoratorName, hasParens, argsStr, range);
    } else if (expectedType === 'object') {
        if (!hasParens || !argsStr) {
            return {
                severity: DiagnosticSeverity.Error,
                range,
                message: `@${decoratorName} requires an argument`,
                source: 'kite'
            };
        }
        // @tags accepts object, array, or string - but not plain numbers
        if (/^\d+$/.test(argsStr)) {
            return {
                severity: DiagnosticSeverity.Error,
                range,
                message: `@${decoratorName} expects an object, array, or string, got number`,
                source: 'kite'
            };
        }
    } else if (expectedType === 'named') {
        return validateNamedArg(decoratorName, hasParens, argsStr, range);
    } else if (expectedType === 'reference') {
        return validateReferenceArg(decoratorName, hasParens, argsStr, range);
    }

    return null;
}

/**
 * Validate reference argument (identifier or array of identifiers)
 */
function validateReferenceArg(
    decoratorName: string,
    hasParens: boolean,
    argsStr: string,
    range: Range
): Diagnostic | null {
    // Reference decorators require an argument (identifier or array)
    if (!hasParens || !argsStr) {
        return {
            severity: DiagnosticSeverity.Error,
            range,
            message: `@${decoratorName} requires a reference argument`,
            source: 'kite'
        };
    }

    // Must be an identifier or array (identifiers must start with letter)
    if (!/^[a-zA-Z_]\w*$/.test(argsStr) && !/^\[/.test(argsStr)) {
        // Check if it's a number (invalid)
        if (/^\d+$/.test(argsStr)) {
            return {
                severity: DiagnosticSeverity.Error,
                range,
                message: `@${decoratorName} expects a reference, got number`,
                source: 'kite'
            };
        }
    }

    return null;
}

/**
 * Validate number argument
 */
function validateNumberArg(
    decoratorName: string,
    hasParens: boolean,
    argsStr: string,
    range: Range
): Diagnostic | null {
    if (!hasParens || !argsStr) {
        return {
            severity: DiagnosticSeverity.Error,
            range,
            message: `@${decoratorName} requires a number argument`,
            source: 'kite'
        };
    }

    // Allow numbers or variable references (identifiers must start with letter)
    if (!/^\d+$/.test(argsStr) && !/^[a-zA-Z_]\w*$/.test(argsStr)) {
        if (/^".*"$/.test(argsStr) || /^'.*'$/.test(argsStr)) {
            return {
                severity: DiagnosticSeverity.Error,
                range,
                message: `@${decoratorName} expects a number, got string`,
                source: 'kite'
            };
        } else if (/^\[/.test(argsStr)) {
            return {
                severity: DiagnosticSeverity.Error,
                range,
                message: `@${decoratorName} expects a number, got array`,
                source: 'kite'
            };
        } else if (/^\{/.test(argsStr)) {
            return {
                severity: DiagnosticSeverity.Error,
                range,
                message: `@${decoratorName} expects a number, got object`,
                source: 'kite'
            };
        }
    }

    return null;
}

/**
 * Validate string argument
 */
function validateStringArg(
    decoratorName: string,
    hasParens: boolean,
    argsStr: string,
    range: Range
): Diagnostic | null {
    if (!hasParens || !argsStr) {
        return {
            severity: DiagnosticSeverity.Error,
            range,
            message: `@${decoratorName} requires a string argument`,
            source: 'kite'
        };
    }

    // Allow string literals or variable references (identifiers must start with letter)
    if (!/^".*"$/.test(argsStr) && !/^'.*'$/.test(argsStr) && !/^[a-zA-Z_]\w*$/.test(argsStr)) {
        if (/^\d/.test(argsStr)) {
            return {
                severity: DiagnosticSeverity.Error,
                range,
                message: `@${decoratorName} expects a string, got number`,
                source: 'kite'
            };
        } else if (/^\[/.test(argsStr)) {
            // Allow arrays for @provider(["aws", "azure"])
            if (decoratorName !== 'provider') {
                return {
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `@${decoratorName} expects a string, got array`,
                    source: 'kite'
                };
            }
        } else if (/^\{/.test(argsStr)) {
            return {
                severity: DiagnosticSeverity.Error,
                range,
                message: `@${decoratorName} expects a string, got object`,
                source: 'kite'
            };
        }
    }

    return null;
}

/**
 * Validate array argument
 */
function validateArrayArg(
    decoratorName: string,
    hasParens: boolean,
    argsStr: string,
    range: Range
): Diagnostic | null {
    if (!hasParens || !argsStr) {
        return {
            severity: DiagnosticSeverity.Error,
            range,
            message: `@${decoratorName} requires an array argument`,
            source: 'kite'
        };
    }

    // Must start with [ or be a variable reference (identifiers must start with letter)
    if (!/^\[/.test(argsStr) && !/^[a-zA-Z_]\w*$/.test(argsStr)) {
        if (/^".*"$/.test(argsStr) || /^'.*'$/.test(argsStr)) {
            return {
                severity: DiagnosticSeverity.Error,
                range,
                message: `@${decoratorName} expects an array, got string`,
                source: 'kite'
            };
        } else if (/^\d+$/.test(argsStr)) {
            return {
                severity: DiagnosticSeverity.Error,
                range,
                message: `@${decoratorName} expects an array, got number`,
                source: 'kite'
            };
        } else if (/^\{/.test(argsStr)) {
            return {
                severity: DiagnosticSeverity.Error,
                range,
                message: `@${decoratorName} expects an array, got object`,
                source: 'kite'
            };
        }
    }

    return null;
}

/**
 * Validate named argument
 */
function validateNamedArg(
    decoratorName: string,
    hasParens: boolean,
    argsStr: string,
    range: Range
): Diagnostic | null {
    // Named arguments like @validate(regex: "pattern")
    if (!hasParens || !argsStr) {
        return {
            severity: DiagnosticSeverity.Error,
            range,
            message: `@${decoratorName} requires named arguments (e.g., regex: "pattern")`,
            source: 'kite'
        };
    }

    // Must have named argument format
    if (!/\w+\s*:/.test(argsStr)) {
        return {
            severity: DiagnosticSeverity.Error,
            range,
            message: `@${decoratorName} requires named arguments (e.g., regex: "pattern")`,
            source: 'kite'
        };
    }

    return null;
}
