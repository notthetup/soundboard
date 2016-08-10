var mumble = require('mumble');
var fs = require('fs');
var wav = require('wav');
var Mixer = require('audio-mixer');
var midi = require('midi');
var volume = require("pcm-volume");

var config = require('./config.json');

var NOTEON = 144
var NOTEOFF = 128;
var CTRLCHANGE = 176;

var STOPCH = 50;

var format = {
  endianness: 'LE',
  channels: 1,
  sampleRate: 44100,
  byteRate: 176400,
  blockAlign: 4,
  bitDepth: 16,
  gain: config.masterGain.gain
};

var currentlyPlaying = [];

var mumbleInput;
var mixer = new Mixer({
  channels: format.channels,
  sampleRate: format.sampleRate,
  bitDepth: format.bitDepth,
  chunkSize : 256
});


// Set up a new input.
var portNum;
var input = new midi.input();
var numPorts = input.getPortCount();
for (var index=0; index< numPorts; index++){
  if (input.getPortName(index) === config.portName){
    portNum = index;
    break;
  }
}

if (portNum === undefined){
  throw new Error("No MIDI Device Found");
}

console.log("Opening MIDI Port...");
input.openPort(portNum);

connectToMumble(config.url, "FX", {
    key: fs.readFileSync( config.auth.key ),
    cert: fs.readFileSync( config.auth.cert )
  }, onConnection);


function onConnection(outputStream){
  mumbleInput = outputStream;

  mixer.pipe(mumbleInput);

  console.log("Registering MIDI Handler");

  input.on('message', function(deltaTime, message) {
    var messageType = message[0];
    var channel = message[1];
    var velocity = message[2];
    // console.log(messageType,channel,velocity);
    mapToSounds(messageType,channel,velocity);
  });
}

function mapToSounds(messageType,channel,velocity){
  if (channel == STOPCH){
    currentlyPlaying.forEach((thisPlayer) =>{
      thisPlayer.end();
    });
  }

  if (messageType == CTRLCHANGE){
    if (channel == config.masterGain.channel){
      var gain = velocity/(127/0.7);
      console.log("Setting master gain to.. ", gain);
      mumbleInput.setGain(gain);
    }
  }
  config.sounds.forEach((thisSound) => {
    if (channel !== thisSound.channel) return;
    if (messageType === NOTEON){
      currentlyPlaying.push(playFile(thisSound));
    }
    if (messageType === NOTEOFF && thisSound.mode === "play"){
      currentlyPlaying.forEach((thisPlayer) =>{
        if (thisPlayer.channel === channel){
            console.log("Stopping.. ", channel);
            thisPlayer.reader.end();
            thisPlayer.mixerInput.end();
        }
      });
    }
  });
}

function connectToMumble(url, username, options, callback){
  console.log( 'Connecting...' );
  mumble.connect( url, options, function ( error, conn ) {
      if( error ) { throw new Error( error ); }
      console.log( 'Connected to', url );
      conn.authenticate( username);
      conn.on( 'initialized', function(){
        callback(conn.inputStream(format));
      });
  });
}

function playFile(soundConfig){
  console.log("Playing...", soundConfig.file);

  var reader = new wav.Reader();
  var gain = new volume();
  var mixerInput = mixer.input();

  gain.setVolume(soundConfig.gain);

  mixerInput.on('finish', () =>{
    console.log("Finishing up...");
    currentlyPlaying.forEach((thisPlayer, index) =>{
      if (thisPlayer.reader === reader){
          currentlyPlaying.splice(index,1);
      }
    });
    console.log("Still playing..",currentlyPlaying.length);
  });

  fs.createReadStream(soundConfig.file)
  .pipe(reader).pipe(gain).pipe(mixerInput);
  return {"mixerInput": mixerInput, "reader": reader, "gain" : gain, "channel": soundConfig.channel};
}
