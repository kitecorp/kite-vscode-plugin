/**
 * Document Symbol handler for the Kite language server.
 * Provides outline view for the editor.
 * Uses AST-based parsing for accurate symbol extraction.
 */

import {
    DocumentSymbol,
    SymbolKind,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    parseKite,
    ProgramContext,
    SchemaDeclarationContext,
    ComponentDeclarationContext,
    ResourceDeclarationContext,
    FunctionDeclarationContext,
    TypeDeclarationContext,
    VarDeclarationContext,
    InputDeclarationContext,
    OutputDeclarationContext,
} from '../../../parser';

/**
 * Handle document symbol request - provides outline view
 * Uses AST-based parsing for accurate symbol extraction.
 */
export function handleDocumentSymbol(document: TextDocument): DocumentSymbol[] {
    const text = document.getText();
    const symbols: DocumentSymbol[] = [];

    // Parse the document
    const result = parseKite(text);
    if (!result.tree) {
        return symbols;
    }

    // Process top-level statements
    const stmtList = result.tree.statementList();
    if (!stmtList) {
        return symbols;
    }

    for (const stmt of stmtList.nonEmptyStatement_list()) {
        const decl = stmt.declaration();
        if (!decl) continue;

        // Schema declaration
        const schemaDecl = decl.schemaDeclaration();
        if (schemaDecl) {
            const symbol = processSchemaDeclaration(schemaDecl, document);
            if (symbol) symbols.push(symbol);
            continue;
        }

        // Component declaration
        const compDecl = decl.componentDeclaration();
        if (compDecl) {
            const symbol = processComponentDeclaration(compDecl, document);
            if (symbol) symbols.push(symbol);
            continue;
        }

        // Resource declaration
        const resDecl = decl.resourceDeclaration();
        if (resDecl) {
            const symbol = processResourceDeclaration(resDecl, document);
            if (symbol) symbols.push(symbol);
            continue;
        }

        // Function declaration
        const funcDecl = decl.functionDeclaration();
        if (funcDecl) {
            const symbol = processFunctionDeclaration(funcDecl, document);
            if (symbol) symbols.push(symbol);
            continue;
        }

        // Type declaration
        const typeDecl = decl.typeDeclaration();
        if (typeDecl) {
            const symbol = processTypeDeclaration(typeDecl, document);
            if (symbol) symbols.push(symbol);
            continue;
        }

        // Variable declaration
        const varDecl = decl.varDeclaration();
        if (varDecl) {
            const varSymbols = processVarDeclaration(varDecl, document);
            symbols.push(...varSymbols);
            continue;
        }

        // Input declaration (top-level)
        const inputDecl = decl.inputDeclaration();
        if (inputDecl) {
            const symbol = processInputDeclaration(inputDecl, document);
            if (symbol) symbols.push(symbol);
            continue;
        }

        // Output declaration (top-level)
        const outputDecl = decl.outputDeclaration();
        if (outputDecl) {
            const symbol = processOutputDeclaration(outputDecl, document);
            if (symbol) symbols.push(symbol);
            continue;
        }
    }

    return symbols;
}

// Helper to create a DocumentSymbol
function createSymbol(
    name: string,
    kind: SymbolKind,
    range: Range,
    selectionRange: Range,
    detail?: string,
    children?: DocumentSymbol[]
): DocumentSymbol {
    return {
        name,
        kind,
        range,
        selectionRange,
        detail,
        children
    };
}

// Helper to get range from AST context
function getContextRange(ctx: { start?: { start: number; line: number; column: number }; stop?: { stop: number; line: number; column: number } }, document: TextDocument): Range {
    const startOffset = ctx.start?.start ?? 0;
    const stopOffset = (ctx.stop?.stop ?? startOffset) + 1;
    return Range.create(document.positionAt(startOffset), document.positionAt(stopOffset));
}

// Helper to get name selection range from identifier
function getNameRange(identCtx: { start?: { start: number; line: number; column: number }; stop?: { stop: number; line: number; column: number }; getText: () => string } | null, document: TextDocument): Range | null {
    if (!identCtx) return null;
    const startOffset = identCtx.start?.start ?? 0;
    const text = identCtx.getText();
    const endOffset = startOffset + text.length;
    return Range.create(document.positionAt(startOffset), document.positionAt(endOffset));
}

function processSchemaDeclaration(ctx: SchemaDeclarationContext, document: TextDocument): DocumentSymbol | null {
    const name = ctx.identifier()?.getText();
    if (!name) return null;

    const range = getContextRange(ctx, document);
    const nameRange = getNameRange(ctx.identifier(), document);
    if (!nameRange) return null;

    // Extract schema properties as children
    const children: DocumentSymbol[] = [];
    const propList = ctx.schemaPropertyList();
    if (propList) {
        for (const prop of propList.schemaProperty_list()) {
            const propName = prop.identifier()?.getText();
            const propType = prop.typeIdentifier()?.getText() ?? 'any';
            if (propName) {
                const propRange = getContextRange(prop, document);
                const propNameRange = getNameRange(prop.identifier(), document);
                if (propNameRange) {
                    children.push(createSymbol(
                        propName,
                        SymbolKind.Property,
                        propRange,
                        propNameRange,
                        propType
                    ));
                }
            }
        }
    }

    return createSymbol(
        name,
        SymbolKind.Struct,
        range,
        nameRange,
        'schema',
        children.length > 0 ? children : undefined
    );
}

function processComponentDeclaration(ctx: ComponentDeclarationContext, document: TextDocument): DocumentSymbol | null {
    const compType = ctx.componentType();
    const typeName = compType?.typeIdentifier()?.getText();
    const instanceName = ctx.identifier()?.getText();

    if (instanceName) {
        // Component instantiation
        const range = getContextRange(ctx, document);
        const nameRange = getNameRange(ctx.identifier(), document);
        if (!nameRange) return null;

        return createSymbol(
            instanceName,
            SymbolKind.Object,
            range,
            nameRange,
            `component: ${typeName ?? 'unknown'}`
        );
    } else if (typeName) {
        // Component definition
        const range = getContextRange(ctx, document);
        const nameRange = getNameRange(compType?.typeIdentifier() ?? null, document);
        if (!nameRange) return null;

        // Extract inputs/outputs as children
        const children: DocumentSymbol[] = [];
        const blockExpr = ctx.blockExpression();
        if (blockExpr) {
            const stmtList = blockExpr.statementList();
            if (stmtList) {
                for (const stmt of stmtList.nonEmptyStatement_list()) {
                    const decl = stmt.declaration();
                    if (decl) {
                        const inputDecl = decl.inputDeclaration();
                        if (inputDecl) {
                            const inputName = inputDecl.identifier()?.getText();
                            const inputType = inputDecl.typeIdentifier()?.getText() ?? 'any';
                            if (inputName) {
                                const inputRange = getContextRange(inputDecl, document);
                                const inputNameRange = getNameRange(inputDecl.identifier(), document);
                                if (inputNameRange) {
                                    children.push(createSymbol(
                                        inputName,
                                        SymbolKind.Property,
                                        inputRange,
                                        inputNameRange,
                                        `input: ${inputType}`
                                    ));
                                }
                            }
                        }

                        const outputDecl = decl.outputDeclaration();
                        if (outputDecl) {
                            const outputName = outputDecl.identifier()?.getText();
                            const outputType = outputDecl.typeIdentifier()?.getText() ?? 'any';
                            if (outputName) {
                                const outputRange = getContextRange(outputDecl, document);
                                const outputNameRange = getNameRange(outputDecl.identifier(), document);
                                if (outputNameRange) {
                                    children.push(createSymbol(
                                        outputName,
                                        SymbolKind.Event,
                                        outputRange,
                                        outputNameRange,
                                        `output: ${outputType}`
                                    ));
                                }
                            }
                        }
                    }
                }
            }
        }

        return createSymbol(
            typeName,
            SymbolKind.Class,
            range,
            nameRange,
            'component',
            children.length > 0 ? children : undefined
        );
    }

    return null;
}

function processResourceDeclaration(ctx: ResourceDeclarationContext, document: TextDocument): DocumentSymbol | null {
    const resourceName = ctx.resourceName();
    const instanceName = resourceName?.identifier()?.getText();
    const schemaName = ctx.typeIdentifier()?.getText();

    if (!instanceName) return null;

    const range = getContextRange(ctx, document);
    const nameRange = getNameRange(resourceName?.identifier() ?? null, document);
    if (!nameRange) return null;

    return createSymbol(
        instanceName,
        SymbolKind.Object,
        range,
        nameRange,
        `resource: ${schemaName ?? 'unknown'}`
    );
}

function processFunctionDeclaration(ctx: FunctionDeclarationContext, document: TextDocument): DocumentSymbol | null {
    const name = ctx.identifier()?.getText();
    if (!name) return null;

    const range = getContextRange(ctx, document);
    const nameRange = getNameRange(ctx.identifier(), document);
    if (!nameRange) return null;

    // Build parameter string
    const params: string[] = [];
    const paramList = ctx.parameterList();
    if (paramList) {
        for (const param of paramList.parameter_list()) {
            const paramType = param.typeIdentifier()?.getText() ?? 'any';
            const paramName = param.identifier()?.getText() ?? '_';
            params.push(`${paramType} ${paramName}`);
        }
    }

    const returnType = ctx.typeIdentifier()?.getText() ?? 'void';
    const detail = `(${params.join(', ')}) → ${returnType}`;

    return createSymbol(
        name,
        SymbolKind.Function,
        range,
        nameRange,
        detail
    );
}

function processTypeDeclaration(ctx: TypeDeclarationContext, document: TextDocument): DocumentSymbol | null {
    const name = ctx.identifier()?.getText();
    if (!name) return null;

    const range = getContextRange(ctx, document);
    const nameRange = getNameRange(ctx.identifier(), document);
    if (!nameRange) return null;

    return createSymbol(
        name,
        SymbolKind.TypeParameter,
        range,
        nameRange,
        'type alias'
    );
}

function processVarDeclaration(ctx: VarDeclarationContext, document: TextDocument): DocumentSymbol[] {
    const symbols: DocumentSymbol[] = [];
    const varList = ctx.varDeclarationList();
    if (!varList) return symbols;

    for (const varDecl of varList.varDeclarator_list()) {
        const name = varDecl.identifier()?.getText();
        if (!name) continue;

        const range = getContextRange(varDecl, document);
        const nameRange = getNameRange(varDecl.identifier(), document);
        if (!nameRange) continue;

        const varType = varDecl.typeIdentifier()?.getText() ?? 'any';

        symbols.push(createSymbol(
            name,
            SymbolKind.Variable,
            range,
            nameRange,
            varType
        ));
    }

    return symbols;
}

function processInputDeclaration(ctx: InputDeclarationContext, document: TextDocument): DocumentSymbol | null {
    const name = ctx.identifier()?.getText();
    if (!name) return null;

    const range = getContextRange(ctx, document);
    const nameRange = getNameRange(ctx.identifier(), document);
    if (!nameRange) return null;

    const inputType = ctx.typeIdentifier()?.getText() ?? 'any';

    return createSymbol(
        name,
        SymbolKind.Property,
        range,
        nameRange,
        `input: ${inputType}`
    );
}

function processOutputDeclaration(ctx: OutputDeclarationContext, document: TextDocument): DocumentSymbol | null {
    const name = ctx.identifier()?.getText();
    if (!name) return null;

    const range = getContextRange(ctx, document);
    const nameRange = getNameRange(ctx.identifier(), document);
    if (!nameRange) return null;

    const outputType = ctx.typeIdentifier()?.getText() ?? 'any';

    return createSymbol(
        name,
        SymbolKind.Event,
        range,
        nameRange,
        `output: ${outputType}`
    );
}
