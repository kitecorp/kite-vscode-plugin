/**
 * DevOps-aware value suggestions for the Kite language server.
 * Provides context-aware completions for common infrastructure values.
 */

import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';

/**
 * Number suggestions for common DevOps properties
 */
const NUMBER_SUGGESTIONS: Record<string, { value: string; desc: string }[]> = {
    'port': [
        { value: '80', desc: 'HTTP' },
        { value: '443', desc: 'HTTPS' },
        { value: '22', desc: 'SSH' },
        { value: '3000', desc: 'Dev server' },
        { value: '3306', desc: 'MySQL' },
        { value: '5432', desc: 'PostgreSQL' },
        { value: '6379', desc: 'Redis' },
        { value: '8080', desc: 'HTTP alt' },
        { value: '27017', desc: 'MongoDB' },
    ],
    'timeout': [
        { value: '30', desc: '30 seconds' },
        { value: '60', desc: '1 minute' },
        { value: '300', desc: '5 minutes' },
        { value: '900', desc: '15 minutes' },
        { value: '3600', desc: '1 hour' },
    ],
    'memory': [
        { value: '128', desc: '128 MB' },
        { value: '256', desc: '256 MB' },
        { value: '512', desc: '512 MB' },
        { value: '1024', desc: '1 GB' },
        { value: '2048', desc: '2 GB' },
        { value: '4096', desc: '4 GB' },
    ],
    'memorysize': [
        { value: '128', desc: '128 MB (Lambda min)' },
        { value: '256', desc: '256 MB' },
        { value: '512', desc: '512 MB' },
        { value: '1024', desc: '1 GB' },
        { value: '2048', desc: '2 GB' },
    ],
    'cpu': [
        { value: '256', desc: '0.25 vCPU (ECS)' },
        { value: '512', desc: '0.5 vCPU (ECS)' },
        { value: '1024', desc: '1 vCPU (ECS)' },
        { value: '2048', desc: '2 vCPU (ECS)' },
        { value: '4096', desc: '4 vCPU (ECS)' },
    ],
    'replicas': [
        { value: '1', desc: 'Single replica' },
        { value: '2', desc: 'HA minimum' },
        { value: '3', desc: 'Production HA' },
        { value: '5', desc: 'High availability' },
    ],
    'desiredcount': [
        { value: '1', desc: 'Single instance' },
        { value: '2', desc: 'HA minimum' },
        { value: '3', desc: 'Production HA' },
    ],
    'minsize': [
        { value: '0', desc: 'Scale to zero' },
        { value: '1', desc: 'Minimum 1' },
        { value: '2', desc: 'HA minimum' },
    ],
    'maxsize': [
        { value: '1', desc: 'No scaling' },
        { value: '3', desc: 'Small scale' },
        { value: '5', desc: 'Medium scale' },
        { value: '10', desc: 'Large scale' },
    ],
    'ttl': [
        { value: '60', desc: '1 minute' },
        { value: '300', desc: '5 minutes' },
        { value: '3600', desc: '1 hour' },
        { value: '86400', desc: '1 day' },
    ],
};

/**
 * String suggestions for common DevOps properties
 */
const STRING_SUGGESTIONS: Record<string, { value: string; desc: string }[]> = {
    'region': [
        { value: '"us-east-1"', desc: 'AWS N. Virginia' },
        { value: '"us-west-2"', desc: 'AWS Oregon' },
        { value: '"eu-west-1"', desc: 'AWS Ireland' },
        { value: '"eu-central-1"', desc: 'AWS Frankfurt' },
        { value: '"ap-southeast-1"', desc: 'AWS Singapore' },
    ],
    'environment': [
        { value: '"dev"', desc: 'Development' },
        { value: '"staging"', desc: 'Staging' },
        { value: '"prod"', desc: 'Production' },
    ],
    'env': [
        { value: '"dev"', desc: 'Development' },
        { value: '"staging"', desc: 'Staging' },
        { value: '"prod"', desc: 'Production' },
    ],
    'protocol': [
        { value: '"http"', desc: 'HTTP' },
        { value: '"https"', desc: 'HTTPS' },
        { value: '"tcp"', desc: 'TCP' },
        { value: '"udp"', desc: 'UDP' },
    ],
    'host': [
        { value: '"localhost"', desc: 'Localhost' },
        { value: '"0.0.0.0"', desc: 'All interfaces' },
    ],
    'provider': [
        { value: '"aws"', desc: 'Amazon Web Services' },
        { value: '"gcp"', desc: 'Google Cloud Platform' },
        { value: '"azure"', desc: 'Microsoft Azure' },
    ],
    'cidr': [
        { value: '"10.0.0.0/16"', desc: 'VPC CIDR' },
        { value: '"10.0.1.0/24"', desc: 'Subnet CIDR' },
        { value: '"0.0.0.0/0"', desc: 'Any' },
    ],
    'instancetype': [
        { value: '"t2.micro"', desc: 'Free tier' },
        { value: '"t3.small"', desc: '2 vCPU, 2GB' },
        { value: '"t3.medium"', desc: '2 vCPU, 4GB' },
        { value: '"m5.large"', desc: '2 vCPU, 8GB' },
    ],
    'runtime': [
        { value: '"nodejs18.x"', desc: 'Node.js 18' },
        { value: '"nodejs20.x"', desc: 'Node.js 20' },
        { value: '"python3.11"', desc: 'Python 3.11' },
        { value: '"python3.12"', desc: 'Python 3.12' },
    ],
    'loglevel': [
        { value: '"debug"', desc: 'Debug level' },
        { value: '"info"', desc: 'Info level' },
        { value: '"warn"', desc: 'Warning level' },
        { value: '"error"', desc: 'Error level' },
    ],
    'name': [{ value: '""', desc: 'empty string' }],
};

/**
 * Add number suggestions based on property name
 */
export function addNumberSuggestions(completions: CompletionItem[], propName: string): void {
    const suggestions = NUMBER_SUGGESTIONS[propName];
    if (suggestions) {
        suggestions.forEach(s => {
            completions.push({
                label: s.value,
                kind: CompletionItemKind.Value,
                detail: s.desc,
                insertText: s.value
            });
        });
    }
}

/**
 * Add string suggestions based on property name
 */
export function addStringSuggestions(completions: CompletionItem[], propName: string): void {
    const suggestions = STRING_SUGGESTIONS[propName];
    if (suggestions) {
        suggestions.forEach(s => {
            completions.push({
                label: s.value,
                kind: CompletionItemKind.Value,
                detail: s.desc,
                insertText: s.value
            });
        });
    } else {
        completions.push({
            label: '""',
            kind: CompletionItemKind.Value,
            detail: 'empty string',
            insertText: '""'
        });
    }
}

/**
 * Get number suggestions for a property name (for context-aware completions)
 */
export function getNumberSuggestionsForProp(propName: string): { value: string; desc: string }[] | null {
    return NUMBER_SUGGESTIONS[propName] || null;
}

/**
 * Get string suggestions for a property name (for context-aware completions)
 */
export function getStringSuggestionsForProp(propName: string): { value: string; desc: string }[] | null {
    return STRING_SUGGESTIONS[propName] || null;
}
