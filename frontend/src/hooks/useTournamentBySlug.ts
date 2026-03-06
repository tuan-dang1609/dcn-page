import { useQuery } from "@tanstack/react-query";
import { getTournamentBySlug } from "@/api/tournaments/index";

export const useTournamentBySlug = (game?: string, slug?: string) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tournament", game, slug],
    enabled: Boolean(game && slug),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const response = await getTournamentBySlug(game!, slug!);
      return response.data;
    },
  });

  return {
    tournament: data?.info,
    isLoading,
    error,
    refetch,
  };
};
