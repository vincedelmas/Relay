import {type SubmitEvent, useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {Badge} from "@/lib/client/components/ui/badge";
import {Input} from "@/lib/client/components/ui/input";
import {Label} from "@/lib/client/components/ui/label";
import {Button} from "@/lib/client/components/ui/button";
import {Switch} from "@/lib/client/components/ui/switch";
import {Separator} from "@/lib/client/components/ui/separator";
import {Alert, AlertDescription} from "@/lib/client/components/ui/alert";
import type {GatewayBuiltIn, GatewayProvider} from "@/lib/client/components/dashboard/types";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/lib/client/components/ui/card";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/lib/client/components/ui/dialog";
import {AlertCircle, ChevronDown, ChevronRight, KeyRound, Link2, Plus, RefreshCw, Settings2, Trash2, Unlink, Wrench} from "lucide-react";
import {
    createProviderFn,
    deleteProviderFn,
    disconnectProviderOAuthFn,
    startProviderOAuthFn,
    syncProviderFn,
    toggleProviderToolFn,
    updateProviderFn,
} from "@/lib/server/functions/gateway";


interface ProviderPreset {
    name: string;
    slug: string;
    url?: string;
    label: string;
    builtinKey?: string;
    kind: "remote_mcp" | "builtin";
    authType?: "oauth" | "bearer" | "none";
}


const PROVIDER_PRESETS: ProviderPreset[] = [
    {
        name: "Steam",
        slug: "steam",
        kind: "builtin",
        builtinKey: "steam",
        label: "Steam (Built-in)",
    },
    {
        name: "PostHog",
        slug: "posthog",
        label: "PostHog",
        authType: "oauth",
        kind: "remote_mcp",
        url: "https://mcp.posthog.com/mcp",
    },
    {
        name: "MyLists",
        slug: "mylists",
        label: "MyLists",
        authType: "oauth",
        kind: "remote_mcp",
        url: "https://mylists.info/api/mcp",
    },
    {
        label: "Recipes",
        slug: "famiglia",
        authType: "oauth",
        kind: "remote_mcp",
        name: "Famiglia Recipes",
        url: "https://famiglia.example/api/mcp",
    },
    {
        authType: "oauth",
        kind: "remote_mcp",
        name: "Cloudflare",
        slug: "cloudflare",
        label: "Cloudflare",
        url: "https://observability.mcp.cloudflare.com/mcp",
    },
];


interface ProvidersTabProps {
    builtins: GatewayBuiltIn[];
    providers: GatewayProvider[];
    onChanged: () => Promise<void>;
}


export function ProvidersTab({ providers, builtins, onChanged }: ProvidersTabProps) {
    const [addOpen, setAddOpen] = useState(false);
    const [editingProvider, setEditingProvider] = useState<GatewayProvider | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
    const [actionError, setActionError] = useState<string | null>(null);

    const toggleExpanded = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const syncMutation = useMutation({
        mutationFn: (id: string) => syncProviderFn({ data: { id } }),
        onMutate: () => setActionError(null),
        onSuccess: async () => {
            await onChanged();
        },
        onError: (err) => setActionError(err instanceof Error ? err.message : "Sync failed."),
    });

    const oauthStartMutation = useMutation({
        mutationFn: (id: string) => startProviderOAuthFn({ data: { id } }),
        onMutate: () => setActionError(null),
        onSuccess: async (res, id) => {
            if (res.authorizationUrl) {
                window.location.assign(res.authorizationUrl);
                return;
            }
            if (res.alreadyAuthorized) {
                await syncProviderFn({ data: { id } });
                await onChanged();
            }
        },
        onError: (err) => setActionError(err instanceof Error ? err.message : "Unable to start OAuth flow."),
    });

    const oauthDisconnectMutation = useMutation({
        mutationFn: (id: string) => disconnectProviderOAuthFn({ data: { id } }),
        onMutate: () => setActionError(null),
        onSuccess: async () => {
            await onChanged();
        },
        onError: (err) => setActionError(err instanceof Error ? err.message : "Disconnect failed."),
    });

    const toggleProviderMutation = useMutation({
        mutationFn: (data: { id: string; enabled?: boolean; readOnly?: boolean }) => updateProviderFn({ data }),
        onMutate: () => setActionError(null),
        onSuccess: async () => {
            await onChanged();
        },
        onError: (err) => setActionError(err instanceof Error ? err.message : "Update failed."),
    });

    const toggleToolMutation = useMutation({
        mutationFn: (data: { toolId: string; enabled: boolean }) => toggleProviderToolFn({ data }),
        onMutate: () => setActionError(null),
        onSuccess: async () => {
            await onChanged();
        },
        onError: (err) => setActionError(err instanceof Error ? err.message : "Toggle failed."),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteProviderFn({ data: { id } }),
        onMutate: () => setActionError(null),
        onSuccess: async () => {
            await onChanged();
        },
        onError: (err) => setActionError(err instanceof Error ? err.message : "Delete failed."),
    });

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-medium">Tool Providers</h2>
                    <p className="text-sm text-muted-foreground">
                        Connect remote Streamable HTTP MCP servers or enable built-in personal tool suites.
                    </p>
                </div>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                    <Plus/>
                    Add provider
                </Button>
            </div>

            {actionError && (
                <Alert variant="destructive">
                    <AlertCircle className="size-4"/>
                    <AlertDescription>{actionError}</AlertDescription>
                </Alert>
            )}

            {providers.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                        <Wrench className="size-8 text-muted-foreground"/>
                        <div>
                            <p className="font-medium">No providers configured yet</p>
                            <p className="text-sm text-muted-foreground">
                                Add MyLists, Famiglia, PostHog, Cloudflare, or the built-in Steam provider to populate your gateway.
                            </p>
                        </div>
                        <Button size="sm" onClick={() => setAddOpen(true)}>
                            <Plus/>
                            Add your first provider
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="flex flex-col gap-3">
                    {providers.map((p) => {
                        const isExpanded = expandedIds.has(p.id);
                        const isSyncing = syncMutation.isPending && syncMutation.variables === p.id;
                        const isStartingOAuth = oauthStartMutation.isPending && oauthStartMutation.variables === p.id;

                        return (
                            <Card key={p.id} size="sm">
                                <CardHeader className="gap-2">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <CardTitle>{p.name}</CardTitle>
                                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                                                    {p.slug}
                                                </code>
                                                <Badge variant="outline">
                                                    {p.kind === "builtin" ? "Built-in" : "Remote MCP"}
                                                </Badge>
                                                {p.kind === "remote_mcp" && p.authType === "oauth" && (
                                                    <Badge variant={p.oauthConnected ? "default" : "secondary"}>
                                                        {p.oauthConnected ? "OAuth connected" : "Needs OAuth"}
                                                    </Badge>
                                                )}
                                                {p.kind === "remote_mcp" && p.authType === "bearer" && (
                                                    <Badge variant={p.hasAuthSecret ? "default" : "secondary"}>
                                                        {p.hasAuthSecret ? "Bearer token" : "Missing token"}
                                                    </Badge>
                                                )}
                                                {p.readOnly && <Badge variant="secondary">Read-only</Badge>}
                                                {!p.enabled && <Badge variant="destructive">Disabled</Badge>}
                                            </div>
                                            <CardDescription className="flex flex-wrap items-center gap-2 font-mono text-xs">
                                                <span>{p.kind === "builtin" ? `builtin:${p.builtinKey}` : p.url}</span>
                                                <span>·</span>
                                                <span>{p.enabledToolCount}/{p.toolCount} tools active</span>
                                            </CardDescription>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {p.kind === "remote_mcp" && p.authType === "oauth" && (
                                                p.oauthConnected ? (
                                                    <Button
                                                        variant="outline"
                                                        size="xs"
                                                        disabled={oauthDisconnectMutation.isPending}
                                                        onClick={() => oauthDisconnectMutation.mutate(p.id)}
                                                    >
                                                        <Unlink/>
                                                        Disconnect
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        variant="default"
                                                        size="xs"
                                                        disabled={isStartingOAuth}
                                                        onClick={() => oauthStartMutation.mutate(p.id)}
                                                    >
                                                        <KeyRound/>
                                                        {isStartingOAuth ? "Redirecting..." : "Connect OAuth"}
                                                    </Button>
                                                )
                                            )}

                                            <Button
                                                variant="outline"
                                                size="xs"
                                                disabled={isSyncing}
                                                onClick={() => syncMutation.mutate(p.id)}
                                            >
                                                <RefreshCw className={isSyncing ? "animate-spin" : ""}/>
                                                {isSyncing ? "Syncing..." : "Sync"}
                                            </Button>

                                            <Button
                                                variant="outline"
                                                size="xs"
                                                onClick={() => setEditingProvider(p)}
                                                aria-label={`Configure ${p.name}`}
                                            >
                                                <Settings2/>
                                                Config
                                            </Button>

                                            <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                aria-label={`Delete ${p.name}`}
                                                disabled={deleteMutation.isPending}
                                                onClick={() => deleteMutation.mutate(p.id)}
                                            >
                                                <Trash2 className="text-destructive"/>
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>

                                <CardContent className="flex flex-col gap-3">
                                    {p.lastError && (
                                        <Alert variant="destructive">
                                            <AlertCircle className="size-4"/>
                                            <AlertDescription className="break-all text-xs">{p.lastError}</AlertDescription>
                                        </Alert>
                                    )}

                                    <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-2.5 text-xs">
                                        <div className="flex flex-wrap items-center gap-5">
                                            <label className="flex cursor-pointer items-center gap-2" htmlFor={`enabled-${p.id}`}>
                                                <Switch
                                                    id={`enabled-${p.id}`}
                                                    size="sm"
                                                    checked={p.enabled}
                                                    onCheckedChange={(checked) => toggleProviderMutation.mutate({ id: p.id, enabled: checked })}
                                                />
                                                <span>Enabled</span>
                                            </label>

                                            <label className="flex cursor-pointer items-center gap-2" htmlFor={`readonly-${p.id}`}>
                                                <Switch
                                                    id={`readonly-${p.id}`}
                                                    size="sm"
                                                    checked={p.readOnly}
                                                    onCheckedChange={(checked) => toggleProviderMutation.mutate({ id: p.id, readOnly: checked })}
                                                />
                                                <span>Read-only only</span>
                                            </label>
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="xs"
                                            onClick={() => toggleExpanded(p.id)}
                                        >
                                            {isExpanded ? <ChevronDown/> : <ChevronRight/>}
                                            {isExpanded ? "Hide tools" : `Inspect ${p.toolCount} tools`}
                                        </Button>
                                    </div>

                                    {isExpanded && (
                                        <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-2.5">
                                            {p.tools.length === 0 ? (
                                                <p className="py-2 text-center text-xs text-muted-foreground">
                                                    No tools synced
                                                    yet. {p.kind === "remote_mcp" && p.authType === "oauth" && !p.oauthConnected ? "Connect OAuth first, then sync." : "Click Sync to fetch tools."}
                                                </p>
                                            ) : (
                                                p.tools.map((tool) => (
                                                    <div
                                                        key={tool.id}
                                                        className="flex items-start justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <code className="font-mono text-xs font-medium text-foreground">
                                                                    {p.slug}.{tool.jsName}
                                                                </code>
                                                                {tool.readOnly && <Badge variant="outline">read-only</Badge>}
                                                                {tool.destructive && <Badge variant="destructive">destructive</Badge>}
                                                            </div>
                                                            {tool.description && (
                                                                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                                                    {tool.description}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <Switch
                                                            size="sm"
                                                            aria-label={`Enable ${tool.name}`}
                                                            checked={tool.enabled}
                                                            onCheckedChange={(checked) => toggleToolMutation.mutate({ toolId: tool.id, enabled: checked })}
                                                        />
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            <AddProviderDialog
                open={addOpen}
                builtins={builtins}
                onOpenChange={setAddOpen}
                onCreated={onChanged}
            />

            {editingProvider && (
                <EditProviderDialog
                    provider={editingProvider}
                    builtins={builtins}
                    onClose={() => setEditingProvider(null)}
                    onSaved={onChanged}
                />
            )}
        </div>
    );
}


function AddProviderDialog({ open, builtins, onOpenChange, onCreated }: {
    open: boolean;
    builtins: GatewayBuiltIn[];
    onCreated: () => Promise<void>;
    onOpenChange: (open: boolean) => void;
}) {
    const [url, setUrl] = useState("");
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [readOnly, setReadOnly] = useState(false);
    const [authSecret, setAuthSecret] = useState("");
    const [builtinKey, setBuiltinKey] = useState(builtins[0]?.key ?? "steam");
    const [configValues, setConfigValues] = useState<Record<string, string>>({});
    const [kind, setKind] = useState<"remote_mcp" | "builtin">("remote_mcp");
    const [authType, setAuthType] = useState<"oauth" | "bearer" | "none">("oauth");

    const activeBuiltIn = builtins.find((b) => b.key === builtinKey);

    const mutation = useMutation({
        mutationFn: () => createProviderFn({
            data: {
                name,
                kind,
                readOnly,
                slug: slug || undefined,
                url: kind === "remote_mcp" ? url : undefined,
                config: kind === "builtin" ? configValues : undefined,
                authType: kind === "remote_mcp" ? authType : undefined,
                builtinKey: kind === "builtin" ? builtinKey : undefined,
                authSecret: kind === "remote_mcp" && authType === "bearer" ? authSecret : undefined,
            },
        }),
        onSuccess: async () => {
            await onCreated();
            setUrl("");
            setName("");
            setSlug("");
            setConfigValues({});
            setAuthSecret("");
            setReadOnly(false);
            onOpenChange(false);
        },
    });

    const applyPreset = (preset: ProviderPreset) => {
        setKind(preset.kind);
        setName(preset.name);
        setSlug(preset.slug);
        setUrl(preset.url ?? "");
        if (preset.authType) setAuthType(preset.authType);
        if (preset.builtinKey) setBuiltinKey(preset.builtinKey);
    };

    const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        mutation.mutate();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        Add Provider
                    </DialogTitle>
                    <DialogDescription>
                        Pick a quick preset or enter any Streamable HTTP MCP server.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-wrap gap-1.5">
                    {PROVIDER_PRESETS.map((preset) => (
                        <Button
                            size="xs"
                            type="button"
                            key={preset.slug}
                            variant="outline"
                            onClick={() => applyPreset(preset)}
                        >
                            {preset.label}
                        </Button>
                    ))}
                </div>

                <Separator/>

                <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                    {mutation.error &&
                        <Alert variant="destructive">
                            <AlertCircle className="size-4"/>
                            <AlertDescription>
                                {mutation.error.message}
                            </AlertDescription>
                        </Alert>
                    }

                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            size="sm"
                            type="button"
                            onClick={() => setKind("remote_mcp")}
                            variant={kind === "remote_mcp" ? "default" : "outline"}
                        >
                            <Link2/>
                            Remote MCP (HTTP)
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={kind === "builtin" ? "default" : "outline"}
                            onClick={() => {
                                setKind("builtin");
                                if (activeBuiltIn && !name) {
                                    setName(activeBuiltIn.defaultName);
                                    setSlug(activeBuiltIn.defaultSlug);
                                }
                            }}
                        >
                            <Wrench/>
                            Built-in Module
                        </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="provider-name">
                                Display Name
                            </Label>
                            <Input
                                value={name}
                                required={true}
                                id="provider-name"
                                placeholder="MyLists"
                                onChange={(ev) => setName(ev.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="provider-slug">
                                Code Mode Namespace
                            </Label>
                            <Input
                                value={slug}
                                id="provider-slug"
                                placeholder="mylists"
                                className="font-mono"
                                onChange={(ev) => setSlug(ev.target.value)}
                            />
                        </div>
                    </div>

                    {kind === "remote_mcp" ?
                        <>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="provider-url">
                                    Streamable HTTP Endpoint URL
                                </Label>
                                <Input
                                    type="url"
                                    value={url}
                                    required={true}
                                    id="provider-url"
                                    className="font-mono text-xs"
                                    placeholder="https://mylists.info/api/mcp"
                                    onChange={(ev) => setUrl(ev.target.value)}
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <span className="text-xs font-medium text-muted-foreground">
                                    Upstream Authentication
                                </span>
                                <div className="grid grid-cols-3 gap-2">
                                    {(["oauth", "bearer", "none"] as const).map((option) =>
                                        <Button
                                            size="xs"
                                            key={option}
                                            type="button"
                                            onClick={() => setAuthType(option)}
                                            variant={authType === option ? "default" : "outline"}
                                        >
                                            {option === "oauth"
                                                ? "OAuth 2.1"
                                                : option === "bearer"
                                                    ? "Bearer Token"
                                                    : "No Auth"
                                            }
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {authType === "bearer" &&
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="provider-secret">
                                        Bearer Token (encrypted in SQLite)
                                    </Label>
                                    <Input
                                        type="password"
                                        value={authSecret}
                                        id="provider-secret"
                                        placeholder="Paste API / personal access token"
                                        onChange={(ev) => setAuthSecret(ev.target.value)}
                                    />
                                </div>
                            }
                        </>
                        :
                        <div className="flex flex-col gap-3">
                            {activeBuiltIn &&
                                <p className="text-xs text-muted-foreground">
                                    {activeBuiltIn.description}
                                </p>
                            }
                            {activeBuiltIn?.configFields.map((field) =>
                                <div key={field.key} className="flex flex-col gap-1.5">
                                    <Label htmlFor={`builtin-${field.key}`}>
                                        {field.label}
                                    </Label>
                                    <Input
                                        id={`builtin-${field.key}`}
                                        placeholder={field.placeholder}
                                        value={configValues[field.key] ?? ""}
                                        type={field.secret ? "password" : "text"}
                                        onChange={(ev) => setConfigValues(prev => ({ ...prev, [field.key]: ev.target.value }))}
                                    />
                                </div>
                            )}
                        </div>
                    }

                    <label className="flex cursor-pointer items-center gap-2 text-xs" htmlFor="provider-readonly">
                        <Switch
                            size="sm"
                            checked={readOnly}
                            id="provider-readonly"
                            onCheckedChange={setReadOnly}
                        />
                        <span>Enforce read-only mode on this provider</span>
                    </label>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending ? "Saving..." : "Add provider"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}


function EditProviderDialog({ provider, builtins, onClose, onSaved }: {
    provider: GatewayProvider;
    builtins: GatewayBuiltIn[];
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const [name, setName] = useState(provider.name);
    const [url, setUrl] = useState(provider.url ?? "");
    const [authType, setAuthType] = useState<"oauth" | "bearer" | "none">(provider.authType);
    const [authSecret, setAuthSecret] = useState("");
    const [configValues, setConfigValues] = useState<Record<string, string>>({});

    const activeBuiltIn = provider.builtinKey
        ? builtins.find((b) => b.key === provider.builtinKey)
        : undefined;

    const mutation = useMutation({
        mutationFn: () => updateProviderFn({
            data: {
                id: provider.id,
                name,
                url: provider.kind === "remote_mcp" ? url : undefined,
                authType: provider.kind === "remote_mcp" ? authType : undefined,
                authSecret: provider.kind === "remote_mcp" && authType === "bearer" && authSecret.trim()
                    ? authSecret
                    : undefined,
                config: provider.kind === "builtin" && Object.values(configValues).some((v) => v.trim())
                    ? configValues
                    : undefined,
            },
        }),
        onSuccess: async () => {
            await onSaved();
            onClose();
        },
    });

    const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        mutation.mutate();
    };

    return (
        <Dialog open onOpenChange={(open) => {
            if (!open) onClose();
        }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Configure {provider.name}</DialogTitle>
                    <DialogDescription>
                        Namespace: <code className="font-mono text-xs">{provider.slug}</code>. Stored secrets are encrypted at rest and never displayed back.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                    {mutation.error && (
                        <Alert variant="destructive">
                            <AlertCircle className="size-4"/>
                            <AlertDescription>{mutation.error.message}</AlertDescription>
                        </Alert>
                    )}

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="edit-provider-name">Display Name</Label>
                        <Input
                            id="edit-provider-name"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    {provider.kind === "remote_mcp" ? (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="edit-provider-url">Endpoint URL</Label>
                                <Input
                                    id="edit-provider-url"
                                    type="url"
                                    required
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    className="font-mono text-xs"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <span className="text-xs font-medium text-muted-foreground">Upstream Auth</span>
                                <div className="grid grid-cols-3 gap-2">
                                    {(["oauth", "bearer", "none"] as const).map((option) => (
                                        <Button
                                            key={option}
                                            type="button"
                                            size="xs"
                                            variant={authType === option ? "default" : "outline"}
                                            onClick={() => setAuthType(option)}
                                        >
                                            {option === "oauth" ? "OAuth 2.1" : option === "bearer" ? "Bearer Token" : "No Auth"}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                            {authType === "bearer" && (
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="edit-provider-secret">
                                        Replace Bearer Token {provider.hasAuthSecret ? "(currently set)" : ""}
                                    </Label>
                                    <Input
                                        id="edit-provider-secret"
                                        type="password"
                                        value={authSecret}
                                        onChange={(e) => setAuthSecret(e.target.value)}
                                        placeholder="Leave blank to keep existing token"
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        activeBuiltIn?.configFields.map((field) => (
                            <div key={field.key} className="flex flex-col gap-1.5">
                                <Label htmlFor={`edit-builtin-${field.key}`}>{field.label}</Label>
                                <Input
                                    id={`edit-builtin-${field.key}`}
                                    type={field.secret ? "password" : "text"}
                                    value={configValues[field.key] ?? ""}
                                    onChange={(e) => setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                    placeholder={provider.hasConfig ? "Leave blank to keep existing config" : field.placeholder}
                                />
                            </div>
                        ))
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending ? "Saving..." : "Save changes"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
