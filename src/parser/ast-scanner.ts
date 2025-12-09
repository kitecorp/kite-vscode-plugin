/**
 * AST-based document scanner for the Kite language server.
 *
 * ## Purpose
 *
 * This module serves as a **bridge** between the ANTLR parser (generated code) and the
 * language server's needs. It walks the parse tree and extracts a simplified list of
 * declarations that the language server can efficiently query.
 *
 * ## Why This Exists
 *
 * 1. **Performance**: The language server needs fast access to declarations for features like
 *    autocomplete, go-to-definition, and validation. Storing a pre-scanned list in a cache
 *    is much faster than re-parsing on every request.
 *
 * 2. **Simplification**: The ANTLR parse tree is complex and deeply nested. This scanner
 *    flattens it into a simple array of Declaration objects with just the info we need:
 *    name, type, location, scope bounds, parameters, etc.
 *
 * 3. **Scope Tracking**: The scanner calculates and stores scope information (scopeStart/scopeEnd)
 *    for variables, parameters, and other scoped declarations. This enables scope-aware
 *    symbol resolution in validation and autocomplete.
 *
 * ## How It's Used
 *
 * Called by the language server on every document change (server.ts:200):
 * ```typescript
 * documents.onDidChangeContent(change => {
 *     const declarations = scanDocumentAST(change.document);
 *     declarationCache.set(change.document.uri, declarations);
 *     // ... declarations are then used by validation, autocomplete, etc.
 * });
 * ```
 *
 * The resulting Declaration[] is cached and consumed by:
 * - Validation (undefined symbols, type checking, etc.)
 * - Autocomplete (suggest available symbols)
 * - Go-to-definition (find declaration location)
 * - Find references (find all usages)
 * - Hover (show declaration info)
 *
 * ## Architecture
 *
 * - **ANTLR Grammar** (grammar/*.g4) → defines the language syntax
 * - **ANTLR Generator** → produces KiteLexer.ts, KiteParser.ts (generated code)
 * - **parse-utils.ts** → wraps the parser with error handling
 * - **ast-scanner.ts** (this file) → walks parse tree, extracts declarations
 * - **Language Server** → uses cached declarations for LSP features
 *
 * ## Important Notes
 *
 * - This is **NOT generated code** - it's hand-written and can be modified
 * - It uses the **Visitor pattern** to traverse the ANTLR parse tree
 * - When grammar changes, regenerate parser with `npm run generate-parser`
 * - This scanner code may need updates if grammar structure changes significantly
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range, Position } from 'vscode-languageserver/node';
import { ParserRuleContext, TerminalNode } from 'antlr4';
import { Declaration, DeclarationType, FunctionParameter, IndexedResourceInfo, IndexType } from '../server/types';
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
    ImportStatementContext,
    DecoratorListContext,
    ArrayExpressionContext,
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
 * Loop context tracking for indexed resources
 */
interface LoopContext {
    /** Loop variable name */
    loopVariable: string;
    /** Type of index: numeric for ranges, string for array iteration */
    indexType: IndexType;
    /** For ranges: start value */
    rangeStart?: number;
    /** For ranges: end value */
    rangeEnd?: number;
    /** For array iteration: the string keys (if known) */
    stringKeys?: string[];
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
        // Handle import statements
        const importStmt = stmt.importStatement();
        if (importStmt) {
            visitImportStatement(importStmt, declarations, uri, text);
        }

        const decl = stmt.declaration();
        if (decl) {
            visitDeclaration(decl, declarations, uri, text, null, null);
        }

        // Handle for loops (they declare loop variables)
        const iterStmt = stmt.iterationStatement();
        if (iterStmt) {
            const forStmt = iterStmt.forStatement();
            if (forStmt) {
                visitForStatement(forStmt, declarations, uri, text, null);
            }
        }

        // Handle array expression with for loop (list comprehension creating resources)
        const exprStmt = stmt.expressionStatement();
        if (exprStmt) {
            const expr = exprStmt.expression();
            if (expr) {
                const arrayExpr = expr.arrayExpression();
                if (arrayExpr) {
                    visitArrayExpressionForLoop(arrayExpr, declarations, uri, text, null);
                }
            }
        }
    }
}

/**
 * Visit an import statement and extract imported symbols
 */
function visitImportStatement(
    ctx: ImportStatementContext,
    declarations: Declaration[],
    uri: string,
    text: string
): void {
    // Get the import path for documentation
    const stringLiteralCtx = ctx.stringLiteral();
    const importPath = stringLiteralCtx ? getStringLiteralValue(stringLiteralCtx) : undefined;

    // Check for named imports: import x, y from "path"
    const symbolList = ctx.importSymbolList();
    if (symbolList) {
        const identifiers = symbolList.IDENTIFIER_list();
        for (const idToken of identifiers) {
            const name = idToken.getText();
            const startToken = idToken.symbol;

            const startLine = startToken.line - 1;
            const startCol = startToken.column;
            const endCol = startCol + name.length;

            const lines = text.split('\n');
            const lineText = lines[startLine] || '';

            const decl: Declaration = {
                name,
                type: 'import',
                range: Range.create(
                    Position.create(startLine, 0),
                    Position.create(startLine, lineText.length)
                ),
                nameRange: Range.create(
                    Position.create(startLine, startCol),
                    Position.create(startLine, endCol)
                ),
                uri,
                documentation: importPath ? `Imported from \`${importPath}\`` : undefined,
                importPath,
            };
            declarations.push(decl);
        }
    }
    // For wildcard imports (import * from "path"), we don't add declarations
    // since we'd need to resolve the file and extract all its exports
}

/**
 * Get the string value from a stringLiteral context
 */
function getStringLiteralValue(ctx: ParserRuleContext): string | undefined {
    const text = ctx.getText();
    if (!text) return undefined;
    // Remove surrounding quotes
    if ((text.startsWith('"') && text.endsWith('"')) ||
        (text.startsWith("'") && text.endsWith("'"))) {
        return text.slice(1, -1);
    }
    return text;
}

/**
 * Visit a declaration and extract its information
 */
function visitDeclaration(
    ctx: DeclarationContext,
    declarations: Declaration[],
    uri: string,
    text: string,
    enclosingScope: ScopeInfo | null,
    loopContext: LoopContext | null
): void {
    // Extract decorator list for @count handling
    const decoratorList = ctx.decoratorList();

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
        visitResourceDeclaration(resourceDecl, declarations, uri, text, enclosingScope, loopContext, decoratorList);
        return;
    }

    const componentDecl = ctx.componentDeclaration();
    if (componentDecl) {
        visitComponentDeclaration(componentDecl, declarations, uri, text, enclosingScope, loopContext, decoratorList);
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
    if (blockExpr) {
        const funcScope = getScopeFromBlock(blockExpr);

        // Add parameters as scoped variables (if any)
        if (paramList) {
            for (const param of paramList.parameter_list()) {
                const paramDecl = createParameterDeclaration(param, uri, text, funcScope, decl.name);
                if (paramDecl) {
                    declarations.push(paramDecl);
                }
            }
        }

        // IMPORTANT: Always visit function body to scan local variables, even if no parameters.
        // Bug fixed: Previously this was only called if `paramList` existed, causing functions
        // without parameters to never scan their local variables (e.g., `var result = 42`).
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
    enclosingScope: ScopeInfo | null,
    loopContext: LoopContext | null,
    decoratorList: DecoratorListContext | null
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

    // Check for @count decorator or loop context for indexed resources
    const countInfo = extractCountDecorator(decoratorList);
    if (countInfo) {
        decl.indexedBy = {
            indexType: 'numeric',
            loopVariable: 'count',
            countValue: countInfo.value,
        };
    } else if (loopContext) {
        decl.indexedBy = {
            indexType: loopContext.indexType,
            loopVariable: loopContext.loopVariable,
            rangeStart: loopContext.rangeStart,
            rangeEnd: loopContext.rangeEnd,
            stringKeys: loopContext.stringKeys,
        };
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
    enclosingScope: ScopeInfo | null,
    loopContext: LoopContext | null,
    decoratorList: DecoratorListContext | null
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

        // Check for @count decorator or loop context for indexed resources
        const countInfo = extractCountDecorator(decoratorList);
        if (countInfo) {
            decl.indexedBy = {
                indexType: 'numeric',
                loopVariable: 'count',
                countValue: countInfo.value,
            };
        } else if (loopContext) {
            decl.indexedBy = {
                indexType: loopContext.indexType,
                loopVariable: loopContext.loopVariable,
                rangeStart: loopContext.rangeStart,
                rangeEnd: loopContext.rangeEnd,
                stringKeys: loopContext.stringKeys,
            };
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

    // Extract loop context for nested resource/component declarations
    const loopContext = extractLoopContext(ctx, name);

    // For loop variables are scoped to the for body
    const forBody = ctx.forBody();
    if (forBody) {
        const blockExpr = forBody.blockExpression();
        if (blockExpr) {
            const scope = getScopeFromBlock(blockExpr);
            decl.scopeStart = scope.start;
            decl.scopeEnd = scope.end;

            // Visit the block expression with loop context
            visitBlockExpressionWithLoop(blockExpr, declarations, uri, text, enclosingScope, loopContext);
        }

        // Handle resource declaration directly in for body (without block)
        const resourceDecl = forBody.resourceDeclaration();
        if (resourceDecl) {
            visitResourceDeclaration(resourceDecl, declarations, uri, text, enclosingScope, loopContext, null);
        }
    }

    declarations.push(decl);
}

/**
 * Visit a block expression for nested declarations (no loop context)
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
            visitDeclaration(decl, declarations, uri, text, enclosingScope, null);
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

/**
 * Extract @count decorator value from decorator list.
 * Handles both direct literal and callMemberExpression paths.
 */
function extractCountDecorator(decoratorList: DecoratorListContext | null): { value?: number } | null {
    if (!decoratorList) return null;

    for (const decorator of decoratorList.decorator_list()) {
        const idCtx = decorator.identifier();
        if (!idCtx) continue;

        const decoratorName = getIdentifierText(idCtx);
        if (decoratorName !== 'count') continue;

        // Found @count - extract the argument
        const argsCtx = decorator.decoratorArgs();
        if (!argsCtx) {
            return { value: undefined }; // @count without argument
        }

        // Get the decorator argument
        const argCtx = argsCtx.decoratorArg();
        if (argCtx) {
            // Try direct literal path first
            let literal = argCtx.literal();

            // If not found, try callMemberExpression -> primaryExpression -> literal path
            if (!literal) {
                const callMember = argCtx.callMemberExpression();
                if (callMember) {
                    const primary = callMember.primaryExpression();
                    if (primary) {
                        literal = primary.literal();
                    }
                }
            }

            if (literal) {
                const numToken = literal.NUMBER();
                if (numToken) {
                    const value = parseInt(numToken.getText(), 10);
                    return { value: isNaN(value) ? undefined : value };
                }
            }

            // Check for identifier (variable reference)
            const idArg = argCtx.identifier();
            if (idArg) {
                return { value: undefined }; // Dynamic count via variable
            }
        }

        return { value: undefined };
    }

    return null;
}

/**
 * Extract loop context from a for statement
 */
function extractLoopContext(ctx: ForStatementContext, loopVariable: string): LoopContext {
    // Check for range expression: 0..n
    const rangeExpr = ctx.rangeExpression();
    if (rangeExpr) {
        const numbers = rangeExpr.NUMBER_list();
        if (numbers.length >= 2) {
            const start = parseInt(numbers[0].getText(), 10);
            const end = parseInt(numbers[1].getText(), 10);
            return {
                loopVariable,
                indexType: 'numeric',
                rangeStart: isNaN(start) ? 0 : start,
                rangeEnd: isNaN(end) ? undefined : end,
            };
        }
        return {
            loopVariable,
            indexType: 'numeric',
        };
    }

    // Check for array expression: ["a", "b", "c"]
    const arrayExpr = ctx.arrayExpression();
    if (arrayExpr) {
        const stringKeys = extractStringArrayValues(arrayExpr);
        if (stringKeys && stringKeys.length > 0) {
            return {
                loopVariable,
                indexType: 'string',
                stringKeys,
            };
        }
        // Array of non-strings or complex expressions - treat as string indexed but unknown keys
        return {
            loopVariable,
            indexType: 'string',
        };
    }

    // Check for identifier (variable reference) - we can't know the type at parse time
    const identifiers = ctx.identifier_list();
    if (identifiers.length >= 2) {
        // for x in someVar - assume string keys for safety
        return {
            loopVariable,
            indexType: 'string',
        };
    }

    // Default to numeric
    return {
        loopVariable,
        indexType: 'numeric',
    };
}

/**
 * Extract string values from an array expression literal.
 * Handles both direct literal and callMemberExpression paths.
 */
function extractStringArrayValues(ctx: ArrayExpressionContext): string[] | null {
    const items = ctx.arrayItems();
    if (!items) return null;

    const stringKeys: string[] = [];

    for (const item of items.arrayItem_list()) {
        // Try direct literal path first
        let literal = item.literal();

        // If not found, try callMemberExpression -> primaryExpression -> literal path
        if (!literal) {
            const callMember = item.callMemberExpression();
            if (callMember) {
                const primary = callMember.primaryExpression();
                if (primary) {
                    literal = primary.literal();
                }
            }
        }

        if (literal) {
            const strLiteral = literal.stringLiteral();
            if (strLiteral) {
                const value = strLiteral.getText();
                // Remove quotes
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    stringKeys.push(value.slice(1, -1));
                } else {
                    stringKeys.push(value);
                }
            }
        }
    }

    return stringKeys.length > 0 ? stringKeys : null;
}

/**
 * Visit a block expression with loop context for indexed resources
 */
function visitBlockExpressionWithLoop(
    ctx: BlockExpressionContext,
    declarations: Declaration[],
    uri: string,
    text: string,
    enclosingScope: ScopeInfo | null,
    loopContext: LoopContext | null
): void {
    const statementList = ctx.statementList();
    if (!statementList) return;

    for (const stmt of statementList.nonEmptyStatement_list()) {
        const decl = stmt.declaration();
        if (decl) {
            visitDeclaration(decl, declarations, uri, text, enclosingScope, loopContext);
        }

        // Handle nested for loops
        const iterStmt = stmt.iterationStatement();
        if (iterStmt) {
            const forStmt = iterStmt.forStatement();
            if (forStmt) {
                visitForStatement(forStmt, declarations, uri, text, enclosingScope);
            }
        }
    }
}

/**
 * Visit an array expression with for loop (list comprehension) for resources
 * Handles: [for env in environments] resource S3.Bucket data { ... }
 */
function visitArrayExpressionForLoop(
    ctx: ArrayExpressionContext,
    declarations: Declaration[],
    uri: string,
    text: string,
    enclosingScope: ScopeInfo | null
): void {
    // Check if this is a list comprehension with for
    const identifiers = ctx.identifier_list();
    if (identifiers.length === 0) return;

    // First identifier is the loop variable
    const nameCtx = identifiers[0];
    const name = getIdentifierText(nameCtx);
    if (!name) return;

    // Create the loop variable declaration
    const loopVarDecl = createDeclaration(name, 'for', nameCtx, uri, text);

    // Extract loop context
    let loopContext: LoopContext;

    // Check for range expression
    const rangeExpr = ctx.rangeExpression();
    if (rangeExpr) {
        const numbers = rangeExpr.NUMBER_list();
        if (numbers.length >= 2) {
            const start = parseInt(numbers[0].getText(), 10);
            const end = parseInt(numbers[1].getText(), 10);
            loopContext = {
                loopVariable: name,
                indexType: 'numeric',
                rangeStart: isNaN(start) ? 0 : start,
                rangeEnd: isNaN(end) ? undefined : end,
            };
        } else {
            loopContext = {
                loopVariable: name,
                indexType: 'numeric',
            };
        }
    } else {
        // Check for array expression within the comprehension
        const arrayExpr = ctx.arrayExpression();
        if (arrayExpr) {
            const stringKeys = extractStringArrayValues(arrayExpr);
            if (stringKeys && stringKeys.length > 0) {
                loopContext = {
                    loopVariable: name,
                    indexType: 'string',
                    stringKeys,
                };
            } else {
                loopContext = {
                    loopVariable: name,
                    indexType: 'string',
                };
            }
        } else {
            // Identifier reference
            loopContext = {
                loopVariable: name,
                indexType: 'string',
            };
        }
    }

    // Set scope for loop variable
    const forBody = ctx.forBody();
    if (forBody) {
        const blockExpr = forBody.blockExpression();
        if (blockExpr) {
            const scope = getScopeFromBlock(blockExpr);
            loopVarDecl.scopeStart = scope.start;
            loopVarDecl.scopeEnd = scope.end;
        }

        // Handle resource declaration in for body
        const resourceDecl = forBody.resourceDeclaration();
        if (resourceDecl) {
            visitResourceDeclaration(resourceDecl, declarations, uri, text, enclosingScope, loopContext, null);
        }
    }

    declarations.push(loopVarDecl);
}
