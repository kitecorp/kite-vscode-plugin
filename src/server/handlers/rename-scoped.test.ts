/**
 * Tests for scoped rename operations (loop variables, local scope).
 */

import { describe, it, expect } from 'vitest';
import { Position } from 'vscode-languageserver/node';
import { handleRename } from './rename';
import { createDocument, createContext, applyEdits } from './rename-test-utils';

describe('handleRename - scoped loop variables', () => {
    it('should only rename loop variable within its scope (for-resource)', () => {
        const content = `[for env in environments]
resource S3.Bucket data {
    name = "data-\${env}"
    versioning = true
}

var env = "production"`;
        const doc = createDocument(content);
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        // Rename 'env' from the for loop declaration
        const result = handleRename(doc, Position.create(0, 5), 'environment', ctx);

        expect(result).not.toBeNull();
        const edits = result?.changes?.['file:///test.kite'];
        expect(edits).toBeDefined();

        // Should only have 2 edits: the declaration and the reference in ${env}
        // Should NOT rename the 'var env' on the last line
        expect(edits!.length).toBe(2);

        const newContent = applyEdits(content, edits!);
        expect(newContent).toContain('for environment in');
        expect(newContent).toContain('${environment}');
        expect(newContent).toContain('var env = "production"'); // Should NOT be renamed
    });

    it('should only rename loop variable within resource body', () => {
        const content = `var env = "global"

[for env in envs]
resource Config settings {
    environment = env
}

var x = env`;
        const doc = createDocument(content);
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        // Rename 'env' from inside the resource (line 4)
        const result = handleRename(doc, Position.create(4, 18), 'e', ctx);

        expect(result).not.toBeNull();
        const edits = result?.changes?.['file:///test.kite'];
        expect(edits).toBeDefined();

        // Should only rename within the loop scope
        expect(edits!.length).toBe(2);

        const newContent = applyEdits(content, edits!);
        expect(newContent).toContain('for e in envs');
        expect(newContent).toContain('environment = e');
        expect(newContent).toContain('var env = "global"'); // Should NOT be renamed
        expect(newContent).toContain('var x = env'); // Should NOT be renamed
    });

    it('should rename loop variable in list comprehension scope', () => {
        const content = `var filtered = [for x in items: if x > 10 { x }]
var x = 5`;
        const doc = createDocument(content);
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        // Rename 'x' from within the list comprehension
        const result = handleRename(doc, Position.create(0, 35), 'item', ctx);

        expect(result).not.toBeNull();
        const edits = result?.changes?.['file:///test.kite'];
        expect(edits).toBeDefined();

        // Should rename all 'x' within the comprehension but not outside
        expect(edits!.length).toBe(3); // for x, if x, { x }

        const newContent = applyEdits(content, edits!);
        expect(newContent).toContain('for item in items');
        expect(newContent).toContain('if item > 10');
        expect(newContent).toContain('{ item }');
        expect(newContent).toContain('var x = 5'); // Should NOT be renamed
    });

    it('should handle multiple loop variables with same name in different scopes', () => {
        const content = `[for item in list1]
resource A first {
    value = item
}

[for item in list2]
resource B second {
    value = item
}`;
        const doc = createDocument(content);
        const ctx = createContext({
            documents: { 'file:///test.kite': doc },
        });

        // Rename 'item' from the first loop
        const result = handleRename(doc, Position.create(0, 5), 'x', ctx);

        expect(result).not.toBeNull();
        const edits = result?.changes?.['file:///test.kite'];
        expect(edits).toBeDefined();

        // Should only rename in the first loop scope
        expect(edits!.length).toBe(2);

        const newContent = applyEdits(content, edits!);
        expect(newContent).toContain('for x in list1');
        expect(newContent).toContain('value = x');
        expect(newContent).toContain('for item in list2'); // Should NOT be renamed
        expect(newContent).toContain('value = item'); // Should NOT be renamed (second loop)
    });
});
