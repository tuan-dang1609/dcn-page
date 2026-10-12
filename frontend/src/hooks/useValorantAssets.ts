import axios from "axios";
import { useQuery } from "@tanstack/react-query";

/**
 * Tên + ảnh đặc vụ và bản đồ Valorant từ valorant-api.com (API cộng đồng, không cần key).
 * API Riot chỉ trả về mã: characterName = UUID đặc vụ, mapName = "/Game/Maps/Bonsai/Bonsai".
 */

export type ValorantAgentAsset = {
  name: string;
  icon: string | null;
  role: string | null;
};

export type ValorantMapAsset = {
  name: string;
  splash: string | null;
};

const ROLE_VI: Record<string, string> = {
  Duelist: "Đối đầu",
  Initiator: "Khởi tranh",
  Controller: "Kiểm soát",
  Sentinel: "Hộ vệ",
};

type AgentRow = {
  uuid: string;
  displayName: string;
  displayIcon?: string | null;
  role?: { displayName?: string } | null;
};

type MapRow = {
  displayName: string;
  mapUrl?: string | null;
  splash?: string | null;
};

export const useValorantAssets = () =>
  useQuery({
    queryKey: ["valorant-assets"],
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
    queryFn: async () => {
      const [agentsRes, mapsRes] = await Promise.all([
        axios.get<{ data: AgentRow[] }>(
          "https://valorant-api.com/v1/agents?isPlayableCharacter=true",
        ),
        axios.get<{ data: MapRow[] }>("https://valorant-api.com/v1/maps"),
      ]);

      const agents = new Map<string, ValorantAgentAsset>();
      for (const agent of agentsRes.data?.data ?? []) {
        const roleEn = agent.role?.displayName ?? "";
        agents.set(agent.uuid.toLowerCase(), {
          name: agent.displayName,
          icon: agent.displayIcon ?? null,
          role: ROLE_VI[roleEn] ?? (roleEn || null),
        });
      }

      const maps = new Map<string, ValorantMapAsset>();
      for (const map of mapsRes.data?.data ?? []) {
        if (!map.mapUrl) continue;
        maps.set(map.mapUrl.toLowerCase(), {
          name: map.displayName,
          splash: map.splash ?? null,
        });
      }

      return { agents, maps };
    },
  });

/** "/Game/Maps/Bonsai/Bonsai" → "Bonsai" khi chưa có dữ liệu valorant-api. */
export const fallbackMapName = (mapUrl?: string | null) =>
  String(mapUrl ?? "")
    .split("/")
    .filter(Boolean)
    .pop() || "Bản đồ";
