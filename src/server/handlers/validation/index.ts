/**
 * Document validation handler for the Kite language server.
 *
 * This module orchestrates all validation checks. Individual checks are
 * implemented in separate modules for maintainability.
 */

import {
    Diagnostic,
    Location,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ImportSuggestion, ImportInfo, BaseContext } from '../../types';

// Import modular validation checks
import { checkDecoratorArguments } from './decorator-arguments';
import { checkResourceSchemaTypes, checkComponentInstantiationTypes, checkFunctionCalls } from './symbol-resolution';
import { checkComponentDefinitionDuplicates } from './component-definition-validation';

// Import individual check modules
import { checkTypeMismatches } from './type-checking';
import { checkUnusedImports } from './unused-imports';
import { checkUnusedVariables } from './unused-variables';
import { checkUndefinedSymbols } from './undefined-symbols';
import { checkMissingProperties } from './missing-properties';
import { checkCloudPropertyAssignment } from './cloud-property-assignment';
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
import { checkImpossibleCondition } from './impossible-condition';
import { checkTypeCoercion } from './type-coercion';
import { checkEmptyStringCheck } from './empty-string-check';
import { checkRedundantBoolean } from './redundant-boolean';
import { checkNegatedComparison } from './negated-comparison';
import { checkUselessExpression } from './useless-expression';
import { checkLongFunction } from './long-function';
import { checkUnusedParameter } from './unused-parameter';
import { checkImplicitAny } from './implicit-any';
import { checkSyntaxErrors } from './syntax-errors';
import { checkReturnTypeMismatch } from './return-type-mismatch';
import { checkIndexedAccess } from './indexed-access';

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
    diagnostics.push(...checkSyntaxErrors(document));

    // Check decorator arguments
    diagnostics.push(...checkDecoratorArguments(document));

    // Setup for symbol resolution checks
    const imports = ctx.extractImports(text);
    ctx.clearDiagnosticData(document.uri);
    const docDiagnosticData = ctx.getDiagnosticData(document.uri);

    // Check resource schema types
    diagnostics.push(...checkResourceSchemaTypes(document, ctx, imports, docDiagnosticData));

    // Check component instantiation types
    diagnostics.push(...checkComponentInstantiationTypes(document, ctx, imports, docDiagnosticData));

    // Check function calls
    diagnostics.push(...checkFunctionCalls(document, ctx, imports, docDiagnosticData));

    // Check for duplicate names in component definitions
    diagnostics.push(...checkComponentDefinitionDuplicates(document));

    // Get local declarations for checks that need them
    const localDeclarations = ctx.getDeclarations(document.uri) || [];

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

    // Check for @cloud property assignments (not allowed - set by cloud provider)
    const cloudPropertyDiagnostics = checkCloudPropertyAssignment(document);
    diagnostics.push(...cloudPropertyDiagnostics);

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

    // Check for impossible conditions (x > 5 && x < 5)
    const impossibleConditionDiagnostics = checkImpossibleCondition(document);
    diagnostics.push(...impossibleConditionDiagnostics);

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

    // Check for return type mismatches
    const returnTypeDiagnostics = checkReturnTypeMismatch(document);
    diagnostics.push(...returnTypeDiagnostics);

    // Check for invalid indexed resource access
    const indexedAccessDiagnostics = checkIndexedAccess(document, localDeclarations);
    diagnostics.push(...indexedAccessDiagnostics);

    return diagnostics;
}
