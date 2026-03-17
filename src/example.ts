import { Initiator, Responder } from './index';

async function runExample() {
    const relayUrl = 'http://localhost:3000';

    try {
        console.log('Creating session...');
        const initiator = await Initiator.createSession(relayUrl);
        console.log(`Session created: ${initiator.getSessionId()}`);
        console.log(`AEAD Key: ${initiator.getKey()}`);

        // Set up initiator message handlers
        initiator
            .onMessage((message) => {
                console.log(`[Initiator] Received: ${message}`);
            })
            .onError((error) => {
                console.error(`[Initiator] Error:`, error);
            })
            .onClose(() => {
                console.log('[Initiator] Connection closed');
            });

        console.log('Initiator connecting...');
        await initiator.init();
        console.log('Initiator connected!');

        // Create responder with the session ID and key from initiator
        const responder = Responder.create(
            relayUrl,
            initiator.getSessionId(),
            initiator.getKey()
        );

        // Set up responder message handlers
        responder
            .onMessage((message) => {
                console.log(`[Responder] Received: ${message}`);
            })
            .onError((error) => {
                console.error(`[Responder] Error:`, error);
            })
            .onClose(() => {
                console.log('[Responder] Connection closed');
            });

        console.log('Responder joining...');
        await responder.join();
        console.log('Responder connected!');

        // Wait a bit for connections to stabilize
        await new Promise(resolve => setTimeout(resolve, 500));

        // Send messages back and forth
        console.log('\n--- Testing message exchange ---');

        console.log('Initiator sending message...');
        initiator.send('Hello from Initiator!');

        await new Promise(resolve => setTimeout(resolve, 500));

        console.log('Responder sending message...');
        responder.send('Hello from Responder!');

        await new Promise(resolve => setTimeout(resolve, 500));

        initiator.send('Message 2 from Initiator');

        await new Promise(resolve => setTimeout(resolve, 500));

        responder.send('Message 2 from Responder');

        // Keep the connection open for a bit to receive all messages
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Clean up
        console.log('\nClosing connections...');
        initiator.close();
        responder.close();

        console.log('Example completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

runExample();
