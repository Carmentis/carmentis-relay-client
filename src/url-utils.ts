/**
 * Normalizes a relay URL to ensure it works with both HTTP REST API and Socket.IO
 * Handles various input formats: http, https, ws, wss, or plain domain
 */
export class RelayUrlUtils {
    /**
     * Normalize URL for HTTP REST API calls
     * @param url - Input URL in any format
     * @returns Normalized HTTP/HTTPS URL
     */
    static normalizeHttpUrl(url: string): string {
        // Remove trailing slashes
        url = url.trim().replace(/\/+$/, '');

        // If it starts with ws:// or wss://, convert to http/https
        if (url.startsWith('ws://')) {
            return url.replace('ws://', 'http://');
        }
        if (url.startsWith('wss://')) {
            return url.replace('wss://', 'https://');
        }

        // If it already has http:// or https://, return as is
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }

        // Plain domain - default to http://
        return `http://${url}`;
    }

    /**
     * Normalize URL for Socket.IO connection
     * Socket.IO handles protocol internally, so we just ensure proper format
     * @param url - Input URL in any format
     * @returns Normalized URL for Socket.IO (http/https format)
     */
    static normalizeSocketUrl(url: string): string {
        // Socket.IO client accepts http/https URLs and handles WS upgrade internally
        return this.normalizeHttpUrl(url);
    }

    /**
     * Parse and validate URL
     * @param url - Input URL
     * @returns Object with protocol, host, and port information
     */
    static parseUrl(url: string): { protocol: string; host: string; port?: number; fullUrl: string } {
        const normalized = this.normalizeHttpUrl(url);

        try {
            const parsed = new URL(normalized);
            return {
                protocol: parsed.protocol.replace(':', ''),
                host: parsed.hostname,
                port: parsed.port ? parseInt(parsed.port) : undefined,
                fullUrl: normalized
            };
        } catch (error) {
            throw new Error(`Invalid URL: ${url}`);
        }
    }
}
