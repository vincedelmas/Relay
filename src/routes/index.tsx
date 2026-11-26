import {useState} from "react";
import {clientEnv} from "@/env/client";
import {authClient} from "@/lib/client/auth-client";
import {createFileRoute} from "@tanstack/react-router";
import {Badge} from "@/lib/client/components/ui/badge";
import {Button} from "@/lib/client/components/ui/button";
import {Check, Copy, Cpu, KeyRound, Radio, Server} from "lucide-react";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/lib/client/components/ui/card";


export const Route = createFileRoute("/")({
    component: HomePage,
});


const mcpEndpoint = new URL("/api/mcp", clientEnv.VITE_BASE_URL).href;


function HomePage() {
    const [copied, setCopied] = useState(false);
    const { data: session } = authClient.useSession();

    const copyEndpoint = async () => {
        await navigator.clipboard.writeText(mcpEndpoint);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-6 px-6 py-16">
            <header className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-brand ring-1 ring-brand/30">
                        <Radio className="size-5"/>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-semibold tracking-tight">Relay</h1>
                            <Badge variant="secondary">v0.1.0</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">Personal MCP Gateway</p>
                    </div>
                </div>
                <Badge variant={session ? "default" : "outline"}>
                    {session ? session.user.email : "Not signed in"}
                </Badge>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle>MCP Endpoint</CardTitle>
                    <CardDescription>
                        Single Streamable HTTP endpoint protected by OAuth 2.1 for your AI clients.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-3">
                    <code className="truncate rounded-lg bg-muted px-3 py-2 font-mono text-sm">
                        {mcpEndpoint}
                    </code>
                    <Button variant="outline" size="sm" onClick={copyEndpoint}>
                        {copied ? <Check/> : <Copy/>}
                        {copied ? "Copied" : "Copy"}
                    </Button>
                </CardContent>
            </Card>

            <section className="grid gap-4 sm:grid-cols-3">
                <Card size="sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Server className="size-4 text-brand"/>
                            Providers
                        </CardTitle>
                        <CardDescription>Remote MCPs & built-in tools</CardDescription>
                    </CardHeader>
                    <CardContent className="text-muted-foreground">
                        Ready to wire MyLists, Famiglia, PostHog, Cloudflare & Steam.
                    </CardContent>
                </Card>

                <Card size="sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <KeyRound className="size-4 text-brand"/>
                            OAuth 2.1
                        </CardTitle>
                        <CardDescription>Better Auth MCP + per-client grants</CardDescription>
                    </CardHeader>
                    <CardContent className="text-muted-foreground">
                        Discovery active at <code className="font-mono text-xs">/.well-known/*</code>.
                    </CardContent>
                </Card>

                <Card size="sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Cpu className="size-4 text-brand"/>
                            Code Mode
                        </CardTitle>
                        <CardDescription>QuickJS WASM + SQLite FTS5</CardDescription>
                    </CardHeader>
                    <CardContent className="text-muted-foreground">
                        Progressive discovery and sandboxed script execution next.
                    </CardContent>
                </Card>
            </section>
        </main>
    );
}
