var mumble = require('mumble');
var fs = require('fs');
var wav = require('wav');
var Mixer = require('audio-mixer');
var midi = require('midi');
var volume = require("pcm-volume");

var config = require('./config.json');

var NOTEON = 128
var NOTEOFF = 144;
var CTRLCHANGE = 176;

var format = {
  endianness: 'LE',
  channels: 1,
  sampleRate: 44100,
  byteRate: 176400,
  blockAlign: 4,
  bitDepth: 16
};

var currentlyPlaying = [];

var mixer = new Mixer({
  channels: format.channels
});

var masterGain = new volume();
masterGain.setVolume(config.masterGain.gain);

mixer.pipe(masterGain);

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
  masterGain.pipe(outputStream);
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
  if (messageType == CTRLCHANGE){
    if (channel == config.masterGain.channel){
      var gain = velocity/(127/0.7);
      console.log("Setting master gain to.. ", gain);
      masterGain.setVolume(gain);
    }
  }
  config.sounds.forEach((thisSound) => {
    if (channel !== thisSound.startCh) return;
    if (messageType === NOTEON && thisSound.mode === "trigger"){
      currentlyPlaying.push(playFile(thisSound.file, thisSound.gain));
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

function playFile(filename, gainLevel){
  console.log("Playing...", filename);

  var reader = new wav.Reader();
  var gain = new volume();
  gain.setVolume(gainLevel);

  reader.pipe(gain);
  gain.pipe(mixer.input({
    sampleRate: format.sampleRate,
    channels: format.channels,
    bitDepth: format.bitDepth
  }));
  fs.createReadStream(filename).pipe(reader);

  reader.on('finish', () =>{
    currentlyPlaying.forEach((thisPlayer, index) =>{
      if (thisPlayer.reader === reader){
        currentlyPlaying.splice(index,1);
      }
    });
    console.log("Still playing..",currentlyPlaying.length);
  });
  return { "reader": reader, "gain" : gain};
}
