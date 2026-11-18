// localStorage that never throws (private modes, blocked storage): values then last this visit only.
const memory = new Map<string, string>()

export const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k)
    } catch {
      return memory.get(k) ?? null
    }
  },
  set(k: string, v: string): void {
    memory.set(k, v)
    try {
      localStorage.setItem(k, v)
    } catch {
      /* this visit only */
    }
  },
  remove(k: string): void {
    memory.delete(k)
    try {
      localStorage.removeItem(k)
    } catch {
      /* nothing stored */
    }
  },
}
