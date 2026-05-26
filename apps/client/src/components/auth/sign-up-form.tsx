import { cn } from "../../../lib/utils";
import type { SignUpFormData } from "./types";

interface SignUpFormProps {
  onSubmit: (data: SignUpFormData) => void;
  authError?: string | null;
  isSubmitting?: boolean;
}

export function SignUpForm({
  onSubmit,
  authError,
  isSubmitting,
}: SignUpFormProps) {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    onSubmit({
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      autoComplete="on"
      className="flex flex-col gap-8 border-2 border-black rounded-xl p-6"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Create an account</h1>
        <p className="text-balance text-sm text-muted-foreground">
          Enter your details below to sign up
        </p>
      </div>
      <div className="grid gap-4">
        <div className="grid gap-2">
          <label htmlFor="name" className="text-sm font-medium">
            Full Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            placeholder="John Doe"
            required
            autoComplete="name"
            className={cn(
              "h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring",
            )}
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="register-email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="register-email"
            name="email"
            type="email"
            placeholder="m@example.com"
            required
            autoComplete="email"
            className={cn(
              "h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring",
            )}
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            placeholder="Password"
            className={cn(
              "h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring",
            )}
          />
        </div>
        {authError ? (
          <p className="text-sm text-red-500" role="alert">
            {authError}
          </p>
        ) : null}
        <button
          type="submit"
          className="mt-2 h-11 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Signing Up..." : "Sign Up"}
        </button>
      </div>
    </form>
  );
}

export default SignUpForm;
