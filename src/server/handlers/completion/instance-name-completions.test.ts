/**
 * Tests for instance name completions.
 * When typing after 'resource TypeName ' or 'component TypeName ',
 * suggests smart instance names.
 */

import { describe, it, expect } from 'vitest';
import {
    isInstanceNameContext,
    generateInstanceNameSuggestions,
    getInstanceNameCompletions,
} from './instance-name-completions';

describe('isInstanceNameContext', () => {
    describe('resource declarations', () => {
        it('should detect cursor after "resource TypeName "', () => {
            const text = 'resource ServerConfig ';
            const result = isInstanceNameContext(text, text.length);
            expect(result).not.toBeNull();
            expect(result?.keyword).toBe('resource');
            expect(result?.typeName).toBe('ServerConfig');
        });

        it('should detect cursor after "resource TypeName " with partial name', () => {
            const text = 'resource ServerConfig ser';
            const result = isInstanceNameContext(text, text.length);
            expect(result).not.toBeNull();
            expect(result?.typeName).toBe('ServerConfig');
            expect(result?.partialName).toBe('ser');
        });

        it('should detect cursor after namespaced type "resource AWS.EC2.Instance "', () => {
            const text = 'resource AWS.EC2.Instance ';
            const result = isInstanceNameContext(text, text.length);
            expect(result).not.toBeNull();
            expect(result?.typeName).toBe('AWS.EC2.Instance');
        });

        it('should not detect when no space after type', () => {
            const text = 'resource ServerConfig';
            const result = isInstanceNameContext(text, text.length);
            expect(result).toBeNull();
        });

        it('should not detect after "resource "', () => {
            const text = 'resource ';
            const result = isInstanceNameContext(text, text.length);
            expect(result).toBeNull();
        });

        it('should handle resource with decorator', () => {
            const text = '@count(3)\nresource ServerConfig ';
            const result = isInstanceNameContext(text, text.length);
            expect(result).not.toBeNull();
            expect(result?.typeName).toBe('ServerConfig');
        });
    });

    describe('component declarations', () => {
        it('should detect cursor after "component TypeName "', () => {
            const text = 'component WebServer ';
            const result = isInstanceNameContext(text, text.length);
            expect(result).not.toBeNull();
            expect(result?.keyword).toBe('component');
            expect(result?.typeName).toBe('WebServer');
        });

        it('should detect cursor after "component TypeName " with partial name', () => {
            const text = 'component WebServer api';
            const result = isInstanceNameContext(text, text.length);
            expect(result).not.toBeNull();
            expect(result?.typeName).toBe('WebServer');
            expect(result?.partialName).toBe('api');
        });

        it('should not detect component definitions (single name before {)', () => {
            // component WebServer { is a definition, not instantiation
            const text = 'component WebServer {';
            const result = isInstanceNameContext(text, text.length);
            expect(result).toBeNull();
        });

        it('should handle namespaced component types', () => {
            const text = 'component aws.Lambda.Function ';
            const result = isInstanceNameContext(text, text.length);
            expect(result).not.toBeNull();
            expect(result?.typeName).toBe('aws.Lambda.Function');
        });
    });

    describe('edge cases', () => {
        it('should not detect inside string', () => {
            const text = '"resource ServerConfig "';
            const result = isInstanceNameContext(text, text.length - 1);
            expect(result).toBeNull();
        });

        it('should not detect inside comment', () => {
            const text = '// resource ServerConfig ';
            const result = isInstanceNameContext(text, text.length);
            expect(result).toBeNull();
        });

        it('should handle multiline code', () => {
            const text = 'schema Config {}\n\nresource ServerConfig ';
            const result = isInstanceNameContext(text, text.length);
            expect(result).not.toBeNull();
            expect(result?.typeName).toBe('ServerConfig');
        });
    });
});

describe('generateInstanceNameSuggestions', () => {
    describe('camelCase conversions', () => {
        it('should convert PascalCase to camelCase', () => {
            const suggestions = generateInstanceNameSuggestions('ServerConfig');
            expect(suggestions).toContain('serverConfig');
        });

        it('should convert multi-word PascalCase to camelCase', () => {
            const suggestions = generateInstanceNameSuggestions('DatabaseConnectionPool');
            expect(suggestions).toContain('databaseConnectionPool');
        });

        it('should handle single-word types', () => {
            const suggestions = generateInstanceNameSuggestions('Server');
            expect(suggestions).toContain('server');
        });

        it('should handle namespaced types - use last segment', () => {
            const suggestions = generateInstanceNameSuggestions('AWS.EC2.Instance');
            expect(suggestions).toContain('instance');
        });
    });

    describe('common abbreviations', () => {
        it('should suggest "db" for Database types', () => {
            const suggestions = generateInstanceNameSuggestions('DatabaseConfig');
            expect(suggestions).toContain('db');
        });

        it('should suggest "cfg" or "config" for Config types', () => {
            const suggestions = generateInstanceNameSuggestions('ServerConfig');
            expect(suggestions.some(s => s === 'config' || s === 'cfg')).toBe(true);
        });

        it('should suggest "srv" or "server" for Server types', () => {
            const suggestions = generateInstanceNameSuggestions('WebServer');
            expect(suggestions.some(s => s === 'server' || s === 'srv')).toBe(true);
        });

        it('should suggest "svc" for Service types', () => {
            const suggestions = generateInstanceNameSuggestions('PaymentService');
            expect(suggestions).toContain('svc');
        });

        it('should suggest "func" for Function types', () => {
            const suggestions = generateInstanceNameSuggestions('Lambda.Function');
            expect(suggestions).toContain('func');
        });
    });

    describe('prefixed versions', () => {
        it('should suggest "my" prefix', () => {
            const suggestions = generateInstanceNameSuggestions('Database');
            expect(suggestions).toContain('myDatabase');
        });

        it('should suggest "primary" prefix', () => {
            const suggestions = generateInstanceNameSuggestions('Database');
            expect(suggestions).toContain('primaryDatabase');
        });

        it('should suggest "main" prefix', () => {
            const suggestions = generateInstanceNameSuggestions('Server');
            expect(suggestions).toContain('mainServer');
        });
    });

    describe('contextual suggestions', () => {
        it('should suggest role-based names for instance types', () => {
            const suggestions = generateInstanceNameSuggestions('EC2.Instance');
            expect(suggestions.some(s =>
                s === 'web' || s === 'api' || s === 'app'
            )).toBe(true);
        });

        it('should suggest "bucket" for S3.Bucket types', () => {
            const suggestions = generateInstanceNameSuggestions('S3.Bucket');
            expect(suggestions).toContain('bucket');
        });
    });

    describe('deduplication and ordering', () => {
        it('should not have duplicates', () => {
            const suggestions = generateInstanceNameSuggestions('Server');
            const uniqueSuggestions = [...new Set(suggestions)];
            expect(suggestions.length).toBe(uniqueSuggestions.length);
        });

        it('should prioritize camelCase first', () => {
            const suggestions = generateInstanceNameSuggestions('ServerConfig');
            expect(suggestions[0]).toBe('serverConfig');
        });
    });
});

describe('getInstanceNameCompletions', () => {
    it('should return null when not in instance name context', () => {
        const text = 'var x = 1';
        const result = getInstanceNameCompletions(text, text.length);
        expect(result).toBeNull();
    });

    it('should return completions when in resource instance context', () => {
        const text = 'resource ServerConfig ';
        const result = getInstanceNameCompletions(text, text.length);
        expect(result).not.toBeNull();
        expect(result!.length).toBeGreaterThan(0);
    });

    it('should return completions when in component instance context', () => {
        const text = 'component WebServer ';
        const result = getInstanceNameCompletions(text, text.length);
        expect(result).not.toBeNull();
        expect(result!.length).toBeGreaterThan(0);
    });

    it('should include camelCase version of type', () => {
        const text = 'resource ServerConfig ';
        const result = getInstanceNameCompletions(text, text.length);
        const labels = result!.map(c => c.label);
        expect(labels).toContain('serverConfig');
    });

    it('should filter by partial name', () => {
        const text = 'resource ServerConfig ser';
        const result = getInstanceNameCompletions(text, text.length);
        // All suggestions should start with "ser"
        result!.forEach(c => {
            expect((c.label as string).toLowerCase().startsWith('ser')).toBe(true);
        });
    });

    it('should have proper completion item properties', () => {
        const text = 'resource ServerConfig ';
        const result = getInstanceNameCompletions(text, text.length);
        const first = result![0];
        expect(first.label).toBeDefined();
        expect(first.kind).toBeDefined();
        expect(first.detail).toBeDefined();
    });
});
