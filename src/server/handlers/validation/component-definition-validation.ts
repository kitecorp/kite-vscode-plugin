/**
 * Component definition validation for the Kite language server.
 * Validates unique names within component definitions.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

interface NameDecl {
    name: string;
    type: string;
    offset: number;
}

/**
 * Check for duplicate names within component definitions
 */
export function checkComponentDefinitionDuplicates(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Find all component definitions: component TypeName { (without instance name)
    const compDefRegex = /\bcomponent\s+(\w+)\s*\{/g;
    let compDefMatch;
    while ((compDefMatch = compDefRegex.exec(text)) !== null) {
        // Check if this is a definition (not instantiation) by looking for instance name
        const fullMatch = compDefMatch[0];
        const afterComponent = fullMatch.substring(10).trim(); // after "component "
        const parts = afterComponent.split(/\s+/);

        // Definition has: TypeName { -> parts = ["TypeName", "{"]
        // Instantiation has: TypeName instanceName { -> parts = ["TypeName", "instanceName", "{"]
        if (parts.length !== 2 || parts[1] !== '{') {
            continue; // This is an instantiation, skip
        }

        const componentName = compDefMatch[1];
        const braceStart = compDefMatch.index + compDefMatch[0].length - 1;

        // Find matching closing brace
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        const braceEnd = pos;
        const bodyText = text.substring(braceStart + 1, braceEnd - 1);
        const bodyOffset = braceStart + 1;

        // Find all name declarations within this component
        const nameDeclarations = extractNameDeclarations(bodyText, bodyOffset);

        // Check for duplicates
        const duplicateDiagnostics = findDuplicateNames(
            document,
            nameDeclarations,
            componentName
        );
        diagnostics.push(...duplicateDiagnostics);
    }

    return diagnostics;
}

/**
 * Extract all name declarations from component body
 */
function extractNameDeclarations(bodyText: string, bodyOffset: number): NameDecl[] {
    const nameDeclarations: NameDecl[] = [];

    // Find inputs: input type name
    const inputRegex = /\binput\s+\w+(?:\[\])?\s+(\w+)/g;
    let inputMatch;
    while ((inputMatch = inputRegex.exec(bodyText)) !== null) {
        const nameOffset = bodyOffset + inputMatch.index + inputMatch[0].lastIndexOf(inputMatch[1]);
        nameDeclarations.push({ name: inputMatch[1], type: 'input', offset: nameOffset });
    }

    // Find outputs: output type name
    const outputRegex = /\boutput\s+\w+(?:\[\])?\s+(\w+)/g;
    let outputMatch;
    while ((outputMatch = outputRegex.exec(bodyText)) !== null) {
        const nameOffset = bodyOffset + outputMatch.index + outputMatch[0].lastIndexOf(outputMatch[1]);
        nameDeclarations.push({ name: outputMatch[1], type: 'output', offset: nameOffset });
    }

    // Find variables: var [type] name =
    const varRegex = /\bvar\s+(?:\w+\s+)?(\w+)\s*=/g;
    let varMatch;
    while ((varMatch = varRegex.exec(bodyText)) !== null) {
        const nameOffset = bodyOffset + varMatch.index + varMatch[0].indexOf(varMatch[1]);
        nameDeclarations.push({ name: varMatch[1], type: 'variable', offset: nameOffset });
    }

    // Find resources: resource Schema name {
    const resRegex = /\bresource\s+[\w.]+\s+(\w+)\s*\{/g;
    let resMatch;
    while ((resMatch = resRegex.exec(bodyText)) !== null) {
        const nameOffset = bodyOffset + resMatch.index + resMatch[0].lastIndexOf(resMatch[1]);
        nameDeclarations.push({ name: resMatch[1], type: 'resource', offset: nameOffset });
    }

    // Find nested component instances: component Type name {
    const nestedCompRegex = /\bcomponent\s+\w+\s+(\w+)\s*\{/g;
    let nestedCompMatch;
    while ((nestedCompMatch = nestedCompRegex.exec(bodyText)) !== null) {
        const nameOffset = bodyOffset + nestedCompMatch.index + nestedCompMatch[0].lastIndexOf(nestedCompMatch[1]);
        nameDeclarations.push({ name: nestedCompMatch[1], type: 'component', offset: nameOffset });
    }

    return nameDeclarations;
}

/**
 * Find duplicate names and return diagnostics
 */
function findDuplicateNames(
    document: TextDocument,
    nameDeclarations: NameDecl[],
    componentName: string
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const seenNames = new Map<string, NameDecl>();

    for (const decl of nameDeclarations) {
        const existing = seenNames.get(decl.name);
        if (existing) {
            // Duplicate found - report error on the second occurrence
            const startPos = document.positionAt(decl.offset);
            const endPos = document.positionAt(decl.offset + decl.name.length);
            const range = Range.create(startPos, endPos);

            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range,
                message: "Duplicate name '" + decl.name + "' in component '" + componentName + "'. Already declared as " + existing.type + ".",
                source: 'kite'
            });
        } else {
            seenNames.set(decl.name, decl);
        }
    }

    return diagnostics;
}
