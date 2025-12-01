/**
 * Tests for Sort Imports code action
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { sortImports, createSortImportsAction } from './sort-imports';

function createDocument(content: string, uri = 'file:///workspace/test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

describe('Sort Imports', () => {
    describe('sortImports', () => {
        it('should sort imports alphabetically by path', () => {
            const doc = createDocument(`import * from "zebra.kite"
import * from "apple.kite"
import * from "mango.kite"

schema Config {}`);

            const result = sortImports(doc);

            expect(result).not.toBeNull();
            expect(result!.newText).toBe(`import * from "apple.kite"
import * from "mango.kite"
import * from "zebra.kite"`);
        });

        it('should handle named imports', () => {
            const doc = createDocument(`import Config from "zebra.kite"
import Server from "apple.kite"

schema Test {}`);

            const result = sortImports(doc);

            expect(result).not.toBeNull();
            expect(result!.newText).toBe(`import Server from "apple.kite"
import Config from "zebra.kite"`);
        });

        it('should handle mixed wildcard and named imports', () => {
            const doc = createDocument(`import * from "zebra.kite"
import Config, Server from "apple.kite"
import * from "mango.kite"

schema Test {}`);

            const result = sortImports(doc);

            expect(result).not.toBeNull();
            expect(result!.newText).toBe(`import Config, Server from "apple.kite"
import * from "mango.kite"
import * from "zebra.kite"`);
        });

        it('should return null when imports are already sorted', () => {
            const doc = createDocument(`import * from "apple.kite"
import * from "mango.kite"
import * from "zebra.kite"

schema Config {}`);

            const result = sortImports(doc);

            expect(result).toBeNull();
        });

        it('should return null when there are no imports', () => {
            const doc = createDocument(`schema Config {
    string name
}`);

            const result = sortImports(doc);

            expect(result).toBeNull();
        });

        it('should return null when there is only one import', () => {
            const doc = createDocument(`import * from "config.kite"

schema Config {}`);

            const result = sortImports(doc);

            expect(result).toBeNull();
        });

        it('should handle imports with single quotes', () => {
            const doc = createDocument(`import * from 'zebra.kite'
import * from 'apple.kite'

schema Config {}`);

            const result = sortImports(doc);

            expect(result).not.toBeNull();
            expect(result!.newText).toBe(`import * from 'apple.kite'
import * from 'zebra.kite'`);
        });

        it('should preserve quote style when sorting', () => {
            const doc = createDocument(`import * from "zebra.kite"
import * from 'apple.kite'

schema Config {}`);

            const result = sortImports(doc);

            expect(result).not.toBeNull();
            // Each import preserves its original quote style
            expect(result!.newText).toContain(`'apple.kite'`);
            expect(result!.newText).toContain(`"zebra.kite"`);
        });

        it('should handle package-style imports', () => {
            const doc = createDocument(`import * from "aws.s3.Bucket"
import * from "aws.ec2.Instance"
import * from "common.kite"

schema Config {}`);

            const result = sortImports(doc);

            expect(result).not.toBeNull();
            expect(result!.newText).toBe(`import * from "aws.ec2.Instance"
import * from "aws.s3.Bucket"
import * from "common.kite"`);
        });

        it('should handle imports with relative paths', () => {
            const doc = createDocument(`import * from "../utils/helpers.kite"
import * from "./config.kite"
import * from "../../common.kite"

schema Config {}`);

            const result = sortImports(doc);

            expect(result).not.toBeNull();
            // Sort alphabetically by path
            expect(result!.newText).toBe(`import * from "../../common.kite"
import * from "../utils/helpers.kite"
import * from "./config.kite"`);
        });

        it('should handle non-contiguous imports by sorting all of them', () => {
            const doc = createDocument(`import * from "zebra.kite"

// Comment between imports

import * from "apple.kite"

schema Config {}`);

            const result = sortImports(doc);

            // Should consolidate and sort all imports at the beginning
            expect(result).not.toBeNull();
        });

        it('should provide correct range for replacement', () => {
            const doc = createDocument(`import * from "zebra.kite"
import * from "apple.kite"

schema Config {}`);

            const result = sortImports(doc);

            expect(result).not.toBeNull();
            expect(result!.range.start.line).toBe(0);
            expect(result!.range.start.character).toBe(0);
            expect(result!.range.end.line).toBe(1);
        });
    });

    describe('createSortImportsAction', () => {
        it('should create a code action when imports need sorting', () => {
            const doc = createDocument(`import * from "zebra.kite"
import * from "apple.kite"

schema Config {}`);

            const action = createSortImportsAction(doc);

            expect(action).not.toBeNull();
            expect(action!.title).toBe('Sort imports');
            expect(action!.kind).toBe('source.organizeImports');
        });

        it('should return null when imports are already sorted', () => {
            const doc = createDocument(`import * from "apple.kite"
import * from "zebra.kite"

schema Config {}`);

            const action = createSortImportsAction(doc);

            expect(action).toBeNull();
        });

        it('should return null when there are no imports', () => {
            const doc = createDocument(`schema Config {}`);

            const action = createSortImportsAction(doc);

            expect(action).toBeNull();
        });
    });

    describe('Edge cases', () => {
        it('should handle empty document', () => {
            const doc = createDocument('');

            const result = sortImports(doc);

            expect(result).toBeNull();
        });

        it('should handle document with only whitespace', () => {
            const doc = createDocument('   \n\n   ');

            const result = sortImports(doc);

            expect(result).toBeNull();
        });

        it('should handle imports at end of file without newline', () => {
            const doc = createDocument(`import * from "zebra.kite"
import * from "apple.kite"`);

            const result = sortImports(doc);

            expect(result).not.toBeNull();
            expect(result!.newText).toBe(`import * from "apple.kite"
import * from "zebra.kite"`);
        });

        it('should handle case-insensitive sorting', () => {
            const doc = createDocument(`import * from "Zebra.kite"
import * from "apple.kite"
import * from "Mango.kite"

schema Config {}`);

            const result = sortImports(doc);

            expect(result).not.toBeNull();
            // Case-insensitive sort
            expect(result!.newText).toBe(`import * from "apple.kite"
import * from "Mango.kite"
import * from "Zebra.kite"`);
        });
    });
});
