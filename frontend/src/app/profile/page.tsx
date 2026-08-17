import { ProfileForm } from "@/app/profile/profile-form";
import { AppHeader } from "@/components/app-header";
import { getProfile } from "@/lib/api";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const profile = await getProfile();

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Your background, in your own words. AI mode scores a job advert against this, so the more
          it says about what you have actually built, the more the score is worth.
        </p>
        <ProfileForm content={profile.content} />
      </main>
    </>
  );
}
