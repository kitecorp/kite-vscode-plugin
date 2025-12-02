/**
 * Document validation handler for the Kite language server.
 */

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
    Location,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import * as path from 'path';
import { Declaration, ImportSuggestion, ImportInfo, BaseContext } from '../../types';
import { DECORATORS } from '../../constants';
import { checkTypeMismatches } from './type-checking';
import { checkUnusedImports } from './unused-imports';
import { checkUnusedVariables } from './unused-variables';
import { checkUndefinedSymbols } from './undefined-symbols';
import { checkMissingProperties } from './missing-properties';
import { checkReservedNames } from './reserved-names';
import { checkDuplicateProperties } from './duplicate-properties';
import { checkDecoratorTargets } from './decorator-targets';
import { checkCircularImports } from './circular-imports';
import { checkMissingValues } from './missing-value';
import { checkDuplicateParameters } from './duplicate-parameters';
import { checkDuplicateDeclarations } from './duplicate-declarations';
import { checkUnknownDecorators } from './unknown-decorator';
import { checkDuplicateDecorators } from './duplicate-decorator';
import { checkEmptyBlocks } from './empty-block';
import { checkInvalidNumbers } from './invalid-number';
import { checkUnclosedStrings } from './unclosed-string';
import { checkMissingReturn } from './missing-return';
import { checkUnreachableCode } from './unreachable-code';
import { checkVariableShadowing } from './variable-shadowing';
import { checkInvalidImportPaths } from './invalid-import-path';
import { checkReturnOutsideFunction } from './return-outside-function';
import { checkInvalidStringInterpolation } from './invalid-string-interpolation';
import { checkUnusedFunctions } from './unused-function';
import { checkDivisionByZero } from './division-by-zero';
import { checkInfiniteLoop } from './infinite-loop';
import { checkAssignmentInCondition } from './assignment-in-condition';
import { checkSelfAssignment } from './self-assignment';
import { checkComparisonToSelf } from './comparison-to-self';
import { checkDuplicateImport } from './duplicate-import';
import { checkConstantCondition } from './constant-condition';
import { checkTooManyParameters } from './too-many-parameters';
import { checkRedundantCondition } from './redundant-condition';
import { checkTypeCoercion } from './type-coercion';
import { checkEmptyStringCheck } from './empty-string-check';
import { checkRedundantBoolean } from './redundant-boolean';
import { checkNegatedComparison } from './negated-comparison';
import { checkUselessExpression } from './useless-expression';
import { checkLongFunction } from './long-function';
import { checkUnusedParameter } from './unused-parameter';
import { checkImplicitAny } from './implicit-any';
import { checkSyntaxErrors } from './syntax-errors';
import { isInComment } from '../../utils/text-utils';
import { findSymbolInWorkspace } from '../../utils/workspace-utils';

/**
 * Context containing dependencies needed for validation
 */
export interface ValidationContext extends BaseContext {
    /** Get or create diagnostic data map for a URI */
    getDiagnosticData: (uri: string) => Map<string, ImportSuggestion>;
    /** Clear diagnostic data for a URI */
    clearDiagnosticData: (uri: string) => void;
    /** Extract imports from text */
    extractImports: (text: string) => ImportInfo[];
    /** Check if symbol is imported */
    isSymbolImported: (imports: ImportInfo[], symbolName: string, filePath: string, currentFilePath: string) => boolean;
    /** Find schema definition in text */
    findSchemaDefinition: (text: string, schemaName: string, filePathOrUri: string) => Location | null;
    /** Find component definition in text */
    findComponentDefinition: (text: string, componentName: string, filePathOrUri: string) => Location | null;
    /** Find function definition in text */
    findFunctionDefinition: (text: string, functionName: string, filePathOrUri: string) => Location | null;
}

/**
 * Validate document and return diagnostics
 */
export function validateDocument(document: TextDocument, ctx: ValidationContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();

    // Check for syntax errors first (parsing errors)
    const syntaxDiagnostics = checkSyntaxErrors(document);
    diagnostics.push(...syntaxDiagnostics);

    // Find all decorator usages: @decoratorName or @decoratorName(args)
    const decoratorRegex = /@(\w+)(\s*\(([^)]*)\))?/g;
    let match;

    while ((match = decoratorRegex.exec(text)) !== null) {
        const decoratorName = match[1];
        const hasParens = match[2] !== undefined;
        const argsStr = match[3]?.trim() || '';

        // Find the decorator definition
        const decoratorDef = DECORATORS.find(d => d.name === decoratorName);

        if (!decoratorDef) {
            // Unknown decorator - could add a warning but skip for now
            continue;
        }

        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        const range = Range.create(startPos, endPos);

        // Validate based on expected argument type
        const expectedType = decoratorDef.argType;

        if (expectedType === 'none') {
            // Should not have arguments
            if (hasParens && argsStr) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `@${decoratorName} does not take arguments`,
                    source: 'kite'
                });
            }
        } else if (expectedType === 'number') {
            if (!hasParens || !argsStr) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `@${decoratorName} requires a number argument`,
                    source: 'kite'
                });
            } else if (!/^\d+$/.test(argsStr) && !/^\w+$/.test(argsStr)) {
                // Allow numbers or variable references
                if (/^".*"$/.test(argsStr) || /^'.*'$/.test(argsStr)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range,
                        message: `@${decoratorName} expects a number, got string`,
                        source: 'kite'
                    });
                } else if (/^\[/.test(argsStr)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range,
                        message: `@${decoratorName} expects a number, got array`,
                        source: 'kite'
                    });
                } else if (/^\{/.test(argsStr)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range,
                        message: `@${decoratorName} expects a number, got object`,
                        source: 'kite'
                    });
                }
            }
        } else if (expectedType === 'string') {
            if (!hasParens || !argsStr) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `@${decoratorName} requires a string argument`,
                    source: 'kite'
                });
            } else if (!/^".*"$/.test(argsStr) && !/^'.*'$/.test(argsStr) && !/^\w+$/.test(argsStr)) {
                // Allow string literals or variable references
                if (/^\d+$/.test(argsStr)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range,
                        message: `@${decoratorName} expects a string, got number`,
                        source: 'kite'
                    });
                } else if (/^\[/.test(argsStr)) {
                    // Allow arrays for @provider(["aws", "azure"])
                    if (decoratorName !== 'provider') {
                        diagnostics.push({
                            severity: DiagnosticSeverity.Error,
                            range,
                            message: `@${decoratorName} expects a string, got array`,
                            source: 'kite'
                        });
                    }
                } else if (/^\{/.test(argsStr)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range,
                        message: `@${decoratorName} expects a string, got object`,
                        source: 'kite'
                    });
                }
            }
        } else if (expectedType === 'array') {
            if (!hasParens || !argsStr) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `@${decoratorName} requires an array argument`,
                    source: 'kite'
                });
            } else if (!/^\[/.test(argsStr) && !/^\w+$/.test(argsStr)) {
                // Must start with [ or be a variable reference
                if (/^".*"$/.test(argsStr) || /^'.*'$/.test(argsStr)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range,
                        message: `@${decoratorName} expects an array, got string`,
                        source: 'kite'
                    });
                } else if (/^\d+$/.test(argsStr)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range,
                        message: `@${decoratorName} expects an array, got number`,
                        source: 'kite'
                    });
                } else if (/^\{/.test(argsStr)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range,
                        message: `@${decoratorName} expects an array, got object`,
                        source: 'kite'
                    });
                }
            }
        } else if (expectedType === 'object') {
            if (!hasParens || !argsStr) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `@${decoratorName} requires an argument`,
                    source: 'kite'
                });
            }
            // @tags accepts object, array, or string - so we allow all for it
        } else if (expectedType === 'named') {
            // Named arguments like @validate(regex: "pattern")
            if (!hasParens || !argsStr) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `@${decoratorName} requires named arguments (e.g., regex: "pattern")`,
                    source: 'kite'
                });
            } else if (!/\w+\s*:/.test(argsStr)) {
                // Must have named argument format
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `@${decoratorName} requires named arguments (e.g., regex: "pattern")`,
                    source: 'kite'
                });
            }
        }
        // 'reference' type is flexible - accepts identifiers or arrays
    }

    // Validate resource schema types
    const currentFilePath = URI.parse(document.uri).fsPath;
    const currentDir = path.dirname(currentFilePath);
    const imports = ctx.extractImports(text);

    // Clear previous diagnostic data for this document
    ctx.clearDiagnosticData(document.uri);
    const docDiagnosticData = ctx.getDiagnosticData(document.uri);

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
            (content, path) => ctx.findSchemaDefinition(content, schemaName, path)
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

                const diagnosticKey = `${startPos.line}:${startPos.character}:${schemaName}`;
                docDiagnosticData.set(diagnosticKey, {
                    symbolName: schemaName,
                    filePath: foundInFile,
                    importPath
                });

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `Schema '${schemaName}' is not imported. Found in '${path.basename(foundInFile)}'.`,
                    source: 'kite',
                    data: diagnosticKey
                });
            }
        } else {
            // Schema not found anywhere
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range,
                message: `Cannot resolve schema '${schemaName}'`,
                source: 'kite'
            });
        }
    }

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
            (content, path) => ctx.findComponentDefinition(content, componentType, path)
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

                const diagnosticKey = `${startPos.line}:${startPos.character}:${componentType}`;
                docDiagnosticData.set(diagnosticKey, {
                    symbolName: componentType,
                    filePath: foundInFile,
                    importPath
                });

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `Component '${componentType}' is not imported. Found in '${path.basename(foundInFile)}'.`,
                    source: 'kite',
                    data: diagnosticKey
                });
            }
        } else {
            // Component not found anywhere
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range,
                message: `Cannot resolve component '${componentType}'`,
                source: 'kite'
            });
        }
    }

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
            (content, path) => ctx.findFunctionDefinition(content, funcName, path)
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

                const diagnosticKey = `${startPos.line}:${startPos.character}:${funcName}`;
                docDiagnosticData.set(diagnosticKey, {
                    symbolName: funcName,
                    filePath: foundInFile,
                    importPath
                });

                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range,
                    message: `Function '${funcName}' is not imported. Found in '${path.basename(foundInFile)}'.`,
                    source: 'kite',
                    data: diagnosticKey
                });
            }
        } else {
            // Function not found anywhere - could be undefined or a method call
            // Only show error if it looks like a standalone function call
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range,
                message: `Cannot resolve function '${funcName}'`,
                source: 'kite'
            });
        }
    }

    // Validate unique names within component definitions
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

        // Track all names within this component with their positions
        interface NameDecl {
            name: string;
            type: string;
            offset: number;
        }
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

        // Check for duplicates
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
                    message: `Duplicate name '${decl.name}' in component '${componentName}'. Already declared as ${existing.type}.`,
                    source: 'kite'
                });
            } else {
                seenNames.set(decl.name, decl);
            }
        }
    }

    // Check for type mismatches
    const typeDiagnostics = checkTypeMismatches(document);
    diagnostics.push(...typeDiagnostics);

    // Check for unused imports
    const unusedImportDiagnostics = checkUnusedImports(document, imports);
    diagnostics.push(...unusedImportDiagnostics);

    // Check for unused variables
    const unusedVariableDiagnostics = checkUnusedVariables(document);
    diagnostics.push(...unusedVariableDiagnostics);

    // Check for undefined symbols
    const undefinedSymbolDiagnostics = checkUndefinedSymbols(document, localDeclarations);
    diagnostics.push(...undefinedSymbolDiagnostics);

    // Check for missing required properties
    const missingPropertyDiagnostics = checkMissingProperties(document);
    diagnostics.push(...missingPropertyDiagnostics);

    // Check for reserved names used as property/input/output names
    const reservedNameDiagnostics = checkReservedNames(document);
    diagnostics.push(...reservedNameDiagnostics);

    // Check for duplicate property names in schemas/resources
    const duplicatePropertyDiagnostics = checkDuplicateProperties(document);
    diagnostics.push(...duplicatePropertyDiagnostics);

    // Check for decorator target mismatches
    const decoratorTargetDiagnostics = checkDecoratorTargets(document);
    diagnostics.push(...decoratorTargetDiagnostics);

    // Check for circular imports
    const circularImportDiagnostics = checkCircularImports(document, ctx);
    diagnostics.push(...circularImportDiagnostics);

    // Check for missing values after '='
    const missingValueDiagnostics = checkMissingValues(document);
    diagnostics.push(...missingValueDiagnostics);

    // Check for duplicate function parameters
    const duplicateParamDiagnostics = checkDuplicateParameters(document);
    diagnostics.push(...duplicateParamDiagnostics);

    // Check for duplicate top-level declarations
    const duplicateDeclDiagnostics = checkDuplicateDeclarations(document);
    diagnostics.push(...duplicateDeclDiagnostics);

    // Check for unknown decorators
    const unknownDecoratorDiagnostics = checkUnknownDecorators(document);
    diagnostics.push(...unknownDecoratorDiagnostics);

    // Check for duplicate decorators
    const duplicateDecoratorDiagnostics = checkDuplicateDecorators(document);
    diagnostics.push(...duplicateDecoratorDiagnostics);

    // Check for empty blocks
    const emptyBlockDiagnostics = checkEmptyBlocks(document);
    diagnostics.push(...emptyBlockDiagnostics);

    // Check for invalid number literals
    const invalidNumberDiagnostics = checkInvalidNumbers(document);
    diagnostics.push(...invalidNumberDiagnostics);

    // Check for unclosed strings
    const unclosedStringDiagnostics = checkUnclosedStrings(document);
    diagnostics.push(...unclosedStringDiagnostics);

    // Check for missing return statements
    const missingReturnDiagnostics = checkMissingReturn(document);
    diagnostics.push(...missingReturnDiagnostics);

    // Check for unreachable code
    const unreachableCodeDiagnostics = checkUnreachableCode(document);
    diagnostics.push(...unreachableCodeDiagnostics);

    // Check for variable shadowing
    const shadowingDiagnostics = checkVariableShadowing(document);
    diagnostics.push(...shadowingDiagnostics);

    // Check for invalid import paths
    const invalidImportDiagnostics = checkInvalidImportPaths(document, ctx);
    diagnostics.push(...invalidImportDiagnostics);

    // Check for return statements outside functions
    const returnOutsideFuncDiagnostics = checkReturnOutsideFunction(document);
    diagnostics.push(...returnOutsideFuncDiagnostics);

    // Check for invalid string interpolation
    const invalidInterpolationDiagnostics = checkInvalidStringInterpolation(document);
    diagnostics.push(...invalidInterpolationDiagnostics);

    // Check for unused functions
    const unusedFunctionDiagnostics = checkUnusedFunctions(document);
    diagnostics.push(...unusedFunctionDiagnostics);

    // Check for division by zero
    const divisionByZeroDiagnostics = checkDivisionByZero(document);
    diagnostics.push(...divisionByZeroDiagnostics);

    // Check for infinite loops
    const infiniteLoopDiagnostics = checkInfiniteLoop(document);
    diagnostics.push(...infiniteLoopDiagnostics);

    // Check for assignment in condition
    const assignmentInConditionDiagnostics = checkAssignmentInCondition(document);
    diagnostics.push(...assignmentInConditionDiagnostics);

    // Check for self-assignment
    const selfAssignmentDiagnostics = checkSelfAssignment(document);
    diagnostics.push(...selfAssignmentDiagnostics);

    // Check for comparison to self
    const comparisonToSelfDiagnostics = checkComparisonToSelf(document);
    diagnostics.push(...comparisonToSelfDiagnostics);

    // Check for duplicate imports
    const duplicateImportDiagnostics = checkDuplicateImport(document);
    diagnostics.push(...duplicateImportDiagnostics);

    // Check for constant conditions
    const constantConditionDiagnostics = checkConstantCondition(document);
    diagnostics.push(...constantConditionDiagnostics);

    // Check for too many parameters
    const tooManyParamsDiagnostics = checkTooManyParameters(document);
    diagnostics.push(...tooManyParamsDiagnostics);

    // Check for redundant conditions (x && x, x || x)
    const redundantConditionDiagnostics = checkRedundantCondition(document);
    diagnostics.push(...redundantConditionDiagnostics);

    // Check for type coercion in comparisons
    const typeCoercionDiagnostics = checkTypeCoercion(document);
    diagnostics.push(...typeCoercionDiagnostics);

    // Check for empty string comparisons
    const emptyStringDiagnostics = checkEmptyStringCheck(document);
    diagnostics.push(...emptyStringDiagnostics);

    // Check for redundant boolean comparisons
    const redundantBooleanDiagnostics = checkRedundantBoolean(document);
    diagnostics.push(...redundantBooleanDiagnostics);

    // Check for negated comparisons
    const negatedComparisonDiagnostics = checkNegatedComparison(document);
    diagnostics.push(...negatedComparisonDiagnostics);

    // Check for useless expressions
    const uselessExpressionDiagnostics = checkUselessExpression(document);
    diagnostics.push(...uselessExpressionDiagnostics);

    // Check for long functions
    const longFunctionDiagnostics = checkLongFunction(document);
    diagnostics.push(...longFunctionDiagnostics);

    // Check for unused parameters
    const unusedParameterDiagnostics = checkUnusedParameter(document);
    diagnostics.push(...unusedParameterDiagnostics);

    // Check for implicit any
    const implicitAnyDiagnostics = checkImplicitAny(document);
    diagnostics.push(...implicitAnyDiagnostics);

    return diagnostics;
}
