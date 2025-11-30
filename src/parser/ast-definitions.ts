/**
 * AST-based definition lookup utilities.
 * Provides functions to find declarations by name with location info.
 */

import {
    ProgramContext,
    SchemaDeclarationContext,
    ComponentDeclarationContext,
    FunctionDeclarationContext,
    TypeDeclarationContext,
} from './grammar/KiteParser';

/**
 * Location information for a definition
 */
export interface DefinitionLocation {
    name: string;
    nameStart: number;
    nameEnd: number;
    line: number;
    column: number;
}

/**
 * Declaration types supported by the finder
 */
export type DeclarationType = 'schema' | 'component' | 'function' | 'type';

/**
 * Generic definition finder - finds any declaration by type and name
 */
export function findDefinitionAST(
    tree: ProgramContext,
    type: DeclarationType,
    name: string
): DefinitionLocation | null {
    const stmtList = tree.statementList();
    if (!stmtList) return null;

    for (const stmt of stmtList.nonEmptyStatement_list()) {
        const decl = stmt.declaration();
        if (!decl) continue;

        switch (type) {
            case 'schema': {
                const schemaDecl = decl.schemaDeclaration();
                if (schemaDecl?.identifier()?.getText() === name) {
                    return extractLocation(schemaDecl.identifier()!, name);
                }
                break;
            }
            case 'component': {
                const compDecl = decl.componentDeclaration();
                // Component definition has no instance name
                if (compDecl && !compDecl.identifier()) {
                    const typeName = compDecl.componentType()?.typeIdentifier()?.getText();
                    if (typeName === name) {
                        return extractLocation(compDecl.componentType()!.typeIdentifier()!, name);
                    }
                }
                break;
            }
            case 'function': {
                const funcDecl = decl.functionDeclaration();
                if (funcDecl?.identifier()?.getText() === name) {
                    return extractLocation(funcDecl.identifier()!, name);
                }
                break;
            }
            case 'type': {
                const typeDecl = decl.typeDeclaration();
                if (typeDecl?.identifier()?.getText() === name) {
                    return extractLocation(typeDecl.identifier()!, name);
                }
                break;
            }
        }
    }

    return null;
}

/**
 * Extract location from an identifier context
 */
function extractLocation(
    ctx: { start?: { start: number; line: number; column: number } },
    name: string
): DefinitionLocation {
    const nameStart = ctx.start?.start ?? 0;
    return {
        name,
        nameStart,
        nameEnd: nameStart + name.length,
        line: (ctx.start?.line ?? 1) - 1,
        column: ctx.start?.column ?? 0,
    };
}

/**
 * Find a schema declaration by name
 */
export function findSchemaByName(tree: ProgramContext, name: string): SchemaDeclarationContext | null {
    const stmtList = tree.statementList();
    if (!stmtList) return null;

    for (const stmt of stmtList.nonEmptyStatement_list()) {
        const decl = stmt.declaration();
        if (decl) {
            const schemaDecl = decl.schemaDeclaration();
            if (schemaDecl?.identifier()?.getText() === name) {
                return schemaDecl;
            }
        }
    }
    return null;
}

/**
 * Find a component definition by name
 */
export function findComponentDefByName(tree: ProgramContext, name: string): ComponentDeclarationContext | null {
    const stmtList = tree.statementList();
    if (!stmtList) return null;

    for (const stmt of stmtList.nonEmptyStatement_list()) {
        const decl = stmt.declaration();
        if (decl) {
            const compDecl = decl.componentDeclaration();
            if (compDecl && !compDecl.identifier()) {
                const typeName = compDecl.componentType()?.typeIdentifier()?.getText();
                if (typeName === name) {
                    return compDecl;
                }
            }
        }
    }
    return null;
}

/**
 * Find schema property location
 */
export function findSchemaPropertyAST(
    tree: ProgramContext,
    schemaName: string,
    propertyName: string
): DefinitionLocation | null {
    const schemaBaseName = schemaName.includes('.') ? schemaName.split('.').pop()! : schemaName;
    const schema = findSchemaByName(tree, schemaBaseName);
    if (!schema) return null;

    const propList = schema.schemaPropertyList();
    if (!propList) return null;

    for (const prop of propList.schemaProperty_list()) {
        const identifier = prop.identifier();
        if (identifier?.getText() === propertyName) {
            return extractLocation(identifier, propertyName);
        }
    }
    return null;
}

/**
 * Find component input location
 */
export function findComponentInputAST(
    tree: ProgramContext,
    componentName: string,
    inputName: string
): DefinitionLocation | null {
    const comp = findComponentDefByName(tree, componentName);
    if (!comp) return null;

    const blockExpr = comp.blockExpression();
    if (!blockExpr) return null;

    const stmtList = blockExpr.statementList();
    if (!stmtList) return null;

    for (const stmt of stmtList.nonEmptyStatement_list()) {
        const decl = stmt.declaration();
        if (decl) {
            const inputDecl = decl.inputDeclaration();
            if (inputDecl) {
                const identifier = inputDecl.identifier();
                if (identifier?.getText() === inputName) {
                    return extractLocation(identifier, inputName);
                }
            }
        }
    }
    return null;
}
