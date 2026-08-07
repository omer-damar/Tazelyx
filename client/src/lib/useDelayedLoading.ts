import { useEffect, useRef, useState } from "react";

// Veri çekme genelde çok hızlı tamamlandığından (yerel ağ, birkaç on
// milisaniye), yükleniyor ikonunu her zaman anında göstermek "göz kırpması"
// gibi hissettirir. Bu hook, yükleme belirli bir süreden (varsayılan 200ms)
// uzun sürerse spinner göstermeyi işaretler — hızlı tamamlanan isteklerde
// spinner hiç görünmez, sadece algılanamayan kısa bir boş an oluşur.
export function useDelayedLoading(isActuallyLoading: boolean, delayMs = 200) {
  const [showSpinner, setShowSpinner] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isActuallyLoading) {
      timeoutRef.current = setTimeout(() => setShowSpinner(true), delayMs);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setShowSpinner(false);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isActuallyLoading, delayMs]);

  return showSpinner;
}
