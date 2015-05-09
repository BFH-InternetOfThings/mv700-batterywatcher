var S = require('string'),
    mqtt = require('mqtt'),
    mqttrouter = require('mqtt-router'),
    serialport = require("serialport");

// settings
var deviceType = "mv700";
var sPort = "ttyUSB4";
var serialSettings = {
    baudrate: 19200,
    flowControl: true,
    parser: serialport.parsers.readline("PID")
};
var deviceID = ''; // is currently set to the mac address of the first interface

// init serialport
var serial = null;

require('getmac').getMac(function(err,macAddress){
    if (err)  {
        console.log("unable to get MAC address");
        return
    }

    deviceID = S(macAddress).replaceAll(':','').s;

    console.log("DeviceID:",macAddress);

    // mqtt connect
    var client  = mqtt.connect('mqtt://smoje.ch');

    // enable the subscription router
    var router = mqttrouter.wrap(client);

    var publishError = function(message) {
        console.error("Error: ", message);
        client.publish('/' + deviceType + '/' + deviceID + '/' + sPort + '/error', message.toString());
    };

    // Serialport Handlers
    var reconnectSerial = function(callback) {

        serial = new serialport.SerialPort("/dev/" + sPort, serialSettings , false); // this is the openImmediately flag [default is true]

        serial.on('data', function (data) {

            var output = {};
            var lines = data.split("\r\n");

            if(lines.length < 10) {
                console.log('Invalid packet');
                return;
            }

            for(var i = 0; i < lines.length; i++) {
                var parts = lines[i].split('\t');
                if(parts.length == 2) {
                    //console.log('parts', parts)
                    var negative = parts[1].substring(2);


                    if(S(parts[1]).isNumeric()) {
                        output[parts[0]] = S(parts[1]).toInteger();
                    }
                    else if(S(negative).isNumeric()) {
                        output[parts[0]] = parseInt(parts[1], 10);
                    }
                    else {
                        output[parts[0]] = parts[1];
                    }
                }
            }

            console.log('publish to ', 'mv700', ' received data: ', output);
            client.publish('mv700', JSON.stringify(output));
            //client.publish('/' + deviceType + '/' + deviceID + '/' + sPort + '/data', JSON.stringify(output));
        });

        serial.on('open', function () {
            console.log('opened serialport ', serial.path);
            client.publish('/' + deviceType + '/' + deviceID + '/' + sPort + '/open', '');
        });

        serial.on('close', function () {
            console.log('closed serialport ', serial.path);
            client.publish('/' + deviceType + '/' + deviceID + '/' + sPort + '/close', '');
        });

        serial.on('error', function(error) {
            publishError('Serial-Error ' + error.toString());
        });

        serial.open(function (error) {
            if ( error ) {
                publishError('failed to open serialport: ' + error.toString());
                return;
            }

            if(callback) callback(error);
        });
    };

    // MQTT Handlers
    router.subscribe('/' + deviceType + '/' + deviceID + '/' + sPort + '/write', function(topic, message){

        if(!serial.isOpen()) {

            reconnectSerial(function (err) {
                if(err) {
                    return;
                }

                //console.log('write message to serial', message);
                serial.write(message, function (err) {
                    if (err) {
                        publishError('failed to write on serialport: ' + err.toString());
                    }
                });
            });
        }
        else {
            // message is Buffer
            console.log('write message to serial', message);
            serial.write(message, function (err) {
                if (err) {
                    publishError('failed to write on serialport: ' + err.toString());
                }
            });
        }
    });

    router.subscribe('/' + deviceType + '/' + deviceID + '/' + sPort + '/ping', function(topic, message){
        var status = { isOpen: serial.isOpen(), ping: message };

        client.publish('/' + deviceType + '/' + deviceID + '/' + sPort + '/status', JSON.stringify(status));
    });

    router.subscribe('/' + deviceType + '/' + deviceID + '/all/ping', function(topic, message){
        var status = { isOpen: serial.isOpen(), ping: message };

        client.publish('/' + deviceType + '/' + deviceID + '/' + sPort + '/status', JSON.stringify(status));
    });

    router.subscribe('/' + deviceType + '/all/all/ping', function(topic, message){
        var status = { isOpen: serial.isOpen(), ping: message };

        client.publish('/' + deviceType + '/' + deviceID + '/' + sPort + '/status', JSON.stringify(status));
    });

    // start the gateway up
    client.on('connect', function () {
        reconnectSerial();
    });

});
