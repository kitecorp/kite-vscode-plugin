/**
 * AST-based document scanner for the Kite language server.
 * Uses the ANTLR parser to extract declarations from Kite source code.
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range, Position } from 'vscode-languageserver/node';
import { ParserRuleContext } from 'antlr4';
import { Declaration, DeclarationType, FunctionParameter } from '../server/types';
import { parseKite } from './parse-utils';
import KiteParser, {
    ProgramContext,
    DeclarationContext,
    FunctionDeclarationContext,
    TypeDeclarationContext,
    SchemaDeclarationContext,
    ResourceDeclarationContext,
    ComponentDeclarationContext,
    InputDeclarationContext,
    OutputDeclarationContext,
    VarDeclarationContext,
    VarDeclaratorContext,
    ForStatementContext,
    ParameterContext,
    BlockExpressionContext,
    SchemaPropertyContext,
} from './grammar/KiteParser';

/**
 * Scope tracking for declarations
 */
interface ScopeInfo {
    start: number;
    end: number;
    type: 'function' | 'component-def' | 'schema';
}

/**
 * Scan document for all declarations using the ANTLR parser.
 */
export function scanDocumentAST(document: TextDocument): Declaration[] {
    const text = document.getText();
    const result = parseKite(text);

    // If there are parse errors, fall back gracefully
    // We still try to extract what we can from the partial tree

    const declarations: Declaration[] = [];
    const uri = document.uri;

    if (result.tree) {
        visitProgram(result.tree, declarations, uri, text);
    }

    return declarations;
}

/**
 * Visit the program root and extract declarations
 */
function visitProgram(ctx: ProgramContext, declarations: Declaration[], uri: string, text: string): void {
    const statementList = ctx.statementList();
    if (!statementList) return;

    for (const stmt of statementList.nonEmptyStatement_list()) {
        const decl = stmt.declaration();
        if (decl) {
            visitDeclaration(decl, declarations, uri, text, null);
        }

        // Handle for loops (they declare loop variables)
        const iterStmt = stmt.iterationStatement();
        if (iterStmt) {
            const forStmt = iterStmt.forStatement();
            if (forStmt) {
                visitForStatement(forStmt, declarations, uri, text, null);
            }
        }
    }
}

/**
 * Visit a declaration and extract its information
 */
function visitDeclaration(
    ctx: DeclarationContext,
    declarations: Declaration[],
    uri: string,
    text: string,
    enclosingScope: ScopeInfo | null
): void {
    const funcDecl = ctx.functionDeclaration();
    if (funcDecl) {
        visitFunctionDeclaration(funcDecl, declarations, uri, text, enclosingScope);
        return;
    }

    const typeDecl = ctx.typeDeclaration();
    if (typeDecl) {
        visitTypeDeclaration(typeDecl, declarations, uri, text);
        return;
    }

    const schemaDecl = ctx.schemaDeclaration();
    if (schemaDecl) {
        visitSchemaDeclaration(schemaDecl, declarations, uri, text);
        return;
    }

    const resourceDecl = ctx.resourceDeclaration();
    if (resourceDecl) {
        visitResourceDeclaration(resourceDecl, declarations, uri, text, enclosingScope);
        return;
    }

    const componentDecl = ctx.componentDeclaration();
    if (componentDecl) {
        visitComponentDeclaration(componentDecl, declarations, uri, text, enclosingScope);
        return;
    }

    const inputDecl = ctx.inputDeclaration();
    if (inputDecl) {
        visitInputDeclaration(inputDecl, declarations, uri, text, enclosingScope);
        return;
    }

    const outputDecl = ctx.outputDeclaration();
    if (outputDecl) {
        visitOutputDeclaration(outputDecl, declarations, uri, text, enclosingScope);
        return;
    }

    const varDecl = ctx.varDeclaration();
    if (varDecl) {
        visitVarDeclaration(varDecl, declarations, uri, text, enclosingScope);
        return;
    }
}

/**
 * Visit a function declaration
 */
function visitFunctionDeclaration(
    ctx: FunctionDeclarationContext,
    declarations: Declaration[],
    uri: string,
    text: string,
    enclosingScope: ScopeInfo | null
): void {
    const nameCtx = ctx.identifier();
    if (!nameCtx) return;

    const name = getIdentifierText(nameCtx);
    if (!name) return;

    const decl = createDeclaration(name, 'function', nameCtx, uri, text);

    // Extract parameters (always initialize to empty array for functions)
    decl.parameters = [];
    const paramList = ctx.parameterList();
    if (paramList) {
        for (const param of paramList.parameter_list()) {
            const paramInfo = extractParameter(param);
            if (paramInfo) {
                decl.parameters.push(paramInfo);
            }
        }
    }

    // Extract return type
    const typeId = ctx.typeIdentifier();
    if (typeId) {
        decl.returnType = typeId.getText();
    }

    // Add scope info if inside component definition
    if (enclosingScope && enclosingScope.type === 'component-def') {
        decl.scopeStart = enclosingScope.start;
        decl.scopeEnd = enclosingScope.end;
    }

    // Extract documentation
    extractDocumentation(decl, ctx, text);

    declarations.push(decl);

    // Process function body for nested declarations and parameters as variables
    const blockExpr = ctx.blockExpression();
    if (blockExpr && paramList) {
        const funcScope = getScopeFromBlock(blockExpr);

        // Add parameters as scoped variables
        for (const param of paramList.parameter_list()) {
            const paramDecl = createParameterDeclaration(param, uri, text, funcScope, decl.name);
            if (paramDecl) {
                declarations.push(paramDecl);
            }
        }

        // Visit body for nested declarations
        visitBlockExpression(blockExpr, declarations, uri, text, funcScope);
    }
}

/**
 * Visit a type declaration
 */
function visitTypeDeclaration(
    ctx: TypeDeclarationContext,
    declarations: Declaration[],
    uri: string,
    text: string
): void {
    const nameCtx = ctx.identifier();
    if (!nameCtx) return;

    const name = getIdentifierText(nameCtx);
    if (!name) return;

    const decl = createDeclaration(name, 'type', nameCtx, uri, text);
    extractDocumentation(decl, ctx, text);
    declarations.push(decl);
}

/**
 * Visit a schema declaration
 */
function visitSchemaDeclaration(
    ctx: SchemaDeclarationContext,
    declarations: Declaration[],
    uri: string,
    text: string
): void {
    const nameCtx = ctx.identifier();
    if (!nameCtx) return;

    const name = getIdentifierText(nameCtx);
    if (!name) return;

    const decl = createDeclaration(name, 'schema', nameCtx, uri, text);
    extractDocumentation(decl, ctx, text);
    declarations.push(decl);

    // Note: Schema properties are not added as declarations
    // They are handled differently (property lookup)
}

/**
 * Visit a resource declaration
 */
function visitResourceDeclaration(
    ctx: ResourceDeclarationContext,
    declarations: Declaration[],
    uri: string,
    text: string,
    enclosingScope: ScopeInfo | null
): void {
    const resourceName = ctx.resourceName();
    if (!resourceName) return;

    const typeId = ctx.typeIdentifier();
    const schemaName = typeId ? typeId.getText() : undefined;

    // Get the instance name
    const nameCtx = resourceName.identifier();
    if (!nameCtx) return;

    const name = getIdentifierText(nameCtx);
    if (!name) return;

    const decl = createDeclaration(name, 'resource', nameCtx, uri, text);
    decl.schemaName = schemaName;

    // Add scope if inside component definition
    if (enclosingScope && enclosingScope.type === 'component-def') {
        decl.scopeStart = enclosingScope.start;
        decl.scopeEnd = enclosingScope.end;
    }

    extractDocumentation(decl, ctx, text);
    declarations.push(decl);
}

/**
 * Visit a component declaration (definition or instantiation)
 */
function visitComponentDeclaration(
    ctx: ComponentDeclarationContext,
    declarations: Declaration[],
    uri: string,
    text: string,
    enclosingScope: ScopeInfo | null
): void {
    const compType = ctx.componentType();
    if (!compType) return;

    const typeId = compType.typeIdentifier();
    if (!typeId) return;

    const typeName = typeId.getText();

    // Check if this is a definition (no instance name) or instantiation
    const nameCtx = ctx.identifier();

    if (nameCtx) {
        // This is an instantiation: component TypeName instanceName {
        const name = getIdentifierText(nameCtx);
        if (!name) return;

        const decl = createDeclaration(name, 'component', nameCtx, uri, text);
        decl.componentType = typeName;

        // Add scope if inside component definition
        if (enclosingScope && enclosingScope.type === 'component-def') {
            decl.scopeStart = enclosingScope.start;
            decl.scopeEnd = enclosingScope.end;
        }

        extractDocumentation(decl, ctx, text);
        declarations.push(decl);
    } else {
        // This is a definition: component TypeName {
        // Use typeId for the name range
        const decl = createDeclaration(typeName, 'component', typeId, uri, text);
        extractDocumentation(decl, ctx, text);
        declarations.push(decl);

        // Process body as component definition scope
        const blockExpr = ctx.blockExpression();
        if (blockExpr) {
            const compScope: ScopeInfo = {
                ...getScopeFromBlock(blockExpr),
                type: 'component-def'
            };
            visitBlockExpression(blockExpr, declarations, uri, text, compScope);
        }
    }
}

/**
 * Visit an input declaration
 */
function visitInputDeclaration(
    ctx: InputDeclarationContext,
    declarations: Declaration[],
    uri: string,
    text: string,
    enclosingScope: ScopeInfo | null
): void {
    const nameCtx = ctx.identifier();
    if (!nameCtx) return;

    const name = getIdentifierText(nameCtx);
    if (!name) return;

    const decl = createDeclaration(name, 'input', nameCtx, uri, text);

    const typeId = ctx.typeIdentifier();
    if (typeId) {
        decl.typeName = typeId.getText();
    }

    if (enclosingScope) {
        decl.scopeStart = enclosingScope.start;
        decl.scopeEnd = enclosingScope.end;
    }

    extractDocumentation(decl, ctx, text);
    declarations.push(decl);
}

/**
 * Visit an output declaration
 */
function visitOutputDeclaration(
    ctx: OutputDeclarationContext,
    declarations: Declaration[],
    uri: string,
    text: string,
    enclosingScope: ScopeInfo | null
): void {
    const nameCtx = ctx.identifier();
    if (!nameCtx) return;

    const name = getIdentifierText(nameCtx);
    if (!name) return;

    const decl = createDeclaration(name, 'output', nameCtx, uri, text);

    const typeId = ctx.typeIdentifier();
    if (typeId) {
        decl.typeName = typeId.getText();
    }

    if (enclosingScope) {
        decl.scopeStart = enclosingScope.start;
        decl.scopeEnd = enclosingScope.end;
    }

    extractDocumentation(decl, ctx, text);
    declarations.push(decl);
}

/**
 * Visit a var declaration
 */
function visitVarDeclaration(
    ctx: VarDeclarationContext,
    declarations: Declaration[],
    uri: string,
    text: string,
    enclosingScope: ScopeInfo | null
): void {
    const varDeclList = ctx.varDeclarationList();
    if (!varDeclList) return;

    for (const varDecl of varDeclList.varDeclarator_list()) {
        visitVarDeclarator(varDecl, declarations, uri, text, enclosingScope, ctx);
    }
}

/**
 * Visit a var declarator
 */
function visitVarDeclarator(
    ctx: VarDeclaratorContext,
    declarations: Declaration[],
    uri: string,
    text: string,
    enclosingScope: ScopeInfo | null,
    parentCtx: ParserRuleContext
): void {
    const nameCtx = ctx.identifier();
    if (!nameCtx) return;

    const name = getIdentifierText(nameCtx);
    if (!name) return;

    const decl = createDeclaration(name, 'variable', nameCtx, uri, text);

    const typeId = ctx.typeIdentifier();
    if (typeId) {
        decl.typeName = typeId.getText();
    }

    if (enclosingScope) {
        decl.scopeStart = enclosingScope.start;
        decl.scopeEnd = enclosingScope.end;
    }

    extractDocumentation(decl, parentCtx, text);
    declarations.push(decl);
}

/**
 * Visit a for statement to extract loop variable
 */
function visitForStatement(
    ctx: ForStatementContext,
    declarations: Declaration[],
    uri: string,
    text: string,
    enclosingScope: ScopeInfo | null
): void {
    const identifiers = ctx.identifier_list();
    if (identifiers.length === 0) return;

    // First identifier is the loop variable
    const nameCtx = identifiers[0];
    const name = getIdentifierText(nameCtx);
    if (!name) return;

    const decl = createDeclaration(name, 'for', nameCtx, uri, text);

    // For loop variables are scoped to the for body
    const forBody = ctx.forBody();
    if (forBody) {
        const blockExpr = forBody.blockExpression();
        if (blockExpr) {
            const scope = getScopeFromBlock(blockExpr);
            decl.scopeStart = scope.start;
            decl.scopeEnd = scope.end;
        }
    }

    declarations.push(decl);
}

/**
 * Visit a block expression for nested declarations
 */
function visitBlockExpression(
    ctx: BlockExpressionContext,
    declarations: Declaration[],
    uri: string,
    text: string,
    enclosingScope: ScopeInfo | null
): void {
    const statementList = ctx.statementList();
    if (!statementList) return;

    for (const stmt of statementList.nonEmptyStatement_list()) {
        const decl = stmt.declaration();
        if (decl) {
            visitDeclaration(decl, declarations, uri, text, enclosingScope);
        }

        // Handle for loops inside blocks
        const iterStmt = stmt.iterationStatement();
        if (iterStmt) {
            const forStmt = iterStmt.forStatement();
            if (forStmt) {
                visitForStatement(forStmt, declarations, uri, text, enclosingScope);
            }
        }
    }
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Get text from an identifier context (handles both IDENTIFIER and string literals)
 */
function getIdentifierText(ctx: ParserRuleContext): string | null {
    const text = ctx.getText();
    if (!text) return null;

    // Remove quotes if it's a string literal identifier
    if ((text.startsWith('"') && text.endsWith('"')) ||
        (text.startsWith("'") && text.endsWith("'"))) {
        return text.slice(1, -1);
    }

    return text;
}

/**
 * Create a declaration from a context
 */
function createDeclaration(
    name: string,
    type: DeclarationType,
    nameCtx: ParserRuleContext,
    uri: string,
    text: string
): Declaration {
    const startToken = nameCtx.start;
    const stopToken = nameCtx.stop || startToken;

    const startLine = startToken.line - 1; // ANTLR is 1-based
    const startCol = startToken.column;
    const endLine = stopToken.line - 1;
    const endCol = stopToken.column + (stopToken.text?.length || 0);

    // Find line start/end for full range
    const lines = text.split('\n');
    const lineText = lines[startLine] || '';

    return {
        name,
        type,
        range: Range.create(
            Position.create(startLine, 0),
            Position.create(startLine, lineText.length)
        ),
        nameRange: Range.create(
            Position.create(startLine, startCol),
            Position.create(endLine, endCol)
        ),
        uri,
    };
}

/**
 * Extract parameter info from parameter context
 */
function extractParameter(ctx: ParameterContext): FunctionParameter | null {
    const nameCtx = ctx.identifier();
    if (!nameCtx) return null;

    const name = getIdentifierText(nameCtx);
    if (!name) return null;

    const typeId = ctx.typeIdentifier();
    const type = typeId ? typeId.getText() : 'any';

    return { type, name };
}

/**
 * Create a declaration for a function parameter
 */
function createParameterDeclaration(
    ctx: ParameterContext,
    uri: string,
    text: string,
    scope: ScopeInfo | null,
    functionName: string
): Declaration | null {
    const nameCtx = ctx.identifier();
    if (!nameCtx) return null;

    const name = getIdentifierText(nameCtx);
    if (!name) return null;

    const typeId = ctx.typeIdentifier();
    const typeName = typeId ? typeId.getText() : undefined;

    const decl = createDeclaration(name, 'variable', nameCtx, uri, text);
    decl.typeName = typeName;
    decl.documentation = `Parameter of function \`${functionName}\``;

    if (scope) {
        decl.scopeStart = scope.start;
        decl.scopeEnd = scope.end;
    }

    return decl;
}

/**
 * Get scope info from a block expression
 */
function getScopeFromBlock(ctx: BlockExpressionContext): ScopeInfo {
    const start = ctx.start.start;
    const stop = ctx.stop?.stop || start;

    return {
        start,
        end: stop + 1,
        type: 'function'
    };
}

/**
 * Extract documentation from preceding comments
 */
function extractDocumentation(decl: Declaration, ctx: ParserRuleContext, text: string): void {
    const startToken = ctx.start;
    if (!startToken) return;

    const startLine = startToken.line - 1;
    if (startLine <= 0) return;

    const lines = text.split('\n');
    const prevLine = lines[startLine - 1]?.trim();

    if (!prevLine) return;

    if (prevLine.startsWith('//')) {
        decl.documentation = prevLine.substring(2).trim();
    } else if (prevLine.endsWith('*/')) {
        // Find block comment
        const commentLines: string[] = [];
        for (let i = startLine - 1; i >= 0; i--) {
            const cLine = lines[i].trim();
            if (cLine.startsWith('/*')) {
                commentLines.unshift(cLine.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, ''));
                break;
            }
            commentLines.unshift(cLine.replace(/^\*\s*/, '').replace(/\s*\*\/$/, ''));
        }
        decl.documentation = commentLines.join('\n').trim();
    }
}
