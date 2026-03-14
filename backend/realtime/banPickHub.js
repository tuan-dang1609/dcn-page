import { toBanPickPayload } from "../utils/banPick.js";

const ROOM_PREFIX = "banpick:round:";

const normalizeRoundSlug = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

let banPickIo = null;

export const getBanPickRoomName = (roundSlug) =>
  `${ROOM_PREFIX}${normalizeRoundSlug(roundSlug)}`;

export const setBanPickSocketServer = (io) => {
  banPickIo = io ?? null;
};

export const getBanPickSocketServer = () => banPickIo;

export const emitBanPickRoomState = ({ roundSlug, session }) => {
  if (!banPickIo || !session) return false;

  const normalizedRoundSlug = normalizeRoundSlug(roundSlug);
  if (!normalizedRoundSlug) return false;

  const roomName = getBanPickRoomName(normalizedRoundSlug);
  const roomPayload = toBanPickPayload(session, null);

  // Primary state event used by the current frontend.
  banPickIo.to(roomName).emit("banpick:state", roomPayload);
  // Compatibility event name for legacy clients.
  banPickIo.to(roomName).emit("banpick:update", roomPayload);

  return true;
};

export const emitBanPickViewerContext = ({ socket, viewerTeamSlot, userId }) => {
  if (!socket) return;

  socket.emit("banpick:self", {
    viewer_team_slot: viewerTeamSlot,
    can_act: Boolean(viewerTeamSlot),
    user_id: toNumber(userId),
  });
};
