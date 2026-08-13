import { LoginForm } from "@/app/login/login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Job applications</h1>
          <p className="text-sm text-muted-foreground">Enter the password to continue.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
