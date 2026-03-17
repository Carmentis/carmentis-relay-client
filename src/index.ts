import axios from "axios";
import { io, Socket } from "socket.io-client";
import { AEADCrypto } from "./crypto";
import { RelayUrlUtils } from "./url-utils";

export type MessageHandler<T = any> = (message: T) => void;
export type ErrorHandler = (error: Error) => void;
export type CloseHandler = () => void;
export type PeerDisconnectedHandler = () => void;
export type SessionReadyHandler = () => void;

export abstract class RelayClient<TMessage = any> {
	protected socket: Socket | null = null;
	protected aeadKey: string;
	protected normalizedUrl: string;
	private messageHandler?: MessageHandler<TMessage>;
	private errorHandler?: ErrorHandler;
	private closeHandler?: CloseHandler;
	private peerDisconnectedHandler?: PeerDisconnectedHandler;
	private sessionReadyHandler?: SessionReadyHandler;

	protected constructor(
		relayUrl: string,
		protected readonly sessionId: string,
		aeadKey: string
	) {
		this.aeadKey = aeadKey;
		this.normalizedUrl = RelayUrlUtils.normalizeHttpUrl(relayUrl);
	}

	/**
	 * Set handler for incoming messages
	 */
	onMessage(handler: MessageHandler<TMessage>): this {
		this.messageHandler = handler;
		return this;
	}

	/**
	 * Set handler for errors
	 */
	onError(handler: ErrorHandler): this {
		this.errorHandler = handler;
		return this;
	}

	/**
	 * Set handler for connection close
	 */
	onClose(handler: CloseHandler): this {
		this.closeHandler = handler;
		return this;
	}

	/**
	 * Set handler for peer disconnection
	 */
	onPeerDisconnected(handler: PeerDisconnectedHandler): this {
		this.peerDisconnectedHandler = handler;
		return this;
	}

	/**
	 * Set handler for session ready (both clients connected)
	 */
	onSessionReady(handler: SessionReadyHandler): this {
		this.sessionReadyHandler = handler;
		return this;
	}

	/**
	 * Send an encrypted message through the socket
	 */
	send(message: TMessage): void {
		if (!this.socket || !this.socket.connected) {
			throw new Error('Socket is not connected');
		}

		const encrypted = AEADCrypto.encryptObject(message, this.aeadKey);
		this.socket.emit('message', encrypted);
	}

	/**
	 * Close the socket connection
	 */
	close(): void {
		if (this.socket) {
			this.socket.disconnect();
			this.socket = null;
		}
	}

	/**
	 * Get the session ID
	 */
	getSessionId(): string {
		return this.sessionId;
	}

	/**
	 * Check if the socket is connected
	 */
	isConnected(): boolean {
		return this.socket !== null && this.socket.connected;
	}

	protected setupSocket(socket: Socket): void {
		this.socket = socket;

		socket.on('message', (encryptedMessage: string) => {
			try {
				const decryptedMessage = AEADCrypto.decryptObject<TMessage>(encryptedMessage, this.aeadKey);

				if (this.messageHandler) {
					this.messageHandler(decryptedMessage);
				}
			} catch (error) {
				if (this.errorHandler) {
					this.errorHandler(error as Error);
				}
			}
		});

		socket.on('error', (error: any) => {
			if (this.errorHandler) {
				this.errorHandler(error instanceof Error ? error : new Error(error.message || 'Socket error'));
			}
		});

		socket.on('disconnect', (reason: string) => {
			this.socket = null;
			if (this.closeHandler) {
				this.closeHandler();
			}
		});

		socket.on('peer-disconnected', () => {
			if (this.peerDisconnectedHandler) {
				this.peerDisconnectedHandler();
			}
		});

		socket.on('session-ready', () => {
			if (this.sessionReadyHandler) {
				this.sessionReadyHandler();
			}
		});
	}
}

export class Initiator<TMessage = any> extends RelayClient<TMessage> {
	private constructor(relayUrl: string, sessionId: string, aeadKey: string) {
		super(relayUrl, sessionId, aeadKey);
	}

	/**
	 * Create a new session and return an Initiator instance
	 */
	static async createSession<TMessage = any>(relayUrl: string): Promise<Initiator<TMessage>> {
		const normalizedUrl = RelayUrlUtils.normalizeHttpUrl(relayUrl);
		const response = await axios.post<{ sessionId: string }>(`${normalizedUrl}/session/create`);
		const sessionId = response.data.sessionId;
		const aeadKey = AEADCrypto.generateKey();

		return new Initiator<TMessage>(relayUrl, sessionId, aeadKey);
	}

	/**
	 * Initialize the session by connecting to the socket
	 */
	async init(): Promise<void> {
		return new Promise((resolve, reject) => {
			const socket = io(this.normalizedUrl, {
				transports: ['websocket'],
				autoConnect: false
			});

			socket.on('connect', () => {
				// Emit init event with session ID
				socket.emit('init', { sessionId: this.sessionId });
			});

			socket.on('initialized', () => {
				this.setupSocket(socket);
				resolve();
			});

			socket.on('error', (error: any) => {
				reject(error instanceof Error ? error : new Error(error.message || 'Connection error'));
			});

			socket.on('connect_error', (error: Error) => {
				reject(error);
			});

			socket.connect();
		});
	}

	/**
	 * Get the AEAD key (base64 encoded)
	 */
	getKey(): string {
		return this.aeadKey;
	}
}

export class Responder<TMessage = any> extends RelayClient<TMessage> {
	private constructor(relayUrl: string, sessionId: string, aeadKey: string) {
		super(relayUrl, sessionId, aeadKey);
	}

	/**
	 * Create a Responder instance with an existing session ID and AEAD key
	 */
	static create<TMessage = any>(relayUrl: string, sessionId: string, aeadKey: string): Responder<TMessage> {
		return new Responder<TMessage>(relayUrl, sessionId, aeadKey);
	}

	/**
	 * Join an existing session by connecting to the socket
	 */
	async join(): Promise<void> {
		return new Promise((resolve, reject) => {
			const socket = io(this.normalizedUrl, {
				transports: ['websocket'],
				autoConnect: false
			});

			socket.on('connect', () => {
				// Emit join event with session ID
				socket.emit('join', { sessionId: this.sessionId });
			});

			socket.on('joined', () => {
				this.setupSocket(socket);
				resolve();
			});

			socket.on('error', (error: any) => {
				reject(error instanceof Error ? error : new Error(error.message || 'Connection error'));
			});

			socket.on('connect_error', (error: Error) => {
				reject(error);
			});

			socket.connect();
		});
	}
}