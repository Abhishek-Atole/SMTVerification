import Link from "next/link";

export default async function ChangeoverReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-neutral-900">Changeover Report</h1>
      <p className="text-sm text-neutral-600">Download or consume report JSON from the API endpoint below.</p>
      <code className="block rounded-md bg-neutral-100 px-3 py-2 text-sm">/api/changeovers/{id}/report</code>
      <Link href={`/changeover/${id}`} className="text-sm text-neutral-900 underline">
        Back to active session
      </Link>
    </div>
  );
}
