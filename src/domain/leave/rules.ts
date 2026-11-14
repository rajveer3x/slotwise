import { localDate } from "@/domain/scheduling/timetable";
export function leaveDateError(startDate: string, endDate: string, semester: { startDate: string; endDate: string }, now = new Date()) {
  if (startDate > endDate) return { field: "endDate", message: "End date must be on or after start date." };
  if (startDate < localDate(now)) return { field: "startDate", message: "Past leave is not supported. Choose today or a future date in Asia/Kolkata." };
  if (startDate < semester.startDate || endDate > semester.endDate) return { field: "endDate", message: "Both inclusive dates must be within the selected semester." };
  return null;
}
export function leaveOverlaps(a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }) { return a.startDate <= b.endDate && b.startDate <= a.endDate; }
