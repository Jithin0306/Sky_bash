// ============================================================================
// src/network/trysteroManager.js
// ============================================================================
// Phase 12: 100% Serverless WebRTC Peer-to-Peer Multiplayer via Trystero!
// - Zero backend server required — runs directly on GitHub Pages!
// - Supports Custom Player Names (persisted in localStorage & synced live).
// - Supports 4-Digit Room Codes (e.g. "4829") and 1-Click Invite Links (?room=4829).
// - Supports 3 Game Modes:
//     1. "1v1" : 2-Player Duel (VOLT vs PYRO)
//     2. "2v2" : 4-Player Team Battle (Team Blue vs Team Red)
//     3. "ffa" : 3-to-6 Player Free-For-All Chaos (No Teams, up to 6 Fighters!)
// - Includes automatic Host Failover and reliable WebRTC handshake sync.
// ============================================================================

import { joinRoom, selfId } from "trystero";
import { FIGHTER_ROSTER } from "../ai/enemyAI.js";

const APP_ID = "sky-bash-25d-arena-v1";
const PLAYER_NAME_STORAGE_KEY = "sky_bash_custom_player_name";

let joinRetryInterval = null;

/**
 * Reads the player's custom nickname from localStorage (or returns "PLAYER 1").
 */
export function getLocalPlayerName() {
  try {
    const saved = localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
    if (saved && saved.trim().length > 0) {
      return saved.trim().slice(0, 12).toUpperCase();
    }
  } catch (e) {}
  return "PLAYER 1";
}

/**
 * Saves the player's custom nickname and syncs it to the active lobby/room!
 */
export function setLocalPlayerName(rawName) {
  const cleaned = String(rawName || "")
    .replace(/[\[\]]/g, "") // Never allow square brackets in KAPLAY drawText!
    .trim()
    .slice(0, 12)
    .toUpperCase() || "PLAYER 1";

  try {
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, cleaned);
  } catch (e) {}

  netState.localPlayerName = cleaned;

  // Update our own slot in netState.slots
  const mySlot =
    netState.slots.find((s) => s.peerId === selfId || s.peerId === "LOCAL_P1") ||
    (netState.isHost ? netState.slots[0] : null);
  if (mySlot) {
    mySlot.playerName = cleaned;
  }

  // Broadcast updated name to room if online
  if (netState.isOnline) {
    if (netState.isHost) {
      broadcastLobbyState();
    } else if (netState.sendLobby) {
      netState.sendLobby({
        type: "NAME_UPDATE",
        peerId: selfId,
        playerName: cleaned,
      });
    }
  }

  return cleaned;
}

// Singleton state for the active multiplayer session (or single-player custom match)
const netState = {
  isOnline: false,
  room: null,
  roomCode: "",
  selfPeerId: selfId,
  localPlayerName: getLocalPlayerName(),
  isHost: true,
  matchStarted: false,
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
 * Initializes default slot descriptors based on current mode and maxPlayers.
 */
export function buildDefaultSlots(mode, maxPlayers, isOnline, hostPeerId) {
  const count =
    mode === "1v1" ? 2 : mode === "2v2" ? 4 : Math.max(3, Math.min(6, maxPlayers));
  const slots = [];
  const myName = getLocalPlayerName();

  for (let i = 0; i < count; i++) {
    const roster = FIGHTER_ROSTER[i] || FIGHTER_ROSTER[0];
    const defaultTeam = mode === "2v2" ? (i < 2 ? "blue" : "red") : "none";
    const isSlot0Human = i === 0 && Boolean(hostPeerId);

    slots.push({
      slot: i,
      name: roster.name,
      playerName: isSlot0Human ? myName : `BOT ${roster.name}`,
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
export function setupSinglePlayerMatchConfig(
  mode = "1v1",
  ffaCount = 4,
  playerTeam = "blue"
) {
  leaveMultiplayerRoom();
  netState.isOnline = false;
  netState.isHost = true;
  netState.matchStarted = false;
  netState.localPlayerName = getLocalPlayerName();
  netState.mode = mode;
  netState.maxPlayers =
    mode === "1v1" ? 2 : mode === "2v2" ? 4 : Math.max(3, Math.min(6, ffaCount));
  netState.fillWithBots = true;
  netState.slots = buildDefaultSlots(
    netState.mode,
    netState.maxPlayers,
    false,
    "LOCAL_P1"
  );
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
export function connectToTrysteroRoom(
  roomCode,
  asHost = true,
  initialMode = "1v1",
  initialMax = 2
) {
  leaveMultiplayerRoom();

  const cleanCode = String(roomCode || generateRoomCode()).trim().slice(0, 6);
  netState.isOnline = true;
  netState.roomCode = cleanCode;
  netState.selfPeerId = selfId;
  netState.localPlayerName = getLocalPlayerName();
  netState.isHost = Boolean(asHost);
  netState.matchStarted = false;
  netState.mode = initialMode;
  netState.maxPlayers =
    initialMode === "1v1" ? 2 : initialMode === "2v2" ? 4 : initialMax;
  netState.fillWithBots = true;
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

    // Periodic Guest Handshake until slot assignment is confirmed
    if (!asHost) {
      joinRetryInterval = setInterval(() => {
        if (!netState.isOnline || netState.isHost || netState.matchStarted) {
          clearInterval(joinRetryInterval);
          joinRetryInterval = null;
          return;
        }
        if (netState.sendLobby) {
          netState.sendLobby({
            type: "JOIN_REQUEST",
            peerId: selfId,
            playerName: getLocalPlayerName(),
          });
        }
      }, 850);
    }

    // 1. Peer Join Event
    room.onPeerJoin((peerId) => {
      if (netState.isHost) {
        assignPeerToOpenSlot(peerId, "PLAYER");
        netState.statusText = `PLAYER CONNECTED! (${getConnectedHumanCount()} ONLINE)`;
        broadcastLobbyState();
      } else {
        netState.statusText = `CONNECTED TO ROOM ${cleanCode}! SYNCING SLOT...`;
        sendLobby({
          type: "JOIN_REQUEST",
          peerId: selfId,
          playerName: getLocalPlayerName(),
        });
      }
      if (netState.onLobbyChange) netState.onLobbyChange();
    });

    // 2. Peer Leave Event (+ Automatic Host Migration!)
    room.onPeerLeave((peerId) => {
      for (const s of netState.slots) {
        if (s.peerId === peerId) {
          const roster = FIGHTER_ROSTER[s.slot] || FIGHTER_ROSTER[0];
          s.peerId = null;
          s.isBot = true;
          s.playerName = `BOT ${roster.name}`;
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
        assignPeerToOpenSlot(
          data.peerId || peerId,
          data.playerName || "ONLINE PLAYER"
        );
        netState.statusText = `PLAYER JOINED! (${getConnectedHumanCount()} PLAYERS IN ROOM)`;
        broadcastLobbyState();
        // If match is already running, immediately pull the newly joined peer in!
        if (netState.matchStarted && netState.sendLobby) {
          netState.sendLobby({
            type: "START_MATCH",
            mode: netState.mode,
            maxPlayers: netState.maxPlayers,
            fillWithBots: netState.fillWithBots,
            slots: netState.slots,
          });
        }
        if (netState.onLobbyChange) netState.onLobbyChange();
      } else if (data.type === "NAME_UPDATE" && netState.isHost) {
        const targetSlot = netState.slots.find(
          (s) => s.peerId === (data.peerId || peerId)
        );
        if (targetSlot && data.playerName) {
          targetSlot.playerName = String(data.playerName)
            .replace(/[\[\]]/g, "")
            .slice(0, 12)
            .toUpperCase();
          broadcastLobbyState();
          if (netState.onLobbyChange) netState.onLobbyChange();
        }
      } else if (data.type === "TEAM_SWITCH" && netState.isHost) {
        const targetSlot = netState.slots.find(
          (s) => s.peerId === (data.peerId || peerId)
        );
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
          netState.statusText = `JOINED AS P${mySlot.slot + 1} (${mySlot.playerName}) — WAITING FOR HOST`;
        }
        if (netState.onLobbyChange) netState.onLobbyChange();
      } else if (data.type === "START_MATCH") {
        netState.mode = data.mode || netState.mode;
        netState.maxPlayers = data.maxPlayers || netState.maxPlayers;
        netState.fillWithBots = Boolean(data.fillWithBots);
        if (Array.isArray(data.slots)) {
          netState.slots = data.slots;
        }
        if (!netState.matchStarted) {
          netState.matchStarted = true;
          if (netState.onStartMatch) {
            netState.onStartMatch();
          }
        }
      }
    });

    // 4. Fighter Movement Channel (30Hz)
    getMove((data, peerId) => {
      // If a Guest receives live arena movement while still waiting in the lobby, auto-enter the arena!
      if (!netState.matchStarted && netState.onStartMatch) {
        netState.matchStarted = true;
        netState.onStartMatch();
      }
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
      if (!netState.matchStarted && netState.onStartMatch) {
        netState.matchStarted = true;
        netState.onStartMatch();
      }
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
 * Assigns a newly joined peerId and their custom playerName to a slot.
 */
function assignPeerToOpenSlot(peerId, customName = "PLAYER") {
  if (!peerId) return;
  const cleanCustom = String(customName || "PLAYER")
    .replace(/[\[\]]/g, "")
    .trim()
    .slice(0, 12)
    .toUpperCase();

  const existing = netState.slots.find((s) => s.peerId === peerId);
  if (existing) {
    if (cleanCustom && cleanCustom !== "PLAYER") {
      existing.playerName = cleanCustom;
    }
    return existing;
  }

  // Find first slot that doesn't have a human peerId yet
  let openSlot = netState.slots.find((s) => !s.peerId);
  if (!openSlot && netState.slots.length < 6) {
    const newIndex = netState.slots.length;
    const roster = FIGHTER_ROSTER[newIndex] || FIGHTER_ROSTER[0];
    openSlot = {
      slot: newIndex,
      name: roster.name,
      playerName: cleanCustom || `PLAYER ${newIndex + 1}`,
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
    openSlot.playerName =
      cleanCustom && cleanCustom !== "PLAYER"
        ? cleanCustom
        : `PLAYER ${openSlot.slot + 1}`;
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
export function setLobbyModeConfig(
  mode,
  maxPlayers = 4,
  fillWithBots = netState.fillWithBots
) {
  netState.mode = mode;
  netState.maxPlayers =
    mode === "1v1" ? 2 : mode === "2v2" ? 4 : Math.max(3, Math.min(6, maxPlayers));
  netState.fillWithBots = Boolean(fillWithBots);

  // Preserve connected human peerIds and custom playerNames when resizing slots
  const currentPeers = netState.slots
    .filter((s) => Boolean(s.peerId))
    .map((s) => ({
      peerId: s.peerId,
      playerName: s.playerName,
      team: s.team,
    }));

  netState.slots = buildDefaultSlots(
    netState.mode,
    netState.maxPlayers,
    netState.isOnline,
    netState.isHost ? selfId : null
  );

  for (let i = 0; i < currentPeers.length && i < netState.slots.length; i++) {
    netState.slots[i].peerId = currentPeers[i].peerId;
    netState.slots[i].playerName =
      currentPeers[i].playerName || `PLAYER ${i + 1}`;
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
    const mySlot =
      netState.slots.find((s) => s.peerId === selfId) || netState.slots[0];
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
 * Sends START_MATCH twice and waits 60ms so WebRTC flushes packets before scene transition.
 */
export function triggerOnlineMatchStart() {
  if (!netState.isHost) return;
  netState.matchStarted = true;

  const payload = {
    type: "START_MATCH",
    mode: netState.mode,
    maxPlayers: netState.maxPlayers,
    fillWithBots: netState.fillWithBots,
    slots: netState.slots,
  };

  if (netState.isOnline && netState.sendLobby) {
    netState.sendLobby(payload);
    setTimeout(() => {
      if (netState.sendLobby) netState.sendLobby(payload);
    }, 35);
  }

  setTimeout(() => {
    if (netState.onStartMatch) {
      netState.onStartMatch();
    }
  }, 65);
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
  if (joinRetryInterval) {
    clearInterval(joinRetryInterval);
    joinRetryInterval = null;
  }
  if (netState.room) {
    try {
      netState.room.leave();
    } catch (e) {}
  }
  netState.room = null;
  netState.isOnline = false;
  netState.matchStarted = false;
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
