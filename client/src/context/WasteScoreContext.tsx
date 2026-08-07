import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from "react";

import { useAuth } from "@/context/AuthContext";
import { getWasteScore } from "@/lib/api";

type WasteScoreContextValue = {
  // Header'daki her sayfaya özgü Lyx görselinin köşesindeki küçük mood
  // rozeti (bkz. LyxMascot.tsx) bunu okuyor — karakter sabit, rozet skora
  // göre değişiyor.
  score: number | null;
  isLoading: boolean;
  // Herhangi bir ekran/bileşen refresh() çağırdığında artıyor — score.tsx
  // gibi kendi verisini ayrıca çeken yerler bunu bir bağımlılık olarak
  // izleyip "başka bir yerde bir tüketim/israf kararı değişti, ben de
  // tazelenmeliyim" sinyali olarak kullanabiliyor.
  version: number;
  refresh: () => void;
};

const WasteScoreContext = createContext<WasteScoreContextValue | null>(null);

export function useWasteScore() {
  const value = useContext(WasteScoreContext);
  if (!value) {
    throw new Error("useWasteScore, bir <WasteScoreProvider> içinde kullanılmalı.");
  }
  return value;
}

export function WasteScoreProvider({ children }: PropsWithChildren) {
  const { token } = useAuth();
  const [score, setScore] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!token) {
      setScore(null);
      return;
    }
    setIsLoading(true);
    getWasteScore(token)
      .then((result) => setScore(result.score))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [token, version]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  return (
    <WasteScoreContext.Provider value={{ score, isLoading, version, refresh }}>
      {children}
    </WasteScoreContext.Provider>
  );
}
