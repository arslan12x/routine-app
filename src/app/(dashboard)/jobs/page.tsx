import JobsScreen from "@/features/jobs/JobsScreen";

export const metadata = {
  title: "Automated Job Engine | Routine",
  description: "Automated multi-stage job application and shifting follow-up timeline pipeline.",
};

export default function JobsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <JobsScreen />
    </div>
  );
}
