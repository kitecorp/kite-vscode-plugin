/**
 * Decorator target validation for the Kite language server.
 * Reports errors when decorators are applied to invalid targets.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment } from '../../utils/text-utils';

/** Target types for decorators */
type DecoratorTarget = 'input' | 'output' | 'resource' | 'component-instance' | 'component-definition' | 'schema' | 'var' | 'fun' | 'schema-property';

/** Decorator configuration with valid targets */
interface DecoratorConfig {
    targets: DecoratorTarget[];
}

/** Built-in decorators with their valid targets */
const DECORATOR_TARGETS: Record<string, DecoratorConfig> = {
    // Validation decorators (input/output)
    minValue: { targets: ['input', 'output'] },
    maxValue: { targets: ['input', 'output'] },
    minLength: { targets: ['input', 'output'] },
    maxLength: { targets: ['input', 'output'] },
    validate: { targets: ['input', 'output'] },
    nonEmpty: { targets: ['input'] },
    allowed: { targets: ['input'] },
    unique: { targets: ['input'] },
    sensitive: { targets: ['input', 'output'] },

    // Resource decorators
    existing: { targets: ['resource'] },

    // Resource/Component instance decorators
    dependsOn: { targets: ['resource', 'component-instance'] },
    tags: { targets: ['resource', 'component-instance'] },
    provider: { targets: ['resource', 'component-instance'] },
    count: { targets: ['resource', 'component-instance'] },

    // Universal decorator
    description: { targets: ['resource', 'component-instance', 'component-definition', 'input', 'output', 'var', 'schema', 'schema-property', 'fun'] },
};

/**
 * Check for decorator target mismatches.
 */
export function checkDecoratorTargets(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Find all decorators and their targets
    const decoratorRegex = /@(\w+)(?:\s*\([^)]*\))?/g;
    let match;

    while ((match = decoratorRegex.exec(text)) !== null) {
        if (isInComment(text, match.index)) continue;

        const decoratorName = match[1];
        const decoratorOffset = match.index;

        // Skip unknown decorators (allow extensibility)
        const config = DECORATOR_TARGETS[decoratorName];
        if (!config) continue;

        // Find what this decorator is applied to
        const target = findDecoratorTarget(text, decoratorOffset + match[0].length);
        if (!target) continue;

        // Check if target is valid for this decorator
        if (!config.targets.includes(target)) {
            const validTargets = formatTargets(config.targets);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: Range.create(
                    document.positionAt(decoratorOffset),
                    document.positionAt(decoratorOffset + match[0].length)
                ),
                message: `@${decoratorName} can only be applied to ${validTargets}`,
                source: 'kite'
            });
        }
    }

    return diagnostics;
}

/**
 * Find the target of a decorator (what comes after it).
 */
function findDecoratorTarget(text: string, afterDecoratorOffset: number): DecoratorTarget | null {
    // Skip whitespace and other decorators to find the actual declaration
    let pos = afterDecoratorOffset;

    while (pos < text.length) {
        // Skip whitespace
        while (pos < text.length && /\s/.test(text[pos])) pos++;

        // Skip other decorators
        if (text[pos] === '@') {
            // Find end of this decorator
            const decoratorEnd = text.indexOf(')', pos);
            const nextLine = text.indexOf('\n', pos);
            if (decoratorEnd !== -1 && (nextLine === -1 || decoratorEnd < nextLine)) {
                pos = decoratorEnd + 1;
            } else {
                // No-arg decorator, skip to end of name
                const nameMatch = text.substring(pos).match(/@\w+/);
                if (nameMatch) {
                    pos += nameMatch[0].length;
                } else {
                    pos++;
                }
            }
            continue;
        }

        // Found non-decorator content
        break;
    }

    // Now identify what declaration this is
    const remainingText = text.substring(pos, pos + 100);

    // input declaration
    if (/^\s*input\s+/.test(remainingText)) {
        return 'input';
    }

    // output declaration
    if (/^\s*output\s+/.test(remainingText)) {
        return 'output';
    }

    // resource declaration
    if (/^\s*resource\s+/.test(remainingText)) {
        return 'resource';
    }

    // component - need to distinguish definition vs instance
    const componentMatch = remainingText.match(/^\s*component\s+(\w+)(\s+\w+)?\s*\{/);
    if (componentMatch) {
        // If there's a second identifier before {, it's an instance
        // component TypeName instanceName { } -> instance
        // component Name { input... } -> definition
        if (componentMatch[2]) {
            // Has instance name -> instance
            return 'component-instance';
        }
        // Just component Name { } - check if body has input/output
        const braceStart = pos + remainingText.indexOf('{');
        const braceEnd = findMatchingBrace(text, braceStart);
        if (braceEnd !== -1) {
            const bodyText = text.substring(braceStart, braceEnd);
            if (/\b(input|output)\s+\w+/.test(bodyText)) {
                return 'component-definition';
            }
            // Empty or property-only body -> could be instance
            return 'component-instance';
        }
        return 'component-definition';
    }

    // schema declaration
    if (/^\s*schema\s+/.test(remainingText)) {
        return 'schema';
    }

    // var declaration
    if (/^\s*var\s+/.test(remainingText)) {
        return 'var';
    }

    // fun declaration
    if (/^\s*fun\s+/.test(remainingText)) {
        return 'fun';
    }

    return null;
}

/**
 * Format target list for error message.
 */
function formatTargets(targets: DecoratorTarget[]): string {
    const readable: Record<DecoratorTarget, string> = {
        'input': 'input',
        'output': 'output',
        'resource': 'resource',
        'component-instance': 'component instance',
        'component-definition': 'component definition',
        'schema': 'schema',
        'var': 'var',
        'fun': 'fun',
        'schema-property': 'schema property',
    };

    const names = targets.map(t => readable[t]);

    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} or ${names[1]}`;

    const last = names.pop();
    return `${names.join(', ')}, or ${last}`;
}

/**
 * Find matching closing brace.
 */
function findMatchingBrace(text: string, startPos: number): number {
    if (text[startPos] !== '{') return -1;

    let depth = 0;
    for (let i = startPos; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}
