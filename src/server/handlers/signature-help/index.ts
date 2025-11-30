/**
 * Signature Help handler for the Kite language server.
 * Provides parameter hints when typing function arguments.
 */

import {
    SignatureHelp,
    SignatureInformation,
    ParameterInformation,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver/node';
import { Declaration, FunctionCallInfo } from '../../types';

/**
 * Handle signature help request
 */
export function handleSignatureHelp(
    document: TextDocument,
    position: Position,
    declarations: Declaration[]
): SignatureHelp | null {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Find the function call we're inside
    const callInfo = findFunctionCallAtPosition(text, offset);
    if (!callInfo) return null;

    // Find the function declaration
    const funcDecl = declarations.find(d => d.type === 'function' && d.name === callInfo.functionName);

    if (!funcDecl || !funcDecl.parameters) return null;

    // Build parameter info
    const parameters: ParameterInformation[] = funcDecl.parameters.map(p => ({
        label: `${p.type} ${p.name}`,
        documentation: undefined
    }));

    // Build signature label: "functionName(type1 param1, type2 param2): returnType"
    const paramsStr = funcDecl.parameters.map(p => `${p.type} ${p.name}`).join(', ');
    let signatureLabel = `${funcDecl.name}(${paramsStr})`;
    if (funcDecl.returnType) {
        signatureLabel += `: ${funcDecl.returnType}`;
    }

    const signature: SignatureInformation = {
        label: signatureLabel,
        documentation: funcDecl.documentation,
        parameters
    };

    return {
        signatures: [signature],
        activeSignature: 0,
        activeParameter: callInfo.activeParameter
    };
}

/**
 * Find function call info at position (for signature help)
 */
export function findFunctionCallAtPosition(text: string, offset: number): FunctionCallInfo | null {
    // Walk backwards to find the opening parenthesis of a function call
    let pos = offset - 1;
    let parenDepth = 0;
    let commaCount = 0;

    while (pos >= 0) {
        const char = text[pos];

        if (char === ')') {
            parenDepth++;
        } else if (char === '(') {
            if (parenDepth === 0) {
                // Found the opening paren - now find the function name
                let nameEnd = pos - 1;
                // Skip whitespace before (
                while (nameEnd >= 0 && /\s/.test(text[nameEnd])) {
                    nameEnd--;
                }
                // Find start of identifier
                let nameStart = nameEnd;
                while (nameStart > 0 && /\w/.test(text[nameStart - 1])) {
                    nameStart--;
                }

                if (nameStart <= nameEnd) {
                    const functionName = text.substring(nameStart, nameEnd + 1);

                    // Verify this is a function call (not a declaration)
                    // Check that 'fun' doesn't precede it
                    let checkPos = nameStart - 1;
                    while (checkPos >= 0 && /\s/.test(text[checkPos])) {
                        checkPos--;
                    }
                    const beforeName = text.substring(Math.max(0, checkPos - 3), checkPos + 1);
                    if (beforeName.endsWith('fun')) {
                        return null; // This is a function declaration, not a call
                    }

                    return {
                        functionName,
                        activeParameter: commaCount
                    };
                }
                return null;
            }
            parenDepth--;
        } else if (char === ',' && parenDepth === 0) {
            commaCount++;
        } else if (char === '{' || char === '}' || char === ';') {
            // Hit a block boundary - not inside a function call
            return null;
        }

        pos--;
    }

    return null;
}
