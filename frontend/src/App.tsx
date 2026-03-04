import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./pages/tournaments/Index";
import BracketPage from "./pages/tournaments/BracketPage";
import PlayersPage from "./pages/tournaments/PlayersPage";
import LeaderboardPage from "./pages/tournaments/LeaderboardPage";
import RulePage from "./pages/tournaments/RulePage";
import NotFound from "./pages/tournaments/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/tournament/:game/:slug/" element={<Layout />}>
            <Route path="bracket" element={<BracketPage />} />
            <Route path="bracket/:matchId" element={<BracketPage />} />
            <Route path="players" element={<PlayersPage />} />
            <Route path="leaderboard" element={<LeaderboardPage />} />
            <Route path="rule" element={<RulePage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
