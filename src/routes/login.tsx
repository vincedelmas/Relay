import {useState} from "react";
import {AlertCircle, Radio} from "lucide-react";
import {authClient} from "@/lib/client/auth-client";
import {Button} from "@/lib/client/components/ui/button";
import {createFileRoute} from "@tanstack/react-router";
import {Alert, AlertDescription} from "@/lib/client/components/ui/alert";
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
        <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
            <Card>
                <CardHeader>
                    <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/15 text-brand ring-1 ring-brand/30">
                        <Radio className="size-5"/>
                    </div>
                    <CardTitle>Sign in to Relay</CardTitle>
                    <CardDescription>
                        Single-owner personal MCP gateway protected by Google OAuth.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {displayedError && (
                        <Alert variant="destructive">
                            <AlertCircle className="size-4"/>
                            <AlertDescription>{displayedError}</AlertDescription>
                        </Alert>
                    )}

                    <Button
                        type="button"
                        size="lg"
                        className="w-full"
                        disabled={isPending}
                        onClick={handleGoogleSignIn}
                    >
                        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                            <path
                                fill="currentColor"
                                d="M21.8 12.23c0-.72-.06-1.41-.18-2.08H12v3.94h5.5a4.7 4.7 0 0 1-2.04 3.09v2.56h3.3c1.93-1.78 3.04-4.4 3.04-7.51Z"
                            />
                            <path
                                fill="currentColor"
                                d="M12 22c2.76 0 5.07-.91 6.76-2.46l-3.3-2.56c-.91.61-2.08.97-3.46.97-2.66 0-4.92-1.8-5.72-4.21H2.87v2.64A10.22 10.22 0 0 0 12 22Z"
                            />
                            <path
                                fill="currentColor"
                                d="M6.28 13.74A6.14 6.14 0 0 1 5.96 12c0-.6.11-1.2.32-1.74V7.62H2.87A10.22 10.22 0 0 0 1.8 12c0 1.65.4 3.21 1.07 4.38l3.41-2.64Z"
                            />
                            <path
                                fill="currentColor"
                                d="M12 6.05c1.5 0 2.85.52 3.91 1.53l2.93-2.93C17.06 2.99 14.75 2 12 2a10.22 10.22 0 0 0-9.13 5.62l3.41 2.64c.8-2.41 3.06-4.21 5.72-4.21Z"
                            />
                        </svg>
                        {isPending ? "Redirecting to Google..." : "Continue with Google"}
                    </Button>
                </CardContent>
            </Card>
        </main>
    );
}
