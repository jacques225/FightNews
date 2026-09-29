import { dateParts } from "@/lib/calendar";

/** Date d'un événement façon éphéméride : « sam. », « 3 », « oct. ». */
export default function EventDate({ date }: { date: string }) {
  const d = dateParts(date);
  return (
    <time className="cal-date" dateTime={date} title={d.long}>
      <span>{d.weekday}</span>
      <b>{d.day}</b>
      <span>{d.month}</span>
    </time>
  );
}
