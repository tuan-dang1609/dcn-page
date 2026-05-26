const streamsByUserId = new Map();
let heartbeatTimer = null;

const toUserId = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const getStreamSet = (userId) => {
  const nextUserId = toUserId(userId);
  if (!nextUserId) return null;

  let streamSet = streamsByUserId.get(nextUserId);
  if (!streamSet) {
    streamSet = new Set();
    streamsByUserId.set(nextUserId, streamSet);
  }

  return streamSet;
};

const encodePayload = (payload) => JSON.stringify(payload);

const sendToSocket = (socket, payload) => {
  if (!socket) return false;

  try {
    if (typeof socket.send === "function") {
      socket.send(payload);
      return true;
    }

    if (socket.raw && typeof socket.raw.send === "function") {
      socket.raw.send(payload);
      return true;
    }
  } catch {
    return false;
  }

  return false;
};

const startHeartbeat = () => {
  if (heartbeatTimer) return;

  heartbeatTimer = setInterval(() => {
    const frame = encodePayload({
      type: "ping",
      ts: new Date().toISOString(),
    });

    for (const [userId, streamSet] of streamsByUserId.entries()) {
      for (const socket of [...streamSet]) {
        if (!sendToSocket(socket, frame)) {
          streamSet.delete(socket);
        }
      }

      if (streamSet.size === 0) {
        streamsByUserId.delete(userId);
      }
    }

    if (streamsByUserId.size === 0 && heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }, 25000);
};

const stopHeartbeatIfIdle = () => {
  if (streamsByUserId.size > 0 || !heartbeatTimer) return;

  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
};

export const registerTeamInviteSocket = (userId, socket) => {
  const nextUserId = toUserId(userId);
  if (!nextUserId) return () => {};

  const streamSet = getStreamSet(nextUserId);
  if (!streamSet) return () => {};

  streamSet.add(socket);
  startHeartbeat();

  try {
    sendToSocket(
      socket,
      encodePayload({
        type: "ready",
        ok: true,
        userId: nextUserId,
      }),
    );
  } catch {
    streamSet.delete(socket);
  }

  return () => {
    const currentSet = streamsByUserId.get(nextUserId);
    if (currentSet) {
      currentSet.delete(socket);
      if (currentSet.size === 0) {
        streamsByUserId.delete(nextUserId);
      }
    }

    stopHeartbeatIfIdle();
  };
};

export const broadcastTeamInvitePayload = (payload) => {
  const inviteeId = toUserId(
    payload?.invitee_id ?? payload?.invite?.invitee_id ?? null,
  );

  if (!inviteeId) return 0;

  const streamSet = streamsByUserId.get(inviteeId);
  if (!streamSet || streamSet.size === 0) return 0;

  const frame = encodePayload(payload);
  let delivered = 0;

  for (const socket of [...streamSet]) {
    try {
      if (sendToSocket(socket, frame)) {
        delivered += 1;
      } else {
        streamSet.delete(socket);
      }
    } catch {
      streamSet.delete(socket);
    }
  }

  if (streamSet.size === 0) {
    streamsByUserId.delete(inviteeId);
  }

  return delivered;
};

export const closeTeamInviteSocket = (userId, socket) => {
  const nextUserId = toUserId(userId);
  if (!nextUserId) return;

  const streamSet = streamsByUserId.get(nextUserId);
  if (!streamSet) return;

  streamSet.delete(socket);
  if (streamSet.size === 0) {
    streamsByUserId.delete(nextUserId);
  }

  stopHeartbeatIfIdle();
};
