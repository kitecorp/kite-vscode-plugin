/**
 * Call Hierarchy handler for the Kite language server.
 * Provides incoming/outgoing call navigation for functions.
 */

import {
    CallHierarchyItem,
    CallHierarchyIncomingCall,
    CallHierarchyOutgoingCall,
    Position,
    Range,
    SymbolKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

/**
 * Context for call hierarchy operations
 */
export interface CallHierarchyContext {
    findKiteFilesInWorkspace: () => string[];
    getFileContent: (filePath: string) => string | null;
}

/**
 * Function info extracted from source
 */
interface FunctionInfo {
    name: string;
    params: string;
    returnType: string;
    startLine: number;
    endLine: number;
    bodyStartLine: number;
    nameStart: number;
    nameLength: number;
}

/**
 * Prepare call hierarchy - find function at position
 */
export function prepareCallHierarchy(
    document: TextDocument,
    position: Position
): CallHierarchyItem[] {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const word = getWordAtOffset(text, offset);

    if (!word) return [];

    // Check if cursor is on a function definition or call
    const functions = extractFunctions(text);

    // Check if on function definition
    for (const func of functions) {
        if (position.line === func.startLine) {
            const nameStart = func.nameStart;
            const nameEnd = nameStart + func.nameLength;
            if (offset >= lineOffset(text, func.startLine) + nameStart &&
                offset <= lineOffset(text, func.startLine) + nameEnd) {
                return [createCallHierarchyItem(func, document.uri)];
            }
        }
    }

    // Check if on function call - find if word is a known function
    const calledFunc = functions.find(f => f.name === word);
    if (calledFunc) {
        // Verify it's actually a call (followed by `(`)
        const afterWord = text.substring(offset);
        const match = afterWord.match(/^\w*\s*\(/);
        if (match) {
            return [createCallHierarchyItem(calledFunc, document.uri)];
        }
    }

    // Check if word is a function name at its definition
    const funcAtLine = functions.find(f =>
        f.startLine === position.line && f.name === word
    );
    if (funcAtLine) {
        return [createCallHierarchyItem(funcAtLine, document.uri)];
    }

    return [];
}

/**
 * Get incoming calls - find all places that call this function
 */
export function getIncomingCalls(
    item: CallHierarchyItem,
    document: TextDocument,
    ctx: CallHierarchyContext
): CallHierarchyIncomingCall[] {
    const results: CallHierarchyIncomingCall[] = [];
    const targetName = item.name;

    // Search current document
    const currentCalls = findCallsToFunction(document.getText(), targetName, document.uri);
    results.push(...currentCalls);

    // Search other files in workspace
    const kiteFiles = ctx.findKiteFilesInWorkspace();
    const currentPath = URI.parse(document.uri).fsPath;

    for (const filePath of kiteFiles) {
        if (filePath === currentPath) continue;

        const content = ctx.getFileContent(filePath);
        if (!content) continue;

        const fileUri = URI.file(filePath).toString();
        const fileCalls = findCallsToFunction(content, targetName, fileUri);
        results.push(...fileCalls);
    }

    return results;
}

/**
 * Get outgoing calls - find all functions called from this function
 */
export function getOutgoingCalls(
    item: CallHierarchyItem,
    document: TextDocument,
    ctx: CallHierarchyContext
): CallHierarchyOutgoingCall[] {
    const text = document.getText();
    const functions = extractFunctions(text);

    // Find the function body for this item
    const sourceFunc = functions.find(f =>
        f.name === item.name && f.startLine === item.range.start.line
    );
    if (!sourceFunc) return [];

    // Extract function body
    const lines = text.split('\n');
    const body = extractFunctionBody(lines, sourceFunc);
    if (!body) return [];

    // Find all function calls in body
    const callMap = new Map<string, Range[]>();
    const callRegex = /\b([a-zA-Z_]\w*)\s*\(/g;
    let match;

    while ((match = callRegex.exec(body.text)) !== null) {
        const funcName = match[1];

        // Skip keywords
        if (isKeyword(funcName)) continue;

        // Calculate position
        const callOffset = match.index;
        const lineInBody = body.text.substring(0, callOffset).split('\n').length - 1;
        const lineStart = body.text.lastIndexOf('\n', callOffset) + 1;
        const column = callOffset - lineStart + body.columnOffset;
        const absoluteLine = body.startLine + lineInBody;

        const range = Range.create(
            Position.create(absoluteLine, column),
            Position.create(absoluteLine, column + funcName.length)
        );

        if (!callMap.has(funcName)) {
            callMap.set(funcName, []);
        }
        callMap.get(funcName)!.push(range);
    }

    // Build outgoing calls
    const results: CallHierarchyOutgoingCall[] = [];

    // Find function definitions for each call
    const allFunctions = new Map<string, { func: FunctionInfo; uri: string }>();

    // Functions in current file
    for (const func of functions) {
        allFunctions.set(func.name, { func, uri: document.uri });
    }

    // Functions in other files
    const kiteFiles = ctx.findKiteFilesInWorkspace();
    for (const filePath of kiteFiles) {
        const content = ctx.getFileContent(filePath);
        if (!content) continue;

        const fileUri = URI.file(filePath).toString();
        const fileFuncs = extractFunctions(content);
        for (const func of fileFuncs) {
            if (!allFunctions.has(func.name)) {
                allFunctions.set(func.name, { func, uri: fileUri });
            }
        }
    }

    // Create outgoing call items
    for (const [funcName, ranges] of callMap) {
        const target = allFunctions.get(funcName);
        if (target) {
            results.push({
                to: createCallHierarchyItem(target.func, target.uri),
                fromRanges: ranges,
            });
        }
    }

    return results;
}

/**
 * Find all calls to a function and group by calling function
 */
function findCallsToFunction(
    text: string,
    targetName: string,
    fileUri: string
): CallHierarchyIncomingCall[] {
    const functions = extractFunctions(text);
    const results: CallHierarchyIncomingCall[] = [];
    const lines = text.split('\n');

    for (const func of functions) {
        // Get function body text
        const bodyText = extractFunctionBody(lines, func);
        if (!bodyText) continue;

        // Find calls to target in this function's body
        const callRanges: Range[] = [];
        const callRegex = new RegExp(`\\b${escapeRegex(targetName)}\\s*\\(`, 'g');
        let match;

        while ((match = callRegex.exec(bodyText.text)) !== null) {
            const callOffset = match.index;
            const lineInBody = bodyText.text.substring(0, callOffset).split('\n').length - 1;
            const lineStart = bodyText.text.lastIndexOf('\n', callOffset) + 1;
            const column = callOffset - lineStart + bodyText.columnOffset;

            const absoluteLine = bodyText.startLine + lineInBody;

            callRanges.push(Range.create(
                Position.create(absoluteLine, column),
                Position.create(absoluteLine, column + targetName.length)
            ));
        }

        if (callRanges.length > 0) {
            results.push({
                from: createCallHierarchyItem(func, fileUri),
                fromRanges: callRanges,
            });
        }
    }

    return results;
}

/**
 * Body extraction result
 */
interface BodyText {
    text: string;
    startLine: number;
    columnOffset: number;
}

/**
 * Extract function body content (between { and })
 */
function extractFunctionBody(lines: string[], func: FunctionInfo): BodyText | null {
    if (func.startLine === func.endLine) {
        // Single-line function: extract content between { and }
        const line = lines[func.startLine];
        const openBrace = line.indexOf('{');
        const closeBrace = line.lastIndexOf('}');
        if (openBrace === -1 || closeBrace === -1 || closeBrace <= openBrace) return null;

        return {
            text: line.substring(openBrace + 1, closeBrace),
            startLine: func.startLine,
            columnOffset: openBrace + 1,
        };
    } else {
        // Multi-line function: extract lines between { and }
        const bodyLines = lines.slice(func.bodyStartLine, func.endLine);
        return {
            text: bodyLines.join('\n'),
            startLine: func.bodyStartLine,
            columnOffset: 0,
        };
    }
}

/**
 * Extract all function definitions from source
 */
function extractFunctions(text: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^\s*fun\s+(\w+)\s*\(([^)]*)\)(?:\s+(\w+))?\s*\{?/);

        if (match) {
            const name = match[1];
            const params = match[2] || '';
            const returnType = match[3] || '';
            const nameStart = line.indexOf(name);

            // Find closing brace
            let braceCount = 0;
            let endLine = i;
            let foundOpen = false;

            for (let j = i; j < lines.length; j++) {
                const scanLine = lines[j];
                for (const char of scanLine) {
                    if (char === '{') {
                        braceCount++;
                        foundOpen = true;
                    } else if (char === '}') {
                        braceCount--;
                        if (foundOpen && braceCount === 0) {
                            endLine = j;
                            break;
                        }
                    }
                }
                if (foundOpen && braceCount === 0) break;
            }

            // Body starts after the opening brace
            let bodyStartLine = i;
            if (line.includes('{')) {
                // For single-line functions, body is on same line
                if (endLine === i) {
                    bodyStartLine = i;
                } else {
                    bodyStartLine = i + 1;
                }
            } else {
                // Find line with opening brace
                for (let j = i; j <= endLine; j++) {
                    if (lines[j].includes('{')) {
                        bodyStartLine = (endLine === j) ? j : j + 1;
                        break;
                    }
                }
            }

            functions.push({
                name,
                params,
                returnType,
                startLine: i,
                endLine,
                bodyStartLine,
                nameStart,
                nameLength: name.length,
            });
        }
    }

    return functions;
}

/**
 * Create a CallHierarchyItem from function info
 */
function createCallHierarchyItem(func: FunctionInfo, uri: string): CallHierarchyItem {
    const detail = func.returnType
        ? `(${func.params}) ${func.returnType}`
        : `(${func.params})`;

    return {
        name: func.name,
        kind: SymbolKind.Function,
        uri,
        range: Range.create(
            Position.create(func.startLine, 0),
            Position.create(func.endLine, 0)
        ),
        selectionRange: Range.create(
            Position.create(func.startLine, func.nameStart),
            Position.create(func.startLine, func.nameStart + func.nameLength)
        ),
        detail,
    };
}

/**
 * Get word at offset
 */
function getWordAtOffset(text: string, offset: number): string | null {
    const before = text.substring(0, offset);
    const after = text.substring(offset);

    const beforeMatch = before.match(/[a-zA-Z_]\w*$/);
    const afterMatch = after.match(/^\w*/);

    if (!beforeMatch && !afterMatch) return null;

    return (beforeMatch?.[0] || '') + (afterMatch?.[0] || '');
}

/**
 * Get character offset of line start
 */
function lineOffset(text: string, line: number): number {
    const lines = text.split('\n');
    let offset = 0;
    for (let i = 0; i < line && i < lines.length; i++) {
        offset += lines[i].length + 1; // +1 for newline
    }
    return offset;
}

/**
 * Check if name is a keyword
 */
function isKeyword(name: string): boolean {
    const keywords = [
        'if', 'else', 'for', 'while', 'in', 'return',
        'var', 'fun', 'schema', 'component', 'resource',
        'input', 'output', 'type', 'import', 'from',
        'true', 'false', 'null', 'init', 'this'
    ];
    return keywords.includes(name);
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
