/**
 * Tests for decorator argument validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkDecoratorArguments } from './decorator-arguments';

function createDocument(content: string, uri = 'file:///test.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

describe('checkDecoratorArguments', () => {
    describe('Decorators requiring number argument', () => {
        it('should accept number argument for @minValue', () => {
            const doc = createDocument(`@minValue(1)
input number port = 8080`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should error when @minValue has string argument', () => {
            const doc = createDocument(`@minValue("abc")
input number port = 8080`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@minValue');
            expect(diagnostics[0].message).toContain('number');
        });

        it('should error when @minValue has no argument', () => {
            const doc = createDocument(`@minValue
input number port = 8080`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@minValue');
            expect(diagnostics[0].message).toContain('requires');
        });

        it('should accept number argument for @maxValue', () => {
            const doc = createDocument(`@maxValue(65535)
input number port = 8080`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should error when @maxValue has string argument', () => {
            const doc = createDocument(`@maxValue("high")
input number port = 8080`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@maxValue');
        });

        it('should accept number argument for @minLength', () => {
            const doc = createDocument(`@minLength(3)
input string name`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should error when @minLength has string argument', () => {
            const doc = createDocument(`@minLength("long")
input string name`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@minLength');
        });

        it('should accept number argument for @maxLength', () => {
            const doc = createDocument(`@maxLength(255)
input string name`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should accept number argument for @count', () => {
            const doc = createDocument(`@count(3)
resource EC2.Instance server {
    name = "server"
}`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should error when @count has string argument', () => {
            const doc = createDocument(`@count("many")
resource EC2.Instance server {
    name = "server"
}`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@count');
        });

        it('should accept variable reference for @count', () => {
            const doc = createDocument(`@count(replicas)
resource EC2.Instance server {
    name = "server"
}`);
            const diagnostics = checkDecoratorArguments(doc);
            // Variable references are allowed (resolved at runtime)
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('Decorators requiring string argument', () => {
        it('should accept string argument for @description', () => {
            const doc = createDocument(`@description("The port number")
input number port = 8080`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should error when @description has number argument', () => {
            const doc = createDocument(`@description(123)
input number port = 8080`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@description');
            expect(diagnostics[0].message).toContain('string');
        });

        it('should error when @description has no argument', () => {
            const doc = createDocument(`@description
input number port = 8080`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@description');
        });

        it('should accept string argument for @existing', () => {
            const doc = createDocument(`@existing("arn:aws:s3:::my-bucket")
resource S3.Bucket bucket {}`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should error when @existing has number argument', () => {
            const doc = createDocument(`@existing(12345)
resource S3.Bucket bucket {}`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@existing');
        });
    });

    describe('Decorators requiring array argument', () => {
        it('should accept array argument for @allowed', () => {
            const doc = createDocument(`@allowed(["dev", "staging", "prod"])
input string environment = "dev"`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should error when @allowed has string argument', () => {
            const doc = createDocument(`@allowed("dev")
input string environment = "dev"`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@allowed');
            expect(diagnostics[0].message).toContain('array');
        });

        it('should error when @allowed has no argument', () => {
            const doc = createDocument(`@allowed
input string environment = "dev"`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@allowed');
        });

        it('should accept array of numbers for @allowed', () => {
            const doc = createDocument(`@allowed([80, 443, 8080])
input number port = 80`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('Decorators with no arguments', () => {
        it('should accept @nonEmpty without arguments', () => {
            const doc = createDocument(`@nonEmpty
input string name`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should error when @nonEmpty has argument', () => {
            const doc = createDocument(`@nonEmpty(true)
input string name`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@nonEmpty');
            expect(diagnostics[0].message).toContain('does not take arguments');
        });

        it('should accept @sensitive without arguments', () => {
            const doc = createDocument(`@sensitive
input string api_key`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should error when @sensitive has argument', () => {
            const doc = createDocument(`@sensitive("very")
input string api_key`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@sensitive');
        });

        it('should accept @unique without arguments', () => {
            const doc = createDocument(`@unique
input string[] tags`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should error when @unique has argument', () => {
            const doc = createDocument(`@unique(true)
input string[] tags`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@unique');
        });
    });

    describe('Decorators with flexible type arguments', () => {
        it('should accept object for @tags', () => {
            const doc = createDocument(`@tags({ Environment: "prod" })
resource S3.Bucket bucket {}`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should accept array for @tags', () => {
            const doc = createDocument(`@tags(["Environment=prod"])
resource S3.Bucket bucket {}`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should accept string for @tags', () => {
            const doc = createDocument(`@tags("Environment=prod")
resource S3.Bucket bucket {}`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should error when @tags has number argument', () => {
            const doc = createDocument(`@tags(123)
resource S3.Bucket bucket {}`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@tags');
        });

        it('should accept string for @provider', () => {
            const doc = createDocument(`@provider("aws")
resource S3.Bucket bucket {}`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should accept array for @provider', () => {
            const doc = createDocument(`@provider(["aws", "azure"])
resource S3.Bucket bucket {}`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should error when @provider has number argument', () => {
            const doc = createDocument(`@provider(123)
resource S3.Bucket bucket {}`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@provider');
        });
    });

    describe('@dependsOn decorator', () => {
        it('should accept identifier reference for @dependsOn', () => {
            const doc = createDocument(`@dependsOn(subnet)
resource EC2.Instance server {}`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should accept array of references for @dependsOn', () => {
            const doc = createDocument(`@dependsOn([vpc, subnet])
resource EC2.Instance server {}`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should error when @dependsOn has no argument', () => {
            const doc = createDocument(`@dependsOn
resource EC2.Instance server {}`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@dependsOn');
        });
    });

    describe('@validate decorator with named arguments', () => {
        it('should accept regex named argument for @validate', () => {
            const doc = createDocument(`@validate(regex: "^[a-z]+$")
input string name`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should accept preset named argument for @validate', () => {
            const doc = createDocument(`@validate(preset: "email")
input string email`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should error when @validate has positional string', () => {
            const doc = createDocument(`@validate("^[a-z]+$")
input string name`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@validate');
            expect(diagnostics[0].message).toContain('regex:');
        });

        it('should error when @validate has no argument', () => {
            const doc = createDocument(`@validate
input string name`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@validate');
        });
    });

    describe('Multiple decorators', () => {
        it('should validate all decorators on same declaration', () => {
            const doc = createDocument(`@minValue("wrong")
@maxValue("also wrong")
input number port = 8080`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(2);
        });

        it('should pass when all decorators are valid', () => {
            const doc = createDocument(`@minValue(1)
@maxValue(65535)
@description("Server port")
input number port = 8080`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('Edge cases', () => {
        it('should ignore unknown decorators', () => {
            const doc = createDocument(`@customDecorator("anything")
input string name`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should handle decorators in comments', () => {
            const doc = createDocument(`// @minValue("invalid")
input string name`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should handle empty parentheses for decorators requiring arguments', () => {
            const doc = createDocument(`@minValue()
input number port = 8080`);
            const diagnostics = checkDecoratorArguments(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@minValue');
        });
    });
});
