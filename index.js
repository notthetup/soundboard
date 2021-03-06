var mumble = require('mumble');
var fs = require('fs');
var wav = require('wav');
var Mixer = require('audio-mixer');
var midi = require('midi');
var Speaker = require('speaker');

var config = require('./config.json');

var NOTEON = 144
var NOTEOFF = 128;
var CTRLCHANGE = 176;

var STOPCH = 50;

var DECREMENT_STEPS = 20;

var LOCAL = process.argv[2] == '--local';

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

if (LOCAL){
  mixer.pipe(new Speaker({
    channels: 1,          // 2 channels
    bitDepth: 16,         // 16-bit samples
    sampleRate: 44100     // 44,100 Hz sample rate
  }));
}



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
    console.log("50. All : Stopping All Sounds!");
    currentlyPlaying.forEach((thisPlayer) =>{
      thisPlayer.mixerInput.end();
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
        if (thisPlayer.config.channel === channel){

            var fadeTime = thisPlayer.config.fadeOut || 0;
            var fadeDecrement = thisPlayer.mixerInput.gain/DECREMENT_STEPS;
            if (fadeTime){
              logMessage(thisPlayer.config, "Fading Out.. ");
              clearInterval(thisPlayer.fadeInterval);
              var fadeInterval = setInterval(() => {
                thisPlayer.mixerInput.gain -= fadeDecrement;
              },fadeTime/DECREMENT_STEPS);
            }
            setTimeout(() => {
              logMessage(thisPlayer.config,"Stopping.. ");
              clearInterval(fadeInterval);
              thisPlayer.mixerInput.end();
            },fadeTime);
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
  logMessage(soundConfig, (soundConfig.mode ==  'trigger' ? "Triggering..." : "Playing..."));

  var file = fs.createReadStream(soundConfig.file, { highWaterMark: 1024 });
  var reader = new wav.Reader();
  var mixerInput = mixer.input();

  mixerInput.on('finish', () =>{
    currentlyPlaying.forEach((thisPlayer, index) =>{
      if (thisPlayer.mixerInput === mixerInput){
          logMessage(thisPlayer.config,"Finishing up...");
          currentlyPlaying.splice(index,1);
      }
    });
    if (currentlyPlaying.length){
      console.log("Still playing.. ",currentlyPlaying.length, " tracks");
    }
  });

  var fadeTime = soundConfig.fadeIn || 0;
  var fadeIncrement = soundConfig.gain/DECREMENT_STEPS;
  if (fadeTime){
    logMessage(soundConfig,"Fading In.. ");
    mixerInput.gain = 0;
    var fadeInterval = setInterval(() => {
      mixerInput.gain += fadeIncrement;
    },fadeTime/DECREMENT_STEPS);
  }
  setTimeout(() => {
    clearInterval(fadeInterval);
    mixerInput.gain = soundConfig.gain;
  },fadeTime);

  file.pipe(reader).pipe(mixerInput);
  return {"mixerInput": mixerInput, "config": soundConfig, "fadeInterval" : fadeInterval};
}

function logMessage(config, message){
  console.log(config.channel + ". " + config.name + " : " + message);
}
