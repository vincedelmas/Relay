import {useState} from "react";
import {clientEnv} from "@/env/client";
import {cn} from "@/lib/utils/classnames";
import {authClient} from "@/lib/client/auth-client";
import {useSuspenseQuery} from "@tanstack/react-query";
import {Badge} from "@/lib/client/components/ui/badge";
import {Button} from "@/lib/client/components/ui/button";
import {RelayMark} from "@/lib/client/components/RelayLogo";
import {LogsTab} from "@/lib/client/components/dashboard/LogsTab";
import {createFileRoute, useNavigate} from "@tanstack/react-router";
import {ClientsTab} from "@/lib/client/components/dashboard/ClientsTab";
import {ProvidersTab} from "@/lib/client/components/dashboard/ProvidersTab";
import {PlaygroundTab} from "@/lib/client/components/dashboard/PlaygroundTab";
import {Alert, AlertAction, AlertDescription} from "@/lib/client/components/ui/alert";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/lib/client/components/ui/tooltip";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/lib/client/components/ui/tabs";
import {gatewayStateOptions} from "@/lib/client/react-query/query-options/gateway.options";
import {Activity, AlertCircle, Check, CheckCircle2, Copy, KeyRound, LogOut, Server, Terminal, Wrench, X} from "lucide-react";


export const Route = createFileRoute("/")({
    validateSearch: (search: Record<string, unknown>): { connected?: string; oauthError?: string } => ({
        connected: typeof search.connected === "string" ? search.connected : undefined,
        oauthError: typeof search.oauthError === "string" ? search.oauthError : undefined,
    }),
    loader: ({ context }) => {
        return context.queryClient.query(gatewayStateOptions);
    },
    pendingComponent: () => (
        <div className="relay-ambient relative min-h-screen bg-background">
            <div className="relay-grid pointer-events-none fixed inset-x-0 top-0 h-80"/>
            <div className="h-15 border-b border-white/[0.06] bg-background/80"/>
            <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="h-24 animate-pulse rounded-xl border border-border/60 bg-card/60"/>
                    ))}
                </div>
                <div className="h-64 animate-pulse rounded-xl border border-border/60 bg-card/50"/>
            </div>
        </div>
    ),
    component: DashboardPage,
});


const mcpEndpoint = new URL("/api/mcp", clientEnv.VITE_BASE_URL).href;


type DashboardTab = "providers" | "clients" | "playground" | "logs";

interface PlaygroundSeed {
    key: number;
    mode: "execute" | "call";
    toolId?: string;
    scriptCode?: string;
}


function DashboardPage() {
    const navigate = useNavigate();
    const { connected, oauthError } = Route.useSearch();
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState<DashboardTab>("providers");
    const [playgroundSeed, setPlaygroundSeed] = useState<PlaygroundSeed>({ key: 0, mode: "execute" });
    const { data } = useSuspenseQuery(gatewayStateOptions);

    const copyEndpoint = async () => {
        await navigator.clipboard.writeText(mcpEndpoint);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
    };

    const handleSignOut = async () => {
        await authClient.signOut();
        await navigate({ to: "/login" });
    };

    const dismissBanner = () => {
        void navigate({ to: "/", search: {}, replace: true });
    };

    const launchToolInPlayground = (toolId: string) => {
        setPlaygroundSeed((prev) => ({
            key: prev.key + 1,
            mode: "call",
            toolId,
        }));
        setActiveTab("playground");
    };

    const replayScriptInPlayground = (scriptCode: string) => {
        setPlaygroundSeed((prev) => ({
            key: prev.key + 1,
            mode: "execute",
            scriptCode,
        }));
        setActiveTab("playground");
    };

    const enabledProviders = data.providers.filter((p) => p.enabled).length;
    const errorProviders = data.providers.filter((p) => Boolean(p.lastError)).length;
    const totalTools = data.providers.reduce((sum, p) => sum + p.toolCount, 0);
    const enabledTools = data.providers.reduce((sum, p) => sum + (p.enabled ? p.enabledToolCount : 0), 0);
    const codeModeClients = data.clients.filter((c) => c.mode === "code").length;
    const classicClients = data.clients.length - codeModeClients;
    const errorLogs = data.logs.filter((l) => l.status === "error").length;
    const avgDurationMs = data.logs.length > 0
        ? Math.round(data.logs.reduce((sum, l) => sum + l.durationMs, 0) / data.logs.length)
        : null;

    const userInitial = (data.user.name || data.user.email).slice(0, 1).toUpperCase();

    return (
        <div className="relay-ambient relative min-h-screen bg-background">
            <div className="relay-grid pointer-events-none fixed inset-x-0 top-0 h-80"/>

            <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/80 backdrop-blur-xl">
                <div className="mx-auto flex h-15 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-8.5 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand ring-1 ring-brand/30 shadow-[0_0_24px_-6px_oklch(0.73_0.165_162/0.55)]">
                            <RelayMark className="size-4.5"/>
                        </div>
                        <div className="flex min-w-0 items-center gap-2.5">
                            <h1 className="text-[15px] font-semibold tracking-tight text-foreground">
                                Relay
                            </h1>
                            <span className="hidden items-center gap-1.5 rounded-full border border-brand/20 bg-brand/8 px-2 py-0.5 text-[11px] font-medium text-brand sm:inline-flex">
                                <span className="size-1.5 rounded-full bg-brand shadow-[0_0_8px_oklch(0.73_0.165_162)]"/>
                                MCP Gateway
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <button
                                        type="button"
                                        onClick={copyEndpoint}
                                        aria-label="Copy MCP endpoint URL"
                                        className="group flex h-8 max-w-52 items-center gap-2 rounded-lg border border-border/80 bg-black/30 px-2.5 text-xs transition-all hover:border-brand/40 hover:bg-black/45 sm:max-w-72"
                                    />
                                }
                            >
                                <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                    MCP
                                </span>
                                <code className="truncate font-mono text-xs text-foreground/90">
                                    {mcpEndpoint}
                                </code>
                                {copied
                                    ? <Check className="size-3.5 shrink-0 text-brand"/>
                                    : <Copy className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"/>
                                }
                            </TooltipTrigger>
                            <TooltipContent>
                                {copied ? "Copied endpoint!" : "Click to copy MCP endpoint"}
                            </TooltipContent>
                        </Tooltip>

                        <div className="hidden h-4 w-px bg-border/70 sm:block"/>

                        <div className="hidden items-center gap-2 rounded-lg border border-border/70 bg-card/60 py-1 pr-2.5 pl-1.5 sm:flex">
                            <span className="flex size-5 items-center justify-center rounded-md bg-secondary text-[11px] font-semibold text-foreground">
                                {userInitial}
                            </span>
                            <span className="max-w-44 truncate text-xs text-muted-foreground">
                                {data.user.email}
                            </span>
                        </div>

                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="Sign out"
                                        onClick={handleSignOut}
                                    />
                                }
                            >
                                <LogOut/>
                            </TooltipTrigger>
                            <TooltipContent>Sign out</TooltipContent>
                        </Tooltip>
                    </div>
                </div>
            </header>

            <main className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
                {connected && (
                    <Alert variant="success">
                        <CheckCircle2 className="size-4"/>
                        <AlertDescription>
                            Connected <code className="rounded bg-brand/15 px-1.5 py-0.5 font-mono text-xs text-brand">{connected}</code> via OAuth 2.1 and synced its tools.
                        </AlertDescription>
                        <AlertAction>
                            <Button variant="ghost" size="icon-xs" aria-label="Dismiss notification" onClick={dismissBanner}>
                                <X/>
                            </Button>
                        </AlertAction>
                    </Alert>
                )}

                {oauthError && (
                    <Alert variant="destructive">
                        <AlertCircle className="size-4"/>
                        <AlertDescription>
                            Upstream OAuth error: {oauthError}
                        </AlertDescription>
                        <AlertAction>
                            <Button variant="ghost" size="icon-xs" aria-label="Dismiss error" onClick={dismissBanner}>
                                <X/>
                            </Button>
                        </AlertAction>
                    </Alert>
                )}

                <section aria-label="Gateway overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <button
                        type="button"
                        onClick={() => setActiveTab("providers")}
                        className={cn(
                            "group flex flex-col justify-between gap-3 rounded-xl border bg-card/80 p-4 text-left transition-all shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] hover:border-foreground/15 hover:bg-card",
                            activeTab === "providers" ? "border-brand/35" : "border-border/80",
                        )}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                Providers
                            </span>
                            <span className="flex size-7 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-muted-foreground transition-colors group-hover:text-brand">
                                <Server className="size-3.5"/>
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                                {enabledProviders}
                                <span className="text-sm font-normal text-muted-foreground">/{data.providers.length}</span>
                            </span>
                            {errorProviders > 0 ? (
                                <span className="text-xs font-medium text-destructive">
                                    {errorProviders} error
                                </span>
                            ) : (
                                <span className="text-xs text-muted-foreground">
                                    {enabledProviders === data.providers.length && data.providers.length > 0 ? "all active" : "enabled"}
                                </span>
                            )}
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab("providers")}
                        className="group flex flex-col justify-between gap-3 rounded-xl border border-border/80 bg-card/80 p-4 text-left shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] transition-all hover:border-foreground/15 hover:bg-card"
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                Active Tools
                            </span>
                            <span className="flex size-7 items-center justify-center rounded-lg border border-brand/20 bg-brand/10 text-brand">
                                <Wrench className="size-3.5"/>
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                                {enabledTools}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                                {totalTools} synced
                            </span>
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab("clients")}
                        className={cn(
                            "group flex flex-col justify-between gap-3 rounded-xl border bg-card/80 p-4 text-left transition-all shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] hover:border-foreground/15 hover:bg-card",
                            activeTab === "clients" ? "border-brand/35" : "border-border/80",
                        )}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                AI Clients
                            </span>
                            <span className="flex size-7 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-muted-foreground transition-colors group-hover:text-brand">
                                <KeyRound className="size-3.5"/>
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                                {data.clients.length}
                            </span>
                            <span className="truncate text-xs text-muted-foreground tabular-nums">
                                {data.clients.length > 0
                                    ? `${codeModeClients} code · ${classicClients} classic`
                                    : "OAuth 2.1 ready"}
                            </span>
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab("logs")}
                        className={cn(
                            "group flex flex-col justify-between gap-3 rounded-xl border bg-card/80 p-4 text-left transition-all shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] hover:border-foreground/15 hover:bg-card",
                            activeTab === "logs" ? "border-brand/35" : "border-border/80",
                        )}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                Executions
                            </span>
                            <span className="flex size-7 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-muted-foreground transition-colors group-hover:text-brand">
                                <Activity className="size-3.5"/>
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                                {data.logs.length}
                            </span>
                            <span className="truncate font-mono text-xs text-muted-foreground tabular-nums">
                                {avgDurationMs !== null ? (
                                    <>
                                        {avgDurationMs}ms avg
                                        {errorLogs > 0 && (
                                            <span className="text-destructive"> · {errorLogs} err</span>
                                        )}
                                    </>
                                ) : (
                                    "no runs yet"
                                )}
                            </span>
                        </div>
                    </button>
                </section>

                <Tabs
                    value={activeTab}
                    onValueChange={(value) => setActiveTab(value as DashboardTab)}
                    className="gap-5"
                >
                    <TabsList variant="line" className="overflow-x-auto">
                        <TabsTrigger value="providers">
                            <Server className="size-3.5"/>
                            Providers
                            <Badge variant="secondary" className="h-4.5 px-1.5 font-mono text-[10px] tabular-nums">
                                {data.providers.length}
                            </Badge>
                        </TabsTrigger>
                        <TabsTrigger value="clients">
                            <KeyRound className="size-3.5"/>
                            Clients
                            <Badge variant="secondary" className="h-4.5 px-1.5 font-mono text-[10px] tabular-nums">
                                {data.clients.length}
                            </Badge>
                        </TabsTrigger>
                        <TabsTrigger value="playground">
                            <Terminal className="size-3.5"/>
                            Playground
                        </TabsTrigger>
                        <TabsTrigger value="logs">
                            <Activity className="size-3.5"/>
                            Audit Logs
                            <Badge
                                variant={errorLogs > 0 ? "destructive" : "secondary"}
                                className="h-4.5 px-1.5 font-mono text-[10px] tabular-nums"
                            >
                                {data.logs.length}
                            </Badge>
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="providers">
                        <ProvidersTab
                            builtins={data.builtins}
                            providers={data.providers}
                            onTryTool={launchToolInPlayground}
                        />
                    </TabsContent>

                    <TabsContent value="clients">
                        <ClientsTab
                            clients={data.clients}
                            mcpEndpoint={mcpEndpoint}
                            providers={data.providers}
                        />
                    </TabsContent>

                    <TabsContent value="playground">
                        <PlaygroundTab
                            key={playgroundSeed.key}
                            initialMode={playgroundSeed.mode}
                            initialToolId={playgroundSeed.toolId}
                            initialScriptCode={playgroundSeed.scriptCode}
                        />
                    </TabsContent>

                    <TabsContent value="logs">
                        <LogsTab
                            logs={data.logs}
                            onReplayScript={replayScriptInPlayground}
                        />
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}
