import { useState, useEffect, useCallback } from "react";
import { load } from "@tauri-apps/plugin-store";

const STORE_FILE = "settings.json";
const KEY = "number_animation";

export function useNumberAnimation() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    load(STORE_FILE)
      .then((store) => store.get<boolean>(KEY))
      .then((v) => {
        if (v !== null && v !== undefined) setEnabled(v);
      })
      .catch(() => {});
  }, []);

  const setEnabledAndPersist = useCallback((value: boolean) => {
    setEnabled(value);
    load(STORE_FILE)
      .then((store) => {
        store.set(KEY, value);
        store.save();
      })
      .catch(() => {});
  }, []);

  return { enabled, setEnabled: setEnabledAndPersist };
}
