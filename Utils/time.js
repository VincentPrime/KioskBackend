// Dates/times in the branch's timezone (default Asia/Manila)
export function dateInTz(tz, d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function timeInTz(tz, d = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(d); // "HH:MM:SS"
}
