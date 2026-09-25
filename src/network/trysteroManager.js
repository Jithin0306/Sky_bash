// ============================================================================
// src/network/trysteroManager.js
// ============================================================================
// Phase 12: 100% Serverless WebRTC Peer-to-Peer Multiplayer via Trystero!
// - Zero backend server required — runs directly on GitHub Pages!
// - Supports 4-Digit Room Codes (e.g. "4829") and 1-Click Invite Links (?room=4829).
// - Supports 3 Game Modes:
//     1. "1v1" : 2-Player Duel (VOLT vs PYRO)
//     2. "2v2" : 4-Player Team Battle (Team Blue vs Team Red)
//     3. "ffa" : 3-to-6 Player Free-For-All Chaos (No Teams, up to 6 Fighters!)
// - Includes automatic Host Failover if Slot 0 leaves.
// ============================================================================

import { joinRoom, selfId } from "trystero";
import { FIGHTER_ROSTER } from "../ai/enemyAI.js";

const APP_ID = "sky-bash-25d-arena-v1";

// Singleton state for the active multiplayer session (or single-player custom match)
const netState = {
  isOnline: false,
  room: null,
  roomCode: "",
  selfPeerId: selfId,
  isHost: true,
  mode: "1v1",        // "1v1" | "2v2" | "ffa"
  maxPlayers: 2,      // 2 for 1v1, 4 for 2v2, 3..6 for ffa
  fillWithBots: true, // Fill unoccupied slots with AI Bots when match starts
  statusText: "READY",
  slots: [],          // Array of up to 6 slot descriptors
  // Action senders
  sendLobby: null,
  sendMove: null,
  sendCombat: null,
  sendWorld: null,
  sendResult: null,
  // Scene listeners
  onLobbyChange: null,
  onStartMatch: null,
  onRemoteMove: null,
  onRemoteCombat: null,
  onWorldSync: null,
  onMatchResult: null,
};

/**
 * Initializes default 6 slot descriptors based on current mode and maxPlayers.
 */
export function buildDefaultSlots(mode, maxPlayers, isOnline, hostPeerId) {
  const count = mode === "1v1" ? 2 : mode === "2v2" ? 4 : Math.max(3, Math.min(6, maxPlayers));
  const slots = [];

  for (let i = 0; i < count; i++) {
    const roster = FIGHTER_ROSTER[i] || FIGHTER_ROSTER[0];
    const defaultTeam =
      mode === "2v2" ? (i < 2 ? "blue" : "red") : "none";

    const isSlot0Human = i === 0;
    slots.push({
      slot: i,
      name: roster.name,
      peerId: isSlot0Human ? hostPeerId : null,
      isBot: !isSlot0Human,
      team: defaultTeam,
      ready: true,
    });
  }

  return slots;
}

/**
 * Configures a Single-Player (Offline vs AI Bots) match configuration for
 * 1v1, 2v2 Team Battle, or 3-to-6 Player Free-For-All!
 */
export function setupSinglePlayerMatchConfig(mode = "1v1", ffaCount = 4, playerTeam = "blue") {
  leaveMultiplayerRoom();
  netState.isOnline = false;
  netState.isHost = true;
  netState.mode = mode;
  netState.maxPlayers = mode === "1v1" ? 2 : mode === "2v2" ? 4 : Math.max(3, Math.min(6, ffaCount));
  netState.fillWithBots = true;
  netState.slots = buildDefaultSlots(netState.mode, netState.maxPlayers, false, "LOCAL_P1");
  if (mode === "2v2") {
    netState.slots[0].team = playerTeam;
    netState.slots[1].team = playerTeam;
    const rivalTeam = playerTeam === "blue" ? "red" : "blue";
    netState.slots[2].team = rivalTeam;
    netState.slots[3].team = rivalTeam;
  }
  return getActiveMatchConfig();
}

/**
 * Generates a random 4-digit room code (`1000` - `9999`).
 */
export function generateRoomCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Joins or creates a Trystero serverless WebRTC room with the given 4-digit code.
 */
export function connectToTrysteroRoom(roomCode, asHost = true, initialMode = "1v1", initialMax = 2) {
  leaveMultiplayerRoom();

  const cleanCode = String(roomCode || generateRoomCode()).trim().slice(0, 6);
  netState.isOnline = true;
  netState.roomCode = cleanCode;
  netState.selfPeerId = selfId;
  netState.isHost = Boolean(asHost);
  netState.mode = initialMode;
  netState.maxPlayers = initialMode === "1v1" ? 2 : initialMode === "2v2" ? 4 : initialMax;
  netState.fillWithBots = false;
  netState.statusText = asHost
    ? `HOSTING ROOM ${cleanCode} — WAITING FOR PLAYERS...`
    : `CONNECTING TO ROOM ${cleanCode}...`;

  netState.slots = buildDefaultSlots(
    netState.mode,
    netState.maxPlayers,
    true,
    asHost ? selfId : null
  );

  try {
    const room = joinRoom({ appId: APP_ID }, `room-${cleanCode}`);
    netState.room = room;

    // Create the 5 Trystero high-speed channels (<= 12 chars each)
    const [sendLobby, getLobby] = room.makeAction("lobby");
    const [sendMove, getMove] = room.makeAction("move");
    const [sendCombat, getCombat] = room.makeAction("combat");
    const [sendWorld, getWorld] = room.makeAction("world");
    const [sendResult, getResult] = room.makeAction("result");

    netState.sendLobby = sendLobby;
    netState.sendMove = sendMove;
    netState.sendCombat = sendCombat;
    netState.sendWorld = sendWorld;
    netState.sendResult = sendResult;

    // 1. Peer Join Event
    room.onPeerJoin((peerId) => {
      if (netState.isHost) {
        assignPeerToOpenSlot(peerId);
        netState.statusText = `PLAYER CONNECTED! (${getConnectedHumanCount()} ONLINE)`;
        broadcastLobbyState();
      } else {
        netState.statusText = `CONNECTED TO ROOM ${cleanCode}!`;
        // Request slot assignment from Host
        sendLobby({
          type: "JOIN_REQUEST",
          peerId: selfId,
        });
      }
      if (netState.onLobbyChange) netState.onLobbyChange();
    });

    // 2. Peer Leave Event (+ Automatic Host Migration!)
    room.onPeerLeave((peerId) => {
      for (const s of netState.slots) {
        if (s.peerId === peerId) {
          s.peerId = null;
          s.isBot = true;
        }
      }

      // Check if we are now the lowest human slot (Host Failover)
      const firstHumanSlot = netState.slots.find((s) => s.peerId !== null);
      if (firstHumanSlot && firstHumanSlot.peerId === selfId && !netState.isHost) {
        netState.isHost = true;
        netState.statusText = "HOST MIGRATED — YOU ARE NOW ROOM HOST!";
        broadcastLobbyState();
      } else if (netState.isHost) {
        netState.statusText = `PLAYER LEFT (${getConnectedHumanCount()} ONLINE)`;
        broadcastLobbyState();
      }
      if (netState.onLobbyChange) netState.onLobbyChange();
    });

    // 3. Lobby Sync Channel
    getLobby((data, peerId) => {
      if (!data) return;

      if (data.type === "JOIN_REQUEST" && netState.isHost) {
        assignPeerToOpenSlot(data.peerId || peerId);
        broadcastLobbyState();
        if (netState.onLobbyChange) netState.onLobbyChange();
      } else if (data.type === "TEAM_SWITCH" && netState.isHost) {
        const targetSlot = netState.slots.find((s) => s.peerId === (data.peerId || peerId));
        if (targetSlot && netState.mode === "2v2") {
          targetSlot.team = targetSlot.team === "blue" ? "red" : "blue";
          broadcastLobbyState();
          if (netState.onLobbyChange) netState.onLobbyChange();
        }
      } else if (data.type === "LOBBY_STATE") {
        netState.mode = data.mode || netState.mode;
        netState.maxPlayers = data.maxPlayers || netState.maxPlayers;
        netState.fillWithBots = Boolean(data.fillWithBots);
        if (Array.isArray(data.slots)) {
          netState.slots = data.slots;
        }
        const mySlot = netState.slots.find((s) => s.peerId === selfId);
        if (mySlot) {
          netState.statusText = `JOINED AS P${mySlot.slot + 1} (${mySlot.name}) — WAITING FOR HOST`;
        }
        if (netState.onLobbyChange) netState.onLobbyChange();
      } else if (data.type === "START_MATCH") {
        netState.mode = data.mode || netState.mode;
        netState.maxPlayers = data.maxPlayers || netState.maxPlayers;
        netState.fillWithBots = Boolean(data.fillWithBots);
        if (Array.isArray(data.slots)) {
          netState.slots = data.slots;
        }
        if (netState.onStartMatch) {
          netState.onStartMatch();
        }
      }
    });

    // 4. Fighter Movement Channel (30Hz)
    getMove((data, peerId) => {
      if (netState.onRemoteMove) {
        netState.onRemoteMove(data, peerId);
      }
    });

    // 5. Instant Combat Trigger Channel
    getCombat((data, peerId) => {
      if (netState.onRemoteCombat) {
        netState.onRemoteCombat(data, peerId);
      }
    });

    // 6. World Sync Channel (Timer, Items, PowerUps)
    getWorld((data, peerId) => {
      if (netState.onWorldSync) {
        netState.onWorldSync(data, peerId);
      }
    });

    // 7. Match End & Rematch Channel
    getResult((data, peerId) => {
      if (netState.onMatchResult) {
        netState.onMatchResult(data, peerId);
      }
    });
  } catch (err) {
    netState.statusText = "OFFLINE / FALLBACK MODE READY";
  }

  return netState;
}

/**
 * Assigns a newly joined peerId to the first open slot in `netState.slots`.
 */
function assignPeerToOpenSlot(peerId) {
  if (!peerId) return;
  const existing = netState.slots.find((s) => s.peerId === peerId);
  if (existing) return existing;

  // Find first slot that doesn't have a human peerId yet
  let openSlot = netState.slots.find((s) => !s.peerId);
  if (!openSlot && netState.slots.length < 6) {
    const newIndex = netState.slots.length;
    const roster = FIGHTER_ROSTER[newIndex] || FIGHTER_ROSTER[0];
    openSlot = {
      slot: newIndex,
      name: roster.name,
      peerId: null,
      isBot: false,
      team: netState.mode === "2v2" ? (newIndex < 2 ? "blue" : "red") : "none",
      ready: true,
    };
    netState.slots.push(openSlot);
  }

  if (openSlot) {
    openSlot.peerId = peerId;
    openSlot.isBot = false;
  }
}

/**
 * Returns how many human browsers are currently occupying slots.
 */
export function getConnectedHumanCount() {
  return netState.slots.filter((s) => Boolean(s.peerId)).length;
}

/**
 * Updates the Room Mode ("1v1", "2v2", "ffa") and max player count (Host only).
 */
export function setLobbyModeConfig(mode, maxPlayers = 4, fillWithBots = netState.fillWithBots) {
  netState.mode = mode;
  netState.maxPlayers =
    mode === "1v1" ? 2 : mode === "2v2" ? 4 : Math.max(3, Math.min(6, maxPlayers));
  netState.fillWithBots = Boolean(fillWithBots);

  // Preserve connected human peerIds when resizing slots
  const currentPeers = netState.slots
    .filter((s) => Boolean(s.peerId))
    .map((s) => ({ peerId: s.peerId, team: s.team }));

  netState.slots = buildDefaultSlots(
    netState.mode,
    netState.maxPlayers,
    netState.isOnline,
    netState.isHost ? selfId : null
  );

  for (let i = 0; i < currentPeers.length && i < netState.slots.length; i++) {
    netState.slots[i].peerId = currentPeers[i].peerId;
    netState.slots[i].isBot = false;
    if (mode === "2v2") {
      netState.slots[i].team = i < 2 ? "blue" : "red";
    } else {
      netState.slots[i].team = "none";
    }
  }

  broadcastLobbyState();
}

/**
 * Toggles the local player's team ("blue" <-> "red") in 2v2 mode.
 */
export function toggleLocalPlayerTeam() {
  if (netState.mode !== "2v2") return;
  if (netState.isHost) {
    const mySlot = netState.slots.find((s) => s.peerId === selfId) || netState.slots[0];
    if (mySlot) {
      mySlot.team = mySlot.team === "blue" ? "red" : "blue";
      broadcastLobbyState();
    }
  } else if (netState.sendLobby) {
    netState.sendLobby({
      type: "TEAM_SWITCH",
      peerId: selfId,
    });
  }
}

/**
 * Broadcasts the current Lobby State from Host to all connected peers.
 */
export function broadcastLobbyState() {
  if (!netState.isOnline || !netState.isHost || !netState.sendLobby) return;
  netState.sendLobby({
    type: "LOBBY_STATE",
    mode: netState.mode,
    maxPlayers: netState.maxPlayers,
    fillWithBots: netState.fillWithBots,
    slots: netState.slots,
  });
}

/**
 * Called by the Host to start the online match for all connected browsers!
 */
export function triggerOnlineMatchStart() {
  if (!netState.isHost) return;
  if (netState.isOnline && netState.sendLobby) {
    netState.sendLobby({
      type: "START_MATCH",
      mode: netState.mode,
      maxPlayers: netState.maxPlayers,
      fillWithBots: netState.fillWithBots,
      slots: netState.slots,
    });
  }
  if (netState.onStartMatch) {
    netState.onStartMatch();
  }
}

/**
 * Copies the 1-Click Shareable Invite URL (`?room=XXXX`) to the user's clipboard.
 */
export function copyRoomInviteLink() {
  const url = `${window.location.origin}${window.location.pathname}?room=${netState.roomCode}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).catch(() => {});
  }
  netState.statusText = `COPIED INVITE LINK: ?room=${netState.roomCode}`;
  return url;
}

/**
 * Leaves and cleans up any active Trystero room.
 */
export function leaveMultiplayerRoom() {
  if (netState.room) {
    try {
      netState.room.leave();
    } catch (e) {}
  }
  netState.room = null;
  netState.isOnline = false;
  netState.sendLobby = null;
  netState.sendMove = null;
  netState.sendCombat = null;
  netState.sendWorld = null;
  netState.sendResult = null;
}

/**
 * Returns the active match configuration object for `multiplayerArena.js`.
 */
export function getActiveMatchConfig() {
  return netState;
}
