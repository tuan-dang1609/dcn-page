import { toBanPickPayload } from "../utils/banPick.js";

const ROOM_PREFIX = "banpick:round:";
const MATCH_ROOM_PREFIX = "banpick:match:";

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

export const getBanPickMatchRoomName = (matchId) => {
  const normalizedMatchId = toNumber(matchId);
  if (!normalizedMatchId) return null;
  return `${MATCH_ROOM_PREFIX}${normalizedMatchId}`;
};

export const setBanPickSocketServer = (io) => {
  banPickIo = io ?? null;
};

export const emitBanPickRoomState = ({ roundSlug, session }) => {
  if (!banPickIo || !session) return false;

  const normalizedRoundSlug = normalizeRoundSlug(roundSlug);
  const roomPayload = toBanPickPayload(session, null);

  let emitted = false;

  if (normalizedRoundSlug) {
    const roomName = getBanPickRoomName(normalizedRoundSlug);
    banPickIo.to(roomName).emit("banpick:state", roomPayload);
    emitted = true;
  }

  const matchRoomName = getBanPickMatchRoomName(session.match_id);
  if (matchRoomName) {
    banPickIo.to(matchRoomName).emit("banpick:state", roomPayload);
    emitted = true;
  }

  return emitted;
};

export const emitBanPickViewerContext = ({
  socket,
  viewerTeamSlot,
  userId,
}) => {
  if (!socket) return;

  socket.emit("banpick:self", {
    viewer_team_slot: viewerTeamSlot,
    can_act: Boolean(viewerTeamSlot),
    user_id: toNumber(userId),
  });
};
