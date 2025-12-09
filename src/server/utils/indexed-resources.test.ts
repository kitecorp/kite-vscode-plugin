/**
 * Tests for indexed resources utilities.
 */

import { describe, it, expect } from 'vitest';
import {
    parseIndexedAccess,
    isIndexedResource,
    getIndexCompletions,
    validateIndexedAccess,
    formatIndexedResourceInfo,
    getAccessPatternSuggestion,
} from './indexed-resources';
import { Declaration, IndexedResourceInfo } from '../types';

describe('parseIndexedAccess', () => {
    it('should parse numeric index access', () => {
        const text = 'server[0]';
        const result = parseIndexedAccess(text, 5);
        expect(result).not.toBeNull();
        expect(result?.baseName).toBe('server');
        expect(result?.indexType).toBe('numeric');
        expect(result?.numericIndex).toBe(0);
    });

    it('should parse double-quoted string index access', () => {
        const text = 'data["prod"]';
        const result = parseIndexedAccess(text, 5);
        expect(result).not.toBeNull();
        expect(result?.baseName).toBe('data');
        expect(result?.indexType).toBe('string');
        expect(result?.stringKey).toBe('prod');
    });

    it('should parse single-quoted string index access', () => {
        const text = "data['dev']";
        const result = parseIndexedAccess(text, 5);
        expect(result).not.toBeNull();
        expect(result?.baseName).toBe('data');
        expect(result?.indexType).toBe('string');
        expect(result?.stringKey).toBe('dev');
    });

    it('should return null for non-indexed access', () => {
        const text = 'server.name';
        const result = parseIndexedAccess(text, 5);
        expect(result).toBeNull();
    });

    it('should handle partial match (identifier[)', () => {
        const text = 'server[';
        const result = parseIndexedAccess(text, 7);
        expect(result).not.toBeNull();
        expect(result?.baseName).toBe('server');
    });
});

describe('isIndexedResource', () => {
    it('should return true for indexed declaration', () => {
        const decl: Declaration = createMockDeclaration('server', {
            indexType: 'numeric',
            countValue: 3,
        });
        expect(isIndexedResource(decl)).toBe(true);
    });

    it('should return false for non-indexed declaration', () => {
        const decl: Declaration = createMockDeclaration('server');
        expect(isIndexedResource(decl)).toBe(false);
    });
});

describe('getIndexCompletions', () => {
    it('should return numeric indices for @count resource', () => {
        const decl: Declaration = createMockDeclaration('server', {
            indexType: 'numeric',
            countValue: 3,
        });
        const completions = getIndexCompletions(decl);
        expect(completions).toEqual(['0', '1', '2']);
    });

    it('should return numeric indices for range loop', () => {
        const decl: Declaration = createMockDeclaration('server', {
            indexType: 'numeric',
            rangeStart: 0,
            rangeEnd: 5,
        });
        const completions = getIndexCompletions(decl);
        expect(completions).toEqual(['0', '1', '2', '3', '4']);
    });

    it('should return string keys for array loop', () => {
        const decl: Declaration = createMockDeclaration('data', {
            indexType: 'string',
            stringKeys: ['dev', 'staging', 'prod'],
        });
        const completions = getIndexCompletions(decl);
        expect(completions).toEqual(['"dev"', '"staging"', '"prod"']);
    });

    it('should return default indices for unknown count', () => {
        const decl: Declaration = createMockDeclaration('server', {
            indexType: 'numeric',
        });
        const completions = getIndexCompletions(decl);
        expect(completions).toEqual(['0', '1', '2']);
    });

    it('should return empty for non-indexed resource', () => {
        const decl: Declaration = createMockDeclaration('server');
        const completions = getIndexCompletions(decl);
        expect(completions).toEqual([]);
    });
});

describe('validateIndexedAccess', () => {
    it('should return error for non-indexed resource', () => {
        const decl: Declaration = createMockDeclaration('server');
        const access = {
            baseName: 'server',
            indexType: 'numeric' as const,
            numericIndex: 0,
            fullText: 'server[0]',
        };
        const error = validateIndexedAccess(access, decl);
        expect(error).toContain('not an indexed resource');
    });

    it('should return error for type mismatch (numeric on string-indexed)', () => {
        const decl: Declaration = createMockDeclaration('data', {
            indexType: 'string',
            stringKeys: ['dev', 'prod'],
        });
        const access = {
            baseName: 'data',
            indexType: 'numeric' as const,
            numericIndex: 0,
            fullText: 'data[0]',
        };
        const error = validateIndexedAccess(access, decl);
        expect(error).toContain('string keys');
    });

    it('should return error for type mismatch (string on numeric-indexed)', () => {
        const decl: Declaration = createMockDeclaration('server', {
            indexType: 'numeric',
            countValue: 3,
        });
        const access = {
            baseName: 'server',
            indexType: 'string' as const,
            stringKey: 'dev',
            fullText: 'server["dev"]',
        };
        const error = validateIndexedAccess(access, decl);
        expect(error).toContain('numeric indices');
    });

    it('should return error for out-of-bounds numeric index', () => {
        const decl: Declaration = createMockDeclaration('server', {
            indexType: 'numeric',
            countValue: 3,
        });
        const access = {
            baseName: 'server',
            indexType: 'numeric' as const,
            numericIndex: 5,
            fullText: 'server[5]',
        };
        const error = validateIndexedAccess(access, decl);
        expect(error).toContain('out of bounds');
    });

    it('should return error for invalid string key', () => {
        const decl: Declaration = createMockDeclaration('data', {
            indexType: 'string',
            stringKeys: ['dev', 'prod'],
        });
        const access = {
            baseName: 'data',
            indexType: 'string' as const,
            stringKey: 'unknown',
            fullText: 'data["unknown"]',
        };
        const error = validateIndexedAccess(access, decl);
        expect(error).toContain('not valid');
    });

    it('should return null for valid numeric access', () => {
        const decl: Declaration = createMockDeclaration('server', {
            indexType: 'numeric',
            countValue: 3,
        });
        const access = {
            baseName: 'server',
            indexType: 'numeric' as const,
            numericIndex: 1,
            fullText: 'server[1]',
        };
        const error = validateIndexedAccess(access, decl);
        expect(error).toBeNull();
    });

    it('should return null for valid string access', () => {
        const decl: Declaration = createMockDeclaration('data', {
            indexType: 'string',
            stringKeys: ['dev', 'prod'],
        });
        const access = {
            baseName: 'data',
            indexType: 'string' as const,
            stringKey: 'dev',
            fullText: 'data["dev"]',
        };
        const error = validateIndexedAccess(access, decl);
        expect(error).toBeNull();
    });
});

describe('formatIndexedResourceInfo', () => {
    it('should format @count info', () => {
        const info: IndexedResourceInfo = {
            indexType: 'numeric',
            loopVariable: 'count',
            countValue: 3,
        };
        const formatted = formatIndexedResourceInfo(info);
        expect(formatted).toContain('3 instances');
        expect(formatted).toContain('@count');
    });

    it('should format range loop info', () => {
        const info: IndexedResourceInfo = {
            indexType: 'numeric',
            loopVariable: 'i',
            rangeStart: 0,
            rangeEnd: 5,
        };
        const formatted = formatIndexedResourceInfo(info);
        expect(formatted).toContain('0..4');
        expect(formatted).toContain('for loop');
    });

    it('should format string keys info', () => {
        const info: IndexedResourceInfo = {
            indexType: 'string',
            loopVariable: 'env',
            stringKeys: ['dev', 'prod'],
        };
        const formatted = formatIndexedResourceInfo(info);
        expect(formatted).toContain('"dev"');
        expect(formatted).toContain('"prod"');
    });
});

describe('getAccessPatternSuggestion', () => {
    it('should suggest numeric access pattern', () => {
        const decl: Declaration = createMockDeclaration('server', {
            indexType: 'numeric',
            countValue: 3,
        });
        const suggestion = getAccessPatternSuggestion(decl);
        expect(suggestion).toContain('server[0]');
        expect(suggestion).toContain('server[1]');
    });

    it('should suggest string access pattern', () => {
        const decl: Declaration = createMockDeclaration('data', {
            indexType: 'string',
            stringKeys: ['dev', 'prod'],
        });
        const suggestion = getAccessPatternSuggestion(decl);
        expect(suggestion).toContain('data["dev"]');
        expect(suggestion).toContain('data["prod"]');
    });

    it('should return null for non-indexed resource', () => {
        const decl: Declaration = createMockDeclaration('server');
        const suggestion = getAccessPatternSuggestion(decl);
        expect(suggestion).toBeNull();
    });
});

// Helper function to create mock declarations
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
