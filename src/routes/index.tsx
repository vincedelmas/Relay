import {useState} from "react";
import {clientEnv} from "@/env/client";
import {authClient} from "@/lib/client/auth-client";
import {useSuspenseQuery} from "@tanstack/react-query";
import {Badge} from "@/lib/client/components/ui/badge";
import {Button} from "@/lib/client/components/ui/button";
import {LogsTab} from "@/lib/client/components/dashboard/LogsTab";
import {createFileRoute, useNavigate} from "@tanstack/react-router";
import {ClientsTab} from "@/lib/client/components/dashboard/ClientsTab";
import {Alert, AlertDescription} from "@/lib/client/components/ui/alert";
import {ProvidersTab} from "@/lib/client/components/dashboard/ProvidersTab";
import {PlaygroundTab} from "@/lib/client/components/dashboard/PlaygroundTab";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/lib/client/components/ui/tabs";
import {gatewayStateOptions} from "@/lib/client/react-query/query-options/gateway.options";
import {Activity, AlertCircle, Check, CheckCircle2, Copy, KeyRound, LogOut, Radio, Server, Terminal} from "lucide-react";


export const Route = createFileRoute("/")({
    validateSearch: (search: Record<string, unknown>): { connected?: string; oauthError?: string } => ({
        connected: typeof search.connected === "string" ? search.connected : undefined,
        oauthError: typeof search.oauthError === "string" ? search.oauthError : undefined,
    }),
    loader: ({ context }) => {
        return context.queryClient.query(gatewayStateOptions);
    },
    component: DashboardPage,
});


const mcpEndpoint = new URL("/api/mcp", clientEnv.VITE_BASE_URL).href;


function DashboardPage() {
    const navigate = useNavigate();
    const { connected, oauthError } = Route.useSearch();
    const [copied, setCopied] = useState(false);
    const { data } = useSuspenseQuery(gatewayStateOptions);

    const copyEndpoint = async () => {
        await navigator.clipboard.writeText(mcpEndpoint);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const handleSignOut = async () => {
        await authClient.signOut();
        await navigate({ to: "/login" });
    };

    const totalTools = data.providers.reduce((sum, p) => sum + p.enabledToolCount, 0);

    return (
        <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-8">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
                <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-brand ring-1 ring-brand/30">
                        <Radio className="size-5"/>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-semibold tracking-tight">
                                Relay
                            </h1>
                            <Badge variant="secondary">
                                MCP Gateway
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {data.providers.length} providers · {totalTools} active tools · {data.clients.length} clients
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 py-1 pr-1 pl-2.5">
                        <code className="max-w-56 truncate font-mono text-xs">
                            {mcpEndpoint}
                        </code>
                        <Button variant="ghost" size="icon-xs" aria-label="Copy MCP endpoint" onClick={copyEndpoint}>
                            {copied
                                ? <Check className="text-brand"/>
                                : <Copy/>
                            }
                        </Button>
                    </div>

                    <Badge variant="outline">
                        {data.user.email}
                    </Badge>

                    <Button variant="ghost" size="icon-sm" aria-label="Sign out" onClick={handleSignOut}>
                        <LogOut/>
                    </Button>
                </div>
            </header>

            {connected &&
                <Alert>
                    <CheckCircle2 className="size-4 text-brand"/>
                    <AlertDescription>
                        Connected <code className="font-mono text-xs">{connected}</code> via OAuth 2.1 and synced its tools.
                    </AlertDescription>
                </Alert>
            }

            {oauthError &&
                <Alert variant="destructive">
                    <AlertCircle className="size-4"/>
                    <AlertDescription>
                        Upstream OAuth error: {oauthError}
                    </AlertDescription>
                </Alert>
            }

            <Tabs defaultValue="providers" className="gap-4">
                <TabsList>
                    <TabsTrigger value="providers">
                        <Server className="size-3.5"/>
                        Providers
                        <Badge variant="secondary">
                            {data.providers.length}
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="clients">
                        <KeyRound className="size-3.5"/>
                        Clients
                        <Badge variant="secondary">
                            {data.clients.length}
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="playground">
                        <Terminal className="size-3.5"/>
                        Playground
                    </TabsTrigger>
                    <TabsTrigger value="logs">
                        <Activity className="size-3.5"/>
                        Logs
                        <Badge variant="secondary">
                            {data.logs.length}
                        </Badge>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="providers">
                    <ProvidersTab
                        builtins={data.builtins}
                        providers={data.providers}
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
                    <PlaygroundTab/>
                </TabsContent>

                <TabsContent value="logs">
                    <LogsTab
                        logs={data.logs}
                    />
                </TabsContent>
            </Tabs>
        </main>
    );
}
