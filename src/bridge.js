import osc from 'osc';
import { WebSocketServer } from 'ws';

const PORT_IN = 9002;
const PORT_OUT = 9000;

const wss = new WebSocketServer({ port: PORT_IN }); // PORT IN ON SLIMEVR 

const udpPort = new osc.UDPPort({
    localAddress: '0.0.0.0',
    localPort: PORT_OUT,  // PORT OUT MIGHT CHANGE ON LAPTOP <-------------------- ?????????
});

udpPort.on('message', (msg) => {
    console.log(msg.address, msg.args); 
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ address: msg.address, args: msg.args }));
        }
    });
});

udpPort.open();
console.log('Bridging from UDP 9000 to WS 9002');