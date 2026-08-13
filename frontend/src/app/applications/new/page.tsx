import { createApplicationAction } from "@/app/applications/actions";
import { AppHeader } from "@/components/app-header";
import { ApplicationForm } from "@/components/application-form";

export const metadata = { title: "New application" };

export default function NewApplicationPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">New application</h1>
        <ApplicationForm action={createApplicationAction} cancelHref="/" />
      </main>
    </>
  );
}
