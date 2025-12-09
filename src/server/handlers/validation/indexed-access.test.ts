/**
 * Tests for indexed access validation.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkIndexedAccess } from './indexed-access';
import { Declaration, IndexedResourceInfo } from '../../types';

function createDocument(content: string): TextDocument {
    return TextDocument.create('file:///test.kite', 'kite', 1, content);
}

function createMockDeclaration(
    name: string,
    indexedBy?: IndexedResourceInfo
): Declaration {
    return {
        name,
        type: 'resource',
        uri: 'file:///test.kite',
        range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 },
        },
        nameRange: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: name.length },
        },
        indexedBy,
    };
}

describe('checkIndexedAccess', () => {
    describe('non-indexed resources', () => {
        it('should report error when using index on non-indexed resource', () => {
            const doc = createDocument(`
var x = server[0]
`);
            const declarations: Declaration[] = [
                createMockDeclaration('server'),
            ];
            const diagnostics = checkIndexedAccess(doc, declarations);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('not an indexed resource');
        });
    });

    describe('type mismatch', () => {
        it('should report error when using numeric index on string-indexed resource', () => {
            const doc = createDocument(`
var x = data[0]
`);
            const declarations: Declaration[] = [
                createMockDeclaration('data', {
                    indexType: 'string',
                    stringKeys: ['dev', 'prod'],
                }),
            ];
            const diagnostics = checkIndexedAccess(doc, declarations);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('string keys');
        });

        it('should report error when using string key on numeric-indexed resource', () => {
            const doc = createDocument(`
var x = server["dev"]
`);
            const declarations: Declaration[] = [
                createMockDeclaration('server', {
                    indexType: 'numeric',
                    countValue: 3,
                }),
            ];
            const diagnostics = checkIndexedAccess(doc, declarations);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('numeric indices');
        });
    });

    describe('out of bounds', () => {
        it('should report error when numeric index is out of bounds (count)', () => {
            const doc = createDocument(`
var x = server[5]
`);
            const declarations: Declaration[] = [
                createMockDeclaration('server', {
                    indexType: 'numeric',
                    countValue: 3,
                }),
            ];
            const diagnostics = checkIndexedAccess(doc, declarations);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('out of bounds');
        });

        it('should report error when numeric index is out of range bounds', () => {
            const doc = createDocument(`
var x = server[10]
`);
            const declarations: Declaration[] = [
                createMockDeclaration('server', {
                    indexType: 'numeric',
                    rangeStart: 0,
                    rangeEnd: 5,
                }),
            ];
            const diagnostics = checkIndexedAccess(doc, declarations);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('out of bounds');
        });
    });

    describe('invalid string keys', () => {
        it('should report error when string key is not in allowed list', () => {
            const doc = createDocument(`
var x = data["unknown"]
`);
            const declarations: Declaration[] = [
                createMockDeclaration('data', {
                    indexType: 'string',
                    stringKeys: ['dev', 'prod'],
                }),
            ];
            const diagnostics = checkIndexedAccess(doc, declarations);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('not valid');
        });
    });

    describe('valid access', () => {
        it('should not report error for valid numeric access', () => {
            const doc = createDocument(`
var x = server[1]
`);
            const declarations: Declaration[] = [
                createMockDeclaration('server', {
                    indexType: 'numeric',
                    countValue: 3,
                }),
            ];
            const diagnostics = checkIndexedAccess(doc, declarations);
            expect(diagnostics).toHaveLength(0);
        });

        it('should not report error for valid string access', () => {
            const doc = createDocument(`
var x = data["dev"]
`);
            const declarations: Declaration[] = [
                createMockDeclaration('data', {
                    indexType: 'string',
                    stringKeys: ['dev', 'prod'],
                }),
            ];
            const diagnostics = checkIndexedAccess(doc, declarations);
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('edge cases', () => {
        it('should ignore indexed access inside comments', () => {
            const doc = createDocument(`
// var x = server[10]
`);
            const declarations: Declaration[] = [
                createMockDeclaration('server', {
                    indexType: 'numeric',
                    countValue: 3,
                }),
            ];
            const diagnostics = checkIndexedAccess(doc, declarations);
            expect(diagnostics).toHaveLength(0);
        });

        it('should ignore indexed access inside strings', () => {
            const doc = createDocument(`
var x = "server[10]"
`);
            const declarations: Declaration[] = [
                createMockDeclaration('server', {
                    indexType: 'numeric',
                    countValue: 3,
                }),
            ];
            const diagnostics = checkIndexedAccess(doc, declarations);
            expect(diagnostics).toHaveLength(0);
        });

        it('should ignore unknown identifiers', () => {
            const doc = createDocument(`
var x = unknown[0]
`);
            const declarations: Declaration[] = [];
            const diagnostics = checkIndexedAccess(doc, declarations);
            expect(diagnostics).toHaveLength(0);
        });
    });
});
