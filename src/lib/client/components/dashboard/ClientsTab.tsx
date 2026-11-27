import {useState} from "react";
import {cn} from "@/lib/utils/classnames";
import {formatRelativeTime} from "@/lib/utils/format";
import {Badge} from "@/lib/client/components/ui/badge";
import {Button} from "@/lib/client/components/ui/button";
import {Switch} from "@/lib/client/components/ui/switch";
import {Checkbox} from "@/lib/client/components/ui/checkbox";
import {Card, CardContent} from "@/lib/client/components/ui/card";
import {Alert, AlertDescription} from "@/lib/client/components/ui/alert";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/lib/client/components/ui/tooltip";
import type {GatewayClient, GatewayProvider} from "@/lib/types/gateway.types";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/lib/client/components/ui/dialog";
import {useDisconnectClientMutation, useSaveClientPolicyMutation} from "@/lib/client/react-query/query-mutations/gateway.mutations";
import {AlertCircle, Bot, Check, Code2, Copy, ExternalLink, KeyRound, Layers, Lock, ShieldCheck, Unplug} from "lucide-react";


interface ClientsTabProps {
    mcpEndpoint: string;
    clients: GatewayClient[];
    providers: GatewayProvider[];
}


export function ClientsTab({ clients, providers, mcpEndpoint }: ClientsTabProps) {
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [revokingClient, setRevokingClient] = useState<GatewayClient | null>(null);

    const policyMutation = useSaveClientPolicyMutation();
    const disconnectMutation = useDisconnectClientMutation();
    const error = policyMutation.error?.message ?? disconnectMutation.error?.message ?? null;

    const copyText = async (key: string, value: string) => {
        await navigator.clipboard.writeText(value);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1600);
    };

    const toggleAllowedProvider = (client: GatewayClient, providerId: string, checked: boolean) => {
        policyMutation.mutate({
            clientId: client.clientId,
            toggleProvider: { providerId, allowed: checked },
        });
    };

    const setAllProviders = (client: GatewayClient, providerIds: string[]) => {
        policyMutation.mutate({
            clientId: client.clientId,
            allowedProviderIds: providerIds,
        });
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold tracking-tight">
                        Connected AI Clients
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Switch any OAuth 2.1 client between Code Mode and Classic MCP, enforce read-only access, or edit allowed providers live.
                    </p>
                </div>

                {clients.length > 0 && (
                    <Button
                        size="xs"
                        variant="outline"
                        onClick={() => copyText("endpoint-top", mcpEndpoint)}
                    >
                        {copiedKey === "endpoint-top" ? <Check className="text-brand"/> : <Copy/>}
                        {copiedKey === "endpoint-top" ? "Endpoint copied" : "Copy MCP URL"}
                    </Button>
                )}
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="size-4"/>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {clients.length === 0 ? (
                <Card className="border-dashed border-border/90 bg-card/50">
                    <CardContent className="flex flex-col items-center gap-5 py-12 text-center">
                        <div className="flex size-12 items-center justify-center rounded-2xl border border-brand/25 bg-brand/10 text-brand">
                            <KeyRound className="size-5"/>
                        </div>

                        <div className="max-w-lg space-y-1.5">
                            <p className="text-base font-semibold tracking-tight">No AI clients connected yet</p>
                            <p className="text-sm text-muted-foreground">
                                Point any MCP-compatible assistant at your gateway URL. Relay handles OAuth 2.1 discovery (DCR + CIMD) and opens your consent screen automatically.
                            </p>
                        </div>

                        <div className="flex w-full max-w-md items-center gap-2 rounded-xl border border-border/80 bg-black/35 p-1.5 pl-3.5">
                            <code className="min-w-0 flex-1 truncate text-left font-mono text-xs text-foreground">
                                {mcpEndpoint}
                            </code>
                            <Button
                                size="xs"
                                variant="default"
                                onClick={() => copyText("endpoint-empty", mcpEndpoint)}
                            >
                                {copiedKey === "endpoint-empty" ? <Check/> : <Copy/>}
                                {copiedKey === "endpoint-empty" ? "Copied" : "Copy URL"}
                            </Button>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                            {["Claude", "ChatGPT", "Codex", "T3 Code"].map((assistant) => (
                                <span
                                    key={assistant}
                                    className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-0.5"
                                >
                                    {assistant}
                                </span>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="flex flex-col gap-3">
                    {clients.map((client) => {
                        const allowedCount = client.allowedProviderIds.filter((id) =>
                            providers.some((p) => p.id === id),
                        ).length;

                        return (
                            <Card key={client.clientId} size="sm" className="gap-0 py-0 transition-colors hover:border-foreground/15">
                                <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <div className="mt-0.5 flex size-9.5 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-brand">
                                            <Bot className="size-4.5"/>
                                        </div>

                                        <div className="min-w-0 space-y-1">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                                                    {client.name}
                                                </h3>
                                                <Badge variant={client.mode === "code" ? "success" : "info"}>
                                                    {client.mode === "code" ? (
                                                        <>
                                                            <Code2/>
                                                            Code Mode
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Layers/>
                                                            Classic MCP
                                                        </>
                                                    )}
                                                </Badge>
                                                {client.readOnly && (
                                                    <Badge variant="warning">
                                                        <Lock/>
                                                        Read-only
                                                    </Badge>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
                                                <button
                                                    type="button"
                                                    onClick={() => copyText(`cid-${client.clientId}`, client.clientId)}
                                                    className="inline-flex items-center gap-1 font-mono text-[11px] transition-colors hover:text-foreground"
                                                    title="Copy client ID"
                                                >
                                                    <span className="max-w-44 truncate">{client.clientId}</span>
                                                    {copiedKey === `cid-${client.clientId}`
                                                        ? <Check className="size-3 text-brand"/>
                                                        : <Copy className="size-3 opacity-60"/>
                                                    }
                                                </button>
                                                <span className="text-border">•</span>
                                                <span
                                                    className="text-[11px]"
                                                    title={new Date(client.createdAt).toLocaleString()}
                                                >
                                                    Connected {formatRelativeTime(client.createdAt)}
                                                </span>
                                                {client.uri && (
                                                    <>
                                                        <span className="text-border">•</span>
                                                        <a
                                                            href={client.uri}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-1 text-[11px] hover:text-foreground hover:underline"
                                                        >
                                                            {client.uri.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}
                                                            <ExternalLink className="size-2.5"/>
                                                        </a>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <Button
                                        size="xs"
                                        variant="destructive"
                                        disabled={disconnectMutation.isPending}
                                        onClick={() => setRevokingClient(client)}
                                    >
                                        <Unplug/>
                                        Revoke
                                    </Button>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/60 bg-black/20 px-4 py-2.5">
                                    <div className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-black/35 p-0.5">
                                        <Tooltip>
                                            <TooltipTrigger
                                                render={
                                                    <button
                                                        type="button"
                                                        onClick={() => policyMutation.mutate({
                                                            mode: "code",
                                                            clientId: client.clientId,
                                                        })}
                                                        className={cn(
                                                            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                                                            client.mode === "code"
                                                                ? "bg-brand/15 text-brand ring-1 ring-brand/30"
                                                                : "text-muted-foreground hover:text-foreground",
                                                        )}
                                                    />
                                                }
                                            >
                                                <Code2 className="size-3"/>
                                                Code Mode
                                            </TooltipTrigger>
                                            <TooltipContent>4 meta-tools + QuickJS sandbox</TooltipContent>
                                        </Tooltip>

                                        <Tooltip>
                                            <TooltipTrigger
                                                render={
                                                    <button
                                                        type="button"
                                                        onClick={() => policyMutation.mutate({
                                                            mode: "classic",
                                                            clientId: client.clientId,
                                                        })}
                                                        className={cn(
                                                            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                                                            client.mode === "classic"
                                                                ? "bg-info/15 text-info ring-1 ring-info/30"
                                                                : "text-muted-foreground hover:text-foreground",
                                                        )}
                                                    />
                                                }
                                            >
                                                <Layers className="size-3"/>
                                                Classic MCP
                                            </TooltipTrigger>
                                            <TooltipContent>Expose allowed tools directly</TooltipContent>
                                        </Tooltip>
                                    </div>

                                    <label
                                        htmlFor={`client-readonly-${client.clientId}`}
                                        className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                        <ShieldCheck className={cn("size-3.5", client.readOnly ? "text-warning" : "text-muted-foreground")}/>
                                        <span className={client.readOnly ? "text-foreground" : undefined}>Read-only tools only</span>
                                        <Switch
                                            size="sm"
                                            checked={client.readOnly}
                                            id={`client-readonly-${client.clientId}`}
                                            onCheckedChange={(checked) => policyMutation.mutate({
                                                readOnly: checked,
                                                clientId: client.clientId,
                                            })}
                                        />
                                    </label>
                                </div>

                                <div className="flex flex-col gap-2.5 border-t border-border/60 p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                            Allowed Providers
                                            <span className="ml-1.5 font-mono text-foreground/75 tabular-nums">
                                                {allowedCount}/{providers.length}
                                            </span>
                                        </span>

                                        {providers.length > 1 && (
                                            <div className="flex items-center gap-2 text-[11px]">
                                                <button
                                                    type="button"
                                                    onClick={() => setAllProviders(client, providers.map((p) => p.id))}
                                                    className="text-muted-foreground transition-colors hover:text-brand"
                                                >
                                                    Allow all
                                                </button>
                                                <span className="text-border">·</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setAllProviders(client, [])}
                                                    className="text-muted-foreground transition-colors hover:text-foreground"
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {providers.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">
                                            Add providers first to grant tool access.
                                        </p>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {providers.map((p) => {
                                                const allowed = client.allowedProviderIds.includes(p.id);
                                                return (
                                                    <label
                                                        key={p.id}
                                                        htmlFor={`allow-${client.clientId}-${p.id}`}
                                                        className={cn(
                                                            "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-all",
                                                            allowed
                                                                ? "border-brand/35 bg-brand/10 text-foreground"
                                                                : "border-border/75 bg-black/20 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                                                        )}
                                                    >
                                                        <Checkbox
                                                            checked={allowed}
                                                            id={`allow-${client.clientId}-${p.id}`}
                                                            onCheckedChange={(val) => toggleAllowedProvider(client, p.id, Boolean(val))}
                                                        />
                                                        <span className="font-medium">{p.name}</span>
                                                        <code className="font-mono text-[11px] text-muted-foreground">
                                                            {p.slug}
                                                        </code>
                                                        <span className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[10px] leading-none tabular-nums text-muted-foreground">
                                                            {p.enabledToolCount}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            <Dialog
                open={revokingClient !== null}
                onOpenChange={(open) => {
                    if (!open) setRevokingClient(null);
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Revoke {revokingClient?.name}?</DialogTitle>
                        <DialogDescription>
                            This immediately invalidates all active OAuth access and refresh tokens for this client. It will need to re-authorize to reconnect.
                        </DialogDescription>
                    </DialogHeader>
                    {disconnectMutation.error && (
                        <Alert variant="destructive">
                            <AlertCircle className="size-4"/>
                            <AlertDescription>{disconnectMutation.error.message}</AlertDescription>
                        </Alert>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={disconnectMutation.isPending}
                            onClick={() => setRevokingClient(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={disconnectMutation.isPending}
                            onClick={() => {
                                if (!revokingClient) return;
                                disconnectMutation.mutate(revokingClient.clientId, {
                                    onSuccess: () => setRevokingClient(null),
                                });
                            }}
                        >
                            <Unplug/>
                            {disconnectMutation.isPending ? "Revoking..." : "Revoke access"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
