import {AlertCircle, Radio} from "lucide-react";
import {type SubmitEvent, useState} from "react";
import {authClient} from "@/lib/client/auth-client";
import {Input} from "@/lib/client/components/ui/input";
import {Label} from "@/lib/client/components/ui/label";
import {Button} from "@/lib/client/components/ui/button";
import {createFileRoute, useNavigate} from "@tanstack/react-router";
import {Alert, AlertDescription} from "@/lib/client/components/ui/alert";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/lib/client/components/ui/card";


export const Route = createFileRoute("/login")({
    component: LoginPage,
    head: () => ({ meta: [{ title: "Sign in — Relay" }] }),
});


function LoginPage() {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const { data, error: signInError } = await authClient.signIn.email({
                email: email.trim(),
                password,
                rememberMe: true,
            });

            if (signInError) {
                setError(signInError.message || "Invalid email or password.");
                return;
            }

            // Better Auth oauthProviderClient returns data.url when continuing an OAuth authorize flow
            if (data && "url" in data && typeof data.url === "string") {
                window.location.assign(data.url);
                return;
            }

            await navigate({ to: "/" });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Unable to sign in.");
        }
        finally {
            setIsSubmitting(false);
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
                        Single-user gateway access. Create your account via{" "}
                        <code className="font-mono text-xs">bun run owner:setup</code>.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="size-4"/>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="login-email">Email</Label>
                            <Input
                                type="email"
                                value={email}
                                required={true}
                                id="login-email"
                                autoComplete="email"
                                placeholder="you@example.com"
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="login-password">
                                Password
                            </Label>
                            <Input
                                required={true}
                                type="password"
                                value={password}
                                id="login-password"
                                autoComplete="current-password"
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        <Button type="submit" disabled={isSubmitting} className="mt-1 w-full">
                            {isSubmitting ? "Signing in..." : "Sign in"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </main>
    );
}
