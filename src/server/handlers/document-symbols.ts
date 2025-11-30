/**
 * Document Symbol handler for the Kite language server.
 * Provides outline view for the editor.
 */

import {
    DocumentSymbol,
    SymbolKind,
    Range,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Handle document symbol request - provides outline view
 */
export function handleDocumentSymbol(document: TextDocument): DocumentSymbol[] {
    const text = document.getText();
    const symbols: DocumentSymbol[] = [];

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

    // Find schemas: schema Name {
    const schemaRegex = /\bschema\s+(\w+)\s*\{/g;
    let match;
    while ((match = schemaRegex.exec(text)) !== null) {
        const name = match[1];
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].indexOf(name));
        const nameEnd = document.positionAt(match.index + match[0].indexOf(name) + name.length);

        // Find the closing brace
        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        const endPos = document.positionAt(pos);

        // Find properties inside schema
        const bodyText = text.substring(braceStart + 1, pos - 1);
        const bodyOffset = braceStart + 1;
        const children: DocumentSymbol[] = [];

        const propRegex = /^\s*(\w+(?:\[\])?)\s+(\w+)/gm;
        let propMatch;
        while ((propMatch = propRegex.exec(bodyText)) !== null) {
            const propType = propMatch[1];
            const propName = propMatch[2];
            const propStart = document.positionAt(bodyOffset + propMatch.index);
            const propNameStart = document.positionAt(bodyOffset + propMatch.index + propMatch[0].indexOf(propName));
            const propNameEnd = document.positionAt(bodyOffset + propMatch.index + propMatch[0].indexOf(propName) + propName.length);
            const propEnd = propNameEnd;

            children.push(createSymbol(
                propName,
                SymbolKind.Property,
                Range.create(propStart, propEnd),
                Range.create(propNameStart, propNameEnd),
                propType
            ));
        }

        symbols.push(createSymbol(
            name,
            SymbolKind.Struct,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            'schema',
            children.length > 0 ? children : undefined
        ));
    }

    // Find component definitions: component TypeName { (without instance name)
    const compDefRegex = /\bcomponent\s+(\w+)\s*\{/g;
    while ((match = compDefRegex.exec(text)) !== null) {
        // Check if definition (not instance)
        const betweenKeywordAndBrace = text.substring(match.index + 10, match.index + match[0].length - 1).trim();
        const parts = betweenKeywordAndBrace.split(/\s+/).filter(s => s);
        if (parts.length !== 1) continue; // Instance, skip

        const name = match[1];
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].indexOf(name));
        const nameEnd = document.positionAt(match.index + match[0].indexOf(name) + name.length);

        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        const endPos = document.positionAt(pos);

        // Find inputs/outputs inside component
        const bodyText = text.substring(braceStart + 1, pos - 1);
        const bodyOffset = braceStart + 1;
        const children: DocumentSymbol[] = [];

        const ioRegex = /\b(input|output)\s+(\w+(?:\[\])?)\s+(\w+)/g;
        let ioMatch;
        while ((ioMatch = ioRegex.exec(bodyText)) !== null) {
            const ioKind = ioMatch[1];
            const ioType = ioMatch[2];
            const ioName = ioMatch[3];
            const ioStart = document.positionAt(bodyOffset + ioMatch.index);
            const ioNameStart = document.positionAt(bodyOffset + ioMatch.index + ioMatch[0].lastIndexOf(ioName));
            const ioNameEnd = document.positionAt(bodyOffset + ioMatch.index + ioMatch[0].lastIndexOf(ioName) + ioName.length);

            children.push(createSymbol(
                ioName,
                ioKind === 'input' ? SymbolKind.Property : SymbolKind.Event,
                Range.create(ioStart, ioNameEnd),
                Range.create(ioNameStart, ioNameEnd),
                `${ioKind}: ${ioType}`
            ));
        }

        symbols.push(createSymbol(
            name,
            SymbolKind.Class,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            'component',
            children.length > 0 ? children : undefined
        ));
    }

    // Find resources: resource SchemaName instanceName {
    const resourceRegex = /\bresource\s+([\w.]+)\s+(\w+)\s*\{/g;
    while ((match = resourceRegex.exec(text)) !== null) {
        const schemaName = match[1];
        const instanceName = match[2];
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].lastIndexOf(instanceName));
        const nameEnd = document.positionAt(match.index + match[0].lastIndexOf(instanceName) + instanceName.length);

        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        const endPos = document.positionAt(pos);

        symbols.push(createSymbol(
            instanceName,
            SymbolKind.Object,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            `resource: ${schemaName}`
        ));
    }

    // Find component instances: component TypeName instanceName {
    const compInstRegex = /\bcomponent\s+(\w+)\s+(\w+)\s*\{/g;
    while ((match = compInstRegex.exec(text)) !== null) {
        const typeName = match[1];
        const instanceName = match[2];
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].lastIndexOf(instanceName));
        const nameEnd = document.positionAt(match.index + match[0].lastIndexOf(instanceName) + instanceName.length);

        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        const endPos = document.positionAt(pos);

        symbols.push(createSymbol(
            instanceName,
            SymbolKind.Object,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            `component: ${typeName}`
        ));
    }

    // Find functions: fun name(params) returnType {
    const funcRegex = /\bfun\s+(\w+)\s*\(([^)]*)\)\s*(\w+)?\s*\{/g;
    while ((match = funcRegex.exec(text)) !== null) {
        const name = match[1];
        const params = match[2];
        const returnType = match[3] || 'void';
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].indexOf(name));
        const nameEnd = document.positionAt(match.index + match[0].indexOf(name) + name.length);

        const braceStart = match.index + match[0].length - 1;
        let braceDepth = 1;
        let pos = braceStart + 1;
        while (pos < text.length && braceDepth > 0) {
            if (text[pos] === '{') braceDepth++;
            else if (text[pos] === '}') braceDepth--;
            pos++;
        }
        const endPos = document.positionAt(pos);

        symbols.push(createSymbol(
            name,
            SymbolKind.Function,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            `(${params}) → ${returnType}`
        ));
    }

    // Find type aliases: type Name = ...
    const typeRegex = /\btype\s+(\w+)\s*=/g;
    while ((match = typeRegex.exec(text)) !== null) {
        const name = match[1];
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].indexOf(name));
        const nameEnd = document.positionAt(match.index + match[0].indexOf(name) + name.length);

        // Find end of line
        let endIdx = text.indexOf('\n', match.index);
        if (endIdx === -1) endIdx = text.length;
        const endPos = document.positionAt(endIdx);

        symbols.push(createSymbol(
            name,
            SymbolKind.TypeParameter,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            'type alias'
        ));
    }

    // Find top-level variables: var [type] name =
    const varRegex = /^var\s+(?:(\w+)\s+)?(\w+)\s*=/gm;
    while ((match = varRegex.exec(text)) !== null) {
        const varType = match[1] || 'any';
        const name = match[2];
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].indexOf(name));
        const nameEnd = document.positionAt(match.index + match[0].indexOf(name) + name.length);

        // Find end of line
        let endIdx = text.indexOf('\n', match.index);
        if (endIdx === -1) endIdx = text.length;
        const endPos = document.positionAt(endIdx);

        symbols.push(createSymbol(
            name,
            SymbolKind.Variable,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            varType
        ));
    }

    // Find inputs (top-level): input type name
    const inputRegex = /^input\s+(\w+(?:\[\])?)\s+(\w+)/gm;
    while ((match = inputRegex.exec(text)) !== null) {
        const inputType = match[1];
        const name = match[2];
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].lastIndexOf(name));
        const nameEnd = document.positionAt(match.index + match[0].lastIndexOf(name) + name.length);

        let endIdx = text.indexOf('\n', match.index);
        if (endIdx === -1) endIdx = text.length;
        const endPos = document.positionAt(endIdx);

        symbols.push(createSymbol(
            name,
            SymbolKind.Property,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            `input: ${inputType}`
        ));
    }

    // Find outputs (top-level): output type name
    const outputRegex = /^output\s+(\w+(?:\[\])?)\s+(\w+)/gm;
    while ((match = outputRegex.exec(text)) !== null) {
        const outputType = match[1];
        const name = match[2];
        const startPos = document.positionAt(match.index);
        const nameStart = document.positionAt(match.index + match[0].lastIndexOf(name));
        const nameEnd = document.positionAt(match.index + match[0].lastIndexOf(name) + name.length);

        let endIdx = text.indexOf('\n', match.index);
        if (endIdx === -1) endIdx = text.length;
        const endPos = document.positionAt(endIdx);

        symbols.push(createSymbol(
            name,
            SymbolKind.Event,
            Range.create(startPos, endPos),
            Range.create(nameStart, nameEnd),
            `output: ${outputType}`
        ));
    }

    return symbols;
}
