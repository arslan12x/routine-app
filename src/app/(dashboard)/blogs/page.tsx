import BlogsScreen from "@/features/blogs/BlogsScreen";

export const metadata = {
  title: "AI Blog Content Generator | Routine",
  description: "Generate structured multi-day blog series with AI narrative continuity.",
};

export default function BlogsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <BlogsScreen />
    </div>
  );
}
