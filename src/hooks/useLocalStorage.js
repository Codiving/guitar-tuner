import { useState, useCallback } from 'react';

export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setAndStore = useCallback((newValue) => {
    setValue((current) => {
      const nextValue = typeof newValue === 'function' ? newValue(current) : newValue;
      try {
        localStorage.setItem(key, JSON.stringify(nextValue));
      } catch {}
      return nextValue;
    });
  }, [key]);

  return [value, setAndStore];
}
