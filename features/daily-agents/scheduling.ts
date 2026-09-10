function assertTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new Error("Invalid IANA timezone.");
  }
}

function dateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values: Record<string, number> = {};
  for (const part of parts)
    if (part.type !== "literal") values[part.type] = Number(part.value);
  const required = (name: string) => {
    const value = values[name];
    if (value === undefined || !Number.isFinite(value))
      throw new Error(`Missing date part: ${name}`);
    return value;
  };
  return {
    year: required("year"),
    month: required("month"),
    day: required("day"),
    hour: required("hour"),
    minute: required("minute"),
  };
}

export function dateKey(date: Date, timezone: string) {
  const parts = dateParts(date, timezone);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

function addLocalDay(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function localDateTimeToUtc(date: string, time: string, timezone: string) {
  const dateValues = date.split("-").map(Number);
  const timeValues = time.split(":").map(Number);
  if (dateValues.length !== 3 || timeValues.length !== 2)
    throw new Error("Invalid local date or time.");
  const [year, month, day] = dateValues as [number, number, number];
  const [hour, minute] = timeValues as [number, number];
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = dateParts(new Date(guess), timezone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    guess += target - actualAsUtc;
  }
  return new Date(guess);
}

export function nextDailyRunAt(
  scheduleTime: string,
  timezone: string,
  now = new Date(),
) {
  assertTimezone(timezone);
  const today = dateKey(now, timezone);
  const candidate = localDateTimeToUtc(today, scheduleTime, timezone);
  return candidate > now
    ? candidate
    : localDateTimeToUtc(addLocalDay(today), scheduleTime, timezone);
}
