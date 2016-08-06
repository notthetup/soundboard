var mumble = require('mumble');
var fs = require('fs');
var wav = require('wav');
var Mixer = require('audio-mixer');

var format = {
  endianness: 'LE',
  channels: 1,
  sampleRate: 44100,
  byteRate: 176400,
  blockAlign: 4,
  bitDepth: 16
};


var reader = new wav.Reader();

var mixer = new Mixer({
	channels: format.channels
});

var mixInput, connection;

var options = {
    key: fs.readFileSync( 'key.pem' ),
    cert: fs.readFileSync( 'cert.pem' )
};

console.log( 'Connecting' );
mumble.connect( 'mumble://listen.webuild.sg', options, function ( error, conn ) {
    if( error ) { throw new Error( error ); }

    console.log( 'Connected' );
    connection = conn;

    connection.authenticate( 'ExampleUser');
    connection.on( 'initialized', function(){
      // the "format" event gets emitted at the end of the WAVE header

      mixer.pipe(connection.inputStream(format));

      playFile('rimshot_mono.wav');
      setTimeout(function(){
        playFile('rimshot_mono.wav');
      },10000);

    });
});

function playFile(filename){
  var reader = new wav.Reader();
  reader.pipe(mixer.input({
    sampleRate: format.sampleRate,
    channels: format.channels,
    bitDepth: format.bitDepth
  }));
  fs.createReadStream(filename).pipe(reader);
}
