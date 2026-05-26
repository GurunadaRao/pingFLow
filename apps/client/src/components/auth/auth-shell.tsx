import { Moon, Sun } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { AuthContent, AuthMode, AuthTheme } from "./types";

interface AuthShellProps {
  mode: AuthMode;
  theme: AuthTheme;
  onToggleTheme: () => void;
  onSwitchMode: () => void;
  onGoogleSignIn?: () => void;
  children: React.ReactNode;
  content: AuthContent;
}

export function AuthShell({
  mode,
  theme,
  onToggleTheme,
  onSwitchMode,
  onGoogleSignIn,
  children,
  content,
}: AuthShellProps) {
  const shellThemeClass =
    theme === "dark"
      ? "bg-zinc-950 text-zinc-50"
      : "bg-slate-50 text-slate-950";

  const panelThemeClass =
    theme === "dark"
      ? "bg-zinc-950/70 text-zinc-50"
      : "bg-white/70 text-slate-950";

  const captionThemeClass =
    theme === "dark" ? "text-zinc-200" : "text-slate-700";

  return (
    <div
      className={cn(
        "min-h-screen w-full transition-colors duration-300 md:grid md:grid-cols-2",
        shellThemeClass,
      )}
    >
      <div className="flex h-screen items-center justify-center p-6 md:h-auto md:py-12">
        <div className="mx-auto grid w-88 gap-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onToggleTheme}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-full border border-input bg-background text-foreground shadow-sm transition-colors hover:bg-accent",
              )}
              aria-label={
                theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
            >
              {theme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </button>
          </div>
          {children}
          <div className="text-center text-sm">
            {mode === "signin"
              ? "Don't have an account?"
              : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={onSwitchMode}
              className="pl-1 font-medium underline-offset-4 hover:underline"
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </div>
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center gap-3 rounded-lg border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent"
            onClick={() =>
              onGoogleSignIn
                ? onGoogleSignIn()
                : console.log("UI: Google button clicked")
            }
          >
            <img
              src="https://thumbs.dreamstime.com/b/google-logo-vector-format-white-background-illustration-407571048.jpg"
              alt="Google logo"
              className="h-8 w-8 rounded-full"
            />
            Continue with Google
          </button>
        </div>
      </div>

      <div
        className={cn(
          "relative hidden bg-cover bg-center transition-all duration-500 md:block",
          panelThemeClass,
        )}
        style={{ backgroundImage: `url(${content.image.src})` }}
      >
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 h-25 bg-linear-to-t",
            theme === "dark"
              ? "from-zinc-950 via-zinc-950/70 to-transparent"
              : "from-slate-50 via-slate-50/70 to-transparent",
          )}
        />
        <div className="relative z-10 flex h-full flex-col items-center justify-end p-2 pb-6">
          <blockquote
            className={cn("space-y-2 text-center", captionThemeClass)}
          >
            <p className="text-lg font-medium">“{content.quote.text}”</p>
            <cite className="block text-sm font-light not-italic opacity-70">
              - {content.quote.author}
            </cite>
          </blockquote>
        </div>
      </div>
    </div>
  );
}

export default AuthShell;
