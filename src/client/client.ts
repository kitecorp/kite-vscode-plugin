import * as path from 'path';
import { workspace, ExtensionContext, window } from 'vscode';

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';

// Create output channel for logging
const outputChannel = window.createOutputChannel('Kite Language Server');

let client: LanguageClient;

export function activateClient(context: ExtensionContext): void {
    // Path to the server module
    const serverModule = context.asAbsolutePath(
        path.join('out', 'server', 'server.js')
    );

    // Server options - run the server in Node
    const serverOptions: ServerOptions = {
        run: {
            module: serverModule,
            transport: TransportKind.ipc
        },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: {
                execArgv: ['--nolazy', '--inspect=6009']
            }
        }
    };

    // Client options
    const clientOptions: LanguageClientOptions = {
        // Register for Kite files
        documentSelector: [{ scheme: 'file', language: 'kite' }],
        synchronize: {
            // Synchronize settings and file changes
            fileEvents: workspace.createFileSystemWatcher('**/*.kite')
        },
        // Output channel for server logs
        outputChannel: outputChannel,
        traceOutputChannel: outputChannel
    };

    outputChannel.appendLine('[Client] Starting Kite Language Server...');

    // Create the language client
    client = new LanguageClient(
        'kiteLanguageServer',
        'Kite Language Server',
        serverOptions,
        clientOptions
    );

    // Start the client (also starts the server)
    client.start();
}

export function deactivateClient(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
