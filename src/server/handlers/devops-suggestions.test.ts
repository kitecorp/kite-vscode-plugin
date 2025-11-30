/**
 * Tests for devops suggestions handler.
 */

import { describe, it, expect } from 'vitest';
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';
import {
    addNumberSuggestions,
    addStringSuggestions,
    getNumberSuggestionsForProp,
    getStringSuggestionsForProp,
} from './devops-suggestions';

describe('addNumberSuggestions', () => {
    it('should add port suggestions', () => {
        const completions: CompletionItem[] = [];
        addNumberSuggestions(completions, 'port');

        expect(completions.length).toBeGreaterThan(0);
        const labels = completions.map(c => c.label);
        expect(labels).toContain('80');
        expect(labels).toContain('443');
        expect(labels).toContain('22');
        expect(labels).toContain('3306');
    });

    it('should add timeout suggestions', () => {
        const completions: CompletionItem[] = [];
        addNumberSuggestions(completions, 'timeout');

        expect(completions.length).toBeGreaterThan(0);
        const labels = completions.map(c => c.label);
        expect(labels).toContain('30');
        expect(labels).toContain('60');
        expect(labels).toContain('300');
    });

    it('should add memory suggestions', () => {
        const completions: CompletionItem[] = [];
        addNumberSuggestions(completions, 'memory');

        expect(completions.length).toBeGreaterThan(0);
        const labels = completions.map(c => c.label);
        expect(labels).toContain('128');
        expect(labels).toContain('256');
        expect(labels).toContain('1024');
    });

    it('should add cpu suggestions', () => {
        const completions: CompletionItem[] = [];
        addNumberSuggestions(completions, 'cpu');

        expect(completions.length).toBeGreaterThan(0);
        const labels = completions.map(c => c.label);
        expect(labels).toContain('256');
        expect(labels).toContain('512');
        expect(labels).toContain('1024');
    });

    it('should add replicas suggestions', () => {
        const completions: CompletionItem[] = [];
        addNumberSuggestions(completions, 'replicas');

        expect(completions.length).toBeGreaterThan(0);
        const labels = completions.map(c => c.label);
        expect(labels).toContain('1');
        expect(labels).toContain('2');
        expect(labels).toContain('3');
    });

    it('should add ttl suggestions', () => {
        const completions: CompletionItem[] = [];
        addNumberSuggestions(completions, 'ttl');

        expect(completions.length).toBeGreaterThan(0);
        const labels = completions.map(c => c.label);
        expect(labels).toContain('60');
        expect(labels).toContain('3600');
        expect(labels).toContain('86400');
    });

    it('should not add suggestions for unknown property', () => {
        const completions: CompletionItem[] = [];
        addNumberSuggestions(completions, 'unknownProp');

        expect(completions).toHaveLength(0);
    });

    it('should set correct completion kind', () => {
        const completions: CompletionItem[] = [];
        addNumberSuggestions(completions, 'port');

        expect(completions[0].kind).toBe(CompletionItemKind.Value);
    });

    it('should include descriptions', () => {
        const completions: CompletionItem[] = [];
        addNumberSuggestions(completions, 'port');

        const httpPort = completions.find(c => c.label === '80');
        expect(httpPort?.detail).toBe('HTTP');

        const httpsPort = completions.find(c => c.label === '443');
        expect(httpsPort?.detail).toBe('HTTPS');
    });
});

describe('addStringSuggestions', () => {
    it('should add region suggestions', () => {
        const completions: CompletionItem[] = [];
        addStringSuggestions(completions, 'region');

        expect(completions.length).toBeGreaterThan(0);
        const labels = completions.map(c => c.label);
        expect(labels).toContain('"us-east-1"');
        expect(labels).toContain('"us-west-2"');
        expect(labels).toContain('"eu-west-1"');
    });

    it('should add environment suggestions', () => {
        const completions: CompletionItem[] = [];
        addStringSuggestions(completions, 'environment');

        expect(completions.length).toBeGreaterThan(0);
        const labels = completions.map(c => c.label);
        expect(labels).toContain('"dev"');
        expect(labels).toContain('"staging"');
        expect(labels).toContain('"prod"');
    });

    it('should add protocol suggestions', () => {
        const completions: CompletionItem[] = [];
        addStringSuggestions(completions, 'protocol');

        expect(completions.length).toBeGreaterThan(0);
        const labels = completions.map(c => c.label);
        expect(labels).toContain('"http"');
        expect(labels).toContain('"https"');
        expect(labels).toContain('"tcp"');
    });

    it('should add provider suggestions', () => {
        const completions: CompletionItem[] = [];
        addStringSuggestions(completions, 'provider');

        expect(completions.length).toBeGreaterThan(0);
        const labels = completions.map(c => c.label);
        expect(labels).toContain('"aws"');
        expect(labels).toContain('"gcp"');
        expect(labels).toContain('"azure"');
    });

    it('should add cidr suggestions', () => {
        const completions: CompletionItem[] = [];
        addStringSuggestions(completions, 'cidr');

        expect(completions.length).toBeGreaterThan(0);
        const labels = completions.map(c => c.label);
        expect(labels).toContain('"10.0.0.0/16"');
        expect(labels).toContain('"0.0.0.0/0"');
    });

    it('should add instancetype suggestions', () => {
        const completions: CompletionItem[] = [];
        addStringSuggestions(completions, 'instancetype');

        expect(completions.length).toBeGreaterThan(0);
        const labels = completions.map(c => c.label);
        expect(labels).toContain('"t2.micro"');
        expect(labels).toContain('"t3.small"');
        expect(labels).toContain('"m5.large"');
    });

    it('should add runtime suggestions', () => {
        const completions: CompletionItem[] = [];
        addStringSuggestions(completions, 'runtime');

        expect(completions.length).toBeGreaterThan(0);
        const labels = completions.map(c => c.label);
        expect(labels).toContain('"nodejs18.x"');
        expect(labels).toContain('"python3.11"');
    });

    it('should add loglevel suggestions', () => {
        const completions: CompletionItem[] = [];
        addStringSuggestions(completions, 'loglevel');

        expect(completions.length).toBeGreaterThan(0);
        const labels = completions.map(c => c.label);
        expect(labels).toContain('"debug"');
        expect(labels).toContain('"info"');
        expect(labels).toContain('"error"');
    });

    it('should add empty string for unknown property', () => {
        const completions: CompletionItem[] = [];
        addStringSuggestions(completions, 'unknownProp');

        expect(completions).toHaveLength(1);
        expect(completions[0].label).toBe('""');
        expect(completions[0].detail).toBe('empty string');
    });

    it('should set correct completion kind', () => {
        const completions: CompletionItem[] = [];
        addStringSuggestions(completions, 'region');

        expect(completions[0].kind).toBe(CompletionItemKind.Value);
    });

    it('should include descriptions', () => {
        const completions: CompletionItem[] = [];
        addStringSuggestions(completions, 'region');

        const usEast = completions.find(c => c.label === '"us-east-1"');
        expect(usEast?.detail).toBe('AWS N. Virginia');
    });
});

describe('getNumberSuggestionsForProp', () => {
    it('should return suggestions for known property', () => {
        const suggestions = getNumberSuggestionsForProp('port');

        expect(suggestions).not.toBeNull();
        expect(suggestions?.length).toBeGreaterThan(0);
        expect(suggestions?.some(s => s.value === '80')).toBe(true);
    });

    it('should return null for unknown property', () => {
        const suggestions = getNumberSuggestionsForProp('unknownProp');

        expect(suggestions).toBeNull();
    });

    it('should return suggestions with value and description', () => {
        const suggestions = getNumberSuggestionsForProp('port');

        expect(suggestions?.[0]).toHaveProperty('value');
        expect(suggestions?.[0]).toHaveProperty('desc');
    });
});

describe('getStringSuggestionsForProp', () => {
    it('should return suggestions for known property', () => {
        const suggestions = getStringSuggestionsForProp('region');

        expect(suggestions).not.toBeNull();
        expect(suggestions?.length).toBeGreaterThan(0);
        expect(suggestions?.some(s => s.value === '"us-east-1"')).toBe(true);
    });

    it('should return null for unknown property', () => {
        const suggestions = getStringSuggestionsForProp('unknownProp');

        expect(suggestions).toBeNull();
    });

    it('should return suggestions with value and description', () => {
        const suggestions = getStringSuggestionsForProp('region');

        expect(suggestions?.[0]).toHaveProperty('value');
        expect(suggestions?.[0]).toHaveProperty('desc');
    });

    it('should handle env as alias for environment', () => {
        const suggestions = getStringSuggestionsForProp('env');

        expect(suggestions).not.toBeNull();
        expect(suggestions?.some(s => s.value === '"dev"')).toBe(true);
    });
});
