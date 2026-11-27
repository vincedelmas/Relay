import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {authClient} from "@/lib/client/auth-client";
import {createFileRoute} from "@tanstack/react-router";
import {Badge} from "@/lib/client/components/ui/badge";
import {Label} from "@/lib/client/components/ui/label";
import {Button} from "@/lib/client/components/ui/button";
import {Checkbox} from "@/lib/client/components/ui/checkbox";
import {Separator} from "@/lib/client/components/ui/separator";
import {Alert, AlertDescription} from "@/lib/client/components/ui/alert";
import {AlertCircle, Code2, Layers, Plug, ShieldCheck} from "lucide-react";
import {getOAuthConsentRequestFn, saveClientPolicyFn} from "@/lib/server/functions/gateway";
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "@/lib/client/components/ui/card";


export const Route = createFileRoute("/oauth/consent")({
    ssr: false,
    beforeLoad: () => ({
        oauthQuery: window.location.search.slice(1),
    }),
    loader: async ({ context }) => {
        const request = await getOAuthConsentRequestFn({ data: { oauthQuery: context.oauthQuery } });
        return { oauthQuery: context.oauthQuery, request };
    },
    component: OAuthConsentPage,
    head: () => ({ meta: [{ title: "Authorize client — Relay" }] }),
});


function OAuthConsentPage() {
    const { oauthQuery, request } = Route.useLoaderData();
    const [readOnly, setReadOnly] = useState(false);
    const [mode, setMode] = useState<"code" | "classic">("code");
    const [selectedProviders, setSelectedProviders] = useState<string[]>(() => request.providers.map((p) => p.id));

    const toggleProvider = (providerId: string, checked: boolean) => {
        setSelectedProviders((prev) =>
            checked
                ? Array.from(new Set([...prev, providerId]))
                : prev.filter((id) => id !== providerId),
        );
    };

    const mutation = useMutation({
        mutationFn: async (accept: boolean) => {
            if (accept) {
                await saveClientPolicyFn({
                    data: {
                        mode,
                        readOnly,
                        clientId: request.clientId,
                        allowedProviderIds: selectedProviders,
                    },
                });
            }

            const { data, error } = await authClient.oauth2.consent({ accept, oauth_query: oauthQuery });
            if (error) {
                throw new Error(error.message || "Consent request failed.");
            }

            return data;
        },
        onSuccess: (data) => {
            window.location.assign(data.url);
        },
    });

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-12">
            <Card>
                <CardHeader>
                    <Plug className="mb-2 size-7 text-brand" aria-hidden="true"/>
                    <CardTitle>
                        Connect {request.name} to Relay?
                    </CardTitle>
                    <CardDescription>
                        Choose which providers and execution mode this AI client can access.
                    </CardDescription>
                </CardHeader>

                <CardContent className="flex flex-col gap-5">
                    {mutation.error && (
                        <Alert variant="destructive">
                            <AlertCircle className="size-4"/>
                            <AlertDescription>
                                {mutation.error.message}
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Gateway Mode
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                disabled={mutation.isPending}
                                onClick={() => setMode("code")}
                                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                                    mode === "code"
                                        ? "border-brand bg-brand/10 text-foreground"
                                        : "border-border bg-background hover:bg-muted/50 text-muted-foreground"
                                }`}
                            >
                                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                    <Code2 className="size-4 text-brand"/>
                                    Code Mode
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    4 meta-tools + QuickJS sandbox
                                </span>
                            </button>
                            <button
                                type="button"
                                disabled={mutation.isPending}
                                onClick={() => setMode("classic")}
                                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                                    mode === "classic"
                                        ? "border-brand bg-brand/10 text-foreground"
                                        : "border-border bg-background hover:bg-muted/50 text-muted-foreground"
                                }`}
                            >
                                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                    <Layers className="size-4 text-brand"/>
                                    Classic MCP
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    Expose allowed tools directly
                                </span>
                            </button>
                        </div>
                    </div>

                    <Separator/>

                    <div className="flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Allowed Providers
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {selectedProviders.length} / {request.providers.length} selected
                            </span>
                        </div>

                        {request.providers.length === 0 ? (
                            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                                No enabled providers configured yet. You can grant providers later in the Relay dashboard.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {request.providers.map((p) => {
                                    const checked = selectedProviders.includes(p.id);
                                    return (
                                        <label
                                            key={p.id}
                                            htmlFor={`consent-provider-${p.id}`}
                                            className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 hover:bg-muted/40"
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <Checkbox
                                                    id={`consent-provider-${p.id}`}
                                                    checked={checked}
                                                    disabled={mutation.isPending}
                                                    onCheckedChange={(val) => toggleProvider(p.id, Boolean(val))}
                                                />
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium">{p.name}</span>
                                                    <span className="font-mono text-xs text-muted-foreground">
                                                        {p.slug} · {p.toolCount} tools
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Badge variant="outline">
                                                    {p.kind === "builtin" ? "Built-in" : "Remote"}
                                                </Badge>
                                                {p.readOnly && <Badge variant="secondary">Read-only</Badge>}
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <Separator/>

                    <div className="flex items-center gap-2.5">
                        <Checkbox
                            id="consent-read-only"
                            checked={readOnly}
                            disabled={mutation.isPending}
                            onCheckedChange={(val) => setReadOnly(Boolean(val))}
                        />
                        <Label htmlFor="consent-read-only" className="cursor-pointer font-normal">
                            Restrict this client to <span className="font-medium">read-only tools only</span>
                        </Label>
                    </div>

                    <Alert>
                        <ShieldCheck className="size-4"/>
                        <AlertDescription>
                            Permissions are enforced on both discovery and execution, and can be edited or revoked anytime from your Relay dashboard.
                            {request.scopes.includes("offline_access") && " This client may stay connected between sessions."}
                        </AlertDescription>
                    </Alert>

                    <p className="break-all text-xs text-muted-foreground">
                        Callback origin: <code className="font-mono">{request.callbackOrigin}</code>
                    </p>
                </CardContent>

                <CardFooter className="justify-end gap-3">
                    <Button
                        variant="outline"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate(false)}
                    >
                        Deny
                    </Button>
                    <Button
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate(true)}
                    >
                        {mutation.isPending ? "Authorizing..." : "Allow connection"}
                    </Button>
                </CardFooter>
            </Card>
        </main>
    );
}
