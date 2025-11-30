/**
 * Language constants for the Kite language server.
 */

import { DecoratorInfo } from './types';

// Keywords for completion
export const KEYWORDS = [
    'resource', 'component', 'schema', 'input', 'output',
    'if', 'else', 'while', 'for', 'in', 'return',
    'import', 'from', 'fun', 'var', 'type', 'init', 'this',
    'true', 'false', 'null'
];

export const TYPES = ['string', 'number', 'boolean', 'any', 'object', 'void'];

// Built-in decorators with descriptions (from DECORATORS.md)
export const DECORATORS: DecoratorInfo[] = [
    // Validation decorators (sortOrder 0-99)
    {
        name: 'minValue', category: 'validation',
        description: 'Minimum value constraint for numbers',
        argument: 'number (0 to 999999)', argType: 'number',
        targets: 'input, output', appliesTo: 'number',
        example: '@minValue(1)\ninput number port = 8080',
        snippet: 'minValue($1)', argHint: '(n)', sortOrder: 0
    },
    {
        name: 'maxValue', category: 'validation',
        description: 'Maximum value constraint for numbers',
        argument: 'number (0 to 999999)', argType: 'number',
        targets: 'input, output', appliesTo: 'number',
        example: '@maxValue(65535)\ninput number port = 8080',
        snippet: 'maxValue($1)', argHint: '(n)', sortOrder: 1
    },
    {
        name: 'minLength', category: 'validation',
        description: 'Minimum length constraint for strings and arrays',
        argument: 'number (0 to 999999)', argType: 'number',
        targets: 'input, output', appliesTo: 'string, array',
        example: '@minLength(3)\ninput string name',
        snippet: 'minLength($1)', argHint: '(n)', sortOrder: 2
    },
    {
        name: 'maxLength', category: 'validation',
        description: 'Maximum length constraint for strings and arrays',
        argument: 'number (0 to 999999)', argType: 'number',
        targets: 'input, output', appliesTo: 'string, array',
        example: '@maxLength(255)\ninput string name',
        snippet: 'maxLength($1)', argHint: '(n)', sortOrder: 3
    },
    {
        name: 'nonEmpty', category: 'validation',
        description: 'Ensures strings or arrays are not empty',
        argument: 'none', argType: 'none',
        targets: 'input', appliesTo: 'string, array',
        example: '@nonEmpty\ninput string name',
        sortOrder: 4
    },
    {
        name: 'validate', category: 'validation',
        description: 'Custom validation with regex pattern or preset',
        argument: 'Named: regex: string or preset: string', argType: 'named',
        targets: 'input, output', appliesTo: 'string, array',
        example: '@validate(regex: "^[a-z]+$")\ninput string name',
        snippet: 'validate(regex: "$1")', argHint: '(regex: "pattern")', sortOrder: 5
    },
    {
        name: 'allowed', category: 'validation',
        description: 'Whitelist of allowed values',
        argument: 'array of literals (1 to 256 elements)', argType: 'array',
        targets: 'input', appliesTo: 'string, number, object, array',
        example: '@allowed(["dev", "staging", "prod"])\ninput string environment = "dev"',
        snippet: 'allowed([$1])', argHint: '([values])', sortOrder: 6
    },
    {
        name: 'unique', category: 'validation',
        description: 'Ensures array elements are unique',
        argument: 'none', argType: 'none',
        targets: 'input', appliesTo: 'array',
        example: '@unique\ninput string[] tags = ["web", "api"]',
        sortOrder: 7
    },
    // Resource decorators (sortOrder 100-199)
    {
        name: 'existing', category: 'resource',
        description: 'Reference existing cloud resources by ARN, URL, or ID',
        argument: 'string (ARN, URL, EC2 instance ID, KMS alias, log group)', argType: 'string',
        targets: 'resource',
        example: '@existing("arn:aws:s3:::my-bucket")\nresource S3.Bucket existing_bucket {}',
        snippet: 'existing("$1")', argHint: '("reference")', sortOrder: 100
    },
    {
        name: 'sensitive', category: 'resource',
        description: 'Mark sensitive data (passwords, secrets, API keys)',
        argument: 'none', argType: 'none',
        targets: 'input, output',
        example: '@sensitive\ninput string api_key',
        sortOrder: 101
    },
    {
        name: 'dependsOn', category: 'resource',
        description: 'Explicit dependency declaration between resources/components',
        argument: 'resource/component reference, or array of references', argType: 'reference',
        targets: 'resource, component (instances)',
        example: '@dependsOn(subnet)\nresource EC2.Instance server { ... }',
        snippet: 'dependsOn($1)', argHint: '(resources)', sortOrder: 102
    },
    {
        name: 'tags', category: 'resource',
        description: 'Add cloud provider tags to resources',
        argument: 'object, array of strings, or string', argType: 'object',
        targets: 'resource, component (instances)',
        example: '@tags({ Environment: "prod", Team: "platform" })\nresource S3.Bucket photos { name = "photos" }',
        snippet: 'tags({ $1 })', argHint: '({key: value})', sortOrder: 103
    },
    {
        name: 'provider', category: 'resource',
        description: 'Target specific cloud providers for resource provisioning',
        argument: 'string or array of strings', argType: 'string',
        targets: 'resource, component (instances)',
        example: '@provider("aws")\nresource S3.Bucket photos { name = "photos" }',
        snippet: 'provider("$1")', argHint: '("provider")', sortOrder: 104
    },
    // Metadata decorators (sortOrder 200-299)
    {
        name: 'description', category: 'metadata',
        description: 'Documentation for any declaration',
        argument: 'string', argType: 'string',
        targets: 'resource, component, input, output, var, schema, schema property, fun',
        example: '@description("The port number for the web server")\ninput number port = 8080',
        snippet: 'description("$1")', argHint: '("text")', sortOrder: 200
    },
    {
        name: 'cloud', category: 'metadata',
        description: 'Mark schema property as cloud-provided (value set by cloud provider)',
        argument: 'none', argType: 'none',
        targets: 'schema property',
        example: 'schema Instance {\n    @cloud\n    string publicIp\n}',
        sortOrder: 201
    },
    {
        name: 'count', category: 'metadata',
        description: 'Create N instances of a resource or component. Injects count variable (0-indexed)',
        argument: 'number', argType: 'number',
        targets: 'resource, component (instances)',
        example: '@count(3)\nresource EC2.Instance server {\n    name = "server-$count"\n}',
        snippet: 'count($1)', argHint: '(n)', sortOrder: 202
    },
];
