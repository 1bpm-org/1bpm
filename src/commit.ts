// "Count me in": one commitment per browser, for the coming bell only.
import { putCommit } from './api'
import { store } from './store'

const KEY = '1bpm.committed' // ISO instant of the bell this browser said it will sit
const ALSO = '1bpm.alsoNext' // carry the commitment to the bell after, once

export const isCommitted = (session: string) => store.get(KEY) === session
export const committedTo = () => store.get(KEY)

export async function setCommitted(session: string, on: boolean): Promise<number> {
  const count = await putCommit(session, on)
  if (on) store.set(KEY, session)
  else {
    store.remove(KEY)
    store.remove(ALSO)
  }
  return count
}

export const alsoNext = {
  get: () => store.get(ALSO) === '1',
  set: (on: boolean) => (on ? store.set(ALSO, '1') : store.remove(ALSO)),
}
