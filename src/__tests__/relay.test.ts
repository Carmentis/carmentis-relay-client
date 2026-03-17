import { Initiator, Responder } from '../index';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

interface TestMessage {
    type: string;
    content: string;
    timestamp?: number;
}

describe('Carmentis Relay Client', () => {
    let container: StartedTestContainer;
    let relayUrl: string;
    let initiator: Initiator<TestMessage>;
    let responder: Responder<TestMessage>;

    beforeAll(async () => {
        // Start the Carmentis Relay container
        console.log('Starting Carmentis Relay container...');
        container = await new GenericContainer('ghcr.io/carmentis/relay')
            .withExposedPorts(3000)
            .withWaitStrategy(Wait.forListeningPorts())
            .start();

        const host = container.getHost();
        const port = container.getMappedPort(3000);
        relayUrl = `http://${host}:${port}`;
        console.log(`Relay running at: ${relayUrl}`);
    });

    afterAll(async () => {
        // Stop the container
        if (container) {
            console.log('Stopping Carmentis Relay container...');
            await container.stop();
        }
    });

    afterEach(async () => {
        // Clean up connections
        if (initiator) {
            initiator.close();
        }
        if (responder) {
            responder.close();
        }
        // Wait a bit for cleanup
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    test('should create session and generate AEAD key', async () => {
        initiator = await Initiator.createSession<TestMessage>(relayUrl);

        expect(initiator.getSessionId()).toBeDefined();
        expect(initiator.getSessionId()).toBeTruthy();
        expect(initiator.getKey()).toBeDefined();
        expect(initiator.getKey()).toBeTruthy();

        console.log(`Session ID: ${initiator.getSessionId()}`);
        console.log(`AEAD Key: ${initiator.getKey()}`);
    });

    test('should connect initiator and responder', async () => {
        initiator = await Initiator.createSession<TestMessage>(relayUrl);

        console.log(`Session created: ${initiator.getSessionId()}`);

        await initiator.init();
        expect(initiator.isConnected()).toBe(true);
        console.log('Initiator connected');

        responder = Responder.create<TestMessage>(
            relayUrl,
            initiator.getSessionId(),
            initiator.getKey()
        );

        await responder.join();
        expect(responder.isConnected()).toBe(true);
        console.log('Responder connected');
    });

    test('should exchange encrypted messages', async () => {
        initiator = await Initiator.createSession<TestMessage>(relayUrl);
        console.log(`Session created: ${initiator.getSessionId()}`);

        const initiatorMessages: TestMessage[] = [];
        const responderMessages: TestMessage[] = [];

        initiator.onMessage((message) => {
            console.log(`[Initiator] Received:`, message);
            initiatorMessages.push(message);
        });

        responder = Responder.create<TestMessage>(
            relayUrl,
            initiator.getSessionId(),
            initiator.getKey()
        );

        responder.onMessage((message) => {
            console.log(`[Responder] Received:`, message);
            responderMessages.push(message);
        });

        await initiator.init();
        console.log('Initiator connected');

        await responder.join();
        console.log('Responder connected');

        // Wait for connections to stabilize
        await new Promise(resolve => setTimeout(resolve, 500));

        // Send message from initiator to responder
        const msg1: TestMessage = { type: 'greeting', content: 'Hello from Initiator!', timestamp: Date.now() };
        console.log('Initiator sending:', msg1);
        await initiator.send(msg1);

        // Wait for message delivery
        await new Promise(resolve => setTimeout(resolve, 500));

        // Send message from responder to initiator
        const msg2: TestMessage = { type: 'greeting', content: 'Hello from Responder!', timestamp: Date.now() };
        console.log('Responder sending:', msg2);
        await responder.send(msg2);

        // Wait for message delivery
        await new Promise(resolve => setTimeout(resolve, 500));

        // Send more messages
        const msg3: TestMessage = { type: 'data', content: 'Message 2 from Initiator', timestamp: Date.now() };
        console.log('Initiator sending:', msg3);
        await initiator.send(msg3);

        await new Promise(resolve => setTimeout(resolve, 500));

        const msg4: TestMessage = { type: 'data', content: 'Message 2 from Responder', timestamp: Date.now() };
        console.log('Responder sending:', msg4);
        await responder.send(msg4);

        // Wait for all messages to be received
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify messages were received
        expect(responderMessages.length).toBe(2);
        expect(responderMessages[0].content).toBe('Hello from Initiator!');
        expect(responderMessages[1].content).toBe('Message 2 from Initiator');

        expect(initiatorMessages.length).toBe(2);
        expect(initiatorMessages[0].content).toBe('Hello from Responder!');
        expect(initiatorMessages[1].content).toBe('Message 2 from Responder');

        console.log(`\nInitiator received ${initiatorMessages.length} messages`);
        console.log(`Responder received ${responderMessages.length} messages`);
    });

    test('should handle connection errors gracefully', async () => {
        const errorHandler = jest.fn();

        initiator = await Initiator.createSession<TestMessage>(relayUrl);
        initiator.onError(errorHandler);

        await initiator.init();

        // Close the connection
        initiator.close();
        expect(initiator.isConnected()).toBe(false);

        // Try to send a message after closing
        await expect(async () => {
            await initiator.send({ type: 'test', content: 'This should fail' });
        }).rejects.toThrow('Socket is not connected');
    });

    test('should handle close event', async () => {
        const closeHandler = jest.fn();

        initiator = await Initiator.createSession<TestMessage>(relayUrl);
        initiator.onClose(closeHandler);

        await initiator.init();
        expect(initiator.isConnected()).toBe(true);

        initiator.close();

        // Wait a bit for the close event
        await new Promise(resolve => setTimeout(resolve, 200));

        expect(closeHandler).toHaveBeenCalled();
        expect(initiator.isConnected()).toBe(false);
    });

    test('should handle peer disconnection', async () => {
        const initiatorPeerDisconnected = jest.fn();
        const responderPeerDisconnected = jest.fn();

        initiator = await Initiator.createSession<TestMessage>(relayUrl);
        initiator.onPeerDisconnected(initiatorPeerDisconnected);

        await initiator.init();
        console.log('Initiator connected');

        responder = Responder.create<TestMessage>(
            relayUrl,
            initiator.getSessionId(),
            initiator.getKey()
        );
        responder.onPeerDisconnected(responderPeerDisconnected);

        await responder.join();
        console.log('Responder connected');

        // Wait for session to be ready
        await new Promise(resolve => setTimeout(resolve, 500));

        // Disconnect initiator
        initiator.close();

        // Wait for peer-disconnected event
        await new Promise(resolve => setTimeout(resolve, 500));

        expect(responderPeerDisconnected).toHaveBeenCalled();
        console.log('Peer disconnection handled correctly');
    });

    test('should handle session ready event', async () => {
        const sessionReadyHandler = jest.fn();

        initiator = await Initiator.createSession<TestMessage>(relayUrl);
        initiator.onSessionReady(sessionReadyHandler);

        await initiator.init();
        console.log('Initiator connected');

        responder = Responder.create<TestMessage>(
            relayUrl,
            initiator.getSessionId(),
            initiator.getKey()
        );

        await responder.join();
        console.log('Responder connected');

        // Wait for session-ready event
        await new Promise(resolve => setTimeout(resolve, 500));

        expect(sessionReadyHandler).toHaveBeenCalled();
        console.log('Session ready event handled correctly');
    });
});
