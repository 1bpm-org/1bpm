// First run: four steps, one idea each. Skip is always there and always equal.
import './style.css'
import { sessionTimes } from './clock'
import { isCommitted, setCommitted } from './commit'
import { t } from './copy'
import { remindState, turnOff, turnOn } from './reminders'
import { startShell, tz } from './shell'
import { store } from './store'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const steps = Array.from(document.querySelectorAll<HTMLElement>('.step'))
const marks = Array.from(document.querySelectorAll<HTMLElement>('.steps span'))
const next = $<HTMLButtonElement>('ob-next-btn')
const skip = $<HTMLButtonElement>('ob-skip')
const remind = $<HTMLButtonElement>('ob-remind')
const count = $<HTMLButtonElement>('ob-count')
const notice = $('ob-notice')
let at = 0

const stop = startShell(document.getElementById('corner'))

function renderTimes(): void {
  const s = sessionTimes(new Date(), tz)
  $('ob-next-label').textContent = `${t('nextSession')} · ${t(s.nextDay)}`
  $('ob-next').textContent = s.nextLocalLabel
  $('ob-other-label').textContent = t(s.otherDay === 'today' ? 'alsoToday' : 'alsoTomorrow')
  $('ob-other').textContent = s.otherLocalLabel
  $('ob-zone').textContent = `Your time · ${tz} (${s.zoneName})`
}

function show(i: number): void {
  at = i
  steps.forEach((s, j) => (s.hidden = j !== i))
  marks.forEach((m, j) => m.classList.toggle('on', j <= i))
  $('step-of').textContent = `${i + 1} of ${steps.length}`
  next.textContent = i === steps.length - 1 ? 'Enter' : 'Next'
  if (i === 1) renderTimes()
  steps[i].querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
}

function finish(): void {
  store.set('1bpm.onboarded', '1')
  stop()
  location.replace('/')
}

next.addEventListener('click', () => (at < steps.length - 1 ? show(at + 1) : finish()))
skip.addEventListener('click', finish)

// ---------- step 4: two independent switches, both off by default ----------

const session = () => sessionTimes(new Date(), tz).next.toISOString()
const setSwitch = (b: HTMLButtonElement, on: boolean) => b.setAttribute('aria-checked', String(on))

function renderRemind(): void {
  const state = remindState()
  setSwitch(remind, state === 'on')
  remind.disabled = state === 'unsupported'
  if (state === 'unsupported') notice.textContent = t('remindUnsupported')
}

remind.addEventListener('click', async () => {
  notice.textContent = ''
  if (remind.getAttribute('aria-checked') === 'true') {
    await turnOff()
  } else {
    const state = await turnOn()
    if (state === 'blocked') notice.textContent = t('blockedLine')
  }
  renderRemind()
})

count.addEventListener('click', async () => {
  notice.textContent = ''
  const on = count.getAttribute('aria-checked') !== 'true'
  count.disabled = true
  try {
    await setCommitted(session(), on)
    setSwitch(count, on)
  } catch {
    notice.textContent = t('countUnavailable')
  } finally {
    count.disabled = false
  }
})

renderRemind()
setSwitch(count, isCommitted(session()))
show(0)
