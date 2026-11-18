// All interface copy, English v1. Times are always whole Intl-formatted tokens inserted
// into a template, so a translation can reorder the sentence around them.

export const copy = {
  nextSession: 'Next session',
  today: 'Today',
  tomorrow: 'Tomorrow',
  alsoToday: 'Also today',
  alsoTomorrow: 'Also tomorrow',
  yourTime: 'Your time · {zone}',
  utcBoth: '06:00 & 18:00 UTC · every day',
  bellSoon: 'The bell is soon',
  soundOff: 'Sound is off.',
  begin: 'Begin',
  waitForBell: 'Wait for the bell',
  joinSit: 'Join the sit · {n} min left',
  startFull: 'Start a full {n}',
  min: '{n} min',
  breath: 'Breath',
  end: 'End',
  youSat: 'You sat.',
  tellOne: 'Tell one person the time.',
  copied: 'Copied. Pass it on.',
  sitting: 'The sit',
  untilBell: 'The bell at {time}',
  share: 'Twice a day, whoever is awake stops for ten minutes, together. Here that is {first} and {second}.',
  soundOnLabel: 'Sound on',
  soundOffLabel: 'Sound off',
  countOne: 'At least {x} person',
  countOther: 'At least {x} people',
  countRestOne: 'has said they will sit this session.',
  countRestOther: 'have said they will sit this session.',
  countUnavailable: 'The count is unavailable.',
  countMeIn: 'Count me in',
  counted: 'You’re counted',
  takeOut: 'Take me out',
  alsoNext: 'Count me in for the next one too',
  remindMe: 'Remind me',
  remindersOn: 'Reminders on',
  stopReminders: 'Stop reminders',
  remindersBlocked: 'Reminders blocked',
  blockedLine: 'Notifications are blocked for this site. The browser’s settings are the only place to change that.',
  remindersStopped: 'Reminders stopped.',
  remindUnsupported: 'This browser can’t show reminders. The bell still rings on this page while it is open.',
  cornerNext: 'Next · {time}',
} as const

export type CopyKey = keyof typeof copy

export function t(key: CopyKey, vars: Record<string, string | number> = {}): string {
  return copy[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
}
