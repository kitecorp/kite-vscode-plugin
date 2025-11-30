/**
 * File utilities for the Kite language server.
 * Pure functions for file system operations.
 */

import * as fs from 'fs';

/**
 * Read file content safely.
 * @param filePath - Path to the file to read
 * @returns File content as string or null if read fails
 */
export function readFileContent(filePath: string): string | null {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return null;
    }
}
