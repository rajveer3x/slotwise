import { addDays, clockTime, days, weekday } from "@/domain/scheduling/timetable";
import type { TimetableSnapshot } from "@/server/services/timetable";

type Occurrence = TimetableSnapshot["occurrences"][number];
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });

export function timetableDate(date: string, length: "short" | "long" = "short") {
  return (length === "short" ? shortDate : longDate).format(new Date(`${date}T00:00:00Z`));
}

export function PublishedTimetable({ week, rows, showSection }: { week: string; rows: Occurrence[]; showSection: boolean }) {
  const teachingDays = rows.some(o => weekday(o.localDate) === 6) ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
  const columns = teachingDays.map(day => {
    const date = addDays(week, day - 1);
    return { day, date, classes: rows.filter(o => o.localDate === date) };
  });
  const times = [...new Set(rows.map(o => o.startMinute))].sort((a, b) => a - b);

  return <>
    <div className="timetable-desktop overflow-x-auto" role="region" aria-label="Published timetable grid; scroll horizontally for all weekdays" tabIndex={0}>
      <table className="timetable-grid published-timetable-grid">
        <thead><tr><th scope="col">Start</th>{columns.map(({ day, date }) => <th key={day} scope="col">{days[day]}<time dateTime={date}>{timetableDate(date)}</time></th>)}</tr></thead>
        <tbody>{times.map(start => <tr key={start}>
          <th scope="row">{clockTime(start)}</th>
          {columns.map(({ day, classes }) => <td key={day}>
            {classes.filter(o => o.startMinute === start).map(o => <PublishedClass key={o.id} occurrence={o} showSection={showSection} />)}
            {classes.filter(o => o.schedulingStatus === "ACTIVE" && o.startMinute < start && o.endMinute > start).map(o =>
              <p key={o.id} className="published-class-continuation">{o.course.split(" · ", 1)[0]}{showSection && ` · ${o.section}`} continues until {clockTime(o.endMinute)}</p>
            )}
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <section className="timetable-mobile published-agenda" aria-label="Published weekly agenda">
      {columns.map(({ day, date, classes }) => <div key={day} className="published-agenda-day">
        <h3>{days[day]} <time dateTime={date}>{timetableDate(date)}</time></h3>
        {classes.length ? classes.map(o => <PublishedClass key={o.id} occurrence={o} showSection={showSection} />) : <p className="text-sm text-text-secondary">No classes.</p>}
      </div>)}
    </section>
  </>;
}

function PublishedClass({ occurrence: o, showSection }: { occurrence: Occurrence; showSection: boolean }) {
  const cancelled = o.schedulingStatus === "CANCELLED";
  const delivery = o.deliveryStatus === "PENDING" ? "Pending" : o.deliveryStatus === "HELD" ? "Held" : "Not held";
  const recovery = o.resolutionTier === 1 ? "Substitute assigned" : o.resolutionTier === 2 ? "Swapped" : "Rescheduled";

  return <article className="class-block published-class" data-cancelled={cancelled}>
    {showSection && <p className="published-class-section">Section {o.section}</p>}
    <h3>{o.course}</h3>
    <p className="published-class-time">{clockTime(o.startMinute)}–{clockTime(o.endMinute)} · {o.room}</p>
    <p>{o.faculty}</p>
    {o.resolutionTier && <p className="published-class-recovery">{recovery} · Original {o.originalDate}</p>}
    {o.meetingUrl && <a className="inline-link break-all" href={o.meetingUrl} target="_blank" rel="noopener noreferrer">Open meeting</a>}
    <p className="published-class-status" data-delivery={o.deliveryStatus}>{cancelled && "Cancelled · "}Delivery: {delivery}</p>
  </article>;
}
