import { notFound } from "next/navigation";

import { updateApplicationAction } from "@/app/applications/actions";
import { AppHeader } from "@/components/app-header";
import { ApplicationForm } from "@/components/application-form";
import { ApiError, getApplication } from "@/lib/api";

export const metadata = { title: "Edit application" };

export default async function EditApplicationPage({
  params,
}: PageProps<"/applications/[id]/edit">) {
  const { id } = await params;

  let application;
  try {
    application = await getApplication(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Edit application</h1>
        <ApplicationForm
          action={updateApplicationAction.bind(null, id)}
          application={application}
          cancelHref={`/applications/${id}`}
        />
      </main>
    </>
  );
}
