/**
 * Tests for type checking functionality.
 */

import { describe, it, expect } from 'vitest';
import { createDocument } from '../../test-utils';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { checkTypeMismatches, inferValueType, isTypeCompatible } from './type-checking';


describe('inferValueType', () => {
    it('should infer string type from double-quoted string', () => {
        expect(inferValueType('"hello"')).toBe('string');
    });

    it('should infer string type from single-quoted string', () => {
        expect(inferValueType("'hello'")).toBe('string');
    });

    it('should infer number type from integer', () => {
        expect(inferValueType('123')).toBe('number');
    });

    it('should infer number type from decimal', () => {
        expect(inferValueType('3.14')).toBe('number');
    });

    it('should infer number type from negative number', () => {
        expect(inferValueType('-42')).toBe('number');
    });

    it('should infer boolean type from true', () => {
        expect(inferValueType('true')).toBe('boolean');
    });

    it('should infer boolean type from false', () => {
        expect(inferValueType('false')).toBe('boolean');
    });

    it('should infer null type', () => {
        expect(inferValueType('null')).toBe('null');
    });

    it('should infer object type from object literal', () => {
        expect(inferValueType('{ key: "value" }')).toBe('object');
    });

    it('should infer array type from array literal', () => {
        expect(inferValueType('[1, 2, 3]')).toBe('array');
    });

    it('should return null for identifier references', () => {
        expect(inferValueType('someVariable')).toBeNull();
    });
});

describe('isTypeCompatible', () => {
    it('should return true for exact type match', () => {
        expect(isTypeCompatible('string', 'string')).toBe(true);
        expect(isTypeCompatible('number', 'number')).toBe(true);
        expect(isTypeCompatible('boolean', 'boolean')).toBe(true);
    });

    it('should return true when declared type is any', () => {
        expect(isTypeCompatible('any', 'string')).toBe(true);
        expect(isTypeCompatible('any', 'number')).toBe(true);
        expect(isTypeCompatible('any', 'boolean')).toBe(true);
        expect(isTypeCompatible('any', 'object')).toBe(true);
    });

    it('should return true for array type with array value', () => {
        expect(isTypeCompatible('string[]', 'array')).toBe(true);
        expect(isTypeCompatible('number[]', 'array')).toBe(true);
    });

    it('should return true for null with any type', () => {
        expect(isTypeCompatible('string', 'null')).toBe(true);
        expect(isTypeCompatible('number', 'null')).toBe(true);
    });

    it('should return false for type mismatches', () => {
        expect(isTypeCompatible('string', 'number')).toBe(false);
        expect(isTypeCompatible('number', 'string')).toBe(false);
        expect(isTypeCompatible('boolean', 'string')).toBe(false);
    });

    it('should be case insensitive', () => {
        expect(isTypeCompatible('String', 'string')).toBe(true);
        expect(isTypeCompatible('NUMBER', 'number')).toBe(true);
    });
});

describe('checkTypeMismatches', () => {
    describe('variable declarations', () => {
        it('should report error for string variable with number value', () => {
            const doc = createDocument('var string name = 123');
            const diagnostics = checkTypeMismatches(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Error);
            expect(diagnostics[0].message).toContain('string');
            expect(diagnostics[0].message).toContain('number');
        });

        it('should report error for number variable with string value', () => {
            const doc = createDocument('var number port = "8080"');
            const diagnostics = checkTypeMismatches(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('number');
            expect(diagnostics[0].message).toContain('string');
        });

        it('should report error for boolean variable with string value', () => {
            const doc = createDocument('var boolean enabled = "true"');
            const diagnostics = checkTypeMismatches(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('boolean');
            expect(diagnostics[0].message).toContain('string');
        });

        it('should not report error for matching types', () => {
            const doc = createDocument(`
var string name = "John"
var number port = 8080
var boolean enabled = true
`);
            const diagnostics = checkTypeMismatches(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should not report error for inferred types (no explicit type)', () => {
            const doc = createDocument('var name = "John"');
            const diagnostics = checkTypeMismatches(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should not report error for any type', () => {
            const doc = createDocument('var any data = 123');
            const diagnostics = checkTypeMismatches(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should not report error for array type with array value', () => {
            const doc = createDocument('var string[] tags = ["a", "b"]');
            const diagnostics = checkTypeMismatches(doc);
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('input declarations', () => {
        it('should report error for input with mismatched type', () => {
            const doc = createDocument('input string port = 8080');
            const diagnostics = checkTypeMismatches(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('string');
            expect(diagnostics[0].message).toContain('number');
        });

        it('should not report error for matching input types', () => {
            const doc = createDocument(`
input string name = "default"
input number replicas = 3
`);
            const diagnostics = checkTypeMismatches(doc);
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('output declarations', () => {
        it('should report error for output with mismatched type', () => {
            const doc = createDocument('output number endpoint = "http://localhost"');
            const diagnostics = checkTypeMismatches(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('number');
            expect(diagnostics[0].message).toContain('string');
        });

        it('should not report error for matching output types', () => {
            const doc = createDocument('output string endpoint = "http://localhost"');
            const diagnostics = checkTypeMismatches(doc);
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('resource property type checking', () => {
        it('should report error for resource property type mismatch', () => {
            const doc = createDocument(`
schema Config {
    string host
    number port
}

resource Config server {
    host = 123
    port = 8080
}
`);
            const diagnostics = checkTypeMismatches(doc);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('host');
            expect(diagnostics[0].message).toContain('string');
            expect(diagnostics[0].message).toContain('number');
        });

        it('should report multiple errors for multiple mismatches', () => {
            const doc = createDocument(`
schema Config {
    string host
    number port
}

resource Config server {
    host = 123
    port = "8080"
}
`);
            const diagnostics = checkTypeMismatches(doc);
            expect(diagnostics).toHaveLength(2);
        });

        it('should not report error for matching resource properties', () => {
            const doc = createDocument(`
schema Config {
    string host
    number port
}

resource Config server {
    host = "localhost"
    port = 8080
}
`);
            const diagnostics = checkTypeMismatches(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should handle array types in schema', () => {
            const doc = createDocument(`
schema Config {
    string[] tags
}

resource Config server {
    tags = ["a", "b"]
}
`);
            const diagnostics = checkTypeMismatches(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should handle any type in schema', () => {
            const doc = createDocument(`
schema Config {
    any metadata
}

resource Config server {
    metadata = { key: "value" }
}
`);
            const diagnostics = checkTypeMismatches(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should handle object type in schema', () => {
            const doc = createDocument(`
schema Config {
    object settings
}

resource Config server {
    settings = { key: "value" }
}
`);
            const diagnostics = checkTypeMismatches(doc);
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('component input/output type checking', () => {
        it('should check types inside component definitions', () => {
            const doc = createDocument(`
component WebServer {
    input string name = 123
    output number url = "http://localhost"
}
`);
            const diagnostics = checkTypeMismatches(doc);
            expect(diagnostics).toHaveLength(2);
        });
    });

    describe('edge cases', () => {
        it('should not report error for identifier references', () => {
            const doc = createDocument(`
var string name = otherVariable
`);
            const diagnostics = checkTypeMismatches(doc);
            // Can't type-check references to other variables without full resolution
            expect(diagnostics).toHaveLength(0);
        });

        it('should handle empty document', () => {
            const doc = createDocument('');
            const diagnostics = checkTypeMismatches(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should handle comments', () => {
            const doc = createDocument(`
// var string x = 123
/* var number y = "hello" */
`);
            const diagnostics = checkTypeMismatches(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should not check values inside strings', () => {
            const doc = createDocument('var string x = "var number y = 123"');
            const diagnostics = checkTypeMismatches(doc);
            expect(diagnostics).toHaveLength(0);
        });
    });
});
