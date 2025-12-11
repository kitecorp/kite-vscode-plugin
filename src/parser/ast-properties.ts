/**
 * AST-based property extraction utilities.
 * Provides functions to extract schema properties and component inputs/outputs.
 */

import { SchemaDeclarationContext, StructDeclarationContext, ComponentDeclarationContext } from './grammar/KiteParser';

/**
 * Schema property information
 */
export interface SchemaProperty {
    name: string;
    typeName: string;
    hasDefault: boolean;
    isCloud: boolean;  // Properties marked with @cloud are set by cloud provider
}

/**
 * Struct property information
 */
export interface StructProperty {
    name: string;
    typeName: string;
    hasDefault: boolean;
}

/**
 * Component input information
 */
export interface ComponentInput {
    name: string;
    typeName: string;
    hasDefault: boolean;
}

/**
 * Component output information
 */
export interface ComponentOutput {
    name: string;
    typeName: string;
}

/**
 * Check if a property has the @cloud decorator
 */
function hasCloudDecorator(decoratorList: ReturnType<typeof import('./grammar/KiteParser').SchemaPropertyContext.prototype.decoratorList>): boolean {
    if (!decoratorList) return false;

    for (const decorator of decoratorList.decorator_list()) {
        const name = decorator.identifier()?.getText();
        if (name === 'cloud') {
            return true;
        }
    }
    return false;
}

/**
 * Extract schema properties using AST
 */
export function extractSchemaPropertiesAST(schemaCtx: SchemaDeclarationContext): SchemaProperty[] {
    const properties: SchemaProperty[] = [];
    const propList = schemaCtx.schemaPropertyList();
    if (!propList) return properties;

    for (const prop of propList.schemaProperty_list()) {
        const name = prop.identifier()?.getText();
        const typeId = prop.typeIdentifier();
        const typeName = typeId?.getText() ?? 'any';
        const hasDefault = prop.propertyInitializer() !== null;
        const isCloud = hasCloudDecorator(prop.decoratorList());

        if (name) {
            properties.push({ name, typeName, hasDefault, isCloud });
        }
    }

    return properties;
}

/**
 * Extract struct properties using AST
 */
export function extractStructPropertiesAST(structCtx: StructDeclarationContext): StructProperty[] {
    const properties: StructProperty[] = [];
    const propList = structCtx.structPropertyList();
    if (!propList) return properties;

    for (const prop of propList.structProperty_list()) {
        const name = prop.identifier()?.getText();
        const typeId = prop.typeIdentifier();
        const typeName = typeId?.getText() ?? 'any';
        const hasDefault = prop.propertyInitializer() !== null;

        if (name) {
            properties.push({ name, typeName, hasDefault });
        }
    }

    return properties;
}

/**
 * Extract input declarations from a component definition
 */
export function extractComponentInputsAST(compCtx: ComponentDeclarationContext): ComponentInput[] {
    const inputs: ComponentInput[] = [];
    const blockExpr = compCtx.blockExpression();
    if (!blockExpr) return inputs;

    const stmtList = blockExpr.statementList();
    if (!stmtList) return inputs;

    for (const stmt of stmtList.nonEmptyStatement_list()) {
        const decl = stmt.declaration();
        if (decl) {
            const inputDecl = decl.inputDeclaration();
            if (inputDecl) {
                const name = inputDecl.identifier()?.getText();
                const typeName = inputDecl.typeIdentifier()?.getText() ?? 'any';
                const hasDefault = inputDecl.expression() !== null;

                if (name) {
                    inputs.push({ name, typeName, hasDefault });
                }
            }
        }
    }

    return inputs;
}

/**
 * Extract output declarations from a component definition
 */
export function extractComponentOutputsAST(compCtx: ComponentDeclarationContext): ComponentOutput[] {
    const outputs: ComponentOutput[] = [];
    const blockExpr = compCtx.blockExpression();
    if (!blockExpr) return outputs;

    const stmtList = blockExpr.statementList();
    if (!stmtList) return outputs;

    for (const stmt of stmtList.nonEmptyStatement_list()) {
        const decl = stmt.declaration();
        if (decl) {
            const outputDecl = decl.outputDeclaration();
            if (outputDecl) {
                const name = outputDecl.identifier()?.getText();
                const typeName = outputDecl.typeIdentifier()?.getText() ?? 'any';

                if (name) {
                    outputs.push({ name, typeName });
                }
            }
        }
    }

    return outputs;
}
