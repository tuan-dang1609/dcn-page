import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import axios from "axios";
import { setTournamentToken } from "@/api/tournaments";

export interface UserTeam {
  name: string;
  short_name: string;
  logo_url: string;
  team_color_hex: string;
  created_by_name: string;
  created_by: string | number;
  created_at: string;
}

export interface User {
  id: string | number;
  nickname: string;
  profile_picture: string | null;
  riot_account: string | null;
  role_id: string | number;
  team_id: string | number | null;
  team: UserTeam | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isRegistered: boolean;
  setIsRegistered: (value: boolean) => void;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const TOKEN_STORAGE_KEY = "tft_token";
const USER_STORAGE_KEY = "tft_user";

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  isRegistered: false,
  setIsRegistered: () => {},
  login: async () => false,
  logout: () => {},
  refreshUser: async () => {},
});

const decodeUserIdFromToken = (token: string): number | null => {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;

    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded));
    const userId = Number(payload?.id);

    return Number.isFinite(userId) ? userId : null;
  } catch {
    return null;
  }
};

const fetchUserByToken = async (token: string): Promise<User | null> => {
  const userId = decodeUserIdFromToken(token);
  if (!userId) return null;

  const response = await axios.get<User>(`${API_BASE}/api/users/${userId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return {
    ...response.data,
    team: response.data?.team ?? null,
  };
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    const hydrateAuth = async () => {
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      const storedUser = localStorage.getItem(USER_STORAGE_KEY);

      if (!storedToken) {
        setToken(null);
        setTournamentToken(null);
        setUser(null);
        localStorage.removeItem(USER_STORAGE_KEY);
        setIsLoading(false);
        return;
      }

      setToken(storedToken);
      setTournamentToken(storedToken);

      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch {
          localStorage.removeItem(USER_STORAGE_KEY);
        }
      }

      try {
        const freshUser = await fetchUserByToken(storedToken);
        if (freshUser) {
          setUser(freshUser);
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(freshUser));
        } else {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          localStorage.removeItem(USER_STORAGE_KEY);
          setToken(null);
          setTournamentToken(null);
          setUser(null);
        }
      } catch {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(USER_STORAGE_KEY);
        setToken(null);
        setTournamentToken(null);
        setUser(null);
      }

      setIsLoading(false);
    };

    void hydrateAuth();
  }, []);

  const refreshUser = async () => {
    if (!token) {
      setUser(null);
      return;
    }

    const freshUser = await fetchUserByToken(token);
    if (!freshUser) {
      throw new Error("Cannot load user profile");
    }

    setUser(freshUser);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(freshUser));
  };

  const login = async (
    username: string,
    password: string,
  ): Promise<boolean> => {
    try {
      const response = await axios.post<{ token?: string }>(
        `${API_BASE}/api/login`,
        {
          username,
          password,
        },
      );

      const nextToken = response.data?.token ?? null;
      if (!nextToken) return false;

      const nextUser = await fetchUserByToken(nextToken);
      if (!nextUser) return false;

      setToken(nextToken);
      setUser(nextUser);
      setIsRegistered(false);
      setTournamentToken(nextToken);
      localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));

      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setIsRegistered(false);
    setTournamentToken(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isRegistered,
        setIsRegistered,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
