import { useQuery } from "@tanstack/react-query";
import { getSeriesById } from "@/api/series";

export const useSeriesById = (id?: string) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["series", id],
    enabled: Boolean(id),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const response = await getSeriesById(id!);
      return response.data;
    },
  });

  return {
    series: data?.info,
    status: data?.status,
    isLoading,
    error,
    refetch,
  };
};
