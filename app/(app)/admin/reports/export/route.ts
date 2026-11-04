import { z } from "zod";
import { getCurrentUser } from "@/lib/data/auth";
import { getMyCapabilities } from "@/lib/data/capabilities";
import {
  getReadinessReport,
  getReportDepartments,
  getTrainingReport,
  logReportExport,
} from "@/lib/data/reports";
import { getCourseProgress } from "@/lib/data/course-progress";
import { lessonsDone } from "@/lib/domain/course-progress";
import { formatDate } from "@/lib/domain/dates";
import {
  COURSE_REPORT_LABELS,
  csvFileName,
  READINESS_REPORT_LABELS,
  toCsv,
} from "@/lib/domain/reports";

// CSV export of a department report (SRS-REPORT-006). Needs report.export; every export is
// audited before the file is sent. Names and training facts only: no emails, no mentoring notes.
// Logs carry status only.

const query = z.object({
  department: z.uuid(),
  report: z.enum(["training", "progress", "readiness"]),
  course: z.uuid().nullable(),
});

function plain(status: number): Response {
  return new Response(null, { status, headers: { "Cache-Control": "private, no-store" } });
}

const date = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return plain(401);
  }
  const url = new URL(request.url);
  const input = query.safeParse({
    department: url.searchParams.get("department"),
    report: url.searchParams.get("report"),
    course: url.searchParams.get("course"),
  });
  if (!input.success) {
    return plain(400);
  }
  const department = (
    await getReportDepartments(await getMyCapabilities(), {
      includeTopics: input.data.report === "progress",
    })
  ).find((d) => d.id === input.data.department);
  if (!department?.canExport) {
    return plain(403);
  }

  let csv: string;
  let rows: number;
  if (input.data.report === "progress") {
    const { view } = await getCourseProgress(department.id, input.data.course);
    if (!view) {
      return plain(404);
    }
    const people = view.people;
    rows = people.length;
    csv = toCsv(
      [
        "Volunteer",
        "Course",
        "Status",
        "Lessons marked complete",
        "Lessons",
        "Best quiz score",
        "Practicals passed",
        "Assigned",
      ],
      people.map((person) => [
        person.name,
        view.courseTitle,
        person.status,
        lessonsDone(person, view),
        view.lessons.length,
        person.quizzes.length ? Math.max(...person.quizzes.map((quiz) => quiz.best.score)) : null,
        view.practicals.filter((p) => person.passedPracticals.includes(p.key)).length,
        person.assignedAt ? formatDate(person.assignedAt) : null,
      ]),
    );
  } else if (input.data.report === "training") {
    const report = await getTrainingReport(department.id);
    rows = report.length;
    csv = toCsv(
      ["Volunteer", "Joined", "Level", "Course", "Course state", "Certificate"],
      report.map((row) => [
        row.name,
        date(row.joinedAt),
        row.level,
        row.courseTitle,
        COURSE_REPORT_LABELS[row.state],
        row.certificate,
      ]),
    );
  } else {
    const report = await getReadinessReport(department.id);
    rows = report.length;
    csv = toCsv(
      ["Volunteer", "Type", "Competency or role", "State", "Since", "Expires"],
      report.map((row) => [
        row.name,
        row.kind === "role" ? "Serving role" : "Competency",
        row.item,
        READINESS_REPORT_LABELS[row.state],
        date(row.since),
        date(row.expiresAt),
      ]),
    );
  }

  if (
    !(await logReportExport(
      department.id,
      input.data.report === "progress" ? "training" : input.data.report,
      rows,
    ))
  ) {
    return plain(403);
  }
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFileName(department.slug, input.data.report, new Date().toISOString())}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
