/**
 * Property reference finding for schemas and components.
 * Handles finding property usages across instantiations.
 */

import { Location, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import {
    findComponentInstantiations,
    findResourceInstantiations,
    findPropertyAssignments,
    findPropertyAccess,
} from '../../utils/rename-utils';
import { offsetToPosition } from '../../utils/text-utils';
import { ReferencesContext } from './types';

/**
 * Find property assignments and property access references in component instantiations.
 */
export function findComponentPropertyReferences(
    componentTypeName: string,
    propertyName: string,
    currentDocUri: string,
    ctx: ReferencesContext
): Location[] {
    const locations: Location[] = [];
    const currentFilePath = URI.parse(currentDocUri).fsPath;

    const kiteFiles = ctx.findKiteFilesInWorkspace();

    for (const filePath of kiteFiles) {
        const fileContent = ctx.getFileContent(filePath, currentDocUri);
        if (!fileContent) continue;

        const fileUri = filePath === currentFilePath ? currentDocUri : URI.file(filePath).toString();
        const doc = ctx.getDocument(fileUri);

        // Find all instantiations using utility function
        const instantiations = findComponentInstantiations(fileContent, componentTypeName);

        for (const inst of instantiations) {
            // Find property assignments using utility function
            const assignments = findPropertyAssignments(fileContent, inst.bodyStart, inst.bodyEnd, propertyName);
            for (const assign of assignments) {
                const startPos = doc
                    ? doc.positionAt(assign.startOffset)
                    : offsetToPosition(fileContent, assign.startOffset);
                const endPos = doc
                    ? doc.positionAt(assign.endOffset)
                    : offsetToPosition(fileContent, assign.endOffset);
                locations.push(Location.create(fileUri, Range.create(startPos, endPos)));
            }

            // Find property access using utility function
            const accesses = findPropertyAccess(fileContent, inst.instanceName, propertyName);
            for (const access of accesses) {
                const startPos = doc
                    ? doc.positionAt(access.startOffset)
                    : offsetToPosition(fileContent, access.startOffset);
                const endPos = doc
                    ? doc.positionAt(access.endOffset)
                    : offsetToPosition(fileContent, access.endOffset);
                locations.push(Location.create(fileUri, Range.create(startPos, endPos)));
            }
        }
    }

    return locations;
}

/**
 * Find property assignments and property access in resource instantiations for a schema.
 */
export function findSchemaPropertyReferences(
    schemaName: string,
    propertyName: string,
    currentDocUri: string,
    ctx: ReferencesContext
): Location[] {
    const locations: Location[] = [];
    const currentFilePath = URI.parse(currentDocUri).fsPath;
    const kiteFiles = ctx.findKiteFilesInWorkspace();

    for (const filePath of kiteFiles) {
        const fileContent = ctx.getFileContent(filePath, currentDocUri);
        if (!fileContent) continue;

        const fileUri = filePath === currentFilePath ? currentDocUri : URI.file(filePath).toString();
        const doc = ctx.getDocument(fileUri);

        // Use utility to find all resource instantiations of this schema type
        const resources = findResourceInstantiations(fileContent, schemaName);

        for (const res of resources) {
            // Find property assignments using utility
            const assignments = findPropertyAssignments(fileContent, res.bodyStart, res.bodyEnd, propertyName);
            for (const assign of assignments) {
                const startPos = doc
                    ? doc.positionAt(assign.startOffset)
                    : offsetToPosition(fileContent, assign.startOffset);
                const endPos = doc
                    ? doc.positionAt(assign.endOffset)
                    : offsetToPosition(fileContent, assign.endOffset);
                locations.push(Location.create(fileUri, Range.create(startPos, endPos)));
            }

            // Find property access references using utility
            const accesses = findPropertyAccess(fileContent, res.instanceName, propertyName);
            for (const access of accesses) {
                const startPos = doc
                    ? doc.positionAt(access.startOffset)
                    : offsetToPosition(fileContent, access.startOffset);
                const endPos = doc
                    ? doc.positionAt(access.endOffset)
                    : offsetToPosition(fileContent, access.endOffset);
                locations.push(Location.create(fileUri, Range.create(startPos, endPos)));
            }
        }
    }

    return locations;
}
