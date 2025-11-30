/**
 * Property definition lookup for schemas and components.
 * Handles finding property definitions within schema/component bodies.
 */

import { Location, Range, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { escapeRegex } from '../../utils/rename-utils';
import { findMatchingBrace } from '../../utils/text-utils';
import {
    parseKite,
    findSchemaPropertyAST,
    findComponentInputAST,
} from '../../../parser';
import { findPropertyInRange } from './utils';

/**
 * Find schema property location in text using AST parsing.
 */
export function findSchemaPropertyLocation(
    text: string,
    schemaName: string,
    propertyName: string,
    filePathOrUri: string
): Location | null {
    const uri = filePathOrUri.startsWith('file://') ? filePathOrUri : URI.file(filePathOrUri).toString();
    const result = parseKite(text);
    if (!result.tree) return null;

    const propLoc = findSchemaPropertyAST(result.tree, schemaName, propertyName);
    if (!propLoc) return null;

    return Location.create(uri, Range.create(
        Position.create(propLoc.line, propLoc.column),
        Position.create(propLoc.line, propLoc.column + propertyName.length)
    ));
}

/**
 * Find component input location in text using AST parsing.
 */
export function findComponentInputLocation(
    text: string,
    componentTypeName: string,
    inputName: string,
    filePathOrUri: string
): Location | null {
    const uri = filePathOrUri.startsWith('file://') ? filePathOrUri : URI.file(filePathOrUri).toString();
    const result = parseKite(text);
    if (!result.tree) return null;

    const inputLoc = findComponentInputAST(result.tree, componentTypeName, inputName);
    if (!inputLoc) return null;

    return Location.create(uri, Range.create(
        Position.create(inputLoc.line, inputLoc.column),
        Position.create(inputLoc.line, inputLoc.column + inputName.length)
    ));
}

/**
 * Find a property definition following a property chain (e.g., server.tag.New.a).
 * Navigates through nested object structures to find the final property.
 */
export function findPropertyInChain(
    document: TextDocument,
    text: string,
    chain: string[]
): Location | null {
    if (chain.length < 2) return null;

    const declarationName = chain[0];
    const propertyPath = chain.slice(1); // ['tag', 'New', 'a']

    // Find the declaration (resource or component) with this name
    const declRegex = new RegExp(`\\b(?:resource|component)\\s+\\w+(?:\\.\\w+)*\\s+${escapeRegex(declarationName)}\\s*\\{`, 'g');
    const declMatch = declRegex.exec(text);

    if (!declMatch) return null;

    // Start searching from the declaration body
    let searchStart = declMatch.index + declMatch[0].length;
    let searchEnd = findMatchingBrace(text, searchStart - 1);

    // Navigate through the property path
    for (let i = 0; i < propertyPath.length; i++) {
        const propName = propertyPath[i];
        const isLast = i === propertyPath.length - 1;

        const result = findPropertyInRange(document, text, searchStart, searchEnd, propName);

        if (!result) return null;

        if (isLast) {
            return result.location;
        } else {
            if (result.valueStart !== undefined && result.valueEnd !== undefined) {
                searchStart = result.valueStart;
                searchEnd = result.valueEnd;
            } else {
                return null;
            }
        }
    }

    return null;
}
