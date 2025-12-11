/**
 * Symbol resolution validation for the Kite language server.
 * Validates that schemas, components, and functions are properly imported/defined.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import * as path from 'path';
import { ImportInfo, ImportSuggestion } from '../../types';
import { isInComment } from '../../utils/text-utils';
import { findSymbolInWorkspace } from '../../utils/workspace-utils';
import { ValidationContext } from './index';

/**
 * Check resource schema types and return diagnostics
 */
export function checkResourceSchemaTypes(
    document: TextDocument,
    ctx: ValidationContext,
    imports: ImportInfo[],
    docDiagnosticData: Map<string, ImportSuggestion>
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const currentFilePath = URI.parse(document.uri).fsPath;
    const currentDir = path.dirname(currentFilePath);

    // Check resource declarations: resource SchemaName instanceName {
    const resourceRegex = /\bresource\s+([\w.]+)\s+(\w+)\s*\{/g;
    let resourceMatch;
    while ((resourceMatch = resourceRegex.exec(text)) !== null) {
        // Skip if inside a comment
        if (isInComment(text, resourceMatch.index)) continue;

        const schemaName = resourceMatch[1];
        // Find the actual position of the schema name in the match
        const matchText = resourceMatch[0];
        const schemaOffsetInMatch = matchText.indexOf(schemaName);
        const schemaStart = resourceMatch.index + schemaOffsetInMatch;
        const schemaEnd = schemaStart + schemaName.length;

        // Check if schema exists in current file
        const schemaInCurrentFile = ctx.findSchemaDefinition(text, schemaName, document.uri);
        if (schemaInCurrentFile) continue;

        // Check if schema is in other files
        const schemaSearch = findSymbolInWorkspace(
            ctx, currentFilePath, document.uri,
            (content, filePath) => ctx.findSchemaDefinition(content, schemaName, filePath)
        );
        const foundInFile = schemaSearch.filePath;

        const startPos = document.positionAt(schemaStart);
        const endPos = document.positionAt(schemaEnd);
        const range = Range.create(startPos, endPos);

        if (foundInFile) {
            // Schema exists but might not be imported
            if (!ctx.isSymbolImported(imports, schemaName, foundInFile, currentFilePath)) {
                // Calculate import path
                let importPath = path.relative(currentDir, foundInFile);
                importPath = importPath.replace(/\\/g, '/');

                const diagnosticKey = createDiagnosticKey(startPos.line, startPos.character, schemaName);
                docDiagnosticData.set(diagnosticKey, {
                    symbolName: schemaName,
                    filePath: foundInFile,
                    importPath
                });

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: createNotImportedMessage('Schema', schemaName, foundInFile),
                    source: 'kite',
                    data: diagnosticKey
                });
            }
        } else {
            // Schema not found anywhere
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range,
                message: createCannotResolveMessage('schema', schemaName),
                source: 'kite'
            });
        }
    }

    return diagnostics;
}

/**
 * Check component instantiation types and return diagnostics
 */
export function checkComponentInstantiationTypes(
    document: TextDocument,
    ctx: ValidationContext,
    imports: ImportInfo[],
    docDiagnosticData: Map<string, ImportSuggestion>
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const currentFilePath = URI.parse(document.uri).fsPath;
    const currentDir = path.dirname(currentFilePath);

    // Check component instantiations: component TypeName instanceName {
    // Must have TWO identifiers (type and instance name) - definitions only have one
    const componentInstRegex = /\bcomponent\s+(\w+)\s+(\w+)\s*\{/g;
    let componentMatch;
    while ((componentMatch = componentInstRegex.exec(text)) !== null) {
        // Skip if inside a comment
        if (isInComment(text, componentMatch.index)) continue;

        const componentType = componentMatch[1];
        // Find the actual position of the type name in the match
        const matchText = componentMatch[0];
        const typeOffsetInMatch = matchText.indexOf(componentType);
        const typeStart = componentMatch.index + typeOffsetInMatch;
        const typeEnd = typeStart + componentType.length;

        // Check if component exists in current file
        const componentInCurrentFile = ctx.findComponentDefinition(text, componentType, document.uri);
        if (componentInCurrentFile) continue;

        // Check if component is in other files
        const componentSearch = findSymbolInWorkspace(
            ctx, currentFilePath, document.uri,
            (content, filePath) => ctx.findComponentDefinition(content, componentType, filePath)
        );
        const foundInFile = componentSearch.filePath;

        const startPos = document.positionAt(typeStart);
        const endPos = document.positionAt(typeEnd);
        const range = Range.create(startPos, endPos);

        if (foundInFile) {
            // Component exists but might not be imported
            if (!ctx.isSymbolImported(imports, componentType, foundInFile, currentFilePath)) {
                // Calculate import path
                let importPath = path.relative(currentDir, foundInFile);
                importPath = importPath.replace(/\\/g, '/');

                const diagnosticKey = createDiagnosticKey(startPos.line, startPos.character, componentType);
                docDiagnosticData.set(diagnosticKey, {
                    symbolName: componentType,
                    filePath: foundInFile,
                    importPath
                });

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: createNotImportedMessage('Component', componentType, foundInFile),
                    source: 'kite',
                    data: diagnosticKey
                });
            }
        } else {
            // Component not found anywhere
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range,
                message: createCannotResolveMessage('component', componentType),
                source: 'kite'
            });
        }
    }

    return diagnostics;
}

/**
 * Check function calls and return diagnostics
 */
export function checkFunctionCalls(
    document: TextDocument,
    ctx: ValidationContext,
    imports: ImportInfo[],
    docDiagnosticData: Map<string, ImportSuggestion>
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const currentFilePath = URI.parse(document.uri).fsPath;
    const currentDir = path.dirname(currentFilePath);

    // Check function calls: functionName(
    // We need to find function calls that are NOT definitions and NOT in declarations cache
    const functionCallRegex = /\b([a-z]\w*)\s*\(/g;
    let funcMatch;
    const localDeclarations = ctx.getDeclarations(document.uri) || [];
    // Get all local names to exclude (inputs, outputs, variables, etc.)
    const localNames = new Set(localDeclarations.map(d => d.name));

    // Built-in functions to ignore
    const builtinFunctions = new Set(['println', 'print', 'len', 'toString', 'toNumber', 'typeof']);

    while ((funcMatch = functionCallRegex.exec(text)) !== null) {
        // Skip if inside a comment
        if (isInComment(text, funcMatch.index)) continue;

        const funcName = funcMatch[1];

        // Skip if it's a builtin function
        if (builtinFunctions.has(funcName)) continue;

        // Skip if it's a local declaration (function, variable, input, output, etc.)
        if (localNames.has(funcName)) continue;

        // Skip if it's a keyword that might be followed by (
        if (['if', 'while', 'for', 'fun', 'return'].includes(funcName)) continue;

        // Skip function definitions: fun funcName(
        const beforeMatch = text.substring(Math.max(0, funcMatch.index - 20), funcMatch.index);
        if (/\bfun\s+$/.test(beforeMatch)) continue;

        // Skip decorators: @decoratorName(
        if (/@\s*$/.test(beforeMatch)) continue;

        // Find the position
        const funcStart = funcMatch.index;
        const funcEnd = funcStart + funcName.length;

        // Check if function exists in current file
        const funcInCurrentFile = ctx.findFunctionDefinition(text, funcName, document.uri);
        if (funcInCurrentFile) continue;

        // Check if function is in other files
        const funcSearch = findSymbolInWorkspace(
            ctx, currentFilePath, document.uri,
            (content, filePath) => ctx.findFunctionDefinition(content, funcName, filePath)
        );
        const foundInFile = funcSearch.filePath;

        const startPos = document.positionAt(funcStart);
        const endPos = document.positionAt(funcEnd);
        const range = Range.create(startPos, endPos);

        if (foundInFile) {
            // Function exists but might not be imported
            if (!ctx.isSymbolImported(imports, funcName, foundInFile, currentFilePath)) {
                // Calculate import path
                let importPath = path.relative(currentDir, foundInFile);
                importPath = importPath.replace(/\\/g, '/');

                const diagnosticKey = createDiagnosticKey(startPos.line, startPos.character, funcName);
                docDiagnosticData.set(diagnosticKey, {
                    symbolName: funcName,
                    filePath: foundInFile,
                    importPath
                });

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: createNotImportedMessage('Function', funcName, foundInFile),
                    source: 'kite',
                    data: diagnosticKey
                });
            }
        } else {
            // Function not found anywhere - could be undefined or a method call
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range,
                message: createCannotResolveMessage('function', funcName),
                source: 'kite'
            });
        }
    }

    return diagnostics;
}

// Helper functions to avoid template literal issues
function createDiagnosticKey(line: number, character: number, name: string): string {
    return line + ':' + character + ':' + name;
}

function createNotImportedMessage(type: string, name: string, foundInFile: string): string {
    return type + " '" + name + "' is not imported. Found in '" + path.basename(foundInFile) + "'.";
}

function createCannotResolveMessage(type: string, name: string): string {
    return "Cannot resolve " + type + " '" + name + "'";
}
