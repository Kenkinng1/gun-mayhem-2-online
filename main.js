"use strict";

let game_keyup = null;
let game_keydown = null;

window.RufflePlayer = window.RufflePlayer || {};

var callIntervalId = null;

var guest_video_id = null;
var guest_data_id = null;

// Key remapping for guest player
// Maps guest's preferred keys -> game's Player 2 keys
var guestKeyMap = {
    "ArrowUp": "KeyW",
    "ArrowDown": "KeyS",
    "ArrowLeft": "KeyA",
    "ArrowRight": "KeyD",
    "ShiftLeft": "KeyQ",
    "KeyE": "KeyE",
};

// The game actions and their default Player 2 codes
var gameActions = [
    { name: "Move Up",    gameCode: "KeyW" },
    { name: "Move Down",  gameCode: "KeyS" },
    { name: "Move Left",  gameCode: "KeyA" },
    { name: "Move Right", gameCode: "KeyD" },
    { name: "Shoot",      gameCode: "KeyQ" },
    { name: "Throw",      gameCode: "KeyE" },
];

// Default guest bindings (arrow keys + L-Shift/E — same layout as host)
var defaultGuestBindings = {
    "Move Up": "ArrowUp",
    "Move Down": "ArrowDown",
    "Move Left": "ArrowLeft",
    "Move Right": "ArrowRight",
    "Shoot": "ShiftLeft",
    "Throw": "KeyE",
};

function codeToLabel(code) {
    var labels = {
        "ArrowUp": "↑", "ArrowDown": "↓", "ArrowLeft": "←", "ArrowRight": "→",
        "Period": ".", "Comma": ",", "Slash": "/", "Semicolon": ";",
        "Quote": "'", "BracketLeft": "[", "BracketRight": "]",
        "Backslash": "\\", "Minus": "-", "Equal": "=",
        "Space": "Space", "Enter": "Enter", "ShiftLeft": "L-Shift",
        "ShiftRight": "R-Shift", "ControlLeft": "L-Ctrl", "ControlRight": "R-Ctrl",
        "Tab": "Tab", "Backspace": "Backspace",
    };
    if (labels[code]) return labels[code];
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    return code;
}

function rebuildKeyMap() {
    guestKeyMap = {};
    for (var i = 0; i < gameActions.length; i++) {
        var action = gameActions[i];
        var guestCode = defaultGuestBindings[action.name];
        if (guestCode) {
            guestKeyMap[guestCode] = action.gameCode;
        }
    }
}

function renderKeybindUI() {
    var html = '<div class="keybind-grid">';
    for (var i = 0; i < gameActions.length; i++) {
        var action = gameActions[i];
        var bound = defaultGuestBindings[action.name];
        var label = bound ? codeToLabel(bound) : "—";
        html += '<div class="keybind-row">' +
            '<span class="keybind-action">' + action.name + '</span>' +
            '<button class="keybind-btn" data-action="' + action.name + '" onclick="startRebind(this)">' + label + '</button>' +
            '</div>';
    }
    html += '</div>';
    html += '<div class="button-row"><button onclick="confirmBindings()">Confirm Controls</button></div>';
    return html;
}

var activeRebindBtn = null;

function startRebind(btn) {
    if (activeRebindBtn) {
        activeRebindBtn.classList.remove("listening");
        activeRebindBtn.textContent = codeToLabel(defaultGuestBindings[activeRebindBtn.dataset.action]) || "—";
    }
    activeRebindBtn = btn;
    btn.classList.add("listening");
    btn.textContent = "Press a key…";
}

function handleRebindKey(ev) {
    if (!activeRebindBtn) return;
    ev.preventDefault();
    var actionName = activeRebindBtn.dataset.action;

    // Remove old binding if this key is already used for another action
    for (var name in defaultGuestBindings) {
        if (defaultGuestBindings[name] === ev.code && name !== actionName) {
            defaultGuestBindings[name] = null;
            var otherBtn = document.querySelector('.keybind-btn[data-action="' + name + '"]');
            if (otherBtn) otherBtn.textContent = "—";
        }
    }

    defaultGuestBindings[actionName] = ev.code;
    activeRebindBtn.textContent = codeToLabel(ev.code);
    activeRebindBtn.classList.remove("listening");
    activeRebindBtn = null;
    rebuildKeyMap();
}

function confirmBindings() {
    if (activeRebindBtn) {
        activeRebindBtn.classList.remove("listening");
        activeRebindBtn = null;
    }
    rebuildKeyMap();
    document.getElementById("keybindconfig").remove();
    document.getElementById("connectiondetails").innerHTML =
        "<h1>Connection Information</h1><p>Connecting…</p>";
    on_guest_load();
}

function on_host_load() {
    const ruffle = window.RufflePlayer.newest();
    const player = ruffle.createPlayer();
    const container = document.getElementById("container");
    player.style.width = "100%";
    player.style.height = "800px";
    container.appendChild(player);
    player.load("gun-mayhem-2.swf");
    const peer = new Peer();
    console.log("peer=", peer);
    peer.on('open', function(id) {
        console.log('My peer ID is: ' + id);
        let conn = peer.connect(guest_data_id);
        conn.on('open', function() {
            console.log("Keyboard connection established");
            // Receive messages
            conn.on('data', function(data) {
                console.log("received data", data);
                window.dispatchEvent(new KeyboardEvent(data["type"], {
                    code: data['code'],
                }));
            });
        });
    });

    const videopeer = new Peer();
    callIntervalId = setInterval(function(p) {
        const canvasElt = document.querySelector("ruffle-player")?.shadowRoot.querySelector("canvas");
        if (canvasElt != null) {
            console.log("Canvas exists, setting up call now");
            const stream = canvasElt.captureStream(30); // FPS
            const video_track = stream.getVideoTracks()[0];
            video_track.contentHint = "motion";
            var call = p.call(guest_video_id, stream);
            console.log("stream=", stream);
            clearInterval(callIntervalId);
        } else {
            console.log("canvas still null");
        }
    }, 1000, videopeer);
}

function transmitKeystroke(conn, type, event) {
    var code = event.code;
    // Remap guest keys to Player 2 game keys
    if (guestKeyMap[code]) {
        code = guestKeyMap[code];
    }
    console.log("transmitting ", type, code);
    conn.send({type: type, code: code});
}

var displayPeerIdIntervalId = null;

function on_guest_load() {
    const peer = new Peer();

    console.log("peer=", peer);
    peer.on('open', function(id) {
        console.log('Opened, data peer ID is: ' + id);
        guest_data_id = id;
    });
    peer.on('connection', function(conn) {
        document.getElementById("connectiondetails").innerHTML = "";
        conn.on('open', function() {
            console.log("Keyboard connection established");
            document.addEventListener("keyup", function(ev) {transmitKeystroke(conn, "keyup", ev)});
            document.addEventListener("keydown", function(ev) {transmitKeystroke(conn, "keydown", ev)});
        });
    });

    const videopeer = new Peer();
    videopeer.on('open', function(id) {
        console.log('Opened, video peer ID is: ' + id);
        guest_video_id = id;
    })
    videopeer.on('call', function(call) {
        console.log("received call");
        call.on('stream', function(stream) {
            console.log("On stream, setting video element to ", stream);
            const video_track = stream.getVideoTracks()[0];
            video_track.contentHint = "motion";
            document.getElementById("receiving-video").srcObject = stream;
            document.getElementById("receiving-video").play();
        });
        call.answer();
    });

    displayPeerIdIntervalId = setInterval(function() {
        if (guest_data_id != null && guest_video_id != null) {
            let combinedID = `${guest_data_id}/${guest_video_id}`
            document.getElementById("connectiondetails").innerHTML =
                `<h1>Connection Information</h1><p>Please pass your connection ID
                <input id="connectionid" readonly size="${combinedID.length}" value="${combinedID}"> to the host.
                The game will automatically start when the host clicks the 'Start game' button`
            clearInterval(displayPeerIdIntervalId);
        } else {
            console.log("still null");
        }
    }, 200);
}

function submit_host_id() {
    let guest_combined_id = document.getElementById("guest_combined_id").value.trim();
    if (guest_combined_id.length == 73) {
        guest_data_id = guest_combined_id.split('/')[0];
        guest_video_id = guest_combined_id.split('/')[1];
        on_host_load();
        document.getElementById("connectiondetails").innerHTML = '';
    } else {
        document.getElementById("error-connectiondetails").innerText = "An error happened";
    }
}

function click_host() {
    document.getElementById("hostguestchoice").remove();
    document.getElementById("connectiondetails").innerHTML = `
        <h1>Host</h1>
        <p>Please paste the ID you received from the guest</p>
        <input id="guest_combined_id" size="73">
        <div class="button-row"><button onclick="submit_host_id()">Start game</button></div>
        <div id="error-connectiondetails"></div>
    `
}

function click_guest() {
    document.getElementById("hostguestchoice").remove();
    // Show keybind config before connecting
    var configDiv = document.createElement("div");
    configDiv.id = "keybindconfig";
    configDiv.className = "modal";
    configDiv.innerHTML =
        '<h1>Configure Your Controls</h1>' +
        '<p>Click a button then press the key you want to use. By default, your controls mirror Player 1 (arrow keys + <code>.</code>/<code>,</code>).</p>' +
        renderKeybindUI();
    document.body.insertBefore(configDiv, document.getElementById("connectiondetails"));
    document.addEventListener("keydown", handleRebindKey);
}
