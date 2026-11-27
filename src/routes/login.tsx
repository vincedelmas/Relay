import {useState} from "react";
import {authClient} from "@/lib/client/auth-client";
import {Button} from "@/lib/client/components/ui/button";
import {createFileRoute} from "@tanstack/react-router";
import {RelayMark} from "@/lib/client/components/RelayLogo";
import {Alert, AlertDescription} from "@/lib/client/components/ui/alert";
import {AlertCircle, Code2, KeyRound, ShieldCheck} from "lucide-react";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/lib/client/components/ui/card";


export const Route = createFileRoute("/login")({
    validateSearch: (search: Record<string, unknown>): { error?: string } => ({
        error: typeof search.error === "string" ? search.error : undefined,
    }),
    component: LoginPage,
    head: () => ({ meta: [{ title: "Sign in — Relay" }] }),
});


const formatAuthError = (code: string): string => {
    if (code === "OWNER_ONLY") {
        return "This Google account is not authorized to access this Relay instance.";
    }
    return `Sign-in failed (${code}). Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and OWNER_EMAIL.`;
};


function LoginPage() {
    const { error: queryError } = Route.useSearch();
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);

    const displayedError = submitError ?? (queryError ? formatAuthError(queryError) : null);

    const handleGoogleSignIn = async () => {
        setSubmitError(null);
        setIsPending(true);

        try {
            const { error } = await authClient.signIn.social({
                provider: "google",
                callbackURL: "/",
                errorCallbackURL: "/login",
            });
            if (error) {
                setSubmitError(error.message || "Unable to start Google sign-in.");
                setIsPending(false);
            }
        }
        catch (err) {
            setSubmitError(err instanceof Error ? err.message : "Unable to start Google sign-in.");
            setIsPending(false);
        }
    };

    return (
        <div className="relay-ambient relative flex min-h-screen items-center justify-center bg-background px-4 py-16">
            <div className="relay-grid pointer-events-none fixed inset-x-0 top-0 h-96"/>

            <main className="relative w-full max-w-[400px]">
                <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-brand/25 via-white/[0.06] to-transparent opacity-80"/>

                <Card className="relative overflow-hidden rounded-2xl border-white/[0.08] bg-card/90 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl">
                    <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-brand/70 to-transparent"/>

                    <CardHeader className="items-center pt-7 text-center">
                        <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand/12 text-brand ring-1 ring-brand/30 shadow-[0_0_32px_-6px_oklch(0.73_0.165_162/0.6)]">
                            <RelayMark className="size-6"/>
                        </div>
                        <CardTitle className="text-xl font-semibold tracking-tight">
                            Sign in to Relay
                        </CardTitle>
                        <CardDescription className="max-w-xs text-balance text-sm">
                            Your personal MCP gateway with OAuth 2.1, per-client policies, and a QuickJS execution sandbox.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="flex flex-col gap-5 pb-7">
                        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-black/25 px-2.5 py-0.5">
                                <KeyRound className="size-3 text-brand"/>
                                OAuth 2.1
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-black/25 px-2.5 py-0.5">
                                <Code2 className="size-3 text-brand"/>
                                QuickJS Sandbox
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-black/25 px-2.5 py-0.5">
                                <ShieldCheck className="size-3 text-brand"/>
                                Per-Client ACL
                            </span>
                        </div>

                        {displayedError && (
                            <Alert variant="destructive">
                                <AlertCircle className="size-4"/>
                                <AlertDescription>{displayedError}</AlertDescription>
                            </Alert>
                        )}

                        <Button
                            type="button"
                            size="lg"
                            className="h-10.5 w-full bg-foreground font-medium text-background shadow-sm hover:bg-foreground/90"
                            disabled={isPending}
                            onClick={handleGoogleSignIn}
                        >
                            <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden="true">
                                <path
                                    fill="#4285F4"
                                    d="M21.8 12.23c0-.72-.06-1.41-.18-2.08H12v3.94h5.5a4.7 4.7 0 0 1-2.04 3.09v2.56h3.3c1.93-1.78 3.04-4.4 3.04-7.51Z"
                                />
                                <path
                                    fill="#34A853"
                                    d="M12 22c2.76 0 5.07-.91 6.76-2.46l-3.3-2.56c-.91.61-2.08.97-3.46.97-2.66 0-4.92-1.8-5.72-4.21H2.87v2.64A10.22 10.22 0 0 0 12 22Z"
                                />
                                <path
                                    fill="#FBBC05"
                                    d="M6.28 13.74A6.14 6.14 0 0 1 5.96 12c0-.6.11-1.2.32-1.74V7.62H2.87A10.22 10.22 0 0 0 1.8 12c0 1.65.4 3.21 1.07 4.38l3.41-2.64Z"
                                />
                                <path
                                    fill="#EA4335"
                                    d="M12 6.05c1.5 0 2.85.52 3.91 1.53l2.93-2.93C17.06 2.99 14.75 2 12 2a10.22 10.22 0 0 0-9.13 5.62l3.41 2.64c.8-2.41 3.06-4.21 5.72-4.21Z"
                                />
                            </svg>
                            {isPending ? "Redirecting to Google..." : "Continue with Google"}
                        </Button>

                        <p className="text-center text-xs text-muted-foreground">
                            Single-owner instance · Restricted to the configured owner account.
                        </p>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
