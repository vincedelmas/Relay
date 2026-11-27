import {useState} from "react";
import {cn} from "@/lib/utils/classnames";
import {createFileRoute} from "@tanstack/react-router";
import {Badge} from "@/lib/client/components/ui/badge";
import {Button} from "@/lib/client/components/ui/button";
import {Switch} from "@/lib/client/components/ui/switch";
import {Checkbox} from "@/lib/client/components/ui/checkbox";
import {RelayMark} from "@/lib/client/components/RelayLogo";
import {Separator} from "@/lib/client/components/ui/separator";
import type {ClientGatewayMode} from "@/lib/types/gateway.types";
import {Alert, AlertDescription} from "@/lib/client/components/ui/alert";
import {oauthConsentRequestOptions} from "@/lib/client/react-query/query-options/gateway.options";
import {useOAuthConsentMutation} from "@/lib/client/react-query/query-mutations/gateway.mutations";
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "@/lib/client/components/ui/card";
import {AlertCircle, ArrowLeftRight, Bot, Check, Code2, Globe, Layers, Lock, ShieldCheck} from "lucide-react";


export const Route = createFileRoute("/oauth/consent")({
    ssr: false,
    beforeLoad: () => ({
        oauthQuery: window.location.search.slice(1),
    }),
    loader: async ({ context }) => ({
        oauthQuery: context.oauthQuery,
        request: await context.queryClient.query(oauthConsentRequestOptions(context.oauthQuery)),
    }),
    pendingComponent: () => (
        <div className="relay-ambient relative flex min-h-screen items-center justify-center bg-background px-4 py-12">
            <div className="relay-grid pointer-events-none fixed inset-x-0 top-0 h-96"/>
            <div className="h-[460px] w-full max-w-lg animate-pulse rounded-2xl border border-border/60 bg-card/60"/>
        </div>
    ),
    component: OAuthConsentPage,
    head: () => ({ meta: [{ title: "Authorize client — Relay" }] }),
});


function OAuthConsentPage() {
    const { oauthQuery, request } = Route.useLoaderData();
    const [readOnly, setReadOnly] = useState(false);
    const [mode, setMode] = useState<ClientGatewayMode>("code");
    const [selectedProviders, setSelectedProviders] = useState<string[]>(() => request.providers.map((p) => p.id));
    const mutation = useOAuthConsentMutation({ mode, readOnly, oauthQuery, clientId: request.clientId, allowedProviderIds: selectedProviders });

    const toggleProvider = (providerId: string, checked: boolean) => {
        setSelectedProviders((prev) =>
            checked
                ? Array.from(new Set([...prev, providerId]))
                : prev.filter((id) => id !== providerId),
        );
    };

    return (
        <div className="relay-ambient relative flex min-h-screen items-center justify-center bg-background px-4 py-12">
            <div className="relay-grid pointer-events-none fixed inset-x-0 top-0 h-96"/>

            <main className="relative w-full max-w-lg">
                <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-brand/25 via-white/[0.06] to-transparent opacity-80"/>

                <Card className="relative overflow-hidden rounded-2xl border-white/[0.08] bg-card/92 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl">
                    <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-brand/70 to-transparent"/>

                    <CardHeader className="items-center gap-2 pt-6 text-center">
                        <div className="mb-1 flex items-center justify-center gap-3">
                            <div className="flex size-11 items-center justify-center rounded-xl border border-white/[0.09] bg-black/35 text-foreground">
                                <Bot className="size-5"/>
                            </div>
                            <ArrowLeftRight className="size-4 text-muted-foreground"/>
                            <div className="flex size-11 items-center justify-center rounded-xl bg-brand/12 text-brand ring-1 ring-brand/30 shadow-[0_0_24px_-6px_oklch(0.73_0.165_162/0.55)]">
                                <RelayMark className="size-5.5"/>
                            </div>
                        </div>

                        <CardTitle className="text-lg font-semibold tracking-tight">
                            Connect {request.name} to Relay?
                        </CardTitle>
                        <CardDescription className="text-balance text-xs sm:text-sm">
                            Choose the execution mode and tool providers this AI client can access.
                        </CardDescription>

                        <div className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/30 px-2.5 py-1 text-[11px] text-muted-foreground">
                            <Globe className="size-3 shrink-0 text-brand"/>
                            <code className="truncate font-mono text-foreground/85">{request.callbackOrigin}</code>
                        </div>
                    </CardHeader>

                    <CardContent className="flex flex-col gap-5">
                        {mutation.error && (
                            <Alert variant="destructive">
                                <AlertCircle className="size-4"/>
                                <AlertDescription>{mutation.error.message}</AlertDescription>
                            </Alert>
                        )}

                        <div className="flex flex-col gap-2">
                            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                Gateway Mode
                            </span>
                            <div className="grid grid-cols-2 gap-2.5">
                                <button
                                    type="button"
                                    disabled={mutation.isPending}
                                    onClick={() => setMode("code")}
                                    className={cn(
                                        "relative flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all",
                                        mode === "code"
                                            ? "border-brand/50 bg-brand/10 text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
                                            : "border-border/80 bg-black/20 text-muted-foreground hover:border-foreground/20 hover:bg-black/30",
                                    )}
                                >
                                    <div className="flex w-full items-center justify-between gap-2">
                                        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                            <Code2 className="size-4 text-brand"/>
                                            Code Mode
                                        </span>
                                        {mode === "code" && (
                                            <span className="flex size-4 items-center justify-center rounded-full bg-brand text-primary-foreground">
                                                <Check className="size-2.5 stroke-[3]"/>
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-xs leading-snug text-muted-foreground">
                                        4 meta-tools + QuickJS sandbox
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    disabled={mutation.isPending}
                                    onClick={() => setMode("classic")}
                                    className={cn(
                                        "relative flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all",
                                        mode === "classic"
                                            ? "border-info/50 bg-info/10 text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
                                            : "border-border/80 bg-black/20 text-muted-foreground hover:border-foreground/20 hover:bg-black/30",
                                    )}
                                >
                                    <div className="flex w-full items-center justify-between gap-2">
                                        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                            <Layers className="size-4 text-info"/>
                                            Classic MCP
                                        </span>
                                        {mode === "classic" && (
                                            <span className="flex size-4 items-center justify-center rounded-full bg-info text-info-foreground">
                                                <Check className="size-2.5 stroke-[3]"/>
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-xs leading-snug text-muted-foreground">
                                        Expose allowed tools directly
                                    </span>
                                </button>
                            </div>
                        </div>

                        <Separator className="bg-border/60"/>

                        <div className="flex flex-col gap-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                    Allowed Providers
                                    <span className="ml-1.5 font-mono text-foreground/80 tabular-nums">
                                        {selectedProviders.length}/{request.providers.length}
                                    </span>
                                </span>

                                {request.providers.length > 1 && (
                                    <div className="flex items-center gap-2 text-[11px]">
                                        <button
                                            type="button"
                                            disabled={mutation.isPending}
                                            onClick={() => setSelectedProviders(request.providers.map((p) => p.id))}
                                            className="text-muted-foreground transition-colors hover:text-brand"
                                        >
                                            Select all
                                        </button>
                                        <span className="text-border">·</span>
                                        <button
                                            type="button"
                                            disabled={mutation.isPending}
                                            onClick={() => setSelectedProviders([])}
                                            className="text-muted-foreground transition-colors hover:text-foreground"
                                        >
                                            None
                                        </button>
                                    </div>
                                )}
                            </div>

                            {request.providers.length === 0 ? (
                                <p className="rounded-xl border border-dashed border-border/80 bg-black/20 p-3.5 text-center text-xs text-muted-foreground">
                                    No enabled providers configured yet. You can grant providers later in the Relay dashboard.
                                </p>
                            ) : (
                                <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-0.5">
                                    {request.providers.map((p) => {
                                        const checked = selectedProviders.includes(p.id);
                                        return (
                                            <label
                                                key={p.id}
                                                htmlFor={`consent-provider-${p.id}`}
                                                className={cn(
                                                    "flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-all",
                                                    checked
                                                        ? "border-brand/35 bg-brand/8"
                                                        : "border-border/75 bg-black/20 hover:border-foreground/20",
                                                )}
                                            >
                                                <div className="flex min-w-0 items-center gap-2.5">
                                                    <Checkbox
                                                        id={`consent-provider-${p.id}`}
                                                        checked={checked}
                                                        disabled={mutation.isPending}
                                                        onCheckedChange={(val) => toggleProvider(p.id, Boolean(val))}
                                                    />
                                                    <div className="flex min-w-0 flex-col">
                                                        <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
                                                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                                                            {p.slug} · {p.toolCount} tool{p.toolCount === 1 ? "" : "s"}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-1.5">
                                                    <Badge variant="outline">
                                                        {p.kind === "builtin" ? "Built-in" : "Remote"}
                                                    </Badge>
                                                    {p.readOnly && <Badge variant="info">Read-only</Badge>}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <label
                            htmlFor="consent-read-only"
                            className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/80 bg-black/25 px-3.5 py-3"
                        >
                            <div className="flex items-center gap-2.5">
                                <Lock className={cn("size-4 shrink-0", readOnly ? "text-warning" : "text-muted-foreground")}/>
                                <div className="flex flex-col">
                                    <span className="text-xs font-medium text-foreground">Read-only mode</span>
                                    <span className="text-[11px] text-muted-foreground">
                                        Block mutating and destructive tool calls for this client
                                    </span>
                                </div>
                            </div>
                            <Switch
                                id="consent-read-only"
                                size="sm"
                                checked={readOnly}
                                disabled={mutation.isPending}
                                onCheckedChange={setReadOnly}
                            />
                        </label>

                        <Alert className="border-white/[0.07] bg-black/25">
                            <ShieldCheck className="size-4 text-brand"/>
                            <AlertDescription className="text-xs">
                                Permissions are enforced on both discovery and execution, and can be changed or revoked anytime from your Relay dashboard.
                                {request.scopes.includes("offline_access") && " This client may stay connected between sessions."}
                            </AlertDescription>
                        </Alert>
                    </CardContent>

                    <CardFooter className="justify-end gap-2.5">
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
        </div>
    );
}
