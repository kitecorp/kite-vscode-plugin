/**
 * AST-based cursor context utilities.
 * Provides functions to detect cursor context in Kite code.
 */

import { ParserRuleContext } from 'antlr4';
import { parseKite, ParseResult } from './parse-utils';
import {
    SchemaDeclarationContext,
    ResourceDeclarationContext,
    ComponentDeclarationContext,
    FunctionDeclarationContext,
    BlockExpressionContext,
    DecoratorContext,
    ForStatementContext,
} from './grammar/KiteParser';

/**
 * Types of cursor contexts in Kite code
 */
export type CursorContextType =
    | 'schema-body'           // Inside schema { } - expect type propertyName
    | 'resource-body'         // Inside resource { } - expect propertyName = value
    | 'component-def-body'    // Inside component definition { } - expect input/output/var/resource
    | 'component-inst-body'   // Inside component instantiation { } - expect inputName = value
    | 'function-body'         // Inside function { }
    | 'function-params'       // Inside function parameter list
    | 'decorator'             // After @
    | 'decorator-args'        // Inside decorator arguments ()
    | 'object-literal'        // Inside { key: value }
    | 'array-literal'         // Inside [ ]
    | 'for-body'              // Inside for loop body
    | 'value'                 // After = (value position)
    | 'top-level'             // Top level of file
    | 'unknown';

/**
 * Information about the cursor context
 */
export interface CursorContext {
    type: CursorContextType;
    /** The enclosing declaration (schema, resource, component, function) */
    enclosingDeclaration?: {
        type: 'schema' | 'resource' | 'component-def' | 'component-inst' | 'function';
        name: string;
        /** For resources/component instances, the schema/component type */
        typeName?: string;
        /** Start offset of the body */
        bodyStart: number;
        /** End offset of the body */
        bodyEnd: number;
    };
    /** Whether cursor is after = on the current line */
    isValueContext: boolean;
    /** The current line text before cursor */
    lineBeforeCursor: string;
    /** Properties already set in the enclosing block */
    alreadySetProperties: Set<string>;
}

/**
 * Cache for parsed documents to avoid reparsing
 */
const parseCache = new Map<string, { text: string; result: ParseResult }>();

/**
 * Get or create parsed result for text
 */
function getParsedResult(text: string): ParseResult {
    const cached = parseCache.get(text);
    if (cached && cached.text === text) {
        return cached.result;
    }

    const result = parseKite(text);
    parseCache.set(text, { text, result });

    // Limit cache size
    if (parseCache.size > 10) {
        const firstKey = parseCache.keys().next().value;
        if (firstKey) parseCache.delete(firstKey);
    }

    return result;
}

/**
 * Get the cursor context at a given offset in the text
 */
export function getCursorContext(text: string, offset: number): CursorContext {
    const result = getParsedResult(text);

    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineBeforeCursor = text.substring(lineStart, offset);
    const isValueContext = checkIsValueContext(lineBeforeCursor);

    const context: CursorContext = {
        type: 'top-level',
        isValueContext,
        lineBeforeCursor,
        alreadySetProperties: new Set(),
    };

    if (!result.tree) {
        return context;
    }

    // Find the innermost context at the offset
    const ctx = findContextAtOffset(result.tree, offset);
    if (!ctx) {
        return context;
    }

    // Determine context type based on the enclosing rules
    determineContextType(ctx, offset, context);

    return context;
}

/**
 * Check if cursor is in value context (after = on current line)
 */
function checkIsValueContext(lineBeforeCursor: string): boolean {
    const equalsIndex = lineBeforeCursor.indexOf('=');
    if (equalsIndex === -1) return false;

    // Check it's not == or != or <= or >=
    const charBefore = lineBeforeCursor[equalsIndex - 1];
    const charAfter = lineBeforeCursor[equalsIndex + 1];
    if (charBefore === '=' || charBefore === '!' || charBefore === '<' || charBefore === '>') {
        return false;
    }
    if (charAfter === '=') {
        return false;
    }

    return true;
}

/**
 * Find the deepest context containing the offset
 */
function findContextAtOffset(ctx: ParserRuleContext, offset: number): ParserRuleContext | null {
    const start = ctx.start?.start ?? 0;
    const stop = (ctx.stop?.stop ?? ctx.start?.stop ?? 0) + 1;

    // Check if offset is within this context
    if (offset < start || offset > stop) {
        return null;
    }

    // Check children for a more specific match
    for (let i = 0; i < ctx.getChildCount(); i++) {
        const child = ctx.getChild(i);
        if (child instanceof ParserRuleContext) {
            const found = findContextAtOffset(child, offset);
            if (found) {
                return found;
            }
        }
    }

    return ctx;
}

/**
 * Determine the context type by walking up the parse tree
 */
function determineContextType(
    ctx: ParserRuleContext,
    offset: number,
    context: CursorContext
): void {
    let current: ParserRuleContext | null = ctx;

    while (current) {
        if (current instanceof SchemaDeclarationContext) {
            // Schema uses LBRACE/RBRACE directly, not blockExpression
            const lbrace = current.LBRACE();
            const rbrace = current.RBRACE();
            if (lbrace && rbrace) {
                const bodyStart = lbrace.symbol.start;
                const bodyEnd = rbrace.symbol.stop + 1;
                if (offset > bodyStart && offset < bodyEnd) {
                    context.type = 'schema-body';
                    context.enclosingDeclaration = {
                        type: 'schema',
                        name: current.identifier()?.getText() || 'unknown',
                        bodyStart,
                        bodyEnd,
                    };
                    context.alreadySetProperties = extractSetPropertiesFromSchema(current);
                    return;
                }
            }
        }

        if (current instanceof ResourceDeclarationContext) {
            const blockExpr = current.blockExpression();
            if (blockExpr && isOffsetInBlock(blockExpr, offset)) {
                const typeName = current.typeIdentifier()?.getText();
                const resourceName = current.resourceName();
                context.type = 'resource-body';
                context.enclosingDeclaration = {
                    type: 'resource',
                    name: resourceName?.identifier()?.getText() || 'unknown',
                    typeName,
                    bodyStart: blockExpr.start?.start ?? 0,
                    bodyEnd: (blockExpr.stop?.stop ?? 0) + 1,
                };
                context.alreadySetProperties = extractSetPropertiesFromBlock(blockExpr);
                return;
            }
        }

        if (current instanceof ComponentDeclarationContext) {
            const blockExpr = current.blockExpression();
            if (blockExpr && isOffsetInBlock(blockExpr, offset)) {
                const compType = current.componentType();
                const typeName = compType?.typeIdentifier()?.getText();
                const instanceName = current.identifier()?.getText();

                if (instanceName) {
                    // Component instantiation
                    context.type = 'component-inst-body';
                    context.enclosingDeclaration = {
                        type: 'component-inst',
                        name: instanceName,
                        typeName,
                        bodyStart: blockExpr.start?.start ?? 0,
                        bodyEnd: (blockExpr.stop?.stop ?? 0) + 1,
                    };
                } else {
                    // Component definition
                    context.type = 'component-def-body';
                    context.enclosingDeclaration = {
                        type: 'component-def',
                        name: typeName || 'unknown',
                        bodyStart: blockExpr.start?.start ?? 0,
                        bodyEnd: (blockExpr.stop?.stop ?? 0) + 1,
                    };
                }
                context.alreadySetProperties = extractSetPropertiesFromBlock(blockExpr);
                return;
            }
        }

        if (current instanceof FunctionDeclarationContext) {
            // Check if in parameter list
            const paramList = current.parameterList();
            if (paramList) {
                const paramStart = paramList.start?.start ?? 0;
                const paramStop = (paramList.stop?.stop ?? 0) + 1;
                if (offset >= paramStart && offset <= paramStop) {
                    context.type = 'function-params';
                    context.enclosingDeclaration = {
                        type: 'function',
                        name: current.identifier()?.getText() || 'unknown',
                        bodyStart: paramStart,
                        bodyEnd: paramStop,
                    };
                    return;
                }
            }

            const blockExpr = current.blockExpression();
            if (blockExpr && isOffsetInBlock(blockExpr, offset)) {
                context.type = 'function-body';
                context.enclosingDeclaration = {
                    type: 'function',
                    name: current.identifier()?.getText() || 'unknown',
                    bodyStart: blockExpr.start?.start ?? 0,
                    bodyEnd: (blockExpr.stop?.stop ?? 0) + 1,
                };
                return;
            }
        }

        if (current instanceof DecoratorContext) {
            const args = current.decoratorArgs();
            if (args) {
                const argsStart = args.start?.start ?? 0;
                const argsStop = (args.stop?.stop ?? 0) + 1;
                if (offset >= argsStart && offset <= argsStop) {
                    context.type = 'decorator-args';
                    return;
                }
            }
            context.type = 'decorator';
            return;
        }

        if (current instanceof ForStatementContext) {
            const forBody = current.forBody();
            if (forBody) {
                const blockExpr = forBody.blockExpression();
                if (blockExpr && isOffsetInBlock(blockExpr, offset)) {
                    context.type = 'for-body';
                    return;
                }
            }
        }

        current = current.parentCtx as ParserRuleContext | null;
    }
}

/**
 * Check if offset is within a block expression (between { and })
 */
function isOffsetInBlock(blockExpr: BlockExpressionContext, offset: number): boolean {
    const start = blockExpr.start?.start ?? 0;
    const stop = (blockExpr.stop?.stop ?? 0) + 1;
    return offset > start && offset < stop;
}

/**
 * Extract properties already set in a schema
 */
function extractSetPropertiesFromSchema(ctx: SchemaDeclarationContext): Set<string> {
    const props = new Set<string>();
    const propList = ctx.schemaPropertyList();
    if (propList) {
        for (const prop of propList.schemaProperty_list()) {
            const name = prop.identifier()?.getText();
            if (name) {
                props.add(name);
            }
        }
    }
    return props;
}

/**
 * Extract properties already set in a block (resource/component body)
 */
function extractSetPropertiesFromBlock(blockExpr: BlockExpressionContext): Set<string> {
    const props = new Set<string>();
    const stmtList = blockExpr.statementList();
    if (!stmtList) return props;

    for (const stmt of stmtList.nonEmptyStatement_list()) {
        const exprStmt = stmt.expressionStatement();
        if (exprStmt) {
            const expr = exprStmt.expression();
            if (expr) {
                const assignExpr = expr.assignmentExpression();
                if (assignExpr) {
                    // Get the left side of assignment
                    const leftSide = assignExpr.orExpression();
                    if (leftSide) {
                        const leftText = leftSide.getText();
                        // Simple identifier assignment
                        if (/^\w+$/.test(leftText)) {
                            props.add(leftText);
                        }
                    }
                }
            }
        }

        // Also check for input/output/var declarations
        const decl = stmt.declaration();
        if (decl) {
            const inputDecl = decl.inputDeclaration();
            if (inputDecl) {
                const name = inputDecl.identifier()?.getText();
                if (name) props.add(name);
            }
            const outputDecl = decl.outputDeclaration();
            if (outputDecl) {
                const name = outputDecl.identifier()?.getText();
                if (name) props.add(name);
            }
            const varDecl = decl.varDeclaration();
            if (varDecl) {
                const varList = varDecl.varDeclarationList();
                if (varList) {
                    for (const v of varList.varDeclarator_list()) {
                        const name = v.identifier()?.getText();
                        if (name) props.add(name);
                    }
                }
            }
        }
    }

    return props;
}

/**
 * Check if cursor is inside a decorator (after @)
 */
export function isInDecoratorContext(text: string, offset: number): boolean {
    const beforeCursor = text.substring(Math.max(0, offset - 100), offset);
    return /@\s*\w*$/.test(beforeCursor);
}

/**
 * Check if cursor is after a dot (property access context)
 * Returns the base identifier (without index for indexed access).
 * Matches patterns like: identifier., identifier[0]., identifier["key"].
 */
export function getDotAccessTarget(text: string, offset: number): string | null {
    const beforeCursor = text.substring(Math.max(0, offset - 100), offset);
    // Match: identifier. or identifier[index]. where index is numeric or string
    const match = beforeCursor.match(/(\w+)(?:\[(?:\d+|["'][^"']*["'])\])?\.\s*$/);
    return match ? match[1] : null;
}
