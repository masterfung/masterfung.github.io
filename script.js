// Generate random room name if needed
if (!location.hash) {
  location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
}
const roomHash = location.hash.substring(1); //added after the '#'

const drone = new ScaleDrone('paQhhhShd3zfDX0Y');
// Room name needs to be prefixed with 'observable-'
const roomName = "observable-" + roomHash;
const configuration = {
  'iceServers': [{
    'url': 'stun:stun.services.mozilla.com'
  },
  {
      'url': 'stun:stun.l.google.com:19302'
  }
  ]
};
let room, pc;

function onSuccess() {console.log('Success');}

function onError(error) {
  console.error(error);
}

drone.on('open', error => {
  if (error) {
    return console.error(error);
  }
  room = drone.subscribe(roomName);
  room.on('open', error => {
    if (error) {
      onError(error);
    }
  });
  // We're connected to the room and received an array of 'members'
  // connected to the room (including us). Signaling server is ready.
  room.on('members', members => {
    console.log('MEMBERS', members);
    if (members.length > 2) {
      console.log('Cannot have more than 2 members.');
      return alert('This room already has 2 members. Please try another time or room.');
    }
    // If we are the second user to connect to the room we will be creating the offer
    const isOfferer = members.length === 2;
    startWebRTC(isOfferer);
  });
});

let stopVideoFirstUser = k => localVideo.srcObject.getTracks().map(t => t.kind == k && t.stop()),
    stopVideoSecondUser = k => remoteVideo.srcObject.getTracks().map(t => t.kind == k && t.stop());

// Send signaling data via Scaledrone
function sendMessage(message) {
  drone.publish({
    room: roomName,
    message
  });
}

function startWebRTC(isOfferer) {
  pc = new RTCPeerConnection(configuration);

  // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
  // message to the other peer through the signaling server
  pc.onicecandidate = event => {
    if (event.candidate) {
      sendMessage({'candidate': event.candidate});
    }
  };

  // If user is offerer let the 'negotiationneeded' event create the offer
  if (isOfferer) {
    console.log('Second Person Joins');
    pc.onnegotiationneeded = () => {
      pc.createOffer().then(localDescCreated).catch(onError);
    }
  }

  // When a remote stream arrives display it in the #remoteVideo element
  pc.onaddstream = event => {
    remoteVideo.srcObject = event.stream;
    remoteVideo.onloadedmetadata = function(e) {
      remoteVideo.play();
      remoteVideo.muted = true;
      document.getElementById('second-user').disabled = false;
  };
  };

  navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true,
  }).then(stream => {
    // Display your local video in #localVideo element
    localVideo.srcObject = stream;
    localVideo.onloadedmetadata = function(e) {
      localVideo.play();
      localVideo.muted = true;
      document.getElementById('first-user').disabled = false;
  };
    // Add your stream to be sent to the connecting peer
    console.log('Stream->>>', stream);
    pc.addStream(stream);
  }, onError);

  // Listen to signaling data from Scaledrone
  room.on('data', (message, client) => {
    // Message was sent by us
    if (client.id === drone.clientId) {
      return;
    }

    if (message.sdp) {
      // This is called after receiving an offer or answer from another peer
      pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        // When receiving an offer lets answer it
        if (pc.remoteDescription.type === 'offer') {
          pc.createAnswer().then(localDescCreated).catch(onError);
        }
      }, onError);
    } else if (message.candidate) {
      // Add the new ICE candidate to our connections remote description
      pc.addIceCandidate(
        new RTCIceCandidate(message.candidate), onSuccess, onError
      );
    }
  });
}

function localDescCreated(desc) {
  console.log('HERE');
  pc.setLocalDescription(
    desc,
    () => sendMessage({'sdp': pc.localDescription}),
    onError
  );
}
