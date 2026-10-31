/**
 * Ghép đội tự động cho người chơi lẻ (thuần logic, không đụng DB — xem utils/teamFinder.js).
 *
 * 1. Lấp chỗ trống các đội lẻ đang mở tuyển có bật "cho tự lấp": ưu tiên vị trí đội cần
 *    (recruit_roles), rồi vị trí đội chưa có; người khớp vai trò chính > phụ > flex/fill > bất kỳ,
 *    cùng mức thì ai đăng ký sớm hơn được trước.
 * 2. Người còn lại chia thành đội mới đủ teamSize người. Ai đăng ký sớm được chọn trước
 *    (người thừa không đủ thành đội → unplaced). Trong số được chọn, xếp vị trí cân bằng: mỗi đội
 *    mỗi vị trí 1 người — vai trò chính trước, rồi vai trò phụ, rồi người flex/fill, rồi người còn lại.
 *    Người cùng vị trí được chia ngẫu nhiên vào các đội. Chỗ dư (teamSize > số vị trí) là dự bị.
 * 3. Đội trưởng: ngẫu nhiên trong những người sẵn sàng làm đội trưởng, không có thì ngẫu nhiên.
 *
 * Game không có vai trò (Liên Quân): positions = [] → chỉ chia ngẫu nhiên.
 */

const shuffle = (list, random) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const pick = (list, random) => list[Math.floor(random() * list.length)];

/** Mức khớp của người chơi với 1 vị trí: 3 chính, 2 phụ, 1 flex/fill, 0 khác. */
const matchScore = (agent, role, anyRole) => {
  if (!role) return 0;
  if (agent.primary_role === role) return 3;
  if (agent.secondary_role === role) return 2;
  if (anyRole && (agent.primary_role === anyRole || agent.secondary_role === anyRole)) return 1;
  return 0;
};

/** Vai trò ghi vào đội hình khi người chơi vào chỗ không gắn vị trí. */
const ownRole = (agent, positions) =>
  positions.includes(agent.primary_role)
    ? agent.primary_role
    : positions.includes(agent.secondary_role)
      ? agent.secondary_role
      : agent.primary_role ?? agent.secondary_role ?? null;

/**
 * @param {object} input
 * @param {Array<{user_id, primary_role?, secondary_role?, can_captain?}>} input.agents  theo thứ tự đăng ký
 * @param {Array<{registration_id, size, roles?: string[], wanted?: string[]}>} input.teams  đội cho tự lấp
 * @param {number} input.teamSize           số người mỗi đội (đội hình tối thiểu của giải)
 * @param {string[]} input.positions        vị trí của game ([] nếu không dùng vai trò)
 * @param {string|null} input.anyRole       "flex" / "fill"
 * @param {number} input.maxNewTeams        số đội mới tối đa (còn chỗ trong giải)
 * @param {() => number} [input.random]
 */
export const planTeamFormation = ({
  agents,
  teams = [],
  teamSize,
  positions = [],
  anyRole = null,
  maxNewTeams = Infinity,
  random = Math.random,
}) => {
  let pool = [...agents];
  const fills = [];

  // 1. Lấp chỗ trống đội đang tuyển
  for (const team of shuffle(teams, random)) {
    const open = teamSize - team.size;
    if (open <= 0 || !pool.length) continue;
    const have = new Set(team.roles ?? []);
    const slots = [];
    for (const role of [...(team.wanted ?? []), ...positions]) {
      if (slots.length >= open) break;
      if (positions.includes(role) && !have.has(role) && !slots.includes(role)) slots.push(role);
    }
    while (slots.length < open) slots.push(null);

    const members = [];
    for (const role of slots) {
      if (!pool.length) break;
      let best = 0;
      pool.forEach((agent, index) => {
        if (matchScore(agent, role, anyRole) > matchScore(pool[best], role, anyRole)) best = index;
      });
      const [agent] = pool.splice(best, 1);
      members.push({ user_id: agent.user_id, role: role ?? ownRole(agent, positions) });
    }
    fills.push({ registration_id: team.registration_id, members });
  }

  // 2. Đội mới
  const count = Math.max(0, Math.min(Math.floor(pool.length / teamSize), maxNewTeams));
  const chosen = pool.slice(0, count * teamSize);
  const unplaced = pool.slice(count * teamSize).map((agent) => agent.user_id);
  const newTeams = Array.from({ length: count }, () => ({ members: [], captain_user_id: null }));

  if (count > 0) {
    const slotRoles = positions.slice(0, teamSize);
    if (slotRoles.length) {
      const quota = new Map(slotRoles.map((role) => [role, count]));
      const byRole = new Map(slotRoles.map((role) => [role, []]));
      const assigned = new Set();
      const assign = (agent, role) => {
        byRole.get(role).push(agent);
        quota.set(role, quota.get(role) - 1);
        assigned.add(agent.user_id);
      };
      const mostOpen = () => [...quota.entries()].sort((a, b) => b[1] - a[1])[0];

      for (const key of ["primary_role", "secondary_role"]) {
        for (const agent of chosen) {
          if (!assigned.has(agent.user_id) && quota.get(agent[key]) > 0) assign(agent, agent[key]);
        }
      }
      for (const flexOnly of [true, false]) {
        for (const agent of chosen) {
          if (assigned.has(agent.user_id)) continue;
          const isFlex = anyRole && (agent.primary_role === anyRole || agent.secondary_role === anyRole);
          if (flexOnly && !isFlex) continue;
          const [role, left] = mostOpen();
          if (left > 0) assign(agent, role);
        }
      }

      for (const role of slotRoles) {
        shuffle(byRole.get(role), random).forEach((agent, index) => {
          newTeams[index].members.push({ user_id: agent.user_id, role, can_captain: Boolean(agent.can_captain) });
        });
      }
      // Dự bị
      shuffle(chosen.filter((agent) => !assigned.has(agent.user_id)), random).forEach((agent, index) => {
        newTeams[index % count].members.push({
          user_id: agent.user_id,
          role: ownRole(agent, positions),
          can_captain: Boolean(agent.can_captain),
        });
      });
    } else {
      shuffle(chosen, random).forEach((agent, index) => {
        newTeams[index % count].members.push({ user_id: agent.user_id, role: null, can_captain: Boolean(agent.can_captain) });
      });
    }

    for (const team of newTeams) {
      const volunteers = team.members.filter((member) => member.can_captain);
      team.captain_user_id = pick(volunteers.length ? volunteers : team.members, random).user_id;
      team.members = team.members.map(({ user_id, role }) => ({ user_id, role }));
    }
  }

  return { fills: fills.filter((fill) => fill.members.length), newTeams, unplaced };
};
