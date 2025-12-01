/**
 * Tests for decorator target validation
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkDecoratorTargets } from './decorator-targets';

function createDocument(content: string): TextDocument {
    return TextDocument.create('file:///test.kite', 'kite', 1, content);
}

describe('checkDecoratorTargets', () => {
    describe('Validation decorators on inputs/outputs', () => {
        it('should allow @minValue on input', () => {
            const doc = createDocument(`
component Server {
    @minValue(1)
    input number port = 8080
}
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should allow @maxValue on output', () => {
            const doc = createDocument(`
component Server {
    @maxValue(65535)
    output number port = 8080
}
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should report error for @minValue on resource', () => {
            const doc = createDocument(`
@minValue(1)
resource Config server {
    name = "test"
}
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@minValue');
            expect(diagnostics[0].message).toContain('input');
            expect(diagnostics[0].message).toContain('output');
        });

        it('should report error for @nonEmpty on resource', () => {
            const doc = createDocument(`
@nonEmpty
resource Config server { }
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@nonEmpty');
        });

        it('should allow @nonEmpty on input', () => {
            const doc = createDocument(`
component Server {
    @nonEmpty
    input string name
}
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should report error for @allowed on output', () => {
            const doc = createDocument(`
component Server {
    @allowed(["a", "b"])
    output string result = "a"
}
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@allowed');
        });

        it('should allow @allowed on input', () => {
            const doc = createDocument(`
component Server {
    @allowed(["dev", "prod"])
    input string env = "dev"
}
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('Resource decorators', () => {
        it('should allow @existing on resource', () => {
            const doc = createDocument(`
@existing("arn:aws:s3:::my-bucket")
resource S3.Bucket bucket { }
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should report error for @existing on input', () => {
            const doc = createDocument(`
component Server {
    @existing("arn:aws:s3:::bucket")
    input string bucket
}
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@existing');
            expect(diagnostics[0].message).toContain('resource');
        });

        it('should allow @tags on resource', () => {
            const doc = createDocument(`
@tags({ Environment: "prod" })
resource S3.Bucket bucket { }
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should allow @provider on resource', () => {
            const doc = createDocument(`
@provider("aws")
resource S3.Bucket bucket { }
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should allow @count on resource', () => {
            const doc = createDocument(`
@count(3)
resource EC2.Instance server { }
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should report error for @count on schema', () => {
            const doc = createDocument(`
@count(3)
schema Config { }
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@count');
        });
    });

    describe('Component instance decorators', () => {
        it('should allow @tags on component instance', () => {
            const doc = createDocument(`
@tags({ Team: "platform" })
component WebServer api { }
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should allow @dependsOn on component instance', () => {
            const doc = createDocument(`
@dependsOn(database)
component WebServer api { }
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should report error for @tags on component definition', () => {
            const doc = createDocument(`
@tags({ Team: "platform" })
component WebServer {
    input string name
}
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@tags');
        });
    });

    describe('@description - universal decorator', () => {
        it('should allow @description on schema', () => {
            const doc = createDocument(`
@description("Server configuration")
schema Config { }
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should allow @description on input', () => {
            const doc = createDocument(`
component Server {
    @description("Server port")
    input number port = 8080
}
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should allow @description on resource', () => {
            const doc = createDocument(`
@description("Main database")
resource RDS.Instance db { }
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should allow @description on function', () => {
            const doc = createDocument(`
@description("Calculate total cost")
fun calculateCost(number items) number {
    return items * 10
}
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should allow @description on var', () => {
            const doc = createDocument(`
@description("Current count")
var count = 0
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });
    });

    describe('@sensitive decorator', () => {
        it('should allow @sensitive on input', () => {
            const doc = createDocument(`
component Server {
    @sensitive
    input string password
}
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should allow @sensitive on output', () => {
            const doc = createDocument(`
component Server {
    @sensitive
    output string connectionString = "secret"
}
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should report error for @sensitive on resource', () => {
            const doc = createDocument(`
@sensitive
resource Config server { }
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0].message).toContain('@sensitive');
        });
    });

    describe('Multiple decorators', () => {
        it('should validate multiple decorators on same target', () => {
            const doc = createDocument(`
component Server {
    @minValue(1)
    @maxValue(65535)
    @description("Server port")
    input number port = 8080
}
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should report errors for multiple invalid decorators', () => {
            const doc = createDocument(`
@minValue(1)
@maxValue(100)
resource Config server { }
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(2);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty document', () => {
            const doc = createDocument('');
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should ignore decorators in comments', () => {
            const doc = createDocument(`
// @minValue(1)
// resource Config server { }
`);
            const diagnostics = checkDecoratorTargets(doc);
            expect(diagnostics).toHaveLength(0);
        });

        it('should allow unknown decorators without error', () => {
            const doc = createDocument(`
@customDecorator("value")
resource Config server { }
`);
            const diagnostics = checkDecoratorTargets(doc);
            // Unknown decorators are allowed (extensibility)
            expect(diagnostics).toHaveLength(0);
        });
    });
});
