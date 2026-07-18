import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { useEffect } from "react";
import { router } from "@/routes";
import { API_BASE } from "@/lib/apiBase";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const warmBackend = () => {
  if (typeof window === "undefined") return;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return;

  const aliveUrl = `${API_BASE.replace(/\/+$/, "")}/alive`;
  void fetch(aliveUrl, {
    method: "GET",
    mode: "cors",
    cache: "no-store",
  }).catch(() => {});
};

const App = () => {
  useEffect(() => {
    warmBackend();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <div className="pb-8 md:pb-10">
            <RouterProvider router={router} />
          </div>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
