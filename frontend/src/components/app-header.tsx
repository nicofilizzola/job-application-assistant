import Link from "next/link";

import { logout } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
        <Link href="/" className="mr-auto font-semibold tracking-tight">
          Job applications
        </Link>
        <Button asChild variant="ghost" size="sm">
          <Link href="/profile">Profile</Link>
        </Button>
        <ThemeToggle />
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
