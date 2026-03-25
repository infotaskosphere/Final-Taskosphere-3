import { useState, useEffect } from "react";
import { onLoadingChange } from "../api/api";

export function useLoading() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = onLoadingChange(setLoading);
    return unsub;
  }, []);

  return loading;
}
